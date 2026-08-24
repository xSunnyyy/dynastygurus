import { NextResponse } from "next/server";
import { LEAGUE_ID, SLEEPER_BASE as BASE } from "@/app/lib/vetocity";
import { fetchPlayersMapServer } from "@/app/lib/players";
import { fetchFantasyProsRankings } from "@/app/lib/rankings/sources/fantasypros";
import { fetchKeepTradeCutRankings } from "@/app/lib/rankings/sources/keeptradecut";
import { computeRankings } from "@/app/lib/rankings/aggregate";
import type { RankingsResponse } from "@/app/lib/rankings/types";

let cache: { ts: number; data: RankingsResponse } | null = null;
const TTL_MS = 3 * 60 * 60 * 1000; // rankings + players data move slowly; refetching hourly is wasteful

async function j<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sleeper error ${res.status} for ${url}`);
  return (await res.json()) as T;
}

export async function GET() {
  try {
    const now = Date.now();
    if (cache && now - cache.ts < TTL_MS) {
      return NextResponse.json(cache.data);
    }

    const [league, users, rosters, playersMap, fantasypros, keeptradecut] = await Promise.all([
      j<any>(`${BASE}/league/${LEAGUE_ID}`),
      j<any[]>(`${BASE}/league/${LEAGUE_ID}/users`),
      j<any[]>(`${BASE}/league/${LEAGUE_ID}/rosters`),
      fetchPlayersMapServer(),
      fetchFantasyProsRankings(),
      fetchKeepTradeCutRankings(),
    ]);

    const data = computeRankings({
      league,
      users,
      rosters,
      playersMap,
      sources: [fantasypros, keeptradecut],
    });

    cache = { ts: now, data };
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to compute rankings" }, { status: 500 });
  }
}
