"use client";

import { useState } from "react";
import FloatingNav from "@/app/components/FloatingNav";
import { useRankingsQuery } from "@/app/hooks/useRankingsQuery";
import type { TeamRankingRow } from "@/app/lib/rankings/types";

function playerHeadshotUrl(playerId: string) {
  return `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`;
}

function nflTeamLogoUrl(abbr?: string | null) {
  if (!abbr) return null;
  return `https://sleepercdn.com/images/team_logos/nfl/${abbr.toLowerCase()}.png`;
}

function posPillClass(pos: string) {
  const base = "w-11 shrink-0 rounded-none border px-2 py-1 text-[11px] font-semibold tracking-wide text-center";
  const color =
    pos === "QB"
      ? "border-violet-900/70 bg-violet-950/60 text-violet-200/90"
      : pos === "RB"
      ? "border-emerald-900/70 bg-emerald-950/60 text-emerald-200/90"
      : pos === "WR"
      ? "border-sky-900/70 bg-sky-950/60 text-sky-200/90"
      : pos === "TE"
      ? "border-amber-900/70 bg-amber-950/60 text-amber-200/90"
      : "border-zinc-800 bg-zinc-950 text-zinc-400";
  return `${base} ${color}`;
}

// Green top third, amber middle third, red bottom third of the league.
function tierTextClass(rank: number | null, numTeams: number) {
  if (rank == null) return "text-zinc-500";
  const pct = rank / numTeams;
  if (pct <= 1 / 3) return "text-emerald-400";
  if (pct <= 2 / 3) return "text-amber-400";
  return "text-red-400";
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function PositionRankCell({ rank, numTeams }: { rank: number | null; numTeams: number }) {
  return (
    <td className="px-3 py-3 text-center">
      <span className={`text-sm font-semibold ${tierTextClass(rank, numTeams)}`}>
        {rank != null ? ordinal(rank) : "—"}
      </span>
    </td>
  );
}

function RosterBreakdown({ team }: { team: TeamRankingRow }) {
  const starters = team.roster.filter((p) => p.isStarter);
  const bench = team.roster.filter((p) => !p.isStarter);

  const Row = ({ p }: { p: TeamRankingRow["roster"][number] }) => {
    const logo = nflTeamLogoUrl(p.nflTeam);
    return (
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className={posPillClass(p.position)}>{p.position || "—"}</div>
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-none border border-zinc-800 bg-zinc-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={playerHeadshotUrl(p.sleeperId)}
            alt={p.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-zinc-100">{p.name}</div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">
            {[p.nflTeam, p.age ? `Age ${p.age}` : null].filter(Boolean).join(" • ")}
          </div>
        </div>
        {logo ? (
          <div className="h-5 w-5 shrink-0 opacity-90">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={p.nflTeam ?? ""} className="h-full w-full object-contain" />
          </div>
        ) : null}
        <div className="w-20 shrink-0 text-right text-xs text-zinc-400">
          {p.consensusRank != null ? (
            <>
              <span className="font-semibold text-zinc-200">#{p.consensusRank}</span>
              {p.positionRank != null ? (
                <span className="ml-1 text-zinc-500">
                  ({p.position}{p.positionRank})
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-zinc-600">unranked</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="border-t border-zinc-800/70 bg-zinc-950/60">
      <div className="grid grid-cols-1 gap-0 sm:grid-cols-2">
        <div>
          <div className="border-b border-zinc-800/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Starting lineup
          </div>
          <div className="divide-y divide-zinc-800/50">
            {starters.map((p) => (
              <Row key={p.sleeperId} p={p} />
            ))}
          </div>
        </div>
        <div className="border-t border-zinc-800/70 sm:border-t-0 sm:border-l">
          <div className="border-b border-zinc-800/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Bench ({bench.length})
          </div>
          <div className="divide-y divide-zinc-800/50">
            {bench.map((p) => (
              <Row key={p.sleeperId} p={p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamRow({ team, numTeams }: { team: TeamRankingRow; numTeams: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer border-b border-zinc-800/70 hover:bg-zinc-900/40"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-3 py-3 text-center">
          <span className="text-lg font-bold text-zinc-100">{team.powerRank}</span>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-zinc-800 bg-zinc-950">
              {team.ownerAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={team.ownerAvatar} alt={team.teamName} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-100">{team.teamName}</div>
              {team.ownerName ? (
                <div className="truncate text-[11px] text-zinc-500">{team.ownerName}</div>
              ) : null}
            </div>
            <span className="ml-1 shrink-0 text-xs text-zinc-600">{open ? "▾" : "▸"}</span>
          </div>
        </td>
        <td className="px-3 py-3 text-center text-sm font-medium text-zinc-200">
          {team.expectedWins}-{team.expectedLosses}
        </td>
        <PositionRankCell rank={team.positionRanks.QB} numTeams={numTeams} />
        <PositionRankCell rank={team.positionRanks.RB} numTeams={numTeams} />
        <PositionRankCell rank={team.positionRanks.WR} numTeams={numTeams} />
        <PositionRankCell rank={team.positionRanks.TE} numTeams={numTeams} />
        <td className="px-3 py-3 text-center text-sm text-zinc-300">
          {team.avgAge != null ? team.avgAge.toFixed(1) : "—"}
        </td>
        <td className="px-3 py-3">
          <div className="flex flex-wrap justify-center gap-1">
            {team.needs.map((n) => (
              <span
                key={n}
                className="rounded-none border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[11px] text-zinc-300"
              >
                {n}
              </span>
            ))}
          </div>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={9} className="p-0">
            <RosterBreakdown team={team} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function RankingsPage() {
  const { data, isLoading, error } = useRankingsQuery();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <FloatingNav />

      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-2 text-2xl font-semibold tracking-tight">Rankings</div>
        <p className="mb-6 max-w-3xl text-sm text-zinc-400">
          Power rankings built from your league&apos;s actual rosters, scored against outside dynasty/redraft
          consensus rankings rather than Sleeper&apos;s own numbers alone. Expected record, positional strength,
          team needs, and average age are all derived from the same blended player values below.
        </p>

        {isLoading ? (
          <div className="rounded-none border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
            Crunching rosters against outside rankings…
          </div>
        ) : error ? (
          <div className="rounded-none border border-red-900/60 bg-zinc-950 p-5 text-red-200">
            <div className="font-semibold">Rankings error</div>
            <div className="mt-2 text-sm opacity-90">{(error as Error).message}</div>
          </div>
        ) : data ? (
          <>
            <div className="mb-5 rounded-none border border-zinc-800 bg-zinc-950 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-zinc-500">Sources:</span>
                {data.sources.map((s) => (
                  <span
                    key={s.source}
                    className={`rounded-none border px-2 py-1 ${
                      s.ok ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-200" : "border-red-900/60 bg-red-950/40 text-red-200"
                    }`}
                    title={s.ok ? `${s.count} players` : s.error}
                  >
                    {s.label} {s.ok ? `✓ (${s.count})` : "✗ unavailable"}
                  </span>
                ))}
                {data.unavailableSources.map((s) => (
                  <span
                    key={s.label}
                    className="rounded-none border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-500"
                    title={s.reason}
                  >
                    {s.label} — not live-fetchable
                  </span>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto rounded-none border border-zinc-800 bg-zinc-950">
              <div className="min-w-[880px]">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/40 text-[11px] uppercase tracking-wide text-zinc-500">
                      <th className="px-3 py-2.5 text-center font-semibold">Rank</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Team</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Exp. Record</th>
                      <th className="px-3 py-2.5 text-center font-semibold">QB</th>
                      <th className="px-3 py-2.5 text-center font-semibold">RB</th>
                      <th className="px-3 py-2.5 text-center font-semibold">WR</th>
                      <th className="px-3 py-2.5 text-center font-semibold">TE</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Avg Age</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Needs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teams.map((team) => (
                      <TeamRow key={team.rosterId} team={team} numTeams={data.numTeams} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-3 text-xs text-zinc-600">
              Click a team to see the full roster breakdown. Position ranks reflect starting-lineup strength at
              that position across the {data.numTeams}-team league; green = top third, amber = middle third, red
              = bottom third.
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
