/**
 * Single source of truth for formatting an event's start time.
 *
 * `toLocaleString('en-IN')` only sets the *locale* (language, comma style,
 * AM/PM marker) — it does NOT pin the time zone. On a server that runs in
 * UTC (Vercel default) a stored `10:30 UTC` value would render as
 * "10:30 AM" instead of being converted to "4:00 PM" IST. We pin the time
 * zone explicitly to Asia/Kolkata so every surface (server-rendered list,
 * server-rendered detail, client-side WhatsApp share message) shows the
 * same wall-clock time the host typed.
 *
 * AM/PM is uppercased post-toLocaleString because `en-IN` returns it as
 * "am"/"pm" (or "Am"/"Pm" depending on the engine), which looks broken
 * next to the capitalised weekday/month.
 *
 * Why hard-code IST instead of using the user's browser zone: the app is
 * Indian-context (gully cricket, badminton at societies, etc.), all
 * hosts and players are in the same zone, and this lets server and
 * client renders agree without any client-zone hydration dance.
 */
export function formatEventDateTime(iso: string): string {
  const formatted = new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return formatted.replace(/\b(am|pm)\b/gi, m => m.toUpperCase());
}
