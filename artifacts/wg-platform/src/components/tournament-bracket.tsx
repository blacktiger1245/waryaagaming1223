import { useMemo, useRef, useLayoutEffect, useState, useCallback } from "react";
import { Trophy, Swords, Crown, Maximize, Minimize } from "lucide-react";
import type { Match } from "@workspace/api-client-react";

interface BracketMatch extends Match {
  parentMatch1Id?: number | null;
  parentMatch2Id?: number | null;
  nextMatchId?: number | null;
  nextSlot?: number | null;
  stage?: number | null;
}

interface BracketRound {
  roundNumber: number;
  name: string;
  matches: BracketMatch[];
}

interface TournamentBracketProps {
  rounds: BracketRound[];
}

interface ConnectorPath {
  id: string;
  d: string;
  color: string;
}

interface Position {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

const CARD_W = 250;
const CARD_H = 72;
const R32_GAP = 8;
const R32_STEP = CARD_H + R32_GAP; // 80
const COL_W = 250;
const COL_GAP = 70;
const CHAMP_W = 290;
const CHAMP_H = 340;
const HEADER_H = 60;

function roundAbbreviation(name: string): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("round of 32")) return "R32";
  if (n.includes("round of 16")) return "R16";
  if (n.includes("quarter")) return "QF";
  if (n.includes("semi")) return "SF";
  if (n.includes("third")) return "3P";
  if (n.includes("grand final")) return "GF";
  if (n.includes("final")) return "F";
  return name ? name.replace(/\s+/g, " ").slice(0, 3).toUpperCase() : "M";
}

function isFinalRoundName(name: string): boolean {
  const n = (name ?? "").toLowerCase();
  return n.includes("final") && !n.includes("third");
}

function isThirdPlaceName(name: string): boolean {
  return /third/i.test(name ?? "");
}

function canonicalRoundOrder(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("round of 32")) return 0;
  if (n.includes("round of 16")) return 1;
  if (n.includes("quarter")) return 2;
  if (n.includes("semi")) return 3;
  if (n.includes("third")) return 5;
  if (n.includes("grand final")) return 4;
  if (n.includes("final")) return 4;
  return 6;
}

function TeamAvatar({ name, isWinner }: { name: string | null; isWinner: boolean }) {
  const initial = (name ?? "?")[0]?.toUpperCase() ?? "?";
  return (
    <div
      className={`flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-black shrink-0 ${
        isWinner
          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
          : "bg-white/5 text-muted-foreground border border-white/10"
      }`}
    >
      {initial}
    </div>
  );
}

