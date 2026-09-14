/**
 * MediaAndStatsSidebar — right rail: interactive bracket graph, live stream
 * preview box and the Top Players leaderboard table.
 */
import { Radio } from "lucide-react";
import { TeamEmblem } from "./TeamEmblem";
import { glaze } from "./glaze";
import { glassPanel, palette } from "./theme";
import type { LiveStream, Team, TopPlayer } from "./types";

/* ── Bracket / Alliance graph ─────────────────────────────────────────────── */
function BracketView({ finals }: { finals: { label: string; teams: Team[] } }) {
  const edge = (x1: number, y1: number, x2: number, y2: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={palette.muted} strokeWidth="1.2" opacity="0.5" />
  );
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: glaze(palette.muted, 0.18) }}>
      <p className="px-1 pb-2 text-[10px] font-black tracking-[0.2em] text-zinc-500">INTERACTIVE BRACKET</p>
      <svg viewBox="0 0 220 150" className="h-auto w-full">
        {finals.teams.slice(0, 4).map((t, i) => {
          const x = i < 2 ? 12 : 180;
          const y = 22 + (i % 2) * 26;
          const lx = i < 2 ? 46 : 150;
          return (
            <g key={t.id}>
              {i < 2 ? edge(x + 8, y, lx, y) : edge(lx, y, x - 8, y)}
              <g transform={`translate(${x},${y - 5})`}>
                <foreignObject width="22" height="22">
                  <TeamEmblem team={t} size={22} />
                </foreignObject>
              </g>
            </g>
          );
        })}
        {edge(46, 22, 92, 50)}
        {edge(46, 48, 92, 50)}
        {edge(150, 22, 128, 50)}
        {edge(150, 48, 128, 50)}
        {edge(92, 50, 128, 50)}
        <g transform="translate(104,55)">
          <circle r="6" fill="none" stroke={palette.gold} strokeWidth="1.5" opacity="0.9" />
        </g>
        <text x="92" y="80" fontSize="7" fontWeight="900" fill={palette.gold} textAnchor="middle">
          FINAL
        </text>
      </svg>
    </div>
  );
}

/* ── Live stream preview ──────────────────────────────────────────────────── */
function LiveStreamPreview({ stream }: { stream: LiveStream }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: glaze(stream.accent, 0.5), boxShadow: `0 0 16px ${glaze(stream.accent, 0.28)}` }}>
      <div className="relative flex h-24 items-center justify-center"
        style={{ background: `radial-gradient(120% 120% at 50% 0%, ${glaze(stream.accent, 0.28)}, #0C111D 70%)` }}
      >
        <span
          className="absolute left-2 top-2 flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-black tracking-widest text-white"
          style={{ background: palette.crimson, boxShadow: `0 0 10px ${glaze(palette.crimson, 0.7)}` }}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
        </span>
        <span className="text-[10px] font-bold text-zinc-400">{stream.channel} · streaming</span>
        <span className="absolute bottom-2 right-2 flex items-end gap-0.5">
          {[4, 8, 6, 10, 7].map((h, i) => (
            <span key={i} className="w-0.5 rounded-full" style={{ height: h, background: palette.emerald, boxShadow: `0 0 5px ${glaze(palette.emerald, 0.7)}` }} />
          ))}
        </span>
      </div>
      <div className="flex items-center justify-between border-t px-3 py-2" style={{ borderColor: glaze(palette.muted, 0.16) }}>
        <span className="truncate text-[11px] font-bold text-white">{stream.title}</span>
        <span className="text-[10px] font-bold text-zinc-400">{stream.viewers.toLocaleString()}</span>
      </div>
    </div>
  );
}

/* ── Top players leaderboard ─────────────────────────────────────────────── */
function LeaderboardTable({ players }: { players: TopPlayer[] }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: glaze(palette.muted, 0.18) }}>
      <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: glaze(palette.muted, 0.16) }}>
        <p className="text-[10px] font-black tracking-[0.2em] text-zinc-500">TOP PLAYERS</p>
        <span className="text-[9px] font-bold text-zinc-500">GOALS</span>
      </div>
      <div className="divide-y divide-[rgba(120,140,190,0.12)]">
        {players.map((p) => {
          const colors = [palette.gold, "#C0C7D6", "#A9714B"];
          const medal = colors[p.rank - 1];
          return (
            <div key={p.rank} className="flex items-center gap-2.5 px-3 py-2">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-black"
                style={{ color: medal ?? palette.muted, background: glaze(medal ?? palette.muted, 0.1) }}
              >
                {p.rank}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[12px] font-bold text-white">{p.name}</p>
                <p className="truncate text-[9px] text-zinc-500">{p.team}</p>
              </div>
              <span className="font-mono text-[12px] font-black tabular-nums text-white">{p.goals}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Sidebar composition ──────────────────────────────────────────────────── */
interface MediaAndStatsSidebarProps {
  finals: { label: string; teams: Team[] };
  streams: LiveStream[];
  players: TopPlayer[];
}

export function MediaAndStatsSidebar({ finals, streams, players }: MediaAndStatsSidebarProps) {
  return (
    <aside
      className={glassPanel + " flex flex-col gap-5 p-3.5"}
      style={{
        background: "linear-gradient(180deg, #111724, #0C111D)",
        borderColor: glaze(palette.muted, 0.18),
      }}
    >
      <BracketView finals={finals} />
      <div className="space-y-2">
        <p className="flex items-center gap-2 px-1 text-[10px] font-black tracking-[0.2em] text-zinc-500">
          <Radio className="h-3 w-3" style={{ color: palette.crimson }} /> LIVE STREAMS
        </p>
        {streams.map((s) => <LiveStreamPreview key={s.id} stream={s} />)}
      </div>
      <LeaderboardTable players={players} />
    </aside>
  );
}