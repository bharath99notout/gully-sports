import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Supabase "Send SMS Hook" implementation backed by WhatsApp Cloud API (Meta direct).
 *
 * Supabase generates the OTP and POSTs it to this endpoint. Instead of delivering
 * the OTP over SMS, we deliver it as a WhatsApp message using a Meta-approved
 * Authentication-category template — which is free for OTPs and avoids DLT.
 *
 * Set up:
 *   1. Facebook Business Manager → create a WhatsApp Business Account (WABA)
 *      and add a phone number that is NOT active on personal WhatsApp.
 *   2. Meta WhatsApp Manager → Message Templates → New Template
 *        - Category: AUTHENTICATION
 *        - Name:     gullysports_otp   (or any snake_case slug)
 *        - Language: en
 *        - Body:     auto-fills "{{1}} is your verification code..." for auth templates
 *        - Optional: enable "Copy code" button (one-tap) — set WHATSAPP_INCLUDE_BUTTON=true
 *      Wait for approval (usually minutes for AUTH-category templates).
 *   3. Generate a permanent System User access token (Business Settings → Users →
 *      System Users → Generate token, scopes: whatsapp_business_messaging,
 *      whatsapp_business_management).
 *   4. Vercel env vars (Settings → Environment Variables → Production + Preview):
 *        SUPABASE_SMS_HOOK_SECRET     "v1,whsec_..." string from Supabase
 *        WHATSAPP_ACCESS_TOKEN        Meta system-user token
 *        WHATSAPP_PHONE_NUMBER_ID     from Meta → WhatsApp Manager → API Setup
 *        WHATSAPP_TEMPLATE_NAME       e.g. gullysports_otp
 *        WHATSAPP_TEMPLATE_LANGUAGE   default "en"
 *        WHATSAPP_API_VERSION         default "v21.0"
 *        WHATSAPP_INCLUDE_BUTTON      "true" if your auth template has a Copy-Code button
 *   5. Supabase Dashboard → Authentication → Hooks → Send SMS Hook
 *        URL: https://<your-domain>/api/auth/sms-hook
 *        Type: HTTPS, copy the generated secret into SUPABASE_SMS_HOOK_SECRET.
 *   6. Authentication → Phone → Phone provider → can stay on Twilio (the hook
 *      overrides delivery as long as it is enabled).
 *
 * Standard Webhooks signature spec:
 *   https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifyStandardWebhook(
  rawBody: string,
  id: string | null,
  timestamp: string | null,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const cleaned = secret.replace(/^v1,/, '').replace(/^whsec_/, '');
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(cleaned, 'base64');
  } catch {
    return false;
  }

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  const provided = signatureHeader.split(/\s+/).map(s => s.replace(/^v1,/, ''));
  return provided.some(p => safeEq(p, expected));
}

function envFlag(name: string): boolean {
  const v = (process.env[name] ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const secret = process.env.SUPABASE_SMS_HOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Hook secret not configured' }, { status: 500 });
  }

  const id = req.headers.get('webhook-id');
  const timestamp = req.headers.get('webhook-timestamp');
  const signature = req.headers.get('webhook-signature');

  if (!verifyStandardWebhook(rawBody, id, timestamp, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: { user?: { phone?: string }; sms?: { otp?: string } };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const phoneE164 = body.user?.phone;
  const otp = body.sms?.otp;
  if (!phoneE164 || !otp) {
    return NextResponse.json({ error: 'Missing phone or otp in payload' }, { status: 400 });
  }

  const recipient = phoneE164.replace(/^\+/, '').replace(/\D/g, '');

  const accessToken    = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId  = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName   = process.env.WHATSAPP_TEMPLATE_NAME;
  const templateLang   = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';
  const apiVersion     = process.env.WHATSAPP_API_VERSION || 'v21.0';
  const includeButton  = envFlag('WHATSAPP_INCLUDE_BUTTON');

  if (!accessToken || !phoneNumberId || !templateName) {
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 500 });
  }

  const components: Array<Record<string, unknown>> = [
    {
      type: 'body',
      parameters: [{ type: 'text', text: otp }],
    },
  ];

  if (includeButton) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: otp }],
    });
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang },
          components,
        },
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error('[sms-hook] WhatsApp send failed:', resp.status, detail);
      return NextResponse.json(
        { error: 'WhatsApp provider rejected the request' },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error('[sms-hook] WhatsApp fetch error:', err);
    return NextResponse.json({ error: 'WhatsApp provider unreachable' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
