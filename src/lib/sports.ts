import type { SportType } from '@/types';

/**
 * Single source of truth for the supported-sports list. Every page that
 * needs to render a sport selector / filter / picker should import from
 * here — DO NOT inline a `['cricket', 'football', …]` array. Doing so
 * has bitten us repeatedly when adding a new sport: foosball was missed
 * on the tournaments CHECK constraint when it shipped; pickleball was
 * missed on /matches/new, /tournaments/new, /events/new, /teams/new,
 * /pickups/new and the profile PickupSettings until a user reported it.
 *
 * Order = canonical display order (cricket → football → racket family →
 * foosball). The 4-character short label is what fits cleanly inside a
 * 3-column grid tile on a 360-px-wide phone — keep new sports under that
 * budget unless the layout is updated too.
 */
export interface SportMeta {
  value: SportType;
  /** Full label — used on roomy surfaces (forms, badges). */
  label: string;
  /** Short label — used in narrow contexts (tabs, grid tiles). */
  shortLabel: string;
}

export const SPORTS_LIST: readonly SportMeta[] = [
  { value: 'cricket',      label: 'Cricket',      shortLabel: 'Cricket'    },
  { value: 'football',     label: 'Football',     shortLabel: 'Football'   },
  { value: 'badminton',    label: 'Badminton',    shortLabel: 'Badminton'  },
  { value: 'table_tennis', label: 'Table Tennis', shortLabel: 'T. Tennis'  },
  { value: 'pickleball',   label: 'Pickleball',   shortLabel: 'Pickleball' },
  { value: 'foosball',     label: 'Foosball',     shortLabel: 'Foosball'   },
] as const;

/** Sport `value` strings only — convenient when you just need keys. */
export const SPORT_VALUES: readonly SportType[] = SPORTS_LIST.map(s => s.value);
