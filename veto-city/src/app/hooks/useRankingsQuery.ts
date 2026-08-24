import { useQuery } from "@tanstack/react-query";
import type { RankingsResponse } from "@/app/lib/rankings/types";

async function fetchRankings(): Promise<RankingsResponse> {
  const res = await fetch("/api/rankings", { cache: "no-store" });
  const json = await res.json();

  if (!res.ok || json.error) {
    throw new Error(json.error || `API error ${res.status}`);
  }

  return json as RankingsResponse;
}

/**
 * React Query hook for fetching combined power rankings from /api/rankings.
 * The route itself caches for a few hours server-side, so this just needs a
 * matching stale time to avoid redundant client refetches.
 */
export function useRankingsQuery() {
  return useQuery({
    queryKey: ["rankings"],
    queryFn: fetchRankings,
    staleTime: 30 * 60 * 1000,
    placeholderData: (previousData) => previousData,
  });
}
