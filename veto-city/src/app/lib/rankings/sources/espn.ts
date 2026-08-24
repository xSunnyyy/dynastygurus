import type { SourcePlayerRank, SourceResult } from "../types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const POSITION_BY_ID: Record<number, string> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DST",
};

// Standard ESPN proTeamId -> abbreviation table (0 = free agent / no team).
const TEAM_BY_ID: Record<number, string> = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
  9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
  17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
  25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

const UNRANKED_THRESHOLD = 1000; // ESPN uses very high sentinel ranks for undrafted-caliber players

function currentSeason(): number {
  const now = new Date();
  // NFL season year rolls over in the spring; before ~March treat it as the previous season.
  return now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

// ESPN's fantasy football app calls this same public, unauthenticated endpoint
// to render its own player rankings/rater views. No API key — just the
// x-fantasy-filter header their web client sends.
export async function fetchEspnRankings(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const season = currentSeason();
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/players?scoringPeriodId=0&view=kona_player_info`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "x-fantasy-filter": JSON.stringify({
          players: { limit: 3000, sortPercOwned: { sortAsc: false, sortPriority: 1 } },
        }),
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
    const raw: any[] = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) throw new Error("ESPN returned no players");

    const ranked = raw
      .map((p) => {
        const pprRank = p?.draftRanksByRankType?.PPR?.rank;
        const stdRank = p?.draftRanksByRankType?.STANDARD?.rank;
        const rank = [pprRank, stdRank].find((r) => Number.isFinite(r) && r > 0 && r < UNRANKED_THRESHOLD);
        return { p, rank: rank as number | undefined };
      })
      .filter((x) => Number.isFinite(x.rank));

    ranked.sort((a, b) => (a.rank as number) - (b.rank as number));
    const poolSize = ranked.length;

    const byPositionCount: Record<string, number> = {};
    const players: SourcePlayerRank[] = ranked.map(({ p }, idx) => {
      const position = POSITION_BY_ID[p.defaultPositionId] || "FLEX";
      byPositionCount[position] = (byPositionCount[position] || 0) + 1;
      return {
        name: String(p.fullName || "").trim(),
        position,
        team: TEAM_BY_ID[p.proTeamId] ?? null,
        age: null,
        rank: idx + 1, // re-rank densely 1..poolSize since raw ranks can have gaps/ties
        positionRank: byPositionCount[position],
        poolSize,
      };
    });

    if (players.length === 0) throw new Error("ESPN returned no ranked players");

    return { source: "espn", label: "ESPN", ok: true, fetchedAt, players };
  } catch (e: any) {
    return {
      source: "espn",
      label: "ESPN",
      ok: false,
      error: e?.message || "Failed to fetch ESPN rankings",
      fetchedAt,
      players: [],
    };
  }
}
