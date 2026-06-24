import { getServerAuth } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { headers } from 'next/headers';
import AthleteCard from '@/components/AthleteCard';
import SpeedGunLauncher from '@/components/SpeedGunLauncher';
import AvatarUpload from '@/components/AvatarUpload';
import FeedMatchCard from '@/components/FeedMatchCard';
import ShareButton from '@/components/ShareButton';
import { buildAthleteData, enrichStatsWithTeamNames, type RawStat } from '@/lib/athleteData';
import { fetchPlayerDetailedStats } from '@/lib/playerDetailedStats';
import { getPendingMatchesForUser } from '@/lib/matchConfirmationServer';
import PendingMatchesSection from '@/components/PendingMatchesSection';
import CricketStatsSection from '@/components/CricketStatsSection';
import FootballStatsPanel from '@/components/FootballStatsPanel';
import RacquetStatsPanel from '@/components/RacquetStatsPanel';
import FoosballStatsPanel from '@/components/FoosballStatsPanel';
import NearbyPickupsRail from '@/components/NearbyPickupsRail';
import SportIcon from '@/components/SportIcon';
import type { SportType } from '@/types';
import { calcCaliber, getCaliberLabel, SportKey } from '@/lib/caliber';
import TrophyBanner, { Achievement } from '@/components/TrophyBanner';
import { isMatchExcludedFromStats, type ConfirmationState } from '@/lib/matchConfirmation';
import { getTrustScoreForPlayer } from '@/lib/trustScoreServer';

