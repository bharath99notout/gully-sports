'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, UserPlus, Trash2, Check, X, Loader2, MessageCircle } from 'lucide-react';
import PlayerSearchAndAdd, { type PlayerAddResult } from '@/components/PlayerSearchAndAdd';
import { inviteEventPlayer, removeEventInvite } from '@/app/actions/events';
import { formatEventDateTime } from '@/lib/formatDateTime';
import type { EventInviteeRow } from '@/lib/eventsServer';

interface Props {
  eventId: string;
  eventName: string;
  sport: string;
  startAtISO: string;
  venueName: string | null;
  invitees: EventInviteeRow[];
}

const SPORT_LABEL: Record<string, string> = {
  cricket: 'Cricket', football: 'Football', badminton: 'Badminton', table_tennis: 'Table Tennis',
};

/** Build a `https://wa.me/<intl phone>?text=<msg>` deeplink that opens
 *  WhatsApp directly to the invitee's chat with the message pre-filled.
 *  Phone numbers in the DB are 10-digit canonical (no country code) — the
 *  app is India-only so we always prefix 91. */
function whatsappDeeplink(phone10: string, message: string): string {
  return `https://wa.me/91${phone10}?text=${encodeURIComponent(message)}`;
}

/**
 * Host-only invite list. Shows everyone the host has pre-added with their
 * RSVP status, plus a per-player "Send via WhatsApp" button that opens
 * WhatsApp pointed straight at that contact.
 *
 * Why per-row buttons instead of one bulk send: web apps can't actually
 * blast WhatsApp messages to multiple recipients without the paid Business
 * API + DLT registration (we explicitly opted out of that — see CLAUDE.md
 * "Why we don't use Twilio / MSG91 / WhatsApp / DLT"). What we *can* do
 * cheaply is open WhatsApp to each contact one at a time with the message
 * already typed; the host taps Send and moves to the next.
 */
export default function InviteesSection({
  eventId, eventName, sport, startAtISO, venueName, invitees,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [sentPhones, setSentPhones] = useState<Set<string>>(new Set());

  const inviteText = (() => {
    const lines = [
      `📅 ${eventName}`,
      `${SPORT_LABEL[sport] ?? sport} · ${formatEventDateTime(startAtISO)}`,
      venueName ? `📍 ${venueName}` : null,
      '',
      'Tap to RSVP:',
      typeof window !== 'undefined'
        ? `${window.location.origin}/events/${eventId}`
        : `/events/${eventId}`,
    ].filter(Boolean);
    return lines.join('\n');
  })();

  async function handleAdd(playerId: string, _displayName: string): Promise<PlayerAddResult> {
    void _displayName;
    const result = await inviteEventPlayer(eventId, playerId);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    startTransition(() => router.refresh());
    return { ok: true };
  }

  async function handleRemove(phone: string) {
    if (!confirm('Remove this player from the invite list?')) return;
    setBusyPhone(phone);
    const result = await removeEventInvite(eventId, phone);
    setBusyPhone(null);
    if (!result.ok) { alert(result.error); return; }
    startTransition(() => router.refresh());
  }

  function sendOne(phone: string) {
    const url = whatsappDeeplink(phone, inviteText);
    // _blank so the host returns to the event page after sending.
    window.open(url, '_blank', 'noopener,noreferrer');
    setSentPhones(prev => {
      const next = new Set(prev);
      next.add(phone);
      return next;
    });
  }

  /** Sequential "send all" — opens the first un-pinged invitee. After the
   *  host sends in WhatsApp and comes back, tapping the same button
   *  advances to the next. We can't open many tabs at once (popup blockers)
   *  so this is the cleanest realistic UX. */
  function sendNext() {
    const next = invitees.find(i => !sentPhones.has(i.phone));
    if (next) sendOne(next.phone);
  }

  const remaining = invitees.filter(i => !sentPhones.has(i.phone)).length;

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2">
            <MessageCircle size={14} className="text-emerald-400" />
            Invite players
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pick GullySports players → send WhatsApp invite directly. For people not on the app yet, use &ldquo;Share to WhatsApp&rdquo; up top.
          </p>
        </div>
        {!pickerOpen && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 bg-emerald-700/30 hover:bg-emerald-700/50 text-emerald-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-800/60"
          >
            <UserPlus size={12} /> Add
          </button>
        )}
      </div>

      {pickerOpen && (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-300">Search by name or phone</p>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="text-gray-500 hover:text-white"
              aria-label="Close picker"
            >
              <X size={14} />
            </button>
          </div>
          <PlayerSearchAndAdd
            onAdd={handleAdd}
            placeholder="Search GullySports players by name or 10-digit phone…"
            hint="Already on GullySports — they'll get a WhatsApp invite tap."
            onSuccess={() => setPickerOpen(false)}
          />
        </div>
      )}

      {invitees.length > 0 && (
        <div className="flex flex-col gap-1">
          {invitees.map(i => {
            const sent = sentPhones.has(i.phone);
            const rsvpBadge = i.rsvp_status ? rsvpBadgeFor(i.rsvp_status) : null;
            return (
              <div
                key={i.phone}
                className="flex items-center justify-between gap-2 py-2 px-2 -mx-2 rounded-lg hover:bg-gray-800/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">
                    {i.name}
                    {i.rsvp_status && rsvpBadge && (
                      <span className={`ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${rsvpBadge.cls}`}>
                        {rsvpBadge.label}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-500 font-mono">+91 {i.phone}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => sendOne(i.phone)}
                    disabled={isPending}
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${
                      sent
                        ? 'bg-emerald-900/40 border-emerald-800/60 text-emerald-300'
                        : 'bg-emerald-700/30 hover:bg-emerald-700/50 border-emerald-800/60 text-emerald-200'
                    }`}
                  >
                    {sent ? <Check size={12} /> : <Send size={12} />}
                    {sent ? 'Sent' : 'Send'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(i.phone)}
                    disabled={busyPhone === i.phone || isPending}
                    className="text-gray-500 hover:text-red-400 disabled:opacity-50 px-1"
                    aria-label="Remove invitee"
                  >
                    {busyPhone === i.phone ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {invitees.length === 0 && !pickerOpen && (
        <p className="text-xs text-gray-500 italic">
          No players invited yet. Tap <strong>Add</strong> to pick someone from GullySports.
        </p>
      )}

      {invitees.length > 1 && remaining > 0 && (
        <button
          type="button"
          onClick={sendNext}
          className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-3 py-2 rounded-xl"
        >
          <Send size={14} />
          {remaining === invitees.length
            ? `Send invites (${invitees.length} player${invitees.length === 1 ? '' : 's'})`
            : `Send next (${remaining} left)`}
        </button>
      )}
    </section>
  );
}

function rsvpBadgeFor(status: 'going' | 'maybe' | 'not_going' | 'waitlist') {
  switch (status) {
    case 'going':     return { label: 'Going',     cls: 'bg-emerald-900/50 text-emerald-300' };
    case 'maybe':     return { label: 'Maybe',     cls: 'bg-amber-900/50 text-amber-300' };
    case 'not_going': return { label: "Can't",     cls: 'bg-red-900/50 text-red-300' };
    case 'waitlist':  return { label: 'Waitlist',  cls: 'bg-gray-800 text-gray-300' };
  }
}
