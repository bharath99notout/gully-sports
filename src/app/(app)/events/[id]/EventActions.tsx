'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, HelpCircle, X, Share2, Loader2, LogOut } from 'lucide-react';
import { rsvpToEvent, dropOwnRsvp } from '@/app/actions/events';
import { formatEventDateTime } from '@/lib/formatDateTime';

interface Props {
  eventId: string;
  eventName: string;
  sport: string;
  startAtISO: string;
  venueName: string | null;
  goingCount: number;
  capacity: number | null;
  /** Current user's existing RSVP status (null if no response yet, or guest). */
  myStatus: 'going' | 'maybe' | 'not_going' | 'waitlist' | null;
  /** Whether the viewer is signed in. Drives "guest RSVP" vs "RSVP" UI. */
  signedIn: boolean;
  isHost: boolean;
}

const SPORT_LABEL: Record<string, string> = {
  cricket: 'Cricket', football: 'Football', badminton: 'Badminton', table_tennis: 'Table Tennis', foosball: 'Foosball',
};

/**
 * RSVP buttons + WhatsApp share. Combined because they're the two actions
 * a host or player takes most often on the event page; keeping them in one
 * client island reduces hydration cost.
 */
export default function EventActions({
  eventId, eventName, sport, startAtISO, venueName,
  goingCount, capacity, myStatus, signedIn, isHost,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function setRsvp(status: 'going' | 'maybe' | 'not_going') {
    if (!signedIn) {
      router.push(`/auth/login?next=/events/${eventId}`);
      return;
    }
    setBusy(status);
    const result = await rsvpToEvent(eventId, status);
    setBusy(null);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function dropOut() {
    if (!confirm('Cancel your RSVP for this event?')) return;
    setBusy('drop');
    const result = await dropOwnRsvp(eventId);
    setBusy(null);
    if (!result.ok) { alert(result.error); return; }
    startTransition(() => router.refresh());
  }

  function shareToWhatsApp() {
    const url = `${window.location.origin}/events/${eventId}`;
    const lines = [
      `📅 ${eventName}`,
      `${SPORT_LABEL[sport] ?? sport} · ${formatEventDateTime(startAtISO)}`,
      venueName ? `📍 ${venueName}` : null,
      capacity
        ? `${goingCount}/${capacity} confirmed${goingCount < capacity ? ` · ${capacity - goingCount} spots open` : ' · waitlist'}`
        : `${goingCount} confirmed`,
      '',
      'Tap to RSVP:',
      url,
    ].filter(Boolean).join('\n');
    const wa = `https://wa.me/?text=${encodeURIComponent(lines)}`;
    window.open(wa, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-white">Are you in?</h2>

      <div className="grid grid-cols-3 gap-2">
        <RsvpButton
          label="Going" icon={Check}
          tone="emerald"
          active={myStatus === 'going' || myStatus === 'waitlist'}
          loading={busy === 'going'}
          onClick={() => setRsvp('going')}
          disabled={isPending}
        />
        <RsvpButton
          label="Maybe" icon={HelpCircle}
          tone="amber"
          active={myStatus === 'maybe'}
          loading={busy === 'maybe'}
          onClick={() => setRsvp('maybe')}
          disabled={isPending}
        />
        <RsvpButton
          label="Can't" icon={X}
          tone="red"
          active={myStatus === 'not_going'}
          loading={busy === 'not_going'}
          onClick={() => setRsvp('not_going')}
          disabled={isPending}
        />
      </div>

      {/* Share only surfaces once the viewer has RSVP'd — you invite people
          after you're in, not before. */}
      {myStatus && (
        <button
          type="button"
          onClick={shareToWhatsApp}
          className="inline-flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white text-sm font-semibold px-4 py-3 rounded-xl transition-all"
        >
          <Share2 size={16} /> Share to WhatsApp
        </button>
      )}

      {myStatus === 'waitlist' && (
        <p className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded-lg px-2 py-1.5">
          You&apos;re on the waitlist — capacity is full. We&apos;ll auto-promote you if a confirmed player drops out.
        </p>
      )}

      {signedIn && myStatus && myStatus !== 'not_going' && !isHost && (
        <button
          type="button"
          onClick={dropOut}
          disabled={busy === 'drop' || isPending}
          className="text-[11px] text-gray-500 hover:text-red-400 inline-flex items-center gap-1 self-end"
        >
          {busy === 'drop' ? <Loader2 size={11} className="animate-spin" /> : <LogOut size={11} />}
          Cancel my RSVP
        </button>
      )}
    </section>
  );
}

function RsvpButton({
  label, icon: Icon, tone, active, loading, onClick, disabled,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: 'emerald' | 'amber' | 'red';
  active: boolean;
  loading: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const activeStyles: Record<string, string> = {
    emerald: 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/40',
    amber:   'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-900/40',
    red:     'bg-red-700 border-red-600 text-white shadow-lg shadow-red-900/40',
  };
  // Inactive buttons keep a tone-coloured icon and a visible border so each
  // choice reads as a distinct, tappable control rather than a flat panel.
  const inactiveIconTone: Record<string, string> = {
    emerald: 'text-emerald-400',
    amber:   'text-amber-400',
    red:     'text-red-400',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex flex-col items-center justify-center gap-1.5 min-h-[64px] py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all active:scale-[0.97] disabled:opacity-50 ${
        active
          ? activeStyles[tone]
          : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700 hover:border-gray-500'
      }`}
    >
      {loading
        ? <Loader2 size={22} className="animate-spin" />
        : <Icon size={22} className={active ? undefined : inactiveIconTone[tone]} />}
      {label}
    </button>
  );
}
