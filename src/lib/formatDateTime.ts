/**
 * Single source of truth for formatting an event's start time.
 *
 * `toLocaleString('en-IN')` returns the AM/PM marker as "am"/"pm" (or
 * "Am"/"Pm" depending on the engine), which looks broken next to the
 * capitalised weekday/month. We force AM/PM uppercase so every surface
 * (events list, detail page, WhatsApp share message) reads consistently.
 */
export function formatEventDateTime(iso: string): string {
  const formatted = new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return formatted.replace(/\b(am|pm)\b/gi, m => m.toUpperCase());
}
