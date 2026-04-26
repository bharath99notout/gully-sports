'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  formatOtpVerifyError,
  MAGIC_SMS_OTP,
  normalizeSmsOtpInput,
  SMS_OTP_LENGTH,
  toIndiaE164,
  tryMagicPhoneOtpSignIn,
} from '@/lib/phoneAuth';
import Link from 'next/link';
import Button from '@/components/ui/Button';

type Step = 'phone' | 'otp';

async function getDestination(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return '/auth/login';
  const { data: profile } = await supabase
    .from('profiles').select('name').eq('id', user.id).single();
  const nameIsPhone = /^\d+$/.test(profile?.name ?? '');
  return (!profile?.name?.trim() || nameIsPhone)
    ? '/auth/signup?from=login'
    : '/dashboard';
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const otpFormRef = useRef<HTMLFormElement>(null);
  const prevOtpLenRef = useRef(0);

  useEffect(() => {
    const p = searchParams.get('phone');
    if (p && /^\d{10}$/.test(p)) setPhone(p);
  }, [searchParams]);

  async function handlePhone(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();
    const e164 = toIndiaE164(phone);
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (otpErr) {
      setError(
        otpErr.message.includes('Signups not allowed') || otpErr.message.toLowerCase().includes('user not found')
          ? 'No account with this number yet. Create one first.'
          : otpErr.message,
      );
      return;
    }
    setStep('otp');
    prevOtpLenRef.current = 0;
  }

  useEffect(() => {
    if (step !== 'otp' || loading) return;
    const len = otp.length;
    const grewToFull =
      len === SMS_OTP_LENGTH && prevOtpLenRef.current < SMS_OTP_LENGTH;
    prevOtpLenRef.current = len;
    if (grewToFull && otpFormRef.current) {
      otpFormRef.current.requestSubmit();
    }
  }, [otp, step, loading]);

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (otp.length !== SMS_OTP_LENGTH) {
      setError(`Enter the full ${SMS_OTP_LENGTH}-digit code from your SMS`);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const e164 = toIndiaE164(phone);

    if (otp === MAGIC_SMS_OTP) {
      const magic = await tryMagicPhoneOtpSignIn(phone, otp, supabase);
      if (magic.ok) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          await supabase.from('profiles').update({ phone }).eq('id', user.id);
        }
        window.location.href = await getDestination(supabase);
        return;
      }
      if (magic.kind === 'failed' || magic.kind === 'disabled') {
        setError(
          magic.message
            ?? (magic.kind === 'disabled'
              ? 'Code 7222 needs ENABLE_MAGIC_PHONE_OTP on the server (see deploy env).'
              : 'Magic sign-in failed'),
        );
        setLoading(false);
        return;
      }
    }

    const { data, error: verifyErr } = await supabase.auth.verifyOtp({
      phone: e164,
      token: otp,
      type: 'sms',
    });
    if (verifyErr) {
      setError(formatOtpVerifyError(verifyErr.message));
      setLoading(false);
      return;
    }
    const uid = data.user?.id;
    if (uid) {
      await supabase.from('profiles').update({ phone }).eq('id', uid);
    }
    window.location.href = await getDestination(supabase);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="bg-emerald-500 p-2 rounded-xl"><Trophy size={22} className="text-white" /></div>
          <span className="text-xl font-bold text-white">GullySports</span>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">

          {step === 'phone' && (
            <>
              <h2 className="text-lg font-semibold text-white mb-1">Sign in</h2>
              <p className="text-sm text-gray-500 mb-5">
                We&apos;ll text you a {SMS_OTP_LENGTH}-digit code
              </p>
              <form onSubmit={handlePhone} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-medium mb-1.5 block">Mobile Number</label>
                  <div className="flex items-center bg-gray-800 border border-gray-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
                    <span className="px-3 text-sm text-gray-400 border-r border-gray-700 py-2.5 select-none">+91</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      placeholder="98765 43210"
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button type="submit" size="lg" loading={loading} disabled={phone.length < 10}>
                  Send OTP
                </Button>
              </form>
            </>
          )}

          {step === 'otp' && (
            <>
              <button type="button" onClick={() => {
                setStep('phone'); setOtp(''); setError(''); prevOtpLenRef.current = 0;
              }}
                className="text-xs text-gray-500 hover:text-gray-300 mb-4 transition-colors">
                ← +91 {phone}
              </button>
              <h2 className="text-lg font-semibold text-white mb-1">Enter OTP</h2>
              <p className="text-sm text-gray-500 mb-5">
                Enter the {SMS_OTP_LENGTH}-digit code we sent by SMS
              </p>
              <form ref={otpFormRef} onSubmit={handleOtp} className="flex flex-col gap-4">
                <input
                  type="text"
                  name="otp"
                  inputMode="numeric"
                  pattern={`[0-9]{${SMS_OTP_LENGTH}}`}
                  maxLength={SMS_OTP_LENGTH}
                  autoComplete="one-time-code"
                  placeholder="• • • •"
                  value={otp}
                  onChange={e => {
                    setOtp(normalizeSmsOtpInput(e.target.value));
                    if (error) setError('');
                  }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 tracking-[0.35em] text-center text-2xl font-bold"
                  required
                  autoFocus
                />
                <p className="text-[11px] text-gray-600 text-center -mt-1">
                  {otp.length}/{SMS_OTP_LENGTH} digits
                </p>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button type="submit" loading={loading} size="lg" disabled={otp.length !== SMS_OTP_LENGTH}>
                  Verify
                </Button>
              </form>
            </>
          )}

        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          New to GullySports?{' '}
          <Link href="/auth/signup" className="text-emerald-400 hover:underline font-medium">
            Create account
          </Link>
        </p>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <LoginForm />
    </Suspense>
  );
}
