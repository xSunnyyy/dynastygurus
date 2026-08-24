export type RankingSourceKey = "fantasypros" | "keeptradecut";

export type SourcePlayerRank = {
  name: string;
  position: string; // QB/RB/WR/TE/K/etc
  team?: string | null;
  age?: number | null;
  rank: number; // 1 = best, within this source's own pool
  positionRank?: number | null;
  poolSize: number; // how many ranked players this source published (for normalizing)
  // When a source publishes a continuous value (e.g. KeepTradeCut's 0-9999
  // dynasty trade value) rather than just an ordinal rank, it can supply a
  // 0-100 percentile here so the consensus math preserves real value gaps
  // instead of flattening them into equal rank steps.
  percentileOverride?: number;
};

export type SourceResult = {
  source: RankingSourceKey;
  label: string;
  ok: boolean;
  error?: string;
  fetchedAt: string;
  players: SourcePlayerRank[];
};

export type SourceRankRef = { rank: number; positionRank?: number | null };

export type ConsensusPlayer = {
  sleeperId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  age: number | null;
  consensusScore: number; // 0-100ish, higher = better
  consensusRank: number | null; // overall rank among matched players
  positionRank: number | null; // rank within position among matched players
  sources: Partial<Record<RankingSourceKey, SourceRankRef>>;
};

export type TeamRankingRow = {
  rosterId: number;
  teamName: string;
  ownerName: string;
  ownerAvatar: string | null;

  powerRank: number;
  powerScore: number;

  // Actual results so far this season, straight from Sleeper.
  currentRecord: { wins: number; losses: number; ties: number };
  // How much weight actual results (vs. roster talent) carry in the blend
  // below — grows from 0 toward 1 as more games are played.
  resultsWeight: number;

  expectedWins: number;
  expectedLosses: number;
  expectedWinPct: number;

  positionRanks: Record<"QB" | "RB" | "WR" | "TE", number | null>;
  positionStrength: Record<"QB" | "RB" | "WR" | "TE", number>;

  avgAge: number | null;

  needs: string[];

  roster: Array<{
    sleeperId: string;
    name: string;
    position: string;
    nflTeam: string | null;
    age: number | null;
    isStarter: boolean;
    lineupSlot: string | null; // which starting slot this player fills, if any
    consensusRank: number | null;
    positionRank: number | null;
    consensusScore: number;
  }>;
};

export type RankingsResponse = {
  season: string;
  leagueName: string;
  numTeams: number;
  regularSeasonGames: number;
  fetchedAt: string;
  sources: Array<{ source: RankingSourceKey; label: string; ok: boolean; error?: string; fetchedAt: string; count: number }>;
  unavailableSources: Array<{ label: string; reason: string }>;
  teams: TeamRankingRow[];
};
