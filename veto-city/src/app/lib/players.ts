import { SLEEPER_BASE } from "./vetocity";

// Wide Sleeper player record — the public /players/nfl payload has far more
// fields than the narrow PlayerMeta types used elsewhere in the app (which
// only pull full_name/position/team). Rankings needs age too.
export type SleeperPlayer = {
  player_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  fantasy_positions?: string[] | null;
  team?: string | null;
  age?: number | null;
  birth_date?: string | null;
  years_exp?: number | null;
  status?: string | null;
  injury_status?: string | null;
  [k: string]: any;
};

export type SleeperPlayerMap = Record<string, SleeperPlayer>;

let cache: { ts: number; data: SleeperPlayerMap } | null = null;
const TTL_MS = 12 * 60 * 60 * 1000; // players.json barely changes intra-day

// Server-side (API route) fetch of the full Sleeper players map, cached
// in-memory for the life of the server process. Client pages have their own
// sessionStorage-based fetch (see league/rosters/page.tsx) — this is only
// for code that runs on the server, like /api/rankings.
export async function fetchPlayersMapServer(): Promise<SleeperPlayerMap> {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) return cache.data;

  const res = await fetch(`${SLEEPER_BASE}/players/nfl`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load Sleeper players (${res.status})`);
  const data = (await res.json()) as SleeperPlayerMap;

  cache = { ts: now, data };
  return data;
}

export function playerName(p: SleeperPlayer | undefined, fallbackId: string) {
  if (!p) return fallbackId;
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || fallbackId;
}
