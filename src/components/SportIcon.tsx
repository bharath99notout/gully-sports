import FoosballIcon from './FoosballIcon';

/**
 * Single source of truth for a sport's visual marker — emoji for the four
 * sports with native Unicode coverage, custom inline SVG for foosball
 * (no emoji exists, and a yo-yo / goal-net stand-in reads as "what is
 * that?" instead of "table football"). The component sizes via the
 * surrounding text utility (`text-xl`, `text-2xl`, …) — emoji honour
 * `font-size`, the SVG uses `width="1em" height="1em"`.
 *
 * Accepts an unknown `sport` string for callers that haven't been
 * tightened to the SportType enum yet — falls back to a target emoji
 * rather than throwing.
 */
const EMOJI_MAP: Record<string, string> = {
  cricket: '🏏',
  football: '⚽',
  badminton: '🏸',
  table_tennis: '🏓',
};

export default function SportIcon({
  sport, className,
}: {
  sport: string;
  className?: string;
}) {
  if (sport === 'foosball') {
    return <FoosballIcon className={className} />;
  }
  return <span className={className}>{EMOJI_MAP[sport] ?? '🎯'}</span>;
}
