import { formatEventDateTime } from '@/lib/formatDateTime';

export type PickupShareFields = {
  sportLabel: string;
  hostName: string;
  startIso: string;
  groundName: string;
  slotsTotal: number;
  /** Accepted count (optional — omitted from message if not passed). */
  acceptedCount?: number;
  format: string | null;
  notes: string | null;
  mapUrl: string;
  appPickupUrl: string;
};

/**
 * Multi-line text for WhatsApp / copy — IST wall time via `formatEventDateTime`.
 */
export function buildPickupWhatsAppInvite(fields: PickupShareFields): string {
  const whenIst = formatEventDateTime(fields.startIso);
  const filled = fields.acceptedCount ?? 0;
  const open = Math.max(0, fields.slotsTotal - filled);
  const slotsLine =
    open > 0
      ? `Players: ${filled} / ${fields.slotsTotal} joined — ${open} spot(s) open`
      : `Players: ${filled} / ${fields.slotsTotal} joined (full)`;

  const lines: string[] = [
    '🙋 Need players — GullySports',
    '',
    `Sport: ${fields.sportLabel}`,
    `When (IST): ${whenIst}`,
    `Venue: ${fields.groundName}`,
    slotsLine,
  ];
  if (fields.format?.trim()) lines.push(`Format: ${fields.format.trim()}`);
  if (fields.notes?.trim()) lines.push(`Notes: ${fields.notes.trim()}`);
  lines.push(
    '',
    `Map pin: ${fields.mapUrl}`,
    '',
    `Open in app (sign in): ${fields.appPickupUrl}`,
    '',
    `Host: ${fields.hostName}`,
  );
  return lines.join('\n');
}

/** Short line for wa.me ?text= on a 1:1 thread (host → joiner or joiner → host). */
export function buildPickupWaContextLine(fields: {
  sportLabel: string;
  groundName: string;
  startIso: string;
  role: 'host' | 'joiner';
  /** Other party's display name — first word used for "Hi …!" */
  counterpartName?: string | null;
}): string {
  const whenIst = formatEventDateTime(fields.startIso);
  const first =
    fields.counterpartName?.trim().split(/\s+/)[0];
  const hi = first ? ` Hi ${first}!` : '';
  if (fields.role === 'host') {
    return `Hi! Re: GullySports ${fields.sportLabel} at ${fields.groundName} on ${whenIst} (IST) — I'm the host.${hi}`;
  }
  return `Hi! Re: GullySports ${fields.sportLabel} at ${fields.groundName} on ${whenIst} (IST) — I'm a player who joined on the app.${hi}`;
}
