'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  expectedLast4Otp,
  formatOtpVerifyError,
  normalizeSmsOtpInput,
  SMS_OTP_LENGTH,
} from '@/lib/phoneAuth';
import Button from '@/components/ui/Button';

type Step =
  | 'loading'
  | 'phone'
  | 'otp'
  | 'name'
  | 'email_otp';

function SignupForm() {
  const searchParams = useSearchParams();
  const fromLogin = searchParams.get('from') === 'login';

  const [step, setStep] = useState<Step>('loading');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailCooldown, setEmailCooldown] = useState(0);
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
    const phone10 = phone.replace(/\D/g, '').slice(-10);

    try {
      const res = await fetch('/api/auth/signup-phone-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone10 }),
      });
      const body = (await res.json().catch(() => ({}))) as { exists?: boolean; error?: string };
      if (body.exists) {
        setPhoneTaken(true);
        setLoading(false);
        return;
      }
      setStep('otp');
      setOtp('');
      prevOtpLenRef.current = 0;
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setLoading(false);
    }
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

  useEffect(() => {
    if (emailCooldown <= 0) return;
    const t = setInterval(() => setEmailCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [emailCooldown]);

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (otp.length !== SMS_OTP_LENGTH) {
      setError(`Enter the ${SMS_OTP_LENGTH}-digit OTP`);
      return;
    }
    const phone10 = phone.replace(/\D/g, '').slice(-10);
    if (otp !== expectedLast4Otp(phone10)) {
      setError('That code is wrong. The OTP is the last 4 digits of your mobile number.');
      return;
    }

    setLoading(true);
    const res = await fetch('/api/auth/last4-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone10, otp }),
    });
    const respBody = (await res.json().catch(() => ({}))) as {
      token_hash?: string;
      type?: string;
      error?: string;
    };
    if (!res.ok || !respBody.token_hash) {
      setError(respBody.error || 'Could not create account');
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: respBody.token_hash,
      type: (respBody.type as 'magiclink' | 'email') || 'magiclink',
    });
    if (verifyErr) {
      setError(formatOtpVerifyError(verifyErr.message));
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      await supabase.from('profiles').update({ phone: phone10 }).eq('id', user.id);
    }

    setStep('name');
    setLoading(false);
  }

  async function handleName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '/auth/login'; return; }

    const phone10 = phone.replace(/\D/g, '').slice(-10);
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ name: name.trim(), ...(phone10 ? { phone: phone10 } : {}) })
      .eq('id', user.id);
    if (updateErr) { setError(updateErr.message); setLoading(false); return; }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      window.location.href = '/dashboard';
      return;
    }

    // Recovery path: email already set + confirmed (e.g., user retried after a
    // half-complete prior attempt). updateUser({email: same}) is a no-op so we
    // skip verification and flip the flag directly.
    const currentEmail = (user.email ?? '').toLowerCase();
    if (currentEmail === cleanEmail && user.email_confirmed_at) {
      const enableRes = await fetch('/api/auth/enable-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      if (!enableRes.ok) {
        const j = await enableRes.json().catch(() => ({}));
        setError(j.error || 'Could not enable email OTP');
        setLoading(false);
        return;
      }
      window.location.href = '/dashboard';
      return;
    }

    const { error: emailErr } = await supabase.auth.updateUser({ email: cleanEmail });
    if (emailErr) {
      setError(formatOtpVerifyError(emailErr.message));
      setLoading(false);
      return;
    }
    setEmailVerified(cleanEmail);
    setEmailOtp('');
    setEmailCooldown(60);
    setStep('email_otp');
    setLoading(false);
  }

  async function handleEmailOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!emailVerified) {
      setError('Verification session expired. Try again.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: emailVerified,
      token: emailOtp,
      type: 'email_change',
    });
    if (verifyErr) {
      setError(formatOtpVerifyError(verifyErr.message));
      setLoading(false);
      return;
    }

    const enableRes = await fetch('/api/auth/enable-email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailVerified }),
    });
    if (!enableRes.ok) {
      const j = await enableRes.json().catch(() => ({}));
      setError(j.error || 'Could not enable email OTP');
      setLoading(false);
      return;
    }
    window.location.href = '/dashboard';
  }

  function skipEmail() {
    window.location.href = '/dashboard';
  }

  async function resendEmailOtp() {
    if (!emailVerified || loading || emailCooldown > 0) return;
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ email: emailVerified });
    setLoading(false);
    if (updateErr) {
      setError(formatOtpVerifyError(updateErr.message));
      return;
    }
    setEmailCooldown(60);
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
                Enter your mobile number to get started
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
                  Continue
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
              <p className="text-sm text-emerald-400 mb-1 font-medium">
                Your OTP is the last 4 digits of your mobile number.
              </p>
              <p className="text-xs text-gray-500 mb-5">
                No SMS will be sent — just type the last 4 digits to continue.
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
                  ? "You're signed in. Add a display name to continue."
                  : 'Shows on your player profile. Email is optional.'}
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
                <div>
                  <label className="text-xs text-gray-400 font-medium mb-1.5 block">
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[11px] text-gray-600 mt-1.5 leading-relaxed">
                    Add an email for stronger sign-in. We&apos;ll send a code to verify it.
                    Once enabled, the last-4-digits OTP will no longer work for your account.
                    Skip if you prefer to keep the simple last-4 sign-in.
                  </p>
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button type="submit" loading={loading} size="lg" disabled={!name.trim()}>
                  {email.trim() ? 'Continue →' : (fromLogin ? 'Continue to dashboard →' : "Let's Play →")}
                </Button>
              </form>
            </>
          )}

          {step === 'email_otp' && (
            <>
              <h2 className="text-lg font-semibold text-white mb-1">Verify your email</h2>
              <p className="text-sm text-gray-500 mb-5">
                We&apos;ve sent a 6-digit code to <span className="text-emerald-400">{emailVerified}</span>
              </p>
              <form onSubmit={handleEmailOtp} className="flex flex-col gap-4">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  value={emailOtp}
                  onChange={e => {
                    setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                    if (error) setError('');
                  }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 tracking-[0.35em] text-center text-2xl font-bold"
                  required
                  autoFocus
                />
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button type="submit" loading={loading} size="lg" disabled={emailOtp.length !== 6}>
                  Verify & enable email OTP
                </Button>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={resendEmailOtp}
                    disabled={emailCooldown > 0 || loading}
                    className="text-emerald-400 hover:text-emerald-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                  >
                    {emailCooldown > 0 ? `Resend in ${emailCooldown}s` : 'Resend code'}
                  </button>
                  <button
                    type="button"
                    onClick={skipEmail}
                    className="text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Skip — I&apos;ll do this later
                  </button>
                </div>
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
