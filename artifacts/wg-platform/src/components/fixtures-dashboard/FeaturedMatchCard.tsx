/**
 * FeaturedMatchCard — highlighted matchup for the active tournament.
 * Dual team cards, match clock, live score and a GO LIVE CTA over a subtle
 * bracket overlay rendered in the background.
 */
import { Radio, Zap } from "lucide-react";
import { TeamEmblem } from "./TeamEmblem";
import { glaze } from "./glaze";
import { glassPanel, palette } from "./theme";
import type { MatchFixture } from "./types";

interface FeaturedMatchCardProps {
  match: MatchFixture;
  timerLabel?: string;
  onGoLive?: () => void;
}

export function FeaturedMatchCard({ match, timerLabel = "20:00", onGoLive }: FeaturedMatchCardProps) {
  return (
    <section
      className={glassPanel + " overflow-hidden"}
      style={{ borderColor: glaze(match.homeTeam.color, 0.35), background: "linear-gradient(180deg,#111A2C,#0C111D)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: glaze(palette.muted, 0.16) }}
      >
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5" style={{ color: palette.gold }} />
          <span className="text-[11px] font-black tracking-[0.2em] text-zinc-400">TOURNAMENT VIEW:</span>
          <span className="text-xs font-black text-white">{match.tournamentName}</span>
        </div>
        <button className="text-[10px] font-bold tracking-wider text-zinc-400 hover:text-white" style={{ color: palette.cyan }}>
          View All ➔
        </button>
      </div>

      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-6">
        {/* Background bracket overlay */}
        <BracketOverlay accent={match.homeTeam.color} />

        {/* Home team */}
        <div className="flex flex-col items-center gap-2 text-center">
          <TeamEmblem team={match.homeTeam} size={64} />
          <p className="max-w-[9rem] text-sm font-black text-white leading-tight">{match.homeTeam.name}</p>
        </div>

        {/* Center: timer + score + CTA */}
        <div className="relative z-10 flex flex-col items-center gap-1.5 px-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: palette.crimson, boxShadow: `0 0 8px ${glaze(palette.crimson, 0.8)}` }} />
            <span
              className="rounded px-2 py-px font-mono text-lg font-black tabular-nums"
              style={{ color: palette.emerald, textShadow: `0 0 12px ${glaze(palette.emerald, 0.7)}` }}
            >
              {timerLabel}
            </span>
          </div>
          <p className="text-[10px] font-bold tracking-widest text-zinc-500">MATCH TIMER</p>

          <div className="flex items-center gap-3 pt-1">
            <span className="text-2xl font-black text-white">{match.homeScore}</span>
            <span className="text-xs font-black text-zinc-600">—</span>
            <span className="text-2xl font-black text-white">{match.awayScore}</span>
          </div>

          {onGoLive && (
            <button
              onClick={onGoLive}
              className="mt-1 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[10px] font-black tracking-widest text-white transition-transform hover:-translate-y-0.5"
              style={{
                background: `linear-gradient(96deg, ${palette.crimson}, #7A1030)`,
                boxShadow: `0 4px 16px ${glaze(palette.crimson, 0.55)}`,
              }}
            >
              <Radio className="h-3.5 w-3.5" /> GO LIVE
            </button>
          )}
        </div>

        {/* Away team */}
        <div className="flex flex-col items-center gap-2 text-center">
          <TeamEmblem team={match.awayTeam} size={64} />
          <p className="max-w-[9rem] text-sm font-black text-white leading-tight">{match.awayTeam.name}</p>
        </div>
      </div>

      {/* Live stream strip */}
      <div className="flex items-center gap-3 border-t px-5 py-2.5"
        style={{ borderColor: glaze(palette.muted, 0.16), background: glaze(match.homeTeam.color, 0.05) }}
      >
        <span
          className="rounded px-2 py-0.5 text-[9px] font-black tracking-widest text-white"
          style={{ background: palette.crimson, boxShadow: `0 0 10px ${glaze(palette.crimson, 0.6)}` }}
        >
          • LIVE
        </span>
        <span className="text-[10px] font-bold text-zinc-300">LIVE STREAM PREVIEW</span>
        <span className="ml-2 flex items-end gap-0.5">
          {[5, 9, 7, 12, 8, 10, 6].map((h, i) => (
            <span
              key={i}
              className="w-0.5 rounded-full"
              style={{
                height: h,
                background: palette.emerald,
                boxShadow: `0 0 6px ${glaze(palette.emerald, 0.6)}`,
              }}
            />
          ))}
        </span>
        <span className="ml-auto text-[10px] font-bold" style={{ color: palette.muted }}>92380 watching</span>
        <span className="rounded-md border px-2.5 py-1 text-[10px] font-bold" style={{ color: palette.cyan, borderColor: glaze(palette.cyan, 0.5) }}>
          View
        </span>
      </div>
    </section>
  );
}

function BracketOverlay({ accent }: { accent: string }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
      viewBox="0 0 600 140"
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill="none" stroke={accent} strokeWidth="1">
        <path d="M20 70 H150" />
        <path d="M150 35 H320 V105 H150" />
        <path d="M450 70 H580" />
        <path d="M450 35 H280 V105 H450" />
        <g strokeDasharray="3 4">
          <path d="M320 70 H280" />
          <path d="M300 26 V114" />
        </g>
      </g>
      {[280, 320, 150, 450].map((x, i) => (
        <circle key={i} cx={x} cy={i % 2 ? 105 : 35} r="4" fill="rgba(0,0,0,0)" stroke={accent} strokeWidth="1.5" />
      ))}
    </svg>
  );
}