import type { SourcePlayerRank, SourceResult } from "../types";

const URL = "https://www.fantasypros.com/nfl/rankings/dynasty-overall.php";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// FantasyPros embeds its consensus expert rankings (ECR) as a `var ecrData = {...}`
// blob directly in the dynasty-overall rankings page. This is the same data
// their own widgets render from — no private API key needed, just parsing the
// page's own inline JSON. Public, no login required.
export async function fetchFantasyProsRankings(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(URL, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`FantasyPros HTTP ${res.status}`);
    const html = await res.text();

    const match = html.match(/var\s+ecrData\s*=\s*(\{[\s\S]*?\});/);
    if (!match) throw new Error("Could not find ecrData on FantasyPros page");

    const parsed = JSON.parse(match[1]);
    const rawPlayers: any[] = Array.isArray(parsed?.players) ? parsed.players : [];
    if (rawPlayers.length === 0) throw new Error("FantasyPros ecrData had no players");

    const players: SourcePlayerRank[] = rawPlayers
      .map((p): SourcePlayerRank | null => {
        const rank = Number(p.rank_ecr);
        if (!Number.isFinite(rank) || rank <= 0) return null;
        const posRankStr: string = p.pos_rank || "";
        const posRankNum = Number(posRankStr.replace(/[A-Za-z]/g, ""));
        return {
          name: String(p.player_name || "").trim(),
          position: String(p.player_position_id || "").trim().toUpperCase(),
          team: p.player_team_id ? String(p.player_team_id).trim().toUpperCase() : null,
          age: p.player_age != null && p.player_age !== "" ? Number(p.player_age) : null,
          rank,
          positionRank: Number.isFinite(posRankNum) ? posRankNum : null,
          poolSize: rawPlayers.length,
        };
      })
      .filter((p): p is SourcePlayerRank => !!p && !!p.name);

    return {
      source: "fantasypros",
      label: "FantasyPros (Dynasty ECR)",
      ok: true,
      fetchedAt,
      players,
    };
  } catch (e: any) {
    return {
      source: "fantasypros",
      label: "FantasyPros (Dynasty ECR)",
      ok: false,
      error: e?.message || "Failed to fetch FantasyPros rankings",
      fetchedAt,
      players: [],
    };
  }
}
