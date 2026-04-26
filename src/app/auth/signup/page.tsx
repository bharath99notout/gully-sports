'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
import Button from '@/components/ui/Button';

type Step = 'phone' | 'otp' | 'name' | 'loading';

function SignupForm() {
  const searchParams = useSearchParams();
  const fromLogin = searchParams.get('from') === 'login';

  const [step, setStep] = useState<Step>('loading');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneTaken, setPhoneTaken] = useState(false);
  const otpFormRef = useRef<HTMLFormElement>(null);
  const prevOtpLenRef = useRef(0);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setStep('phone'); return; }

      const { data: profile } = await supabase
        .from('profiles').select('name').eq('id', user.id).single();

      const nameIsPhone = /^\d+$/.test(profile?.name ?? '');
      if (profile?.name?.trim() && !nameIsPhone) {
        window.location.href = '/dashboard';
      } else {
        setStep('name');
      }
    })();
  }, []);

  async function handlePhone(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPhoneTaken(false);
    setLoading(true);

    const supabase = createClient();
    const e164 = toIndiaE164(phone);

    // Probe Supabase Auth itself: if the user does NOT exist, this errors with
    // "Signups not allowed for otp" / "user not found". That's our signal to
    // proceed with shouldCreateUser:true. If it succeeds, the number is already
    // registered — show the "sign in instead" UI and DO NOT send a second OTP.
    const probe = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { shouldCreateUser: false },
    });

    if (!probe.error) {
      setPhoneTaken(true);
      setLoading(false);
      return;
    }

    const msg = probe.error.message.toLowerCase();
    const isNewUser =
      msg.includes('signups not allowed') ||
      msg.includes('user not found') ||
      msg.includes('not found');

    if (!isNewUser) {
      setLoading(false);
      setError(probe.error.message);
      return;
    }

    const { error: otpErr } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (otpErr) {
      setError(otpErr.message);
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
        setStep('name');
        setLoading(false);
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

    const { error: verifyErr } = await supabase.auth.verifyOtp({
      phone: e164,
      token: otp,
      type: 'sms',
    });
    if (verifyErr) {
      setError(formatOtpVerifyError(verifyErr.message));
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      await supabase.from('profiles').update({ phone }).eq('id', user.id);
    }

    setStep('name');
    setLoading(false);
  }

  async function handleName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '/auth/login'; return; }
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ name: name.trim(), ...(phone ? { phone } : {}) })
      .eq('id', user.id);
    if (updateErr) { setError(updateErr.message); setLoading(false); return; }
    window.location.href = '/dashboard';
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="bg-emerald-500 p-2 rounded-xl">
            <Trophy size={22} className="text-white" />
          </div>
          <span className="text-xl font-bold text-white">GullySports</span>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">

          {step === 'phone' && (
            <>
              <h2 className="text-lg font-semibold text-white mb-1">Create account</h2>
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
                      onChange={e => {
                        setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                        if (error) setError('');
                        setPhoneTaken(false);
                      }}
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {error ? <p className="text-sm text-red-400">{error}</p> : null}

                {phoneTaken ? (
                  <p className="text-sm text-amber-300 leading-relaxed">
                    This number is already registered.{' '}
                    <Link
                      href={`/auth/login?phone=${encodeURIComponent(phone)}`}
                      className="text-emerald-400 font-medium underline hover:text-emerald-300"
                    >
                      Sign in here
                    </Link>
                    {' '}instead of creating a new account.
                  </p>
                ) : null}

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

          {step === 'name' && (
            <>
              <h2 className="text-lg font-semibold text-white mb-1">
                {fromLogin ? 'Finish your profile' : "What's your name?"}
              </h2>
              <p className="text-sm text-gray-500 mb-5">
                {fromLogin
                  ? "You're signed in. This account doesn't have a proper display name yet (empty or phone-only). Add one to continue — it shows on matches and the leaderboard."
                  : 'Shows on your player profile'}
              </p>
              <form onSubmit={handleName} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-medium mb-1.5 block">Full Name</label>
                  <input
                    type="text"
                    placeholder="Virat Kumar"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                    autoFocus
                  />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button type="submit" loading={loading} size="lg" disabled={!name.trim()}>
                  {fromLogin ? 'Continue to dashboard →' : "Let's Play →"}
                </Button>
              </form>
            </>
          )}

        </div>

        {step === 'phone' && (
          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-emerald-400 hover:underline font-medium">
              Sign in
            </Link>
          </p>
        )}

      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={(
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )}>
      <SignupForm />
    </Suspense>
  );
}
