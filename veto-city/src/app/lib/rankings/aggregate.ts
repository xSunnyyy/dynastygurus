import type { SleeperPlayerMap } from "../players";
import { playerName } from "../players";
import { buildSleeperNameIndex, matchSleeperId } from "./match";
import type {
  ConsensusPlayer,
  RankingSourceKey,
  RankingsResponse,
  SourceResult,
  TeamRankingRow,
} from "./types";

// How much weight each source's percentile score carries in the consensus.
// Both sources are dynasty-native and community-trusted (FantasyPros is a
// ~20-expert consensus, KeepTradeCut a crowdsourced trade-value consensus),
// so they're weighted evenly.
const SOURCE_WEIGHTS: Record<RankingSourceKey, number> = {
  fantasypros: 0.5,
  keeptradecut: 0.5,
};

// Shrinkage constant for blending roster-talent projections with actual
// results: after this many games played, real results carry as much weight
// as the talent prior; beyond it, real results dominate. Standard empirical-
// Bayes-style regression toward the mean for small in-season samples.
const RESULTS_REGRESSION_GAMES = 4;

const SCORED_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type ScoredPosition = (typeof SCORED_POSITIONS)[number];

function isScoredPosition(pos: string): pos is ScoredPosition {
  return (SCORED_POSITIONS as readonly string[]).includes(pos);
}

