import Link from 'next/link';
import CaliberBar from './CaliberBar';
import {
  calcCaliber, getPlayerTagline, getPlayerTaglines, getOverallLevel,
  getCaliberColor, getCaliberTierLabel, CALIBER_TIERS,
  SportKey, SportStat,
} from '@/lib/caliber';

export interface AthleteData {
  id: string;
  name: string;
  avatarUrl?: string | null;
  joinedYear: number;
  sportStats: Record<SportKey, SportStat>;
}


const sportMeta: { key: SportKey; emoji: string; label: string }[] = [
  { key: 'cricket', emoji: '🏏', label: 'Cricket' },
  { key: 'football', emoji: '⚽', label: 'Football' },
  { key: 'badminton', emoji: '🏸', label: 'Badminton' },
];

function statLine(sport: SportKey, s: SportStat): string {
  if (s.matches === 0) return 'No matches yet · Play to unlock';
  const winRate = Math.round((s.wins / s.matches) * 100);
  if (sport === 'cricket') {
    const avg = (s.runs / s.matches).toFixed(1);
    const parts = [`${s.runs} runs`, `avg ${avg}`];
    if (s.wickets > 0) parts.push(`${s.wickets} wkts`);
    if (s.catches > 0) parts.push(`${s.catches} catches`);
    parts.push(`${winRate}% wins`);
    return parts.join(' · ');
  }
  if (sport === 'football') {
    return [
      `${s.goals} goals`,
      `${(s.goals / s.matches).toFixed(1)}/match`,
      `${winRate}% wins`,
      `${s.matches} matches`,
    ].join(' · ');
  }
  return [`${winRate}% win rate`, `${s.matches} matches`].join(' · ');
}

interface Props {
  athlete: AthleteData;
  compact?: boolean;
  isOwn?: boolean;
  editSlot?: React.ReactNode;
}

