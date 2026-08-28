import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays, Circle, Radio, Shield, Trophy,
  RefreshCw, ChevronRight, LayoutList, Clock, CheckCircle2, BarChart2,
  ChevronDown, Check, Layers, Loader2, X, MonitorPlay,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { storageUrl } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { publishScreen, requestScreenStream, startBroadcast, fetchLiveBroadcasts, isScreenShareSupported, type PublishHandle, type LiveBroadcastInfo } from "@/lib/live";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Tournament {
  id: number;
  name: string;
  status: string;
  tournamentType: string;
}

interface RawMatch {
  id: number;
  tournamentId: number;
  tournamentName?: string | null;
  round: number | null;
  roundName: string | null;
  status: string;
  participant1Id: number | null;
  participant1Name: string | null;
  participant1Score: number | null;
  participant2Id: number | null;
  participant2Name: string | null;
  participant2Score: number | null;
  winnerId: number | null;
  scheduledAt: string | null;
}

interface FlatMatch extends RawMatch {
  tournamentName: string;
  tournamentType: string;
}

interface Standing {
  id: number; name: string;
  mp: number; w: number; d: number; l: number;
  gf: number; ga: number; gd: number; pts: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildStandings(matches: FlatMatch[]): Standing[] {
  const map = new Map<number, Standing>();
  function ensure(id: number, name: string) {
    if (!map.has(id)) map.set(id, { id, name, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
    return map.get(id)!;
  }
  for (const m of matches) {
    const p1 = m.participant1Id ?? 0, p2 = m.participant2Id ?? 0;
    if (!p1 || !p2) continue;
    ensure(p1, m.participant1Name ?? `#${p1}`);
    ensure(p2, m.participant2Name ?? `#${p2}`);
    if (m.status !== "completed") continue;
    const s1 = ensure(p1, m.participant1Name ?? `#${p1}`);
    const s2 = ensure(p2, m.participant2Name ?? `#${p2}`);
    const g1 = m.participant1Score ?? 0, g2 = m.participant2Score ?? 0;
    s1.mp++; s2.mp++;
    s1.gf += g1; s1.ga += g2; s2.gf += g2; s2.ga += g1;
    if (m.winnerId === p1) { s1.w++; s1.pts += 3; s2.l++; }
    else if (m.winnerId === p2) { s2.w++; s2.pts += 3; s1.l++; }
    else { s1.d++; s1.pts++; s2.d++; s2.pts++; }
  }
  return Array.from(map.values())
    .map(s => ({ ...s, gd: s.gf - s.ga }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
}

function dateKey(iso: string | null) {
  if (!iso) return "zz-unscheduled";
  return new Date(iso).toISOString().slice(0, 10);
}

function groupLabel(key: string) {
  if (key === "zz-unscheduled") return "Unscheduled";
  const d = new Date(key + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  const fmt = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  if (diff === 0) return `Today · ${fmt}`;
  if (diff === 1) return `Tomorrow · ${fmt}`;
  if (diff === -1) return `Yesterday · ${fmt}`;
  return fmt;
}

function fmtTime(iso: string | null) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
  catch { return null; }
}

// Replace the bare tournament name on fixture rows with a clear stage label for
// Round Robin + Knock-out tournaments: "Group Stage · Group A" or
// "Knock-out · Quarter Finals". Everything else keeps the tournament name.
function stageLabel(m: { roundName?: string | null; tournamentName?: string }): string {
  const rn = m.roundName ?? "";
  if (rn.startsWith("Group ")) return `Group Stage · ${rn}`;
  if (/final|round of|quarter|semi|third place/i.test(rn)) return `Knock-out · ${rn}`;
  return m.tournamentName ?? "";
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Av({ name, size = "md", url }: { name: string; size?: "sm" | "md" | "lg"; url?: string | null }) {
  const sz = size === "sm" ? "w-9 h-9 text-sm" : size === "lg" ? "w-14 h-14 text-xl" : "w-11 h-11 text-base";
  return url
    ? <img src={url} alt={name} className={`${sz} rounded-full object-cover border border-[#243050] flex-shrink-0`} />
    : (
      <div className={`${sz} rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 border border-[#2e3d60] flex items-center justify-center font-black text-zinc-300 flex-shrink-0`}>
        {name.charAt(0).toUpperCase()}
      </div>
    );
}

// ── Match card ─────────────────────────────────────────────────────────────────
function MatchCard({ m, logoMap, canShare, broadcasting, onStartLive, onCloseLive }: {
  m: FlatMatch;
  logoMap: Map<number, string | null>;
  canShare: boolean;
  broadcasting: boolean;
  onStartLive: (id: number) => void;
  onCloseLive: () => void;
}) {
  const done = m.status === "completed";
  const live = m.status === "live";

  const goLiveButton = (() => {
    if (!canShare || done) return null;
    if (broadcasting) {
      return (
        <button
          onClick={onCloseLive}
          className="shrink-0 inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
          data-testid="button-close-live"
        >
          <X className="w-3.5 h-3.5" /> Close Live
        </button>
      );
    }
    return (
      <button
        onClick={() => onStartLive(m.id)}
        className="shrink-0 inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 hover:border-amber-400 transition-colors"
        data-testid="button-go-live"
      >
        <Radio className="w-3.5 h-3.5" /> Go Live
      </button>
    );
  })();
  const hasScore = m.participant1Score != null && m.participant2Score != null;
  const time = fmtTime(m.scheduledAt);
  const p1wins = done && m.winnerId === m.participant1Id;
  const p2wins = done && m.winnerId === m.participant2Id;
  const logo1 = m.participant1Id ? logoMap.get(m.participant1Id) ?? null : null;
  const logo2 = m.participant2Id ? logoMap.get(m.participant2Id) ?? null : null;

  return (
    <>
      {/* ── Mobile layout ────────────────────────────────────────────────── */}
      <div className={`lg:hidden px-4 py-4 border-b border-[#1e2a45]/60 last:border-0 transition-colors ${live ? "bg-red-950/10" : "hover:bg-[#162038]/20"}`}>
        {/* Main row: name · avatar · score · avatar · name */}
        <div className="flex items-center gap-2">

          {/* Home: name right-aligned, then avatar */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
            <span className={`font-black text-sm leading-tight text-right truncate
              ${p1wins ? "text-white" : done ? "text-zinc-500" : "text-zinc-100"}`}>
              {m.participant1Name ?? "TBD"}
            </span>
            <Av name={m.participant1Name ?? "?"} size="md" url={logo1} />
          </div>

          {/* Score / VS */}
          <div className="flex flex-col items-center shrink-0 px-1 min-w-[72px]">
            {hasScore ? (
              <span className="font-black text-2xl text-white tabular-nums leading-none tracking-tight">
                {m.participant1Score}
                <span className="text-zinc-500 font-normal mx-1.5 text-xl">-</span>
                {m.participant2Score}
              </span>
            ) : (
              <span className="font-black text-base text-zinc-400">VS</span>
            )}
            <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-wide mt-0.5 text-center max-w-[110px] truncate">
              {stageLabel(m)}
            </span>
          </div>

          {/* Away: avatar, then name left-aligned */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <Av name={m.participant2Name ?? "?"} size="md" url={logo2} />
            <span className={`font-black text-sm leading-tight truncate
              ${p2wins ? "text-white" : done ? "text-zinc-500" : "text-zinc-100"}`}>
              {m.participant2Name ?? "TBD"}
            </span>
          </div>
        </div>

        {/* Status / time row */}
        <div className="flex items-center justify-between mt-2.5">
          <span className="text-[10px] text-zinc-600">
            {time ? `${time} GMT+3` : "TBD"}
          </span>
          <div className="flex items-center gap-2">
            {goLiveButton}
            {live && (
              <span className="flex items-center gap-1 text-[10px] font-black bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                <Radio className="w-2.5 h-2.5" /> LIVE
              </span>
            )}
            {!live && !done && (
              <span className="text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-full">
                UPCOMING
              </span>
            )}
            {done && (
              <span className="text-[10px] font-bold bg-[#162038] text-zinc-400 border border-[#243050] px-2 py-0.5 rounded-full">
                FT
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Desktop layout ─────────────────────────────────────────────────── */}
      <div className={`hidden lg:flex items-center gap-2 px-5 py-3.5 border-b border-[#1e2a45]/60 last:border-0 transition-colors ${live ? "bg-[#1a1020] wg-live-row" : "hover:bg-[#162038]/20"}`}>
        {/* Time */}
        <div className="w-14 shrink-0">
          {time ? (
            <>
              <div className={`text-sm font-bold tabular-nums leading-none ${live ? "text-red-400" : "text-zinc-300"}`}>{time}</div>
              <div className="text-[10px] text-zinc-600 mt-0.5">GMT+3</div>
            </>
          ) : (
            <span className="text-[11px] text-zinc-600">TBD</span>
          )}
        </div>

        {/* Home team */}
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          {p1wins && <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" strokeWidth={2} />}
          <span className={`text-sm font-black truncate text-right leading-tight ${p1wins ? "text-white" : done ? "text-zinc-500" : "text-zinc-100"}`}>
            {m.participant1Name ?? "TBD"}
          </span>
          <Av name={m.participant1Name ?? "?"} size="sm" url={logo1} />
        </div>

        {/* Score */}
        <div className="w-[96px] shrink-0 flex flex-col items-center gap-1">
          {hasScore ? (
            <span className={`font-mono font-black text-lg text-white tabular-nums leading-none px-3 py-1 rounded-lg ${live ? "bg-sky-500/15 border border-sky-400/30" : ""}`}>
              {m.participant1Score} <span className="text-zinc-500 font-normal text-base">·</span> {m.participant2Score}
            </span>
          ) : (
            <span className="font-black text-sm text-zinc-400">VS</span>
          )}
          <span className="text-[9px] font-bold text-sky-300/70 truncate max-w-[110px] text-center uppercase tracking-wide">
            {stageLabel(m)}
          </span>
        </div>

        {/* Away team */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Av name={m.participant2Name ?? "?"} size="sm" url={logo2} />
          <span className={`text-sm font-black truncate leading-tight ${p2wins ? "text-white" : done ? "text-zinc-500" : "text-zinc-100"}`}>
            {m.participant2Name ?? "TBD"}
          </span>
          {p2wins && <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" strokeWidth={2} />}
        </div>

        {/* Status + action */}
        <div className="w-24 shrink-0 flex flex-col items-end gap-1.5">
          {live && (
            <span className="flex items-center gap-1 text-[10px] font-black bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">
              <Radio className="w-2.5 h-2.5" /> LIVE
            </span>
          )}
          {!live && !done && (
            <span className="text-[10px] font-bold bg-sky-500/10 text-sky-300 border border-sky-400/20 px-2 py-0.5 rounded-full">
              UPCOMING
            </span>
          )}
          {done && (
            <span className="text-[10px] font-bold bg-[#162038] text-zinc-400 border border-[#243050] px-2 py-0.5 rounded-full">
              FT
            </span>
          )}
          <Link href={`/tournaments`}>
            <span className="text-[10px] font-bold text-zinc-600 hover:text-sky-300 transition-colors cursor-pointer whitespace-nowrap">
              View Details →
            </span>
          </Link>
          {goLiveButton}
        </div>
      </div>
    </>
  );
}

// ── Live match spotlight ───────────────────────────────────────────────────────
function LiveSpotlight({ m, logoMap, broadcast }: { m: FlatMatch; logoMap: Map<number, string | null>; broadcast?: LiveBroadcastInfo | null }) {
  const logo1 = m.participant1Id ? logoMap.get(m.participant1Id) ?? null : null;
  const logo2 = m.participant2Id ? logoMap.get(m.participant2Id) ?? null : null;
  return (
    <div className="rounded-2xl overflow-hidden border border-[#1e2a45] bg-[#0f1628]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2a45]">
        <div className="flex items-center gap-2">
          <Circle className="w-2.5 h-2.5 fill-red-500 text-red-500 animate-pulse" />
          <span className="text-[11px] font-black uppercase tracking-widest text-zinc-300">Live Match</span>
        </div>
        <span className="text-[10px] font-black bg-red-500 text-white px-2.5 py-0.5 rounded-full">LIVE</span>
      </div>
      <div className="px-4 py-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
            <Av name={m.participant1Name ?? "?"} size="lg" url={logo1} />
            <span className="text-xs font-bold text-zinc-300 text-center leading-tight truncate w-full text-center">
              {m.participant1Name ?? "TBD"}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="font-black text-3xl text-white tabular-nums leading-none">
              {m.participant1Score ?? 0}
              <span className="text-blue-400 mx-1.5 font-bold text-2xl">-</span>
              {m.participant2Score ?? 0}
            </div>
            <span className="text-[10px] text-blue-400 font-bold mt-1 text-center max-w-[90px] truncate">{m.tournamentName}</span>
          </div>
          <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
            <Av name={m.participant2Name ?? "?"} size="lg" url={logo2} />
            <span className="text-xs font-bold text-zinc-300 text-center leading-tight truncate w-full text-center">
              {m.participant2Name ?? "TBD"}
            </span>
          </div>
        </div>
        <Link
          href={broadcast ? `/live/${broadcast.id}` : "/live"}
          className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-400 hover:to-blue-400 shadow-[0_6px_20px_-6px_rgba(56,189,248,0.7)] transition-all text-sm font-black text-white"
        >
          <Radio className="w-4 h-4" /> Watch Live Now
        </Link>
      </div>
    </div>
  );
}

// ── Mini standings ─────────────────────────────────────────────────────────────
function MiniStandings({ matches, name }: { matches: FlatMatch[]; name: string }) {
  const rows = buildStandings(matches).slice(0, 6);
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl bg-[#0f1628] border border-[#1e2a45] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2a45]">
        <span className="text-[11px] font-black uppercase tracking-widest text-zinc-300 truncate flex-1 mr-2">{name}</span>
        <Link href="/tournaments">
          <span className="text-[10px] font-bold text-blue-400 hover:underline cursor-pointer whitespace-nowrap">View All</span>
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#1e2a45]">
            {["POS", "TEAM", "P", "W", "D", "L", "GD", "PTS"].map(h => (
              <th key={h} className={`py-2 text-[9px] font-bold text-zinc-600 uppercase ${h === "TEAM" ? "text-left px-2" : "text-center px-1"} ${h === "POS" ? "pl-3" : ""} ${h === "PTS" ? "pr-3" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.id} className="border-b border-[#1e2a45]/40 last:border-0 hover:bg-[#162038]/30 transition-colors">
              <td className="pl-3 pr-1 py-2.5 text-center text-zinc-500 font-mono">{i + 1}</td>
              <td className="px-2 py-2.5 font-bold text-zinc-200 truncate max-w-[90px]">{s.name}</td>
              <td className="px-1 py-2.5 text-center text-zinc-400 tabular-nums">{s.mp}</td>
              <td className="px-1 py-2.5 text-center text-emerald-400 font-bold tabular-nums">{s.w}</td>
              <td className="px-1 py-2.5 text-center text-zinc-400 tabular-nums">{s.d}</td>
              <td className="px-1 py-2.5 text-center text-red-400 tabular-nums">{s.l}</td>
              <td className="px-1 py-2.5 text-center text-zinc-500 font-mono tabular-nums">{s.gd > 0 ? `+${s.gd}` : s.gd}</td>
              <td className="pl-1 pr-3 py-2.5 text-center font-black text-white tabular-nums">{s.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Top players ───────────────────────────────────────────────────────────────
function TopPlayers({ players, teamLogoMap }: { players: any[]; teamLogoMap: Map<string, string | null> }) {
  if (!players.length) return null;
  return (
    <div className="rounded-2xl bg-[#0f1628] border border-[#1e2a45] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2a45]">
        <span className="text-[11px] font-black uppercase tracking-widest text-zinc-300">Top Score Players</span>
        <Link href="/rankings">
          <span className="text-[10px] font-bold text-blue-400 hover:underline cursor-pointer">View All</span>
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#1e2a45]">
            <th className="pl-3 pr-1 py-2 text-[9px] font-bold text-zinc-600 uppercase text-center w-6">#</th>
            <th className="px-2 py-2 text-[9px] font-bold text-zinc-600 uppercase text-left">Player</th>
            <th className="px-2 py-2 text-[9px] font-bold text-zinc-600 uppercase text-left">Team</th>
            <th className="pl-1 pr-3 py-2 text-[9px] font-bold text-zinc-600 uppercase text-center">Goals</th>
          </tr>
        </thead>
        <tbody>
          {players.slice(0, 10).map((p, i) => {
            const teamLogo = p.teamName ? teamLogoMap.get(p.teamName) ?? null : null;
            return (
              <tr key={p.playerId} className="border-b border-[#1e2a45]/40 last:border-0 hover:bg-[#162038]/30 transition-colors">
                <td className="pl-3 pr-1 py-2.5 text-center text-zinc-500 font-mono">{i + 1}</td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2">
                    {p.avatarUrl
                      ? <img src={p.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover border border-[#243050]" />
                      : <div className="w-6 h-6 rounded-full bg-[#162038] border border-[#243050] flex items-center justify-center text-[9px] font-black text-zinc-500">{(p.displayName ?? p.username ?? "?").charAt(0).toUpperCase()}</div>
                    }
                    <span className="font-bold text-zinc-200 truncate max-w-[65px]">{p.displayName ?? p.username}</span>
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {teamLogo
                      ? <img src={teamLogo} alt="" className="w-5 h-5 rounded-full object-cover border border-[#243050] shrink-0" />
                      : p.teamName
                        ? <div className="w-5 h-5 rounded-full bg-[#162038] border border-[#243050] flex items-center justify-center text-[8px] font-black text-zinc-500 shrink-0">{p.teamName.charAt(0).toUpperCase()}</div>
                        : null
                    }
                    <span className="text-zinc-500 truncate max-w-[55px]">{p.teamName ?? "—"}</span>
                  </div>
                </td>
                <td className="pl-1 pr-3 py-2.5 text-center font-black text-blue-400 tabular-nums">{p.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Top team winners ──────────────────────────────────────────────────────────
function TopTeams({ teams }: { teams: any[] }) {
  if (!teams.length) return null;
  return (
    <div className="rounded-2xl bg-[#0f1628] border border-[#1e2a45] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2a45]">
        <span className="text-[11px] font-black uppercase tracking-widest text-zinc-300">Top Team Winners</span>
        <Link href="/rankings">
          <span className="text-[10px] font-bold text-blue-400 hover:underline cursor-pointer">View All</span>
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#1e2a45]">
            <th className="pl-3 pr-1 py-2 text-[9px] font-bold text-zinc-600 uppercase text-center w-6">#</th>
            <th className="px-2 py-2 text-[9px] font-bold text-zinc-600 uppercase text-left">Team</th>
            <th className="px-1 py-2 text-[9px] font-bold text-zinc-600 uppercase text-center">Trophies</th>
            <th className="px-1 py-2 text-[9px] font-bold text-zinc-600 uppercase text-center">Win %</th>
            <th className="pr-3 pl-1 py-2 text-[9px] font-bold text-zinc-600 uppercase text-center">Matches</th>
          </tr>
        </thead>
        <tbody>
          {teams.slice(0, 10).map((t, i) => {
            const winPct = t.matchesPlayed > 0 ? Math.round((t.wins / t.matchesPlayed) * 100) : 0;
            return (
              <tr key={t.teamId} className="border-b border-[#1e2a45]/40 last:border-0 hover:bg-[#162038]/30 transition-colors">
                <td className="pl-3 pr-1 py-2.5 text-center text-zinc-500 font-mono">{i + 1}</td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2">
                    {storageUrl(t.logoUrl)
                      ? <img src={storageUrl(t.logoUrl)} alt="" className="w-6 h-6 rounded-full object-cover border border-[#243050]" />
                      : <div className="w-6 h-6 rounded-full bg-[#162038] border border-[#243050] flex items-center justify-center text-[9px] font-black text-zinc-500">{(t.name ?? "?").charAt(0).toUpperCase()}</div>
                    }
                    <span className="font-bold text-zinc-200 truncate max-w-[65px]">{t.name}</span>
                  </div>
                </td>
                <td className="px-1 py-2.5 text-center tabular-nums">
                  <span className="flex items-center justify-center gap-1">
                    <Trophy className="w-3 h-3 text-yellow-400 shrink-0" />
                    <span className="font-bold text-zinc-200">{t.wins}</span>
                  </span>
                </td>
                <td className="px-1 py-2.5 text-center font-bold text-emerald-400 tabular-nums">{winPct}%</td>
                <td className="pr-3 pl-1 py-2.5 text-center text-zinc-400 tabular-nums">{t.matchesPlayed}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Sidebar nav item ───────────────────────────────────────────────────────────
function NavItem({
  label, icon: Icon, active, badge, onClick,
}: {
  label: string; icon: any; active?: boolean; badge?: React.ReactNode; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all text-left
        ${active ? "bg-sky-500 text-white shadow-[0_4px_16px_-6px_rgba(56,189,248,0.7)]" : "text-zinc-400 hover:text-zinc-200 hover:bg-[#162038]/50"}`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-zinc-500"}`} />
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
type StatusFilter = "all" | "live" | "upcoming" | "completed";

export default function FixturesPage() {
  const [mainView, setMainView] = useState<"matches" | "table">("matches");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tournamentFilter, setTournamentFilter] = useState<number | "all">("all");
  const [visibleDates, setVisibleDates] = useState(5);
  const [selectedTableTournamentId, setSelectedTableTournamentId] = useState<number | null>(null);
  const [tableDropdownOpen, setTableDropdownOpen] = useState(false);
  const [selectedGroupsTournamentId, setSelectedGroupsTournamentId] = useState<number | null>(null);
  const [groupsDropdownOpen, setGroupsDropdownOpen] = useState(false);

  const qc = useQueryClient();
  const { canShareScreen } = useAuth();

  // ── Live screen-share broadcast ───────────────────────────────────────────
  const [liveHandle, setLiveHandle] = useState<PublishHandle | null>(null);
  const [liveMatchId, setLiveMatchId] = useState<number | null>(null);
  const [liveStatus, setLiveStatus] = useState<"idle" | "starting" | "live" | "error">("idle");
  const [liveError, setLiveError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const liveHandleRef = useRef<PublishHandle | null>(null);
  liveHandleRef.current = liveHandle;

  // Close any open broadcast when leaving the page.
  useEffect(() => () => { liveHandleRef.current?.close(); }, []);

  function handleCloseLive() {
    liveHandleRef.current?.close();
    setLiveHandle(null);
    setLiveMatchId(null);
    setLiveStatus("idle");
    setLiveError(null);
    setViewerCount(0);
    // Refresh so the LIVE badge disappears from the fixture list.
    qc.invalidateQueries({ queryKey: ["tournament-matches"] });
  }

  // Register the broadcast and start publishing an already-captured stream.
  async function beginStreaming(matchId: number, stream: MediaStream) {
    try {
      const { id } = await startBroadcast(matchId);
      const handle = publishScreen(id, stream, (count) => setViewerCount(count));
      setLiveHandle(handle);
      setLiveMatchId(matchId);
      setLiveStatus("live");
      // If the user stops sharing from the browser UI, close the live too.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => handleCloseLive());
      qc.invalidateQueries({ queryKey: ["tournament-matches"] });
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      setLiveStatus("error");
      setLiveError(e instanceof Error ? e.message : "Could not start the broadcast");
    }
  }

  async function handleGoLive(matchId: number) {
    if (liveStatus === "starting" || liveHandleRef.current) return;
    setLiveStatus("starting");
    setLiveError(null);

    // 1. WebRTC and screen capture only exist on secure (HTTPS) pages. On a
    //    phone opening http://<ip>:3000 the browser hides these APIs
    //    entirely — show the exact HTTPS link to use instead.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setLiveStatus("error");
      setLiveError(
        `Live features are blocked on plain HTTP. Open https://${window.location.host}${window.location.pathname} instead and accept the certificate warning.`,
      );
      return;
    }

    // 2. Try real screen sharing. This works on desktop browsers only.
    //    Mobile browsers have no screen-capture API (getDisplayMedia does not
    //    exist on Android Chrome or iOS Safari), so screen sharing is a
    //    desktop feature — never a camera workaround.
    if (!isScreenShareSupported()) {
      setLiveStatus("error");
      setLiveError(
        "Screen sharing is not available in this browser. Go live from a desktop PC using Chrome, Edge or Firefox. Watching live streams still works on any device.",
      );
      return;
    }
    setLiveStatus("starting");
    let stream: MediaStream | null = null;
    try {
      stream = await requestScreenStream(true);
    } catch (err) {
      setLiveStatus("error");
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        setLiveError("Screen sharing was blocked. Click Go Live again and press Allow (on the screen picker, choose what to share).");
      } else {
        setLiveError("Could not start screen sharing on this device. Try going live from a desktop PC with Chrome, Edge or Firefox.");
      }
      return;
    }
    if (stream) await beginStreaming(matchId, stream);
  }

  // ── Fetch all tournaments ─────────────────────────────────────────────────
  const { data: tournaments = [], isLoading: tournamentsLoading } = useQuery<Tournament[]>({
    queryKey: ["tournaments"],
    queryFn: async () => {
      const r = await fetch("/api/tournaments");
      if (!r.ok) return [];
      return r.json();
    },
  });

  // ── Poll currently-live screen-share broadcasts ─────────────────────────────
  // Used by the Live Match spotlight to deep-link straight into a stream.
  const { data: liveBroadcasts = [] } = useQuery<LiveBroadcastInfo[]>({
    queryKey: ["live-broadcasts"],
    queryFn: fetchLiveBroadcasts,
    refetchInterval: 8000,
  });

  // ── Fetch matches for every tournament in parallel ────────────────────────
  const matchQueries = useQueries({
    queries: tournaments.map((t) => ({
      queryKey: ["tournament-matches", t.id],
      queryFn: async (): Promise<FlatMatch[]> => {
        const r = await fetch(`/api/tournaments/${t.id}/matches`);
        if (!r.ok) return [];
        const raw: RawMatch[] = await r.json();
        return raw.map(m => ({
          ...m,
          tournamentName: t.name,
          tournamentType: t.tournamentType,
        }));
      },
      enabled: tournaments.length > 0,
      // Keep LIVE badges in sync across every open browser: when a broadcast
      // ends the server restores the match status and this refetch picks it up.
      refetchInterval: 15000,
    })),
  });

  const matchesLoading = tournamentsLoading || matchQueries.some(q => q.isLoading);

  // ── Fetch top players ─────────────────────────────────────────────────────
  const { data: topPlayers = [] } = useQuery<any[]>({
    queryKey: ["rankings-players"],
    queryFn: async () => {
      const r = await fetch("/api/rankings/players");
      if (!r.ok) return [];
      return r.json();
    },
  });

  // ── Fetch all teams for logo lookup ───────────────────────────────────────
  const { data: allTeams = [] } = useQuery<any[]>({
    queryKey: ["teams"],
    queryFn: async () => {
      const r = await fetch("/api/teams");
      if (!r.ok) return [];
      return r.json();
    },
  });

  // ── Fetch team rankings for Top Team Winners ───────────────────────────────
  const { data: topTeams = [] } = useQuery<any[]>({
    queryKey: ["rankings-teams"],
    queryFn: async () => {
      const r = await fetch("/api/rankings/teams");
      if (!r.ok) return [];
      return r.json();
    },
  });

  // ── Flatten + filter all matches ──────────────────────────────────────────
  const allMatches = useMemo<FlatMatch[]>(() => {
    return matchQueries.flatMap(q => q.data ?? []);
  }, [matchQueries]);

  // ── Build participant-id → logo/avatar map ────────────────────────────────
  const logoMap = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const t of allTeams) {
      if (t.id != null) map.set(t.id, t.logoUrl ?? null);
    }
    for (const p of topPlayers) {
      if (p.playerId != null) map.set(p.playerId, p.avatarUrl ?? null);
    }
    return map;
  }, [allTeams, topPlayers]);

  // ── Build team-name → logo map (for TopPlayers team logos) ───────────────
  const teamNameLogoMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const t of allTeams) {
      if (t.name) map.set(t.name, t.logoUrl ?? null);
    }
    return map;
  }, [allTeams]);

  const liveCount = useMemo(() => allMatches.filter(m => m.status === "live").length, [allMatches]);
  const upcomingCount = useMemo(() => allMatches.filter(m => m.status !== "completed" && m.status !== "live").length, [allMatches]);

  const filtered = useMemo(() => {
    let ms = allMatches;
    // Only show matches that have a date/time set by the admin (or are currently live)
    ms = ms.filter(m => m.status === "live" || m.scheduledAt != null);
    if (tournamentFilter !== "all") ms = ms.filter(m => m.tournamentId === tournamentFilter);
    if (statusFilter === "live")      ms = ms.filter(m => m.status === "live");
    if (statusFilter === "upcoming")  ms = ms.filter(m => m.status !== "completed" && m.status !== "live");
    if (statusFilter === "completed") ms = ms.filter(m => m.status === "completed");
    return ms;
  }, [allMatches, statusFilter, tournamentFilter]);

  // ── Progressive round filter ───────────────────────────────────────────────
  // Find the lowest round that has at least one non-completed match.
  // Only show that round's matches. Matches with no round number are unaffected.
  const { activeRound, roundFiltered } = useMemo(() => {
    const withRound = filtered.filter(m => m.round != null);
    const withoutRound = filtered.filter(m => m.round == null);

    if (withRound.length === 0) {
      // No round numbers — show everything as-is
      return { activeRound: null as number | null, roundFiltered: filtered };
    }

    const rounds = [...new Set(withRound.map(m => m.round as number))].sort((a, b) => a - b);
    // Active round = lowest round with any non-completed match; fall back to last round
    const active =
      rounds.find(r => withRound.filter(m => m.round === r).some(m => m.status !== "completed"))
      ?? rounds[rounds.length - 1];

    return {
      activeRound: active,
      roundFiltered: [...withRound.filter(m => m.round === active), ...withoutRound],
    };
  }, [filtered]);

  // Group by date key, sorted chronologically (live/upcoming first, then completed most-recent)
  const grouped = useMemo(() => {
    const map = new Map<string, FlatMatch[]>();
    for (const m of roundFiltered) {
      const k = dateKey(m.scheduledAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    }
    // Sort each group: live first, then upcoming, then completed
    for (const [, ms] of map) {
      ms.sort((a, b) => {
        const order = { live: 0, upcoming: 1, scheduled: 2, completed: 3 };
        const ao = order[a.status as keyof typeof order] ?? 2;
        const bo = order[b.status as keyof typeof order] ?? 2;
        if (ao !== bo) return ao - bo;
        if (a.scheduledAt && b.scheduledAt) return a.scheduledAt.localeCompare(b.scheduledAt);
        return 0;
      });
    }
    // Sort date groups: upcoming/live groups first (soonest first), then completed groups (most recent first), unscheduled last
    const hasUpcoming = (ms: FlatMatch[]) => ms.some(m => m.status !== "completed");
    return Array.from(map.entries()).sort(([a, ams], [b, bms]) => {
      if (a === "zz-unscheduled") return 1;
      if (b === "zz-unscheduled") return -1;
      const aUp = hasUpcoming(ams);
      const bUp = hasUpcoming(bms);
      if (aUp && !bUp) return -1;   // upcoming groups float to top
      if (!aUp && bUp) return 1;
      if (aUp && bUp) return a.localeCompare(b);   // both upcoming → soonest first
      return b.localeCompare(a);                   // both completed → most recent first
    });
  }, [roundFiltered]);

  // First live match for spotlight, first active tournament for mini standings
  const firstLive = useMemo(() => allMatches.find(m => m.status === "live") ?? null, [allMatches]);

  // Active TEAM tournament → mini standings table in sidebar
  const activeTournament = useMemo(() => {
    const teamTs = tournaments.filter(t => t.tournamentType === "team");
    return teamTs.find(t => t.status === "active") ?? teamTs[0] ?? null;
  }, [tournaments]);
  const standingsMatches = useMemo(() => {
    if (!activeTournament) return [];
    return allMatches.filter(m => m.tournamentId === activeTournament.id);
  }, [allMatches, activeTournament]);

  // Active SOLO tournament → mini group stages in sidebar
  const activeSoloTournament = useMemo(() => {
    const soloTs = tournaments.filter(t => t.tournamentType === "solo");
    return soloTs.find(t => t.status === "active") ?? soloTs[0] ?? null;
  }, [tournaments]);
  const soloGroupMap = useMemo(() => {
    if (!activeSoloTournament) return new Map<string, FlatMatch[]>();
    const map = new Map<string, FlatMatch[]>();
    for (const m of allMatches.filter(x => x.tournamentId === activeSoloTournament.id)) {
      const key = m.roundName ?? (m.round != null ? `Round ${m.round}` : "Ungrouped");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }, [allMatches, activeSoloTournament]);

  const visibleGroups = grouped.slice(0, visibleDates);

  return (
    <div className="min-h-screen bg-[#080c18] pb-20 lg:pb-6 wg-fixtures">

      {/* ── Live broadcast control bar ─────────────────────────────────────── */}
      {liveStatus === "starting" && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#0f1628]/95 backdrop-blur border border-amber-500/40 rounded-full px-5 py-2.5 shadow-[0_0_24px_rgba(245,158,11,0.25)]">
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
          <span className="text-xs font-bold text-amber-300">Allow screen sharing in your browser to go live…</span>
        </div>
      )}
      {liveStatus === "live" && liveHandle && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#0f1628]/95 backdrop-blur border border-red-500/50 rounded-full pl-4 pr-1.5 py-1.5 shadow-[0_0_24px_rgba(239,68,68,0.35)]">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-black tracking-widest text-red-400">LIVE</span>
          <span className="text-xs text-zinc-400 flex items-center gap-1">
            <MonitorPlay className="w-3.5 h-3.5" /> {viewerCount} watching
          </span>
          <button
            onClick={handleCloseLive}
            className="text-xs font-black px-3 py-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
            data-testid="button-end-broadcast"
          >
            End Broadcast
          </button>
        </div>
      )}
      {liveStatus === "error" && liveError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#0f1628]/95 backdrop-blur border border-red-500/40 rounded-full pl-5 pr-2 py-2 shadow-lg max-w-[90vw]">
          <span className="text-xs text-red-300">{liveError}</span>
          <button
            onClick={() => setLiveStatus("idle")}
            className="shrink-0 w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="max-w-[1440px] mx-auto px-3 py-4 lg:px-4 lg:py-6">

        {/* ── Page hero ─────────────────────────────────────────────────── */}
        <div className="wg-hero px-6 py-6 mb-7">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
            <div>
              <span className="wg-eyebrow inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Match Day</span>
              <h1 className="wg-hero-title text-4xl mt-3">Fixtures</h1>
              <p className="text-sm text-zinc-400 leading-relaxed mt-2 max-w-xl">
                Every scheduled Waryaa clash, live score and final result — one command center for match day.
              </p>
            </div>
            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
              <div className="wg-stat text-center">
                <div className="wg-val">{liveCount}</div>
                <div className="text-[9px] uppercase tracking-wider text-zinc-400">Live</div>
              </div>
              <div className="wg-stat text-center">
                <div className="wg-val">{upcomingCount}</div>
                <div className="text-[9px] uppercase tracking-wider text-zinc-400">Upcoming</div>
              </div>
              <div className="wg-stat text-center">
                <div className="wg-val">{filtered.length}</div>
                <div className="text-[9px] uppercase tracking-wider text-zinc-400">Fixtures</div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:flex lg:gap-0">

        {/* ── Left sidebar — desktop only ───────────────────────────────────── */}
        <aside className="hidden lg:block w-52 shrink-0 mr-4 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-2 px-1">
            <CalendarDays className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-black uppercase tracking-widest text-zinc-300">Fixtures</span>
          </div>

          {/* Status nav */}
          <div className="space-y-1">
            <NavItem
              label="All Matches"
              icon={LayoutList}
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            />
            <NavItem
              label="Live Matches"
              icon={Radio}
              active={statusFilter === "live"}
              onClick={() => setStatusFilter("live")}
              badge={liveCount > 0 ? (
                <span className="text-[10px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-full animate-pulse">
                  {liveCount}
                </span>
              ) : undefined}
            />
            <NavItem
              label="Upcoming"
              icon={Clock}
              active={statusFilter === "upcoming"}
              onClick={() => setStatusFilter("upcoming")}
              badge={upcomingCount > 0 ? (
                <span className="text-[10px] font-bold text-zinc-500">{upcomingCount}</span>
              ) : undefined}
            />
            <NavItem
              label="Completed"
              icon={CheckCircle2}
              active={statusFilter === "completed"}
              onClick={() => setStatusFilter("completed")}
            />
          </div>

          {/* Tournament filter */}
          <div className="space-y-2">
            <span className="px-1 text-[10px] font-black uppercase tracking-widest text-zinc-600">Filter</span>
            <div className="space-y-0.5">
              {tournamentsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-9 bg-[#0f1628] rounded-xl animate-pulse" />
                ))
              ) : (
                <>
                  <NavItem
                    label="All Tournaments"
                    icon={Trophy}
                    active={tournamentFilter === "all"}
                    onClick={() => setTournamentFilter("all")}
                  />
                  {tournaments.map(t => (
                    <NavItem
                      key={t.id}
                      label={t.name}
                      icon={Shield}
                      active={tournamentFilter === t.id}
                      onClick={() => setTournamentFilter(t.id)}
                    />
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Reset */}
          {(statusFilter !== "all" || tournamentFilter !== "all") && (
            <button
              onClick={() => { setStatusFilter("all"); setTournamentFilter("all"); }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-[#1e2a45] text-xs font-bold text-zinc-500 hover:text-zinc-300 hover:border-[#2e3d60] transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Reset Filters
            </button>
          )}

        </aside>

        {/* ── Mobile filter bar — shown only on small screens ──────────────── */}
        <div className="lg:hidden mb-4 space-y-3">
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-[#0f1628] border border-[#1e2a45] rounded-xl p-1">
            {(["matches", "table", "groups"] as const).map(view => (
              <button
                key={view}
                onClick={() => setMainView(view as any)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors capitalize
                  ${mainView === view ? "bg-blue-600 text-white" : "text-zinc-400"}`}
              >
                {view === "matches" ? "Fixtures" : view === "table" ? "Table" : "Groups"}
              </button>
            ))}
          </div>

          {/* Status pills — horizontal scroll */}
          {mainView === "matches" && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {([
                ["all", "All"],
                ["live", "Live"],
                ["upcoming", "Upcoming"],
                ["completed", "Completed"],
              ] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setStatusFilter(v)}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap border
                    ${statusFilter === v
                      ? v === "live"      ? "bg-red-500 text-white border-red-500"
                      : v === "upcoming"  ? "bg-orange-500 text-white border-orange-500"
                      : v === "completed" ? "bg-emerald-600 text-white border-emerald-600"
                      :                    "bg-blue-600 text-white border-blue-600"
                      : "text-zinc-400 border-[#1e2a45] bg-[#0f1628]"}`}
                >
                  {v === "live" && liveCount > 0 ? `🔴 ${label} ${liveCount}` : label}
                </button>
              ))}
            </div>
          )}

          {/* Tournament pills — horizontal scroll */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setTournamentFilter("all")}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap
                ${tournamentFilter === "all" ? "bg-blue-600 text-white border-blue-600" : "text-zinc-400 border-[#1e2a45] bg-[#0f1628]"}`}
            >
              All Tournaments
            </button>
            {tournaments.map(t => (
              <button
                key={t.id}
                onClick={() => setTournamentFilter(t.id)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap
                  ${tournamentFilter === t.id ? "bg-blue-600 text-white border-blue-600" : "text-zinc-400 border-[#1e2a45] bg-[#0f1628]"}`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── Main panel ───────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0">
          {/* Panel header — desktop only (mobile uses the filter bar above) */}
          <div className="hidden lg:flex items-center justify-between mb-4 gap-3">
            {/* Matches / Table toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0f1628] border border-sky-400/20 shadow-[0_6px_20px_-12px_rgba(56,189,248,0.4)] shrink-0">
              <button
                onClick={() => setMainView("matches")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                  ${mainView === "matches" ? "bg-sky-500 text-white shadow-[0_4px_14px_-4px_rgba(56,189,248,0.7)]" : "text-zinc-400 hover:text-zinc-200 hover:bg-[#162038]/60"}`}
              >
                <LayoutList className="w-3.5 h-3.5" /> Fixtures
              </button>
              <button
                onClick={() => setMainView("table")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                  ${mainView === "table" ? "bg-sky-500 text-white shadow-[0_4px_14px_-4px_rgba(56,189,248,0.7)]" : "text-zinc-400 hover:text-zinc-200 hover:bg-[#162038]/60"}`}
              >
                <BarChart2 className="w-3.5 h-3.5" /> Table
              </button>
              <button
                onClick={() => setMainView("groups" as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                  ${mainView === ("groups" as any) ? "bg-sky-500 text-white shadow-[0_4px_14px_-4px_rgba(56,189,248,0.7)]" : "text-zinc-400 hover:text-zinc-200 hover:bg-[#162038]/60"}`}
              >
                <Layers className="w-3.5 h-3.5" /> Groups
              </button>
            </div>

            {/* Status pills — only shown in Fixtures view */}
            {mainView === "matches" && (
              <div className="flex items-center gap-1 bg-[#0f1628] border border-[#1e2a45] rounded-xl p-1 flex-wrap">
                {([
                  ["all", "All"],
                  ["live", "Live"],
                  ["upcoming", "Upcoming"],
                  ["completed", "Completed"],
                ] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setStatusFilter(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors
                      ${statusFilter === v
                        ? v === "live"      ? "bg-red-500 text-white"
                        : v === "upcoming"  ? "bg-orange-500 text-white"
                        : v === "completed" ? "bg-emerald-600 text-white"
                        :                    "bg-blue-600 text-white"
                        : "text-zinc-400 hover:text-zinc-200"}`}
                  >
                    {v === "live" && liveCount > 0
                      ? <span className="flex items-center gap-1"><Circle className="w-1.5 h-1.5 fill-current" />{label}</span>
                      : label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Table view ─────────────────────────────────────────────────── */}
          {mainView === "table" && (() => {
            // Team tournaments only
            const teamTournaments = tournaments.filter(t => t.tournamentType === "team");
            // Active selection — default to first
            const activeId = selectedTableTournamentId ?? teamTournaments[0]?.id ?? null;
            const activeTour = teamTournaments.find(t => t.id === activeId) ?? null;
            const tMatches = activeId ? allMatches.filter(m => m.tournamentId === activeId) : [];
            const standings = buildStandings(tMatches);
            const n = standings.length;
            const promoCutoff = Math.ceil(n * 0.25);
            const europaEnd   = Math.ceil(n * 0.40);
            const relegStart  = n > 1 ? n - Math.floor(n * 0.15) : Infinity;

            if (matchesLoading) {
              return (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-10 w-28 bg-[#0f1628] border border-[#1e2a45] rounded-xl animate-pulse" />
                    ))}
                  </div>
                  <div className="bg-[#0f1628] border border-[#1e2a45] rounded-2xl h-72 animate-pulse" />
                </div>
              );
            }

            if (teamTournaments.length === 0) {
              return (
                <div className="rounded-2xl border border-[#1e2a45] bg-[#0f1628] py-20 text-center">
                  <BarChart2 className="w-12 h-12 mx-auto text-[#2e3d60] mb-3" />
                  <p className="font-bold text-zinc-400">No team tournaments found</p>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                {/* Tournament dropdown selector */}
                <div className="relative w-64">
                  <button
                    onClick={() => setTableDropdownOpen(o => !o)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-[#0f1628] border border-[#243050] rounded-xl text-sm font-bold text-zinc-200 hover:border-zinc-500 transition-colors"
                  >
                    <span className="truncate">{activeTour?.name ?? "Select tournament"}</span>
                    <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${tableDropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {tableDropdownOpen && (
                    <>
                      {/* backdrop */}
                      <div className="fixed inset-0 z-10" onClick={() => setTableDropdownOpen(false)} />
                      {/* menu */}
                      <div className="absolute left-0 top-full mt-1 w-full z-20 bg-[#0f1628] border border-[#243050] rounded-xl shadow-2xl overflow-hidden">
                        {teamTournaments.map(t => {
                          const isActive = t.id === activeId;
                          return (
                            <button
                              key={t.id}
                              onClick={() => { setSelectedTableTournamentId(t.id); setTableDropdownOpen(false); }}
                              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold transition-colors text-left
                                ${isActive ? "bg-blue-600 text-white" : "text-zinc-300 hover:bg-[#162038]"}`}
                            >
                              {isActive
                                ? <Check className="w-4 h-4 shrink-0" />
                                : <span className="w-4 shrink-0" />}
                              <span className="truncate flex-1">{t.name}</span>
                              {t.status === "active" && (
                                <span className={`text-[10px] font-black uppercase shrink-0 ${isActive ? "text-black/60" : "text-emerald-400"}`}>
                                  Current
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Selected tournament table */}
                {activeTour && (
                  <div className="bg-[#0f1628] border border-[#1e2a45] rounded-2xl overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e2a45] bg-[#162038]/40">
                      <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                        <Trophy className="w-4.5 h-4.5 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="font-black text-white truncate text-base">{activeTour.name}</h2>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                          Team Tournament · {n} participant{n !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border
                        ${activeTour.status === "active"   ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : activeTour.status === "upcoming" ? "bg-blue-600/10 text-blue-400 border-blue-500/20"
                        : "bg-[#162038] text-zinc-500 border-[#243050]"}`}>
                        {activeTour.status}
                      </span>
                    </div>

                    {standings.length === 0 ? (
                      <p className="text-center text-sm text-zinc-500 py-12">
                        No completed matches yet — table builds as results come in.
                      </p>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[560px]">
                            <thead>
                              <tr className="border-b border-[#1e2a45]">
                                {["#", "Club", "MP", "W", "D", "L", "GF", "GA", "GD", "Pts"].map(h => (
                                  <th key={h} className={`py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500
                                    ${h === "Club" ? "text-left px-3" : "text-center px-2"}
                                    ${h === "#" ? "pl-5 pr-2 w-10" : ""}
                                    ${h === "Pts" ? "pr-5" : ""}`}>
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {standings.map((s, i) => {
                                const pos = i + 1;
                                let stripe = "border-l-transparent";
                                if (pos <= promoCutoff)     stripe = "border-l-emerald-500";
                                else if (pos <= europaEnd)  stripe = "border-l-orange-500";
                                else if (pos >= relegStart) stripe = "border-l-red-500";
                                return (
                                  <tr key={s.id} className={`border-b border-[#1e2a45]/50 last:border-0 border-l-2 ${stripe} hover:bg-[#162038]/30 transition-colors`}>
                                    <td className="pl-5 pr-2 py-3.5 text-center">
                                      <span className="text-xs font-black tabular-nums text-zinc-500">{pos}</span>
                                    </td>
                                    <td className="px-3 py-3.5">
                                      <div className="flex items-center gap-2.5">
                                        {logoMap.get(s.id)
                                          ? <img src={logoMap.get(s.id)!} alt={s.name} className="w-7 h-7 rounded-full object-cover border border-[#243050] shrink-0" />
                                          : <div className="w-7 h-7 rounded-full bg-[#162038] border border-[#243050] flex items-center justify-center text-[10px] font-black text-zinc-400 shrink-0">{s.name.charAt(0).toUpperCase()}</div>
                                        }
                                        <span className="font-black text-zinc-100 truncate">{s.name}</span>
                                      </div>
                                    </td>
                                    <td className="px-2 py-3.5 text-center tabular-nums text-zinc-400">{s.mp}</td>
                                    <td className="px-2 py-3.5 text-center tabular-nums text-emerald-400 font-bold">{s.w}</td>
                                    <td className="px-2 py-3.5 text-center tabular-nums text-zinc-400">{s.d}</td>
                                    <td className="px-2 py-3.5 text-center tabular-nums text-red-400">{s.l}</td>
                                    <td className="px-2 py-3.5 text-center tabular-nums text-zinc-400">{s.gf}</td>
                                    <td className="px-2 py-3.5 text-center tabular-nums text-zinc-400">{s.ga}</td>
                                    <td className="px-2 py-3.5 text-center tabular-nums text-zinc-500 font-mono text-xs">
                                      {s.gd > 0 ? `+${s.gd}` : s.gd}
                                    </td>
                                    <td className="pr-5 pl-2 py-3.5 text-center">
                                      <span className="font-black text-base text-white tabular-nums">{s.pts}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {/* Legend */}
                        <div className="flex flex-wrap gap-4 px-5 py-3 border-t border-[#1e2a45] bg-[#080c18]/40 text-[10px] text-zinc-500">
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Promotion</span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" />Europa</span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Relegation</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Groups view ────────────────────────────────────────────────── */}
          {(mainView as string) === "groups" && (() => {
            const teamTournaments = tournaments.filter(t => t.tournamentType === "solo");
            const activeId = selectedGroupsTournamentId ?? teamTournaments[0]?.id ?? null;
            const activeTour = teamTournaments.find(t => t.id === activeId) ?? null;
            const tMatches = activeId ? allMatches.filter(m => m.tournamentId === activeId) : [];

            // Group matches by roundName → build standings per group
            const groupMap = new Map<string, FlatMatch[]>();
            for (const m of tMatches) {
              const key = m.roundName ?? (m.round != null ? `Round ${m.round}` : "Ungrouped");
              if (!groupMap.has(key)) groupMap.set(key, []);
              groupMap.get(key)!.push(m);
            }
            const groups = Array.from(groupMap.entries()).sort(([a], [b]) => a.localeCompare(b));

            // Shared dropdown render
            function GroupsDropdown() {
              return (
                <div className="relative w-64">
                  <button
                    onClick={() => setGroupsDropdownOpen(o => !o)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-[#0f1628] border border-[#243050] rounded-xl text-sm font-bold text-zinc-200 hover:border-zinc-500 transition-colors"
                  >
                    <span className="truncate">{activeTour?.name ?? "Select tournament"}</span>
                    <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${groupsDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {groupsDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setGroupsDropdownOpen(false)} />
                      <div className="absolute left-0 top-full mt-1 w-full z-20 bg-[#0f1628] border border-[#243050] rounded-xl shadow-2xl overflow-hidden">
                        {teamTournaments.map(t => {
                          const isSel = t.id === activeId;
                          return (
                            <button
                              key={t.id}
                              onClick={() => { setSelectedGroupsTournamentId(t.id); setGroupsDropdownOpen(false); }}
                              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold transition-colors text-left
                                ${isSel ? "bg-blue-600 text-white" : "text-zinc-300 hover:bg-[#162038]"}`}
                            >
                              {isSel ? <Check className="w-4 h-4 shrink-0" /> : <span className="w-4 shrink-0" />}
                              <span className="truncate flex-1">{t.name}</span>
                              {t.status === "active" && (
                                <span className={`text-[10px] font-black uppercase shrink-0 ${isSel ? "text-black/60" : "text-emerald-400"}`}>Current</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            }

            if (matchesLoading) {
              return (
                <div className="space-y-3">
                  <div className="h-11 w-64 bg-[#0f1628] border border-[#1e2a45] rounded-xl animate-pulse" />
                  <div className="grid grid-cols-2 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="bg-[#0f1628] border border-[#1e2a45] rounded-2xl h-52 animate-pulse" />
                    ))}
                  </div>
                </div>
              );
            }

            if (teamTournaments.length === 0) {
              return (
                <div className="rounded-2xl border border-[#1e2a45] bg-[#0f1628] py-20 text-center">
                  <Layers className="w-12 h-12 mx-auto text-[#2e3d60] mb-3" />
                  <p className="font-bold text-zinc-400">No team tournaments found</p>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                <GroupsDropdown />

                {groups.length === 0 ? (
                  <div className="rounded-2xl border border-[#1e2a45] bg-[#0f1628] py-16 text-center">
                    <Layers className="w-12 h-12 mx-auto text-[#2e3d60] mb-3" />
                    <p className="font-bold text-zinc-400">No group data yet</p>
                    <p className="text-xs text-zinc-600 mt-1">Groups appear once matches are scheduled with group names</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {groups.map(([groupName, gMatches]) => {
                      const rows = buildStandings(gMatches);
                      return (
                        <div key={groupName} className="bg-[#0f1628] border border-[#1e2a45] rounded-2xl overflow-hidden">
                          {/* Group header */}
                          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e2a45] bg-[#162038]/50">
                            <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                              <Layers className="w-3.5 h-3.5 text-blue-400" />
                            </div>
                            <span className="font-black text-white text-sm truncate">{groupName}</span>
                            <span className="ml-auto text-[10px] text-zinc-500 shrink-0">{rows.length} teams</span>
                          </div>

                          {rows.length === 0 ? (
                            <p className="text-center text-xs text-zinc-600 py-6">No completed matches</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-[#1e2a45]">
                                  {["#", "Team", "P", "W", "D", "L", "GD", "Pts"].map(h => (
                                    <th key={h} className={`py-2.5 text-[9px] font-bold uppercase tracking-widest text-zinc-600
                                      ${h === "Team" ? "text-left px-2" : "text-center px-1.5"}
                                      ${h === "#" ? "pl-4 w-7" : ""}
                                      ${h === "Pts" ? "pr-4" : ""}`}>
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((s, i) => {
                                  const pos = i + 1;
                                  const n = rows.length;
                                  const promoCut = Math.ceil(n * 0.5); // top half promotes
                                  let stripe = "border-l-transparent";
                                  if (pos <= promoCut) stripe = "border-l-emerald-500";
                                  else stripe = "border-l-red-500";

                                  return (
                                    <tr key={s.id} className={`border-b border-[#1e2a45]/40 last:border-0 border-l-2 ${stripe} hover:bg-[#162038]/30 transition-colors`}>
                                      <td className="pl-4 pr-1 py-2.5 text-center text-zinc-500 font-mono">{pos}</td>
                                      <td className="px-2 py-2.5">
                                        <div className="flex items-center gap-1.5">
                                          {logoMap.get(s.id)
                                            ? <img src={logoMap.get(s.id)!} alt={s.name} className="w-5 h-5 rounded-full object-cover border border-[#243050] shrink-0" />
                                            : <div className="w-5 h-5 rounded-full bg-[#162038] border border-[#243050] flex items-center justify-center text-[8px] font-black text-zinc-500 shrink-0">{s.name.charAt(0).toUpperCase()}</div>
                                          }
                                          <span className="font-bold text-zinc-200 truncate max-w-[80px]">{s.name}</span>
                                        </div>
                                      </td>
                                      <td className="px-1.5 py-2.5 text-center text-zinc-400 tabular-nums">{s.mp}</td>
                                      <td className="px-1.5 py-2.5 text-center text-emerald-400 font-bold tabular-nums">{s.w}</td>
                                      <td className="px-1.5 py-2.5 text-center text-zinc-400 tabular-nums">{s.d}</td>
                                      <td className="px-1.5 py-2.5 text-center text-red-400 tabular-nums">{s.l}</td>
                                      <td className="px-1.5 py-2.5 text-center text-zinc-500 font-mono tabular-nums text-[10px]">
                                        {s.gd > 0 ? `+${s.gd}` : s.gd}
                                      </td>
                                      <td className="pr-4 pl-1.5 py-2.5 text-center font-black text-white tabular-nums">{s.pts}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Fixtures view ───────────────────────────────────────────────── */}
          {mainView === "matches" && (
            <div className="space-y-4">
              {matchesLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-[#0f1628] border border-[#1e2a45] rounded-2xl overflow-hidden">
                    <div className="px-5 py-2 bg-[#162038]/50 h-8 animate-pulse" />
                    {Array.from({ length: 2 }).map((__, j) => (
                      <div key={j} className="h-16 px-5 border-b border-[#1e2a45]/60 flex items-center gap-4">
                        <div className="w-14 h-4 bg-[#162038] rounded animate-pulse" />
                        <div className="flex-1 h-4 bg-[#162038] rounded animate-pulse" />
                        <div className="w-16 h-6 bg-[#162038] rounded animate-pulse" />
                        <div className="flex-1 h-4 bg-[#162038] rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                ))
              ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-[#1e2a45] bg-[#0f1628] py-20 text-center">
                  <CalendarDays className="w-12 h-12 mx-auto text-[#2e3d60] mb-3" />
                  <p className="font-bold text-zinc-400">No matches found</p>
                  <p className="text-xs text-zinc-600 mt-1">Try adjusting your filters</p>
                </div>
              ) : (
                <>
                  {/* Round badge — only shown when round data exists */}
                  {activeRound != null && (
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Currently showing</span>
                      <span className="text-[11px] font-black uppercase tracking-widest text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-2.5 py-0.5 rounded-full">
                        Round {activeRound}
                      </span>
                    </div>
                  )}
                  {visibleGroups.map(([key, matches]) => (
                    <div key={key} className="bg-[#0f1628] border border-[#1e2a45] rounded-2xl overflow-hidden">
                      <div className="px-5 py-2.5 bg-[#162038]/60 border-b border-[#1e2a45]">
                        <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400">
                          {groupLabel(key)}
                        </span>
                      </div>
                      {matches.map(m => (
                        <MatchCard
                          key={m.id}
                          m={m}
                          logoMap={logoMap}
                          canShare={canShareScreen}
                          broadcasting={liveMatchId === m.id}
                          onStartLive={handleGoLive}
                          onCloseLive={handleCloseLive}
                        />
                      ))}
                    </div>
                  ))}
                  {grouped.length > visibleDates && (
                    <button
                      onClick={() => setVisibleDates(d => d + 5)}
                      className="w-full py-3.5 rounded-2xl border border-[#1e2a45] bg-[#0f1628] hover:bg-[#162038] transition-colors text-sm font-bold text-zinc-400 hover:text-zinc-200 flex items-center justify-center gap-2"
                    >
                      Load More Matches <ChevronRight className="w-4 h-4 rotate-90" />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </main>

        {/* ── Right sidebar ─────────────────────────────────────────────────── */}
        <aside className="w-full mt-6 lg:mt-0 lg:w-72 lg:shrink-0 lg:ml-4 space-y-4">
          {/* Live match spotlight */}
          {firstLive && (
            <LiveSpotlight
              m={firstLive}
              logoMap={logoMap}
              broadcast={liveBroadcasts.find((b) => b.matchId === firstLive.id)}
            />
          )}

          {/* Top players */}
          {topPlayers.length > 0 && <TopPlayers players={topPlayers} teamLogoMap={teamNameLogoMap} />}

          {/* Top team winners */}
          {topTeams.length > 0 && <TopTeams teams={topTeams} />}

          {/* Fallback when right sidebar is empty */}
          {!firstLive && standingsMatches.length === 0 && soloGroupMap.size === 0 && topPlayers.length === 0 && topTeams.length === 0 && !matchesLoading && (
            <div className="rounded-2xl border border-[#1e2a45] bg-[#0f1628] p-6 text-center">
              <Trophy className="w-10 h-10 mx-auto text-[#2e3d60] mb-3" />
              <p className="text-xs font-bold text-zinc-500">Stats will appear once matches are played</p>
            </div>
          )}

          {/* Loading skeletons for right sidebar */}
          {matchesLoading && (
            <div className="space-y-3">
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-52 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
            </div>
          )}
        </aside>
        </div>
      </div>
    </div>
  );
}