export default async function DashboardPage() {
  const { supabase, user } = await getServerAuth();

  const statsSelect = `
    sport, runs_scored, wickets_taken, catches_taken, goals_scored, balls_faced, fours, sixes,
    balls_bowled, runs_conceded, is_out, match_id,
    matches(winner_team_id, winner_team_name, team_a_id, team_b_id, team_a_name, team_b_name, confirmation_state)
  `;

  const [
    pendingForMe,
    hdrs,
    trustScore,
    bundle,
  ] = await Promise.all([
    user ? getPendingMatchesForUser(user.id) : Promise.resolve([]),
    headers(),
    getTrustScoreForPlayer(user!.id, supabase),
    Promise.all([
      supabase.from('profiles').select('id, name, avatar_url, created_at').eq('id', user!.id).single(),
      supabase.from('player_match_stats').select(statsSelect).eq('player_id', user!.id),
      supabase
        .from('match_players')
        .select('match_id, team_name')
        .eq('player_id', user!.id),
    ]),
  ]);

  const [{ data: profile }, { data: myStats }, { data: myMatchPlayers }] = bundle;

  // Include matches the player was added to (match_players) even when they
  // have no player_match_stats row yet — e.g. a cricket player who hasn't
  // batted/bowled. Mirrors the /matches page so the dashboard feed matches it.
  const myMatchIds = [...new Set([
    ...(myStats ?? []).map(s => s.match_id),
    ...(myMatchPlayers ?? []).map(p => p.match_id),
  ])];

  const [rawFeedRes, detailedStats] = await Promise.all([
    myMatchIds.length > 0
      ? supabase
          .from('matches')
          .select(`id, sport, status, confirmation_state, team_a_name, team_b_name, winner_team_id, winner_team_name, team_a_id, team_b_id, played_at,
          match_scores(team_name, runs, wickets, overs_faced, goals, sets),
          player_match_stats(player_id, runs_scored, wickets_taken, catches_taken, goals_scored, profiles(id, name))`)
          .in('id', myMatchIds)
          .neq('status', 'upcoming')
          .order('played_at', { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] }),
    fetchPlayerDetailedStats(
      user!.id,
      (myStats ?? []) as unknown as RawStat[],
      (myMatchPlayers ?? []) as Array<{ match_id: string; team_name: string }>,
      supabase,
    ),
  ]);

  const rawFeed = rawFeedRes.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveMatches = ((rawFeed ?? []) as any[]).filter(m => m.status === 'live').slice(0, 5);

  const enrichedStats = enrichStatsWithTeamNames(
    (myStats ?? []) as unknown as Parameters<typeof enrichStatsWithTeamNames>[0],
    (myMatchPlayers ?? []) as Array<{ match_id: string; team_name: string }>,
  );

  const athleteData = buildAthleteData(
    profile ?? { id: user!.id, name: 'Player', avatar_url: null, created_at: new Date().toISOString() },
    enrichedStats
  );

  // Same expandable per-sport details we use on profile pages, so the
  // dashboard AthleteCard becomes interactive too — no extra section needed.
  // (Fetched in parallel with the recent-matches feed above.)
  const expandableDetails: Partial<Record<SportKey, React.ReactNode>> = {};
  if (detailedStats.cricket.innings > 0
      || detailedStats.cricket.bowlingInnings > 0
      || detailedStats.cricket.totalCatches > 0) {
    expandableDetails.cricket = <CricketStatsSection detail={detailedStats.cricket} />;
  }
  if (detailedStats.football.matches > 0) {
    expandableDetails.football = <FootballStatsPanel detail={detailedStats.football} />;
  }
  if (detailedStats.badminton.matches > 0) {
    expandableDetails.badminton = <RacquetStatsPanel detail={detailedStats.badminton} showFormatSplit />;
  }
  if (detailedStats.tableTennis.matches > 0) {
    expandableDetails.table_tennis = <RacquetStatsPanel detail={detailedStats.tableTennis} />;
  }
  if (detailedStats.pickleball.matches > 0) {
    expandableDetails.pickleball = <RacquetStatsPanel detail={detailedStats.pickleball} />;
  }
  if (detailedStats.foosball.matches > 0) {
    expandableDetails.foosball = <FoosballStatsPanel detail={detailedStats.foosball} />;
  }

  // Sport ordering on the dashboard: most-played and recently-played sports
  // float to the top so the player's current focus is the first thing they
  // see. Composite rank = matches × recency-weight (exp decay, ~90 day
  // half-life). Profile pages keep the canonical order — the dashboard is
  // the only surface where the player's *own* recent activity should reshape
  // the layout.
  //
  // Last-played per sport is derived from `rawFeed` (15 most recent matches)
  // — sports that haven't surfaced in the recent window contribute zero to
  // the recency term, which is fine because their `matches × exp(-large)`
  // score is dominated by sports the player has actually played lately.
  const HALF_LIFE_DAYS = 90;
  const now = new Date().getTime();
  const lastPlayedBySport = new Map<SportKey, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (rawFeed ?? []) as any[]) {
    if (!m.sport || !m.played_at) continue;
    const t = new Date(m.played_at).getTime();
    const prev = lastPlayedBySport.get(m.sport as SportKey) ?? 0;
    if (t > prev) lastPlayedBySport.set(m.sport as SportKey, t);
  }
  function rankFor(matches: number, sport: SportKey): number {
    if (matches === 0) return -1;
    const lastMs = lastPlayedBySport.get(sport);
    if (!lastMs) return matches;            // played but not in recent window → fall back to volume
    const ageDays = Math.max(0, (now - lastMs) / 86_400_000);
    return matches * Math.exp(-ageDays / HALF_LIFE_DAYS);
  }
  // Use the AthleteData summary stats (sportStats) for the volume term so
  // every sport contributes its real match count, including ones not in
  // detailedStats (cricket innings ≠ matches, etc.).
  const sportRanks: { key: SportKey; rank: number }[] = (
    ['cricket', 'football', 'badminton', 'table_tennis', 'pickleball', 'foosball'] as SportKey[]
  ).map(key => ({
    key,
    rank: rankFor(athleteData.sportStats[key].matches, key),
  }));
  // Sort descending by rank; ties (incl. zero-matches sports at -1) keep
  // canonical input order — Array.prototype.sort in V8/Node is stable.
  const sportOrder = [...sportRanks].sort((a, b) => b.rank - a.rank).map(r => r.key);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feedMatches = (rawFeed ?? []).map((m: any) => ({
    ...m,
    player_performances: (m.player_match_stats ?? []).map((s: { player_id: string; runs_scored: number; wickets_taken: number; catches_taken: number; goals_scored: number; profiles: { id: string; name: string } | null }) => ({
      player_id: s.player_id,
      name: s.profiles?.name ?? 'Unknown',
      runs_scored: s.runs_scored,
      wickets_taken: s.wickets_taken,
      catches_taken: s.catches_taken,
      goals_scored: s.goals_scored,
    })),
  }));

  const firstName = profile?.name?.trim().split(' ')[0] || 'Player';

  // Compute per-match achievements for trophy banners
  const achievements: Achievement[] = [];
  const impactScore = (p: { runs_scored: number; wickets_taken: number; catches_taken: number }) =>
    (p.runs_scored ?? 0) + (p.wickets_taken ?? 0) * 20 + (p.catches_taken ?? 0) * 10;

  for (const stat of myStats ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const confState = (stat as any).matches?.confirmation_state as ConfirmationState | undefined;
    if (isMatchExcludedFromStats(confState)) continue;
    const mid = stat.match_id;
    if ((stat.runs_scored ?? 0) >= 100)
      achievements.push({ id: `century_${mid}`, emoji: '💯', title: 'Century!', subtitle: `${stat.runs_scored} runs`, color: 'gold' });
    else if ((stat.runs_scored ?? 0) >= 50)
      achievements.push({ id: `fifty_${mid}`, emoji: '⚡', title: 'Half-Century!', subtitle: `${stat.runs_scored} runs`, color: 'emerald' });

    if ((stat.wickets_taken ?? 0) >= 10)
      achievements.push({ id: `10wkt_${mid}`, emoji: '🏆', title: 'Bowling Legend!', subtitle: `${stat.wickets_taken} wickets`, color: 'gold' });
    else if ((stat.wickets_taken ?? 0) >= 5)
      achievements.push({ id: `5wkt_${mid}`, emoji: '🔥', title: '5-Wicket Haul!', subtitle: `${stat.wickets_taken} wickets`, color: 'red' });
    else if ((stat.wickets_taken ?? 0) >= 3)
      achievements.push({ id: `3wkt_${mid}`, emoji: '🎯', title: 'Hat-Trick Hero!', subtitle: `${stat.wickets_taken} wickets`, color: 'blue' });

    if ((stat.catches_taken ?? 0) >= 3)
      achievements.push({ id: `catches_${mid}`, emoji: '🧤', title: 'Catch Master!', subtitle: `${stat.catches_taken} catches`, color: 'emerald' });

    // Football goal trophies — graduated tiers so every scorer gets seen.
    // 1 → Goal Scorer, 2 → Brace, 3+ → Hat-Trick Hero, 5+ → Goal Fest.
    const goals = stat.goals_scored ?? 0;
    if (goals >= 5)
      achievements.push({ id: `goals_${mid}`, emoji: '🔥', title: 'Goal Fest!', subtitle: `${goals} goals`, color: 'gold' });
    else if (goals >= 3)
      achievements.push({ id: `hattrick_${mid}`, emoji: '⚽⚽⚽', title: 'Hat-Trick Hero!', subtitle: `${goals} goals`, color: 'red' });
    else if (goals === 2)
      achievements.push({ id: `brace_${mid}`, emoji: '⚽⚽', title: 'Brace!', subtitle: '2 goals', color: 'emerald' });
    else if (goals === 1)
      achievements.push({ id: `goal_${mid}`, emoji: '⚽', title: 'Goal Scored!', subtitle: '1 goal', color: 'blue' });
  }

  // MVP: highest impact player in each completed match
  for (const match of feedMatches) {
    if (match.status !== 'completed') continue;
    if (match.confirmation_state !== 'confirmed') continue;
    const perfs: { player_id: string; runs_scored: number; wickets_taken: number; catches_taken: number }[] =
      match.player_performances ?? [];
    if (perfs.length === 0) continue;
    const sorted = [...perfs].sort((a, b) => impactScore(b) - impactScore(a));
    if (sorted[0]?.player_id === user!.id && impactScore(sorted[0]) > 0)
      achievements.push({ id: `mvp_${match.id}`, emoji: '🥇', title: 'Match MVP!', subtitle: `${match.team_a_name} vs ${match.team_b_name}`, color: 'gold' });
  }

  // Badminton / Table Tennis: award match-win trophies
  const myTeamByMatch = new Map<string, string>();
  for (const mp of myMatchPlayers ?? []) myTeamByMatch.set(mp.match_id, mp.team_name);
  for (const stat of myStats ?? []) {
    if (stat.sport !== 'badminton' && stat.sport !== 'table_tennis') continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const confState = (stat as any).matches?.confirmation_state as ConfirmationState | undefined;
    if (isMatchExcludedFromStats(confState)) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (stat as any).matches as { winner_team_name?: string | null } | null;
    const playerTeam = myTeamByMatch.get(stat.match_id);
    if (!m?.winner_team_name || !playerTeam || m.winner_team_name !== playerTeam) continue;

    if (stat.sport === 'badminton') {
      achievements.push({ id: `bmn_win_${stat.match_id}`, emoji: '🏸', title: 'Badminton Win!', subtitle: 'You won the match', color: 'emerald' });
    } else {
      achievements.push({ id: `tt_win_${stat.match_id}`, emoji: '🏓', title: 'Table Tennis Win!', subtitle: 'You won the match', color: 'emerald' });
    }
  }

  // Share-my-profile setup — points share targets at the public /p/<id> route
  // so anyone (logged-out included) can open the link, with a versioned OG
  // image for fresh previews.
  const host = hdrs.get('host') ?? '';
  const proto = hdrs.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  const myShareUrl = `${origin}/p/${user!.id}`;
  const myOgVersion = `${profile?.avatar_url ?? 'noavatar'}|${profile?.name ?? ''}`
    .split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const myOgImageUrl = `${origin}/p/${user!.id}/opengraph-image?v=${Math.abs(myOgVersion)}`;
  const mySportLines = (['cricket', 'football', 'badminton', 'table_tennis', 'pickleball', 'foosball'] as SportKey[])
    .filter(s => athleteData.sportStats[s].matches > 0)
    .map(s => {
      const score = calcCaliber(s, athleteData.sportStats[s]);
      const label = getCaliberLabel(score);
      const emoji =
          s === 'cricket'      ? '🏏'
        : s === 'football'     ? '⚽'
        : s === 'badminton'    ? '🏸'
        : s === 'table_tennis' ? '🏓'
        : s === 'foosball'     ? '🥅'
        : s === 'pickleball'   ? '🥒'
        :                        '🎯';
      return `${emoji} ${label} (${score})`;
    });
  const myShareText = [`🏆 ${athleteData.name || 'My'} profile on GullySports`, ...mySportLines].join('\n');
  const myImageFilename = `${(athleteData.name || 'gullysports').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-gullysports.png`;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-white">Hey, {firstName} 👋</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your player profile</p>
      </div>

      {/* Trophy notifications */}
      {achievements.length > 0 && <TrophyBanner achievements={achievements} />}

      {/* Athlete card hero — sport bars are tap-to-expand. Start collapsed
          on the dashboard so the rest of the page (live, recent, etc.) stays
          visible without scrolling. */}
      <AthleteCard
        athlete={athleteData}
        isOwn
        editSlot={<AvatarUpload userId={user!.id} />}
        expandableDetails={expandableDetails}
        defaultOpenSport={null}
        trustScore={trustScore}
        sportOrder={sportOrder}
      />

      {/* Trust workflow — needs your attention. Sits right under the hero
          so you can't miss it. Renders nothing when there's nothing pending. */}
      {pendingForMe.length > 0 && (
        <PendingMatchesSection matches={pendingForMe} />
      )}

      {/* Need Players Now — geo-aware rail of nearby live pickup requests.
          Client component (needs GPS). Renders nothing until geolocation
          resolves, then surfaces a horizontal scroll of nearby pings. */}
      <NearbyPickupsRail viewerId={user!.id} />

      {/* New match CTA — one tile per sport. Grid wraps to a second row
          on mobile (2 cols) so all six sports stay visible without
          horizontal scroll, and shows three across on small screens. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {([
          { sport: 'cricket' as SportType,      label: 'Cricket' },
          { sport: 'football' as SportType,     label: 'Football' },
          { sport: 'badminton' as SportType,    label: 'Badminton' },
          { sport: 'table_tennis' as SportType, label: 'T. Tennis' },
          { sport: 'pickleball' as SportType,   label: 'Pickleball' },
          { sport: 'foosball' as SportType,     label: 'Foosball' },
        ]).map(({ sport, label }) => (
          <Link
            key={sport}
            href={`/matches/new?sport=${sport}`}
            className="flex items-center justify-center gap-1.5 bg-gray-900 border border-gray-800 hover:border-emerald-700 hover:bg-emerald-950/20 rounded-xl py-2.5 text-sm text-gray-400 hover:text-emerald-400 font-medium transition-all"
          >
            <SportIcon sport={sport} /> + {label}
          </Link>
        ))}
      </div>

      <SpeedGunLauncher variant="card" />

      {/* Live now — only user's live matches */}
      {liveMatches && liveMatches.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <h2 className="text-sm font-semibold text-white">Live Now</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(liveMatches as any[]).map(m => {
              const sA = m.match_scores?.find((s: { team_name: string }) => s.team_name === m.team_a_name);
              const sB = m.match_scores?.find((s: { team_name: string }) => s.team_name === m.team_b_name);
              const emoji =
                  m.sport === 'cricket'      ? '🏏'
                : m.sport === 'football'     ? '⚽'
                : m.sport === 'badminton'    ? '🏸'
                : m.sport === 'table_tennis' ? '🏓'
                : m.sport === 'foosball'     ? '🥅'
                : m.sport === 'pickleball'   ? '🥒'
                :                              '🎯';
              return (
                <Link key={m.id} href={`/matches/${m.id}`}
                  className="flex-shrink-0 bg-red-950/30 border border-red-900/50 rounded-2xl p-3 w-44 hover:border-red-700 transition-colors">
                  <p className="text-xs text-red-400 font-semibold mb-2">{emoji} LIVE</p>
                  <p className="text-xs text-gray-300 truncate">{m.team_a_name}</p>
                  <p className="text-lg font-bold text-white">{m.sport === 'cricket' ? `${sA?.runs ?? 0}/${sA?.wickets ?? 0}` : sA?.goals ?? 0}</p>
                  <p className="text-xs text-gray-600 my-0.5">vs</p>
                  <p className="text-xs text-gray-300 truncate">{m.team_b_name}</p>
                  <p className="text-lg font-bold text-white">{m.sport === 'cricket' ? `${sB?.runs ?? 0}/${sB?.wickets ?? 0}` : sB?.goals ?? 0}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent matches — only user's matches */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Recent Matches</h2>
          <Link href="/matches" className="text-xs text-emerald-400 hover:underline">View all</Link>
        </div>
        {feedMatches.length > 0 ? (
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {feedMatches.map((m: any) => <FeedMatchCard key={m.id} match={m} />)}
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
            <p className="text-3xl mb-2">🏟️</p>
            <p className="text-gray-500 text-sm">Play your first match to start building your profile</p>
            <Link href="/matches/new"
              className="inline-flex items-center gap-1.5 mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold">
              <Plus size={14} /> New Match
            </Link>
          </div>
        )}
      </div>

      {/* Share my profile — keep at the bottom so it doesn't break the
          identity → action → activity flow above. */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Share your profile</p>
          <p className="text-[11px] text-gray-500 truncate">Send your card on WhatsApp — link preview or as a photo</p>
        </div>
        <ShareButton
          text={myShareText}
          url={myShareUrl}
          title={`${athleteData.name || 'My'} – GullySports`}
          variant="inline"
          label="Share"
          imageUrl={myOgImageUrl}
          imageFilename={myImageFilename}
        />
      </div>
    </div>
  );
}
