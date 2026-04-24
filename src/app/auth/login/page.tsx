'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Button from '@/components/ui/Button';

type Step = 'phone' | 'otp';

async function getDestination(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return '/auth/login';
  const { data: profile } = await supabase
    .from('profiles').select('name').eq('id', user.id).single();
  const nameIsPhone = /^\d+$/.test(profile?.name ?? '');
  return (!profile?.name?.trim() || nameIsPhone) ? '/auth/signup' : '/dashboard';
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Pre-fill phone if passed as ?phone=... (from signup redirect)
  useEffect(() => {
    const p = searchParams.get('phone');
    if (p && /^\d{10}$/.test(p)) setPhone(p);
  }, [searchParams]);

  function handlePhone(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStep('otp');
  }

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (otp !== phone.slice(-4)) {
      setError('Wrong OTP — enter the last 4 digits of your mobile number');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const email = `${phone}@live.com`;
    const password = phone.slice(-6);

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (!signInErr) {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) await supabase.from('profiles').update({ phone }).eq('id', u.id);
      window.location.href = await getDestination(supabase);
      return;
    }

    if (signInErr.message !== 'Invalid login credentials') {
      setError(signInErr.message);
      setLoading(false);
      return;
    }

    // New user — register then go to signup for name
    const { error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) { setError(signUpErr.message); setLoading(false); return; }

    window.location.href = '/auth/signup';
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
              <p className="text-sm text-gray-500 mb-5">We'll verify with an OTP</p>
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
                <Button type="submit" size="lg" disabled={phone.length < 10}>
                  Send OTP
                </Button>
              </form>
            </>
          )}

          {step === 'otp' && (
            <>
              <button onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
                className="text-xs text-gray-500 hover:text-gray-300 mb-4 transition-colors">
                ← +91 {phone}
              </button>
              <h2 className="text-lg font-semibold text-white mb-1">Enter OTP</h2>
              <p className="text-sm text-gray-500 mb-5">Enter the last 4 digits of your mobile number</p>
              <form onSubmit={handleOtp} className="flex flex-col gap-4">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="- - - -"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 tracking-[0.8em] text-center text-2xl font-bold"
                  required
                  autoFocus
                />
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button type="submit" loading={loading} size="lg" disabled={otp.length < 4}>
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
