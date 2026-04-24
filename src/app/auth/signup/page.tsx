'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';

type Step = 'phone' | 'otp' | 'name' | 'loading';

export default function SignupPage() {
  const [step, setStep] = useState<Step>('loading');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // On load: if already logged in, skip straight to name entry
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setStep('phone'); return; }

      const { data: profile } = await supabase
        .from('profiles').select('name').eq('id', user.id).single();

      const nameIsPhone = /^\d+$/.test(profile?.name ?? '');
      if (profile?.name?.trim() && !nameIsPhone) {
        // Already has a real name — go to dashboard
        window.location.href = '/dashboard';
      } else {
        // Logged in but no real name yet — show name step
        setStep('name');
      }
    })();
  }, []);

  async function handlePhone(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Detect existing account by attempting a silent sign-in on a detached
      // client (persistSession:false so this never leaves a stray session).
      const { createBrowserClient } = await import('@supabase/ssr');
      const tempClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const { data } = await tempClient.auth.signInWithPassword({
        email: `${phone}@live.com`,
        password: phone.slice(-6),
      });
      if (data?.user) {
        setError('already-exists');
        return;
      }
    } catch {
      // Network hiccup — fall through and let OTP step proceed
    } finally {
      setLoading(false);
    }

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

    const { error: signUpErr } = await supabase.auth.signUp({ email, password });

    if (signUpErr) {
      // Already registered — sign in instead
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) { setError('Could not sign in. Try the login page.'); setLoading(false); return; }
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
              <p className="text-sm text-gray-500 mb-5">Enter your mobile number to get started</p>
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
                      onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); if (error) setError(''); }}
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {error === 'already-exists' ? (
                  <div className="bg-amber-950/30 border border-amber-800/60 rounded-xl px-3 py-2.5 flex flex-col gap-2">
                    <p className="text-sm text-amber-300">
                      <span className="font-semibold">This number is already registered.</span>
                      <br />
                      <span className="text-gray-400">Please sign in with your existing account.</span>
                    </p>
                    <Link
                      href={`/auth/login?phone=${phone}`}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-2 rounded-lg text-center transition-colors">
                      Go to Sign In →
                    </Link>
                  </div>
                ) : error ? (
                  <p className="text-sm text-red-400">{error}</p>
                ) : null}

                <Button type="submit" size="lg" loading={loading} disabled={phone.length < 10}>
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

          {step === 'name' && (
            <>
              <h2 className="text-lg font-semibold text-white mb-1">What's your name?</h2>
              <p className="text-sm text-gray-500 mb-5">Shows on your player profile</p>
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
                  Let's Play →
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
