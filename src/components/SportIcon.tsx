import FoosballIcon from './FoosballIcon';
import PickleballIcon from './PickleballIcon';

/**
 * Single source of truth for a sport's visual marker — emoji for the four
 * sports with native Unicode coverage, custom inline SVG for foosball and
 * pickleball (no emoji exists for either — foosball reads as "what is
 * that?" with a goal-net stand-in, pickleball is a paddle sport that
 * needs the crossed-paddle silhouette to be recognisable). The component
 * sizes via the surrounding text utility (`text-xl`, `text-2xl`, …) —
 * emoji honour `font-size`, the SVGs use `width="1em" height="1em"`.
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
  if (sport === 'pickleball') {
    return <PickleballIcon className={className} />;
  }
  return <span className={className}>{EMOJI_MAP[sport] ?? '🎯'}</span>;
}