export default function AthleteCard({ athlete, compact = false, isOwn = false, editSlot }: Props) {
  const { name, avatarUrl, sportStats, joinedYear } = athlete;
  const tagline = getPlayerTagline(sportStats);
  const sportTaglines = getPlayerTaglines(sportStats);
  const overallScore = getOverallLevel(sportStats);
  const { text: overallColor } = getCaliberColor(overallScore);
  const activeSportKeys = (sportMeta.filter(s => sportStats[s.key].matches > 0).map(s => s.key) as SportKey[]);
  const overallLabel = getCaliberTierLabel(overallScore, activeSportKeys);

  const totalMatches = Object.values(sportStats).reduce((a, s) => a + s.matches, 0);
  const totalWins = Object.values(sportStats).reduce((a, s) => a + s.wins, 0);
  const activeSports = sportMeta.filter(s => sportStats[s.key].matches > 0);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Header strip — score badge lives here so overflow-hidden never clips it */}
      <div className="h-20 bg-gradient-to-r from-gray-800 via-gray-900 to-gray-800 relative">
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, #10b981 0%, transparent 60%), radial-gradient(circle at 70% 50%, #0ea5e9 0%, transparent 60%)' }} />
        {overallScore > 0 ? (
          <div className="absolute top-3 right-4 text-right">
            <div className={`text-3xl font-black tabular-nums leading-none ${overallColor}`}
              style={{ textShadow: '0 0 18px currentColor' }}>
              {overallScore}
            </div>
            <div className={`text-xs font-semibold mt-1 leading-tight ${overallColor}`}>
              {overallLabel}
            </div>
          </div>
        ) : (
          <div className="absolute top-4 right-4 text-xs text-gray-700 font-medium">No rating yet</div>
        )}
      </div>

      <div className={compact ? 'px-4 pb-4' : 'px-5 pb-5'}>
        {/* Avatar row — no badge here, freed from clipping risk */}
        <div className="flex items-end -mt-10 mb-4">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt={name}
                className={`rounded-full border-4 border-gray-900 object-cover ${compact ? 'w-16 h-16' : 'w-20 h-20'}`} />
            ) : (
              <div className={`rounded-full border-4 border-gray-900 bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center font-bold text-white ${compact ? 'w-16 h-16 text-2xl' : 'w-20 h-20 text-3xl'}`}>
                {name[0].toUpperCase()}
              </div>
            )}
            {isOwn && editSlot && (
              <div className="absolute -bottom-1 -right-1">{editSlot}</div>
            )}
          </div>
        </div>

        {/* Name + tagline */}
        <div className="mb-1">
          <h2 className={`font-bold text-white leading-tight ${compact ? 'text-base' : 'text-xl'}`}>{name}</h2>
          {sportTaglines.length === 0 ? (
            <p className="text-sm text-gray-500 mt-0.5">{tagline}</p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {sportTaglines.map((t, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Mini stats + year */}
        {!compact && (
          <div className="flex items-center gap-3 mb-4 text-xs text-gray-600">
            <span><span className="text-white font-semibold">{totalMatches}</span> matches</span>
            <span>·</span>
            <span><span className="text-white font-semibold">{totalWins}</span> wins</span>
            <span>·</span>
            <span>Since {joinedYear}</span>
          </div>
        )}

        {/* Sport caliber bars */}
        <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
          {sportMeta.map(({ key, emoji, label }) => {
            const score = calcCaliber(key, sportStats[key]);
            const { text } = getCaliberColor(score);
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold ${sportStats[key].matches > 0 ? 'text-white' : 'text-gray-700'}`}>
                    {emoji} {label}
                  </span>
                  {!compact && sportStats[key].matches > 0 && (
                    <span className={`text-xs ${text}`}>{statLine(key, sportStats[key])}</span>
                  )}
                </div>
                <CaliberBar score={score} />
              </div>
            );
          })}
        </div>

        {/* Active sport emoji pills (compact only) */}
        {compact && activeSports.length > 0 && (
          <div className="flex gap-1 mt-3">
            {activeSports.map(s => (
              <span key={s.key} className="text-xs bg-gray-800 border border-gray-700 rounded-full px-2 py-0.5 text-gray-300">
                {s.emoji} {s.label}
              </span>
            ))}
          </div>
        )}

        {/* Caliber levels ladder */}
        {!compact && (
          <details className="mt-4 group">
            <summary className="list-none flex items-center justify-between cursor-pointer select-none">
              <span className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Caliber levels</span>
              <span className="text-xs text-gray-700 group-open:hidden">▾ show</span>
              <span className="text-xs text-gray-700 hidden group-open:inline">▴ hide</span>
            </summary>
            <div className="mt-2 flex flex-col gap-1.5">
              {CALIBER_TIERS.map(tier => {
                const active = overallScore === 0 ? tier.min === 0 : overallScore >= tier.min && overallScore <= tier.max;
                const { text: tierColor } = getCaliberColor(tier.min === 0 ? 0 : tier.min);
                return (
                  <div key={tier.label}
                    className={`rounded-xl px-3 py-2 border flex items-center gap-3 transition-colors ${
                      active ? 'border-gray-600 bg-gray-800' : 'border-gray-800/60 bg-gray-900/30'
                    }`}>
                    {/* Score range */}
                    <span className={`text-xs tabular-nums w-12 shrink-0 font-mono ${active ? 'text-gray-300' : 'text-gray-700'}`}>
                      {tier.range}
                    </span>
                    {/* Sport-specific names */}
                    <div className="flex-1 min-w-0">
                      {activeSportKeys.length === 0 ? (
                        <span className={`text-xs font-semibold ${active ? tierColor : 'text-gray-600'}`}>
                          {tier.sportNames.cricket}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                          {activeSportKeys.map(sk => (
                            <span key={sk} className={`text-xs font-semibold ${active ? tierColor : 'text-gray-600'}`}>
                              {tier.sportEmojis[sk]} {tier.sportNames[sk]}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {active && <span className={`text-xs font-bold shrink-0 ${tierColor}`}>← you</span>}
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

// Mini version for player grid
export function AthleteCardMini({ athlete }: { athlete: AthleteData }) {
  const overallScore = getOverallLevel(athlete.sportStats);
  const { text: overallColor } = getCaliberColor(overallScore);
  const tagline = getPlayerTagline(athlete.sportStats);

  return (
    <Link href={`/players/${athlete.id}`}>
      <div className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-2xl p-4 transition-all hover:-translate-y-0.5 cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          {athlete.avatarUrl ? (
            <img src={athlete.avatarUrl} alt={athlete.name}
              className="w-12 h-12 rounded-full border-2 border-gray-800 object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-xl font-bold text-white border-2 border-gray-800">
              {athlete.name[0].toUpperCase()}
            </div>
          )}
          {overallScore > 0 && (
            <div className={`text-lg font-black tabular-nums ${overallColor}`}>{overallScore}</div>
          )}
        </div>

        <p className="text-sm font-bold text-white truncate">{athlete.name}</p>
        <p className="text-xs text-gray-600 mt-0.5 truncate">{tagline}</p>

        <div className="flex flex-col gap-1.5 mt-3">
          {sportMeta.map(({ key, emoji }) => {
            const score = calcCaliber(key, athlete.sportStats[key]);
            const { bar } = getCaliberColor(score);
            return (
              <div key={key} className="flex items-center gap-1.5">
                <span className="text-xs w-4">{emoji}</span>
                <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full rounded-full ${score === 0 ? 'bg-gray-800' : bar}`}
                    style={{ width: `${score}%` }} />
                </div>
                <span className="text-xs text-gray-700 w-6 text-right tabular-nums">{score || '–'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Link>
  );
}