// Slot -> eligible positions, ordered narrowest-first so single-position
// slots get filled before flexible ones during the greedy lineup fill.
const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DST"],
  REC_FLEX: ["WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  FLEX: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};

function buildConsensus(
  sources: SourceResult[],
  playersMap: SleeperPlayerMap
): Map<string, ConsensusPlayer> {
  const index = buildSleeperNameIndex(playersMap);

  // sleeperId -> per-source weighted percentile contributions
  const contributions = new Map<
    string,
    { weightSum: number; scoreSum: number; sources: ConsensusPlayer["sources"]; position: string }
  >();

  for (const src of sources) {
    if (!src.ok) continue;
    const weight = SOURCE_WEIGHTS[src.source] ?? 0.3;

    for (const p of src.players) {
      const sleeperId = matchSleeperId(index, p.name, p.position);
      if (!sleeperId) continue;

      // Prefer a source's own value-based percentile (preserves real talent
      // gaps) and fall back to a rank-based percentile — 1st ranked ~= 100,
      // last ~= 0 — for sources that only publish an ordinal rank.
      const percentile =
        p.percentileOverride ?? 100 * (1 - (p.rank - 1) / Math.max(1, p.poolSize - 1));

      const entry = contributions.get(sleeperId) || {
        weightSum: 0,
        scoreSum: 0,
        sources: {},
        position: p.position,
      };
      entry.weightSum += weight;
      entry.scoreSum += weight * percentile;
      entry.sources[src.source] = { rank: p.rank, positionRank: p.positionRank ?? null };
      contributions.set(sleeperId, entry);
    }
  }

  const consensus = new Map<string, ConsensusPlayer>();
  for (const [sleeperId, c] of contributions.entries()) {
    const meta = playersMap[sleeperId];
    const score = c.weightSum > 0 ? c.scoreSum / c.weightSum : 0;
    consensus.set(sleeperId, {
      sleeperId,
      name: playerName(meta, sleeperId),
      position: meta?.position || c.position,
      nflTeam: meta?.team ?? null,
      age: meta?.age ?? null,
      consensusScore: score,
      consensusRank: null,
      positionRank: null,
      sources: c.sources,
    });
  }

  // Rank overall (among matched players) and within position.
  const ranked = Array.from(consensus.values()).sort((a, b) => b.consensusScore - a.consensusScore);
  ranked.forEach((p, i) => (p.consensusRank = i + 1));

  const byPosition = new Map<string, ConsensusPlayer[]>();
  for (const p of ranked) {
    const list = byPosition.get(p.position) || [];
    list.push(p);
    byPosition.set(p.position, list);
  }
  for (const list of byPosition.values()) {
    list.forEach((p, i) => (p.positionRank = i + 1));
  }

  return consensus;
}

function scoreFor(consensus: Map<string, ConsensusPlayer>, sleeperId: string): number {
  return consensus.get(sleeperId)?.consensusScore ?? 0;
}

type LineupResult = {
  slots: Array<{ slot: string; sleeperId: string | null }>;
  usedIds: Set<string>;
};

// Greedily fills the roster's starting slots with whichever eligible rostered
// player has the highest consensus score, narrowest-eligibility slots first.
// Not a guaranteed-optimal assignment, but a good approximation for a power
// ranking heuristic.
function fillLineup(
  rosterPositions: string[],
  rosterIds: string[],
  consensus: Map<string, ConsensusPlayer>,
  playersMap: SleeperPlayerMap
): LineupResult {
  const slots = rosterPositions.filter((s) => s !== "BN" && SLOT_ELIGIBILITY[s]);
  slots.sort((a, b) => SLOT_ELIGIBILITY[a].length - SLOT_ELIGIBILITY[b].length);

  const available = new Set(rosterIds);
  const result: LineupResult = { slots: [], usedIds: new Set() };

  for (const slot of slots) {
    const eligiblePositions = SLOT_ELIGIBILITY[slot];
    let best: string | null = null;
    let bestScore = -Infinity;

    for (const pid of available) {
      const pos = (playersMap[pid]?.position || "").toUpperCase();
      const normalizedPos = pos === "DEF" ? "DST" : pos;
      if (!eligiblePositions.includes(normalizedPos)) continue;
      const score = scoreFor(consensus, pid);
      if (score > bestScore) {
        bestScore = score;
        best = pid;
      }
    }

    if (best) {
      available.delete(best);
      result.usedIds.add(best);
      result.slots.push({ slot, sleeperId: best });
    } else {
      result.slots.push({ slot, sleeperId: null });
    }
  }

  return result;
}

function computeNeeds(positionRanks: Record<ScoredPosition, number | null>, numTeams: number): string[] {
  const labels: Record<ScoredPosition, string> = { QB: "QB", RB: "RB depth", WR: "WR depth", TE: "TE" };
  const bottomThird = Math.ceil(numTeams * (2 / 3)); // rank strictly worse than this = bottom third

  const weak = SCORED_POSITIONS.map((pos) => ({ pos, rank: positionRanks[pos] }))
    .filter((x): x is { pos: ScoredPosition; rank: number } => x.rank != null && x.rank > bottomThird)
    .sort((a, b) => b.rank - a.rank);

  if (weak.length > 0) return weak.slice(0, 2).map((w) => labels[w.pos]);

  // Nothing glaring — surface the single relatively-weakest position instead.
  const worst = SCORED_POSITIONS.map((pos) => ({ pos, rank: positionRanks[pos] }))
    .filter((x): x is { pos: ScoredPosition; rank: number } => x.rank != null)
    .sort((a, b) => b.rank - a.rank)[0];

  return worst ? [`Watch: ${labels[worst.pos]}`] : [];
}

export function computeRankings(params: {
  league: any;
  users: any[];
  rosters: any[];
  playersMap: SleeperPlayerMap;
  sources: SourceResult[];
}): RankingsResponse {
  const { league, users, rosters, playersMap, sources } = params;

  const consensus = buildConsensus(sources, playersMap);
  const rosterPositions: string[] = Array.isArray(league?.roster_positions) ? league.roster_positions : [];
  const numTeams = rosters.length;

  const userById = new Map<string, any>(users.map((u) => [u.user_id, u]));

  type TeamCalc = {
    rosterId: number;
    teamName: string;
    ownerName: string;
    ownerAvatar: string | null;
    talentScore: number;
    avgAge: number | null;
    positionStrength: Record<ScoredPosition, number>;
    roster: TeamRankingRow["roster"];
    currentRecord: { wins: number; losses: number; ties: number };
    gamesPlayed: number;
    pythWinPct: number;
  };

  const teamCalcs: TeamCalc[] = rosters.map((r: any) => {
    const owner = r.owner_id ? userById.get(r.owner_id) : undefined;
    const ownerName = owner?.display_name?.trim() || owner?.username?.trim() || "";
    const teamName = owner?.metadata?.team_name?.trim() || ownerName || `Team ${r.roster_id}`;
    const ownerAvatar = owner?.avatar ? `https://sleepercdn.com/avatars/${owner.avatar}` : null;

    const rosterIds: string[] = Array.isArray(r.players) ? r.players : [];
    const lineup = fillLineup(rosterPositions, rosterIds, consensus, playersMap);

    // Depth bonus: best remaining (non-starting) player at each scored position,
    // discounted, so two similarly-talented starting rooms are separated by
    // who has a capable RB2/WR3 behind them.
    const remaining = rosterIds.filter((pid) => !lineup.usedIds.has(pid));
    const bestRemainingByPos = new Map<ScoredPosition, number>();
    for (const pid of remaining) {
      const pos = (playersMap[pid]?.position || "").toUpperCase();
      if (!isScoredPosition(pos)) continue;
      const score = scoreFor(consensus, pid);
      bestRemainingByPos.set(pos, Math.max(bestRemainingByPos.get(pos) ?? 0, score));
    }

    const positionStrength: Record<ScoredPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    let talentScore = 0;

    for (const { slot, sleeperId } of lineup.slots) {
      if (!sleeperId) continue;
      const score = scoreFor(consensus, sleeperId);
      talentScore += score;
      if (SLOT_ELIGIBILITY[slot]?.[0] && slot !== "K" && slot !== "DEF") {
        const pos = (playersMap[sleeperId]?.position || "").toUpperCase();
        if (isScoredPosition(pos)) positionStrength[pos] += score;
      }
    }

    for (const [pos, score] of bestRemainingByPos.entries()) {
      positionStrength[pos] += score * 0.25;
    }
    talentScore += remaining.reduce((sum, pid) => sum + scoreFor(consensus, pid), 0) * 0.1;

    const ages = rosterIds.map((pid) => playersMap[pid]?.age).filter((a): a is number => typeof a === "number");
    const avgAge = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null;

    const rs = r.settings || {};
    const wins = Number(rs.wins) || 0;
    const losses = Number(rs.losses) || 0;
    const ties = Number(rs.ties) || 0;
    const gamesPlayed = wins + losses + ties;
    const pf = (Number(rs.fpts) || 0) + (Number(rs.fpts_decimal) || 0) / 100;
    const pa = (Number(rs.fpts_against) || 0) + (Number(rs.fpts_against_decimal) || 0) / 100;
    // Standard Pythagorean win expectation (points-for^2 over PF^2+PA^2) —
    // the same sabermetric approach used across sports to estimate a team's
    // "true" win rate from scoring margin rather than raw win-loss luck.
    const pythWinPct = pf + pa > 0 ? pf ** 2 / (pf ** 2 + pa ** 2) : 0.5;

    const roster: TeamRankingRow["roster"] = rosterIds.map((pid) => {
      const meta = playersMap[pid];
      const c = consensus.get(pid);
      const slotEntry = lineup.slots.find((s) => s.sleeperId === pid);
      return {
        sleeperId: pid,
        name: playerName(meta, pid),
        position: meta?.position || "",
        nflTeam: meta?.team ?? null,
        age: meta?.age ?? null,
        isStarter: !!slotEntry,
        lineupSlot: slotEntry?.slot ?? null,
        consensusRank: c?.consensusRank ?? null,
        positionRank: c?.positionRank ?? null,
        consensusScore: c?.consensusScore ?? 0,
      };
    });
    roster.sort((a, b) => b.consensusScore - a.consensusScore);

    return {
      rosterId: r.roster_id,
      teamName,
      ownerName,
      ownerAvatar,
      talentScore,
      avgAge,
      positionStrength,
      roster,
      currentRecord: { wins, losses, ties },
      gamesPlayed,
      pythWinPct,
    };
  });

  const positionRanksByRoster = new Map<number, Record<ScoredPosition, number | null>>();
  for (const pos of SCORED_POSITIONS) {
    const sorted = [...teamCalcs].sort((a, b) => b.positionStrength[pos] - a.positionStrength[pos]);
    sorted.forEach((t, i) => {
      const existing = positionRanksByRoster.get(t.rosterId) || { QB: null, RB: null, WR: null, TE: null };
      existing[pos] = i + 1;
      positionRanksByRoster.set(t.rosterId, existing);
    });
  }

  const mean = teamCalcs.reduce((s, t) => s + t.talentScore, 0) / Math.max(1, teamCalcs.length);
  const variance =
    teamCalcs.reduce((s, t) => s + (t.talentScore - mean) ** 2, 0) / Math.max(1, teamCalcs.length);
  const stdDev = Math.sqrt(variance) || 1;

  const settings = league?.settings || {};
  const playoffStart = Number(settings.playoff_week_start) || 15;
  const regularSeasonGames = Math.max(1, playoffStart - 1);

  // Power rank and expected record both come from the same blended win%:
  // a roster-talent projection (via z-score of the lineup's consensus value)
  // shrunk toward this season's actual Pythagorean win expectation as more
  // games get played. Early season leans on talent; a half-season in, real
  // results dominate. This keeps "power rank" and "expected record" mutually
  // consistent instead of two competing opinions about the same team.
  const blended = teamCalcs.map((t) => {
    const talentZ = (t.talentScore - mean) / stdDev;
    const talentWinPct = Math.min(0.94, Math.max(0.06, 0.5 + talentZ * 0.11));
    const resultsWeight = t.gamesPlayed / (t.gamesPlayed + RESULTS_REGRESSION_GAMES);
    const blendedWinPct = (1 - resultsWeight) * talentWinPct + resultsWeight * t.pythWinPct;
    return { calc: t, resultsWeight, blendedWinPct };
  });

  blended.sort(
    (a, b) => b.blendedWinPct - a.blendedWinPct || b.calc.talentScore - a.calc.talentScore
  );

  const teams: TeamRankingRow[] = blended.map(({ calc: t, resultsWeight, blendedWinPct }, i) => {
    const expectedWins = Math.round(blendedWinPct * regularSeasonGames);
    const positionRanks = positionRanksByRoster.get(t.rosterId) || { QB: null, RB: null, WR: null, TE: null };

    return {
      rosterId: t.rosterId,
      teamName: t.teamName,
      ownerName: t.ownerName,
      ownerAvatar: t.ownerAvatar,
      powerRank: i + 1,
      powerScore: blendedWinPct * 100,
      currentRecord: t.currentRecord,
      resultsWeight,
      expectedWins,
      expectedLosses: regularSeasonGames - expectedWins,
      expectedWinPct: blendedWinPct,
      positionRanks,
      positionStrength: t.positionStrength,
      avgAge: t.avgAge,
      needs: computeNeeds(positionRanks, numTeams),
      roster: t.roster,
    };
  });

  return {
    season: String(league?.season || ""),
    leagueName: league?.name || "League",
    numTeams,
    regularSeasonGames,
    fetchedAt: new Date().toISOString(),
    sources: sources.map((s) => ({
      source: s.source,
      label: s.label,
      ok: s.ok,
      error: s.error,
      fetchedAt: s.fetchedAt,
      count: s.players.length,
    })),
    unavailableSources: [
      { label: "CBS Sports", reason: "Rankings are rendered client-side with no public data feed to fetch." },
      { label: "NFL.com", reason: "Rankings are rendered client-side with no public data feed to fetch." },
    ],
    teams,
  };
}