function MatchCard({
  match,
  label,
  isFinal,
  style,
  matchRef,
}: {
  match: BracketMatch;
  label: string;
  isFinal: boolean;
  style: React.CSSProperties;
  matchRef: (el: HTMLDivElement | null) => void;
}) {
  const p1Name = match.participant1Name ?? "TBD";
  const p2Name = match.participant2Name ?? "TBD";
  const p1Score = match.participant1Score ?? "-";
  const p2Score = match.participant2Score ?? "-";
  const isCompleted = match.status === "completed";
  const isLive = match.status === "live";

  const p1Winner = isCompleted && match.winnerId != null && match.winnerId === match.participant1Id;
  const p2Winner = isCompleted && match.winnerId != null && match.winnerId === match.participant2Id;
  const p1Loser = isCompleted && match.winnerId != null && !p1Winner && match.participant1Id != null;
  const p2Loser = isCompleted && match.winnerId != null && !p2Winner && match.participant2Id != null;

  return (
    <div
      ref={matchRef}
      data-match-id={match.id}
      className={`
        absolute rounded-xl border overflow-hidden transition-all duration-300
        ${isFinal
          ? "border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-amber-600/10 shadow-[0_0_30px_-8px_rgba(245,158,11,0.35)]"
          : isLive
          ? "border-red-500/30 bg-gradient-to-br from-red-500/8 to-transparent shadow-[0_0_20px_-8px_rgba(239,68,68,0.3)]"
          : "border-[var(--card-border)] bg-card/90 backdrop-blur-sm shadow-[0_8px_24px_-16px_var(--card-glow)]"
        }
        hover:shadow-[0_12px_32px_-12px_var(--card-glow)] hover:border-[var(--acc)]/30
      `}
      style={style}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-[20px] border-b border-white/5 bg-white/[0.02]">
        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--acc)]">{label}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide">
          {isCompleted ? (
            <span className="text-emerald-400">FT</span>
          ) : isLive ? (
            <span className="text-red-400 animate-pulse">LIVE</span>
          ) : (
            <span className="text-muted-foreground">TBD</span>
          )}
        </span>
      </div>

      {/* Teams */}
      <div className="flex flex-col justify-center h-[52px]">
        <div className={`flex items-center justify-between px-3 h-[26px] ${p1Winner ? "text-emerald-400 font-bold" : p1Loser ? "text-muted-foreground opacity-60" : "text-foreground"}`}>
          <div className="flex items-center gap-2 min-w-0">
            <TeamAvatar name={p1Name} isWinner={p1Winner} />
            <span className="text-xs truncate">{p1Name}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-black tabular-nums">{p1Score}</span>
            {p1Winner && <Trophy className="w-3 h-3 text-amber-400" />}
          </div>
        </div>
        <div className={`flex items-center justify-between px-3 h-[26px] ${p2Winner ? "text-emerald-400 font-bold" : p2Loser ? "text-muted-foreground opacity-60" : "text-foreground"}`}>
          <div className="flex items-center gap-2 min-w-0">
            <TeamAvatar name={p2Name} isWinner={p2Winner} />
            <span className="text-xs truncate">{p2Name}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-black tabular-nums">{p2Score}</span>
            {p2Winner && <Trophy className="w-3 h-3 text-amber-400" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChampionCard({
  name,
  style,
  championRef,
}: {
  name: string | null;
  style: React.CSSProperties;
  championRef: (el: HTMLDivElement | null) => void;
}) {
  const resolved = name ?? "TBD";
  const determined = name != null;
  return (
    <div
      ref={championRef}
      className={`
        absolute rounded-2xl border-2 overflow-hidden flex flex-col items-center justify-center text-center p-5
        ${determined
          ? "border-amber-500/50 bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-amber-600/10 shadow-[0_0_50px_-12px_rgba(245,158,11,0.45)]"
          : "border-white/10 bg-card/80"
        }
      `}
      style={style}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400 mb-3">Hall of Fame</div>
      <div className={`rounded-full flex items-center justify-center mb-4 ${determined ? "bg-amber-500/20 text-amber-400" : "bg-white/5 text-muted-foreground"}`} style={{ width: 96, height: 96 }}>
        {determined ? <Trophy className="w-12 h-12" /> : <Crown className="w-12 h-12" />}
      </div>
      <div className="text-2xl font-black text-white mb-1 truncate w-full">{resolved}</div>
      <div className="text-xs font-bold uppercase tracking-widest text-amber-400/80">Tournament Champion</div>
    </div>
  );
}

function RoundTitle({ round }: { round: BracketRound }) {
  const isFinalRound = round.matches.some((m) => isFinalRoundName(m.roundName ?? ""));
  return (
    <div className={`text-center ${isFinalRound ? "text-amber-400" : "text-[var(--acc)]"}`}>
      <div
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider border ${
          isFinalRound ? "bg-amber-500/10 border-amber-500/30" : "bg-[var(--acc)]/10 border-[var(--acc)]/20"
        }`}
      >
        {isFinalRound && <Trophy className="w-3 h-3" />}
        {round.name}
      </div>
    </div>
  );
}

function orderRounds(rounds: BracketRound[]): BracketRound[] {
  const sorted = [...rounds].sort((a, b) => {
    const ao = canonicalRoundOrder(a.name);
    const bo = canonicalRoundOrder(b.name);
    if (ao !== bo) return ao - bo;
    return a.roundNumber - b.roundNumber;
  });

  const matchById = new Map<number, BracketMatch>();
  sorted.forEach((r) => r.matches.forEach((m) => matchById.set(m.id, m)));

  const childrenOf = new Map<number, number[]>();
  sorted.forEach((r) =>
    r.matches.forEach((m) => {
      const add = (parentId?: number | null) => {
        if (parentId == null) return;
        if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
        childrenOf.get(parentId)!.push(m.id);
      };
      add(m.parentMatch1Id);
      add(m.parentMatch2Id);
      if (m.nextMatchId) add(m.nextMatchId);
    })
  );

  const ordered: BracketRound[] = [];
  sorted.forEach((round, idx) => {
    if (idx === 0) {
      ordered.push({ ...round, matches: [...round.matches].sort((a, b) => a.id - b.id) });
      return;
    }
    const prevMatches = ordered[idx - 1].matches;
    const seen = new Set<number>();
    const nextMatches: BracketMatch[] = [];
    for (const p of prevMatches) {
      for (const cid of childrenOf.get(p.id) ?? []) {
        if (seen.has(cid)) continue;
        const child = matchById.get(cid);
        if (child && round.matches.some((m) => m.id === cid)) {
          seen.add(cid);
          nextMatches.push(child);
        }
      }
    }
    for (const m of [...round.matches].sort((a, b) => a.id - b.id)) {
      if (!seen.has(m.id)) nextMatches.push(m);
    }
    ordered.push({ ...round, matches: nextMatches });
  });

  return ordered;
}

export function TournamentBracket({ rounds }: TournamentBracketProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const championRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { orderedRounds, finalMatch, championName, matchById } = useMemo(() => {
    const ordered = orderRounds(rounds);
    const map = new Map<number, BracketMatch>();
    ordered.forEach((r) => r.matches.forEach((m) => map.set(m.id, m)));

    const lastRound = ordered[ordered.length - 1];
    const finalMatch =
      lastRound?.matches.find((m) => isFinalRoundName(m.roundName ?? "")) ??
      lastRound?.matches[0] ??
      null;

    let championName: string | null = null;
    if (finalMatch && finalMatch.status === "completed" && finalMatch.winnerId != null) {
      if (finalMatch.winnerId === finalMatch.participant1Id) {
        championName = finalMatch.participant1Name ?? finalMatch.winnerName ?? "TBD";
      } else if (finalMatch.winnerId === finalMatch.participant2Id) {
        championName = finalMatch.participant2Name ?? finalMatch.winnerName ?? "TBD";
      } else {
        championName = finalMatch.winnerName ?? "TBD";
      }
    }

    return { orderedRounds: ordered, finalMatch, championName, matchById: map };
  }, [rounds]);

  // ── LAYOUT ENGINE: deterministic Y positions derived from actual parent matches ──
  const positions = useMemo(() => {
    const pos = new Map<number, Position>();
    orderedRounds.forEach((round, ridx) => {
      const colX = ridx * (COL_W + COL_GAP);
      round.matches.forEach((m, idx) => {
        let cy: number;
        if (ridx === 0) {
          // R32 establishes base positions: 80px vertical steps.
          cy = idx * R32_STEP + CARD_H / 2;
        } else {
          const parentCys = [m.parentMatch1Id, m.parentMatch2Id]
            .filter((id): id is number => id != null)
            .map((id) => pos.get(id)?.cy)
            .filter((c): c is number => c != null);
          if (parentCys.length > 0) {
            cy = parentCys.reduce((a, b) => a + b, 0) / parentCys.length;
          } else {
            const firstRound = orderedRounds[0];
            const totalR32Height = firstRound
              ? (firstRound.matches.length - 1) * R32_STEP + CARD_H
              : 800;
            cy = (idx + 0.5) * (totalR32Height / round.matches.length);
          }
        }
        pos.set(m.id, { x: colX, y: cy - CARD_H / 2, cx: colX + CARD_W / 2, cy });
      });
    });
    return pos;
  }, [orderedRounds]);

  const championPos = useMemo((): Position | null => {
    if (!finalMatch) return null;
    const finalPos = positions.get(finalMatch.id);
    if (!finalPos) return null;
    const x = orderedRounds.length * (COL_W + COL_GAP);
    const cy = finalPos.cy; // CHAMPION.centerY = FINAL.centerY
    return { x, y: cy - CHAMP_H / 2, cx: x + CHAMP_W / 2, cy };
  }, [positions, finalMatch, orderedRounds.length]);

  const canvasHeight = useMemo(() => {
    const firstRound = orderedRounds[0];
    if (!firstRound || firstRound.matches.length === 0) return 800;
    const contentBottom = (firstRound.matches.length - 1) * R32_STEP + CARD_H;
    const champBottom = championPos ? championPos.y + CHAMP_H : 0;
    return Math.max(contentBottom, champBottom) + 40;
  }, [orderedRounds, championPos]);

  // ── SVG CONNECTOR ENGINE: drawn from actual computed positions ──
  const paths = useMemo(() => {
    const next: ConnectorPath[] = [];
    const isWinnerPath = (source: BracketMatch) =>
      source.status === "completed" && source.winnerId != null;

    for (const round of orderedRounds) {
      for (const match of round.matches) {
        const child = positions.get(match.id);
        if (!child) continue;
        const parentIds = [match.parentMatch1Id, match.parentMatch2Id].filter(
          (id): id is number => id != null
        );
        if (parentIds.length === 0) continue;
        const parents = parentIds
          .map((id) => positions.get(id))
          .filter((p): p is Position => p != null)
          .sort((a, b) => a.cy - b.cy);
        if (parents.length === 0) continue;

        if (parents.length === 1) {
          const p = parents[0];
          const midX = p.x + CARD_W + (child.x - (p.x + CARD_W)) / 2;
          const d = `M ${p.x + CARD_W} ${p.cy} L ${midX} ${p.cy} L ${midX} ${child.cy} L ${child.x} ${child.cy}`;
          const src = matchById.get(parentIds[0]);
          next.push({ id: `conn-${match.id}`, d, color: src && isWinnerPath(src) ? "#f5b82e" : "rgba(150,100,255,0.75)" });
        } else {
          const [a, b] = parents;
          const midX = a.x + CARD_W + (child.x - (a.x + CARD_W)) / 2;
          const midY = (a.cy + b.cy) / 2;
          const srcA = matchById.get(parentIds[0]);
          const srcB = matchById.get(parentIds[1]);
          const colorA = srcA && isWinnerPath(srcA) ? "#f5b82e" : "rgba(150,100,255,0.75)";
          const colorB = srcB && isWinnerPath(srcB) ? "#f5b82e" : "rgba(150,100,255,0.75)";
          const targetColor =
            match.status === "completed" && match.winnerId != null
              ? "#f5b82e"
              : "rgba(150,100,255,0.75)";
          next.push({ id: `conn-${match.id}-a`, d: `M ${a.x + CARD_W} ${a.cy} L ${midX} ${a.cy}`, color: colorA });
          next.push({ id: `conn-${match.id}-b`, d: `M ${b.x + CARD_W} ${b.cy} L ${midX} ${b.cy}`, color: colorB });
          next.push({ id: `conn-${match.id}-v`, d: `M ${midX} ${a.cy} L ${midX} ${b.cy}`, color: "rgba(150,100,255,0.75)" });
          next.push({ id: `conn-${match.id}-t`, d: `M ${midX} ${midY} L ${child.x} ${child.cy}`, color: targetColor });
        }
      }
    }

    if (finalMatch && championPos) {
      const finalPos = positions.get(finalMatch.id);
      if (finalPos) {
        const midX = finalPos.x + CARD_W + (championPos.x - (finalPos.x + CARD_W)) / 2;
        const d = `M ${finalPos.x + CARD_W} ${finalPos.cy} L ${midX} ${finalPos.cy} L ${midX} ${championPos.cy} L ${championPos.x} ${championPos.cy}`;
        next.push({
          id: "conn-champion",
          d,
          color: finalMatch.status === "completed" && finalMatch.winnerId != null ? "#f5b82e" : "rgba(150,100,255,0.75)",
        });
      }
    }

    return next;
  }, [orderedRounds, positions, finalMatch, championPos, matchById]);


  const setMatchRef = useCallback(
    (id: number) => (el: HTMLDivElement | null) => {
      if (el) matchRefs.current.set(id, el);
      else matchRefs.current.delete(id);
    },
    []
  );

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      canvasRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useLayoutEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  if (orderedRounds.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Swords className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No knockout matches available yet.</p>
      </div>
    );
  }

  const canvasWidth = Math.max(1800, orderedRounds.length * (COL_W + COL_GAP) + CHAMP_W + 80);

  return (
    <div className="w-full min-h-screen bg-background flex flex-col">
      {/* Title area */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-background/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--acc)]/10 border border-[var(--acc)]/20">
            <Trophy className="w-5 h-5 text-[var(--acc)]" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide text-foreground">Knockout Bracket</h2>
            <p className="text-xs text-muted-foreground font-medium">Road to the Champion</p>
          </div>
        </div>
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider border border-white/10 bg-white/5 hover:bg-white/10 transition"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          {isFullscreen ? "Exit" : "Full Screen"}
        </button>
      </div>

      {/* Viewport - starts scrolled to the LEFT (scrollLeft = 0), R32 first */}
      <div className="flex-1 overflow-x-auto overflow-y-auto w-full">
        <div
          ref={canvasRef}
          className="relative flex flex-col"
          style={{
            width: "max-content",
            minWidth: Math.max(canvasWidth, 1800),
            minHeight: canvasHeight + HEADER_H + 80,
            padding: "20px 40px 60px",
          }}
        >
          {/* Round header row - fixed header area, never overlaps cards */}
          <div className="flex shrink-0" style={{ gap: COL_GAP, height: HEADER_H, marginBottom: 20 }}>
            {orderedRounds.map((round) => (
              <div key={round.roundNumber} style={{ width: COL_W }} className="flex items-start justify-center">
                <RoundTitle round={round} />
              </div>
            ))}
            <div style={{ width: CHAMP_W }} className="flex items-start justify-center text-amber-400">
              <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider border bg-amber-500/10 border-amber-500/30">
                <Crown className="w-3 h-3" /> Champion
              </div>
            </div>
          </div>

          {/* Bracket body - single coordinate system shared by cards and SVG */}
          <div className="relative" style={{ height: canvasHeight, width: "100%" }}>
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ overflow: "visible" }}>
              {paths.map((p) => (
                <path
                  key={p.id}
                  d={p.d}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={p.color === "#f5b82e" ? 2.5 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>

            {orderedRounds.map((round, ridx) =>
              round.matches.map((match, idx) => {
                const pos = positions.get(match.id);
                if (!pos) return null;
                const labelPrefix = roundAbbreviation(match.roundName ?? round.name);
                return (
                  <MatchCard
                    key={match.id}
                    match={match}
                    label={`${labelPrefix} - ${String(idx + 1).padStart(2, "0")}`}
                    isFinal={isFinalRoundName(match.roundName ?? "")}
                    style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
                    matchRef={setMatchRef(match.id)}
                  />
                );
              })
            )}

            {championPos && (
              <ChampionCard
                name={championName}
                style={{ left: championPos.x, top: championPos.y, width: CHAMP_W, height: CHAMP_H }}
                championRef={(el) => (championRef.current = el)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-5 py-4 text-[11px] text-muted-foreground border-t border-white/5 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/30" />
          <span>Winner</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-white/5 border border-white/10" />
          <span>Participant</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-500/10 border border-red-500/20" />
          <span>Live Match</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-0.5 bg-violet-500/60 rounded" />
          <span>Connector</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-0.5 bg-amber-400 rounded" />
          <span>Winner Path</span>
        </div>
      </div>
    </div>
  );
}
