'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatOtpVerifyError } from '@/lib/phoneAuth';

type Props = {
  /** Currently-verified email on `auth.users.email` (excluding @live.com legacy). */
  currentEmail: string;
  /** Whether the profile already has email_otp_enabled = true. */
  enabled: boolean;
};

type Step = 'idle' | 'editing' | 'enter_otp' | 'success';

const RESEND_COOLDOWN_SECONDS = 60;

export default function EmailOtpSection({ currentEmail, enabled }: Props) {
  // If user has email already → start in `idle` (display). If not enabled and no
  // email → start directly in `editing` so the input is the primary CTA.
  const [step, setStep] = useState<Step>(enabled || currentEmail ? 'idle' : 'editing');
  const [email, setEmail] = useState(currentEmail);
  const [otp, setOtp] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [successEmail, setSuccessEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function sendOtpFor(target: string): Promise<string | null> {
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ email: target });
    if (updateErr) return updateErr.message;
    return null;
  }

  function showSuccess(addr: string) {
    setSuccessEmail(addr);
    setStep('success');
    setError('');
    setInfo('');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setError('Enter a valid email');
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const userEmail = (user?.email ?? '').toLowerCase();

    // Recovery path: email already set + confirmed; just flip flag if needed.
    if (userEmail === clean && user?.email_confirmed_at) {
      if (enabled) {
        // No change at all — just exit edit mode silently.
        setLoading(false);
        setStep('idle');
        return;
      }
      const enableRes = await fetch('/api/auth/enable-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean }),
      });
      setLoading(false);
      if (!enableRes.ok) {
        const j = await enableRes.json().catch(() => ({}));
        setError(j.error || 'Could not enable email OTP');
        return;
      }
      showSuccess(clean);
      return;
    }

    // Otherwise: trigger OTP send to verify the new email.
    const errMsg = await sendOtpFor(clean);
    setLoading(false);
    if (errMsg) {
      setError(formatOtpVerifyError(errMsg));
      return;
    }
    setPendingEmail(clean);
    setOtp('');
    setStep('enter_otp');
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function resendOtp() {
    if (!pendingEmail || cooldown > 0 || loading) return;
    setError(''); setInfo(''); setLoading(true);
    const errMsg = await sendOtpFor(pendingEmail);
    setLoading(false);
    if (errMsg) { setError(formatOtpVerifyError(errMsg)); return; }
    setInfo('A new code has been sent.');
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!pendingEmail) { setError('Verification session expired — restart.'); return; }
    setLoading(true);
    const supabase = createClient();
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: pendingEmail, token: otp, type: 'email_change',
    });
    if (verifyErr) {
      setError(formatOtpVerifyError(verifyErr.message));
      setLoading(false);
      return;
    }
    const enableRes = await fetch('/api/auth/enable-email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail }),
    });
    setLoading(false);
    if (!enableRes.ok) {
      const j = await enableRes.json().catch(() => ({}));
      setError(j.error || 'Could not enable email OTP');
      return;
    }
    showSuccess(pendingEmail);
  }

  function startEdit() {
    setEmail(currentEmail);
    setError(''); setInfo('');
    setStep('editing');
  }

  function cancelEdit() {
    setEmail(currentEmail);
    setError(''); setInfo('');
    setStep(currentEmail || enabled ? 'idle' : 'editing');
  }

  return (
    <div className="mt-5 pt-5 border-t border-gray-800/60">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-gray-400">Email</label>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
            enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gray-800 text-gray-500'
          }`}>
            {enabled ? 'Enabled' : 'Off'}
          </span>
          {step === 'idle' && (
            <button
              type="button"
              onClick={startEdit}
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              {currentEmail ? 'Edit' : 'Add'}
            </button>
          )}
        </div>
      </div>

      {step === 'idle' && (
        <p className="text-sm text-white py-1 break-all">
          {currentEmail || <span className="text-gray-600">Not set — tap Add to enable email OTP sign-in</span>}
        </p>
      )}

      {step === 'editing' && (
        <form onSubmit={handleSave} className="flex flex-col gap-2">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
            autoFocus
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex items-center gap-3 text-sm">
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="text-emerald-400 hover:text-emerald-300 disabled:text-gray-600 font-medium"
            >
              {loading ? 'Saving…' : 'Save'}
            </button>
            {(currentEmail || enabled) && (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-gray-500 hover:text-gray-300"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {step === 'enter_otp' && (
        <form onSubmit={verifyOtp} className="flex flex-col gap-2">
          <p className="text-xs text-gray-400">
            Enter the 6-digit code sent to{' '}
            <span className="text-emerald-400 break-all">{pendingEmail}</span>
          </p>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="••••••"
            value={otp}
            onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); if (error) setError(''); }}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 tracking-[0.35em] text-center text-xl font-bold"
            required
            autoFocus
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          {info && <p className="text-sm text-emerald-400">{info}</p>}
          <div className="flex items-center gap-3 text-sm">
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="text-emerald-400 hover:text-emerald-300 disabled:text-gray-600 font-medium"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={resendOtp}
              disabled={cooldown > 0 || loading}
              className="text-emerald-400 hover:text-emerald-300 disabled:text-gray-600 disabled:cursor-not-allowed text-xs"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('idle'); setOtp(''); setError(''); setInfo(''); }}
              className="text-gray-500 hover:text-gray-300 ml-auto"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {step === 'success' && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex flex-col items-center text-center gap-2 mt-2">
          <CheckCircle2 size={28} className="text-emerald-400" />
          <h4 className="text-sm font-semibold text-white">Email OTP active</h4>
          <p className="text-xs text-gray-300 leading-relaxed max-w-xs">
            Sign in by entering the 6-digit code sent to{' '}
            <span className="text-emerald-400 font-medium break-all">{successEmail}</span>.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-emerald-400 hover:text-emerald-300 font-medium mt-1"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
