import type { SourcePlayerRank, SourceResult } from "../types";

const URL = "https://keeptradecut.com/dynasty-rankings";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const MAX_KTC_VALUE = 10000; // KTC's 1QB value scale tops out just under this

// KeepTradeCut embeds its full ranked player list as `var playersArray = [...]`
// directly in the dynasty-rankings page. It's the most widely cited dynasty
// trade-value source in the fantasy community — crowdsourced from head-to-head
// player comparisons rather than a handful of experts — and unlike ESPN it's
// dynasty-native rather than a redraft (this-year-only) valuation. We read the
// 1QB value set since this league starts a single QB (no superflex).
export async function fetchKeepTradeCutRankings(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(URL, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`KeepTradeCut HTTP ${res.status}`);
    const html = await res.text();

    const match = html.match(/var\s+playersArray\s*=\s*(\[[\s\S]*?\]);/);
    if (!match) throw new Error("Could not find playersArray on KeepTradeCut page");

    const rawPlayers: any[] = JSON.parse(match[1]);
    if (!Array.isArray(rawPlayers) || rawPlayers.length === 0) {
      throw new Error("KeepTradeCut playersArray had no players");
    }

    const withValues = rawPlayers.filter((p) => Number.isFinite(p?.oneQBValues?.rank));
    withValues.sort((a, b) => a.oneQBValues.rank - b.oneQBValues.rank);
    const poolSize = withValues.length;

    const players: SourcePlayerRank[] = withValues.map((p) => ({
      name: String(p.playerName || "").trim(),
      position: String(p.position || "").trim().toUpperCase(),
      team: p.team ? String(p.team).trim().toUpperCase() : null,
      age: typeof p.age === "number" ? Math.round(p.age) : null,
      rank: p.oneQBValues.rank,
      positionRank: p.oneQBValues.positionalRank ?? null,
      poolSize,
      // KTC's "value" is a real magnitude (0-~9999), not just an ordinal —
      // using it directly preserves the actual talent gap between players
      // instead of treating every rank step as equally sized.
      percentileOverride: 100 * (Math.max(0, p.oneQBValues.value) / MAX_KTC_VALUE),
    }));

    return {
      source: "keeptradecut",
      label: "KeepTradeCut (Dynasty Value)",
      ok: true,
      fetchedAt,
      players,
    };
  } catch (e: any) {
    return {
      source: "keeptradecut",
      label: "KeepTradeCut (Dynasty Value)",
      ok: false,
      error: e?.message || "Failed to fetch KeepTradeCut rankings",
      fetchedAt,
      players: [],
    };
  }
}
