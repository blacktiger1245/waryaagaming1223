/**
 * MatchRow — a single fixture row in the upcoming fixtures feed.
 * Time · home team · score · away team · stage tag · action button.
 */
import { Radio } from "lucide-react";
import { TeamEmblem } from "./TeamEmblem";
import { glaze } from "./glaze";
import { palette } from "./theme";
import type { MatchFixture, MatchStatus } from "./types";

export const STATUS_COLOR: Record<MatchStatus, string> = {
  LIVE: palette.crimson,
  UPCOMING: palette.cyan,
  COMPLETED: palette.emerald,
};

interface MatchRowProps {
  match: MatchFixture;
  onGoLive?: (id: string) => void;
  onViewDetails?: (id: string) => void;
}

function timeLabel(iso: Date): string {
  return iso.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function MatchRow({ match, onGoLive, onViewDetails }: MatchRowProps) {
  const statusColor = STATUS_COLOR[match.status];
  const stage = match.roundName ?? `${match.tournamentName} • CLANS`;

  return (
    <div
      className="group flex items-center gap-3 rounded-xl border px-3 py-3 transition-transform hover:-translate-y-0.5"
      style={{
        borderColor: glaze(palette.muted, 0.18),
        background: "linear-gradient(180deg, rgba(22,30,48,0.75), rgba(15,20,33,0.9))",
        boxShadow: match.status === "LIVE" ? `0 0 16px ${glaze(palette.crimson, 0.25)}` : "none",
      }}
    >
      {/* Time */}
      <div className="flex w-12 shrink-0 flex-col items-center">
        <span className="font-mono text-sm font-black text-white tabular-nums">{timeLabel(match.scheduledTime)}</span>
        <span className="text-[8px] font-bold tracking-widest text-zinc-500">EAT</span>
      </div>

      {/* Home team */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
        <span className="truncate text-xs font-bold text-white">{match.homeTeam.name}</span>
        <TeamEmblem team={match.homeTeam} size={30} />
      </div>

      {/* Score */}
      <div className="flex shrink-0 flex-col items-center px-1">
        <span className="flex items-center gap-1.5">
          <span className={`text-sm font-black tabular-nums ${match.status === "LIVE" ? "text-white" : "text-zinc-300"}`}>{match.homeScore}</span>
          <span className="text-xs font-black text-zinc-600">–</span>
          <span className={`text-sm font-black tabular-nums ${match.status === "LIVE" ? "text-white" : "text-zinc-300"}`}>{match.awayScore}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-[8px] font-black tracking-widest uppercase" style={{ color: statusColor }}>
          {match.status === "LIVE" && <span className="h-1 w-1 animate-pulse rounded-full bg-current" />}
          {match.status}
        </span>
      </div>

      {/* Away team */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <TeamEmblem team={match.awayTeam} size={30} />
        <span className="truncate text-xs font-bold text-white">{match.awayTeam.name}</span>
      </div>

      {/* Stage tag */}
      <div
        className="hidden shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-black tracking-wider md:flex"
        style={{ color: palette.gold, borderColor: glaze(palette.gold, 0.4), background: glaze(palette.gold, 0.08) }}
      >
        {stage.toUpperCase()}
      </div>

      {/* Action */}
      {match.status === "LIVE" ? (
        <button
          onClick={() => onGoLive?.(match.id)}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-black text-white transition-transform hover:-translate-y-0.5"
          style={{ background: `linear-gradient(96deg, ${palette.crimson}, #7A1030)`, boxShadow: `0 3px 12px ${glaze(palette.crimson, 0.5)}` }}
        >
          <Radio className="h-3 w-3" /> GO LIVE
        </button>
      ) : (
        <button
          onClick={() => onViewDetails?.(match.id)}
          className="shrink-0 rounded-md border px-3 py-1.5 text-[10px] font-black tracking-wider transition-colors"
          style={{ color: palette.cyan, borderColor: glaze(palette.cyan, 0.45), background: glaze(palette.cyan, 0.08) }}
        >
          VIEW DETAILS
        </button>
      )}
    </div>
  );
}