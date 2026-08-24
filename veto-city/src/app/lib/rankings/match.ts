import type { SleeperPlayerMap } from "../players";

const FANTASY_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DST", "DEF"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[.'’]/g, "")
    .replace(/[-]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !SUFFIXES.has(word))
    .join(" ")
    .trim();
}

function normalizePosition(pos?: string | null): string {
  const p = (pos || "").toUpperCase();
  if (p === "DEF") return "DST";
  return p;
}

export type SleeperNameIndex = {
  byNameAndPos: Map<string, string>; // "name|POS" -> sleeperId
  byName: Map<string, string[]>; // "name" -> sleeperId[]
};

export function buildSleeperNameIndex(players: SleeperPlayerMap): SleeperNameIndex {
  const byNameAndPos = new Map<string, string>();
  const byName = new Map<string, string[]>();

  for (const [sleeperId, p] of Object.entries(players)) {
    const position = normalizePosition(p.position);
    if (!FANTASY_POSITIONS.has(position)) continue;

    const fullName = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ");
    if (!fullName) continue;

    const norm = normalizeName(fullName);
    if (!norm) continue;

    byNameAndPos.set(`${norm}|${position}`, sleeperId);

    const list = byName.get(norm) || [];
    list.push(sleeperId);
    byName.set(norm, list);
  }

  return { byNameAndPos, byName };
}

export function matchSleeperId(
  index: SleeperNameIndex,
  name: string,
  position: string
): string | null {
  const norm = normalizeName(name);
  const pos = normalizePosition(position);
  if (!norm) return null;

  const exact = index.byNameAndPos.get(`${norm}|${pos}`);
  if (exact) return exact;

  // FLEX-eligible mismatch (e.g. a player listed as RB on one site, WR on another) —
  // fall back to name-only match when there's exactly one candidate.
  const candidates = index.byName.get(norm);
  if (candidates && candidates.length === 1) return candidates[0];

  return null;
}
