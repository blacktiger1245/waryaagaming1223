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

const CARD_W = 250;
const CARD_H = 72;
const GAP = 8;
const STEP = CARD_H + GAP;
const COL_W = 250;
const COL_GAP = 70;
const CHAMP_W = 290;
const CHAMP_H = 340;

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
  matchRef,
}: {
  match: BracketMatch;
  label: string;
  isFinal: boolean;
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
        absolute left-0 rounded-xl border overflow-hidden transition-all duration-300
        ${isFinal
          ? "border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-amber-600/10 shadow-[0_0_30px_-8px_rgba(245,158,11,0.35)]"
          : isLive
          ? "border-red-500/30 bg-gradient-to-br from-red-500/8 to-transparent shadow-[0_0_20px_-8px_rgba(239,68,68,0.3)]"
          : "border-[var(--card-border)] bg-card/90 backdrop-blur-sm shadow-[0_8px_24px_-16px_var(--card-glow)]"
        }
        hover:shadow-[0_12px_32px_-12px_var(--card-glow)] hover:border-[var(--acc)]/30
      `}
      style={{ width: CARD_W, height: CARD_H }}
    >
      {isFinal && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-black shadow-lg">
          <Trophy className="w-3 h-3" /> Grand Final
        </div>
      )}

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
  championRef,
}: {
  name: string | null;
  championRef: (el: HTMLDivElement | null) => void;
}) {
  const resolved = name ?? "TBD";
  const determined = name != null;
  return (
    <div
      ref={championRef}
      className={`
        absolute left-0 rounded-2xl border-2 overflow-hidden flex flex-col items-center justify-center text-center p-5
        ${determined
          ? "border-amber-500/50 bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-amber-600/10 shadow-[0_0_50px_-12px_rgba(245,158,11,0.45)]"
          : "border-white/10 bg-card/80"
        }
      `}
      style={{ width: CHAMP_W, height: CHAMP_H }}
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

export function TournamentBracket({ rounds }: TournamentBracketProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const championRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<ConnectorPath[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { orderedRounds, finalMatch, championName } = useMemo(() => {
    const sorted = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
    const matchById = new Map<number, BracketMatch>();
    sorted.forEach((r) => r.matches.forEach((m) => matchById.set(m.id, m)));

    const childByParent = new Map<number, number>();
    matchById.forEach((m, id) => {
      if (m.nextMatchId) childByParent.set(id, m.nextMatchId);
    });
    matchById.forEach((child) => {
      if (child.parentMatch1Id && !childByParent.has(child.parentMatch1Id)) {
        childByParent.set(child.parentMatch1Id, child.id);
      }
      if (child.parentMatch2Id && !childByParent.has(child.parentMatch2Id)) {
        childByParent.set(child.parentMatch2Id, child.id);
      }
    });

    const ordered: BracketRound[] = [];
    sorted.forEach((round, idx) => {
      if (idx === 0) {
        ordered.push({ ...round, matches: [...round.matches].sort((a, b) => a.id - b.id) });
        return;
      }
      const prevMatches = ordered[idx - 1].matches;
      const seen = new Set<number>();
      const next: BracketMatch[] = [];
      for (const p of prevMatches) {
        const cid = childByParent.get(p.id);
        if (cid != null && !seen.has(cid)) {
          const child = matchById.get(cid);
          if (child && round.matches.some((m) => m.id === cid)) {
            seen.add(cid);
            next.push(child);
          }
        }
      }
      for (const m of [...round.matches].sort((a, b) => a.id - b.id)) {
        if (!seen.has(m.id)) next.push(m);
      }
      ordered.push({ ...round, matches: next });
    });

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

    return { orderedRounds: ordered, finalMatch, championName };
  }, [rounds]);

  const positions = useMemo(() => {
    const pos = new Map<number, { top: number; center: number }>();
    orderedRounds.forEach((round, ridx) => {
      round.matches.forEach((m, idx) => {
        let center: number;
        if (ridx === 0) {
          center = idx * STEP + CARD_H / 2;
        } else {
          const parentCenters = [m.parentMatch1Id, m.parentMatch2Id]
            .filter((id): id is number => id != null)
            .map((id) => pos.get(id)?.center)
            .filter((c): c is number => c != null);
          if (parentCenters.length > 0) {
            center = parentCenters.reduce((a, b) => a + b, 0) / parentCenters.length;
          } else {
            const prev = pos.get(round.matches[idx - 1]?.id);
            center = prev ? prev.center + STEP : idx * STEP + CARD_H / 2;
          }
        }
        pos.set(m.id, { top: center - CARD_H / 2, center });
      });
    });
    return pos;
  }, [orderedRounds]);

  const { canvasHeight, championTop } = useMemo(() => {
    let height = 0;
    positions.forEach((p) => {
      height = Math.max(height, p.top + CARD_H);
    });
    const finalCenter = finalMatch ? positions.get(finalMatch.id)?.center ?? height / 2 : height / 2;
    let top = finalCenter - CHAMP_H / 2;
    if (top < 20) top = 20;
    height = Math.max(height, top + CHAMP_H + 40);
    height = Math.max(height, 800);
    return { canvasHeight: height, championTop: top };
  }, [positions, finalMatch]);

  const setMatchRef = useCallback(
    (id: number) => (el: HTMLDivElement | null) => {
      if (el) matchRefs.current.set(id, el);
      else matchRefs.current.delete(id);
    },
    []
  );

  const matchById = useRef<Map<number, BracketMatch>>(new Map());
  useMemo(() => {
    const map = new Map<number, BracketMatch>();
    orderedRounds.forEach((r) => r.matches.forEach((m) => map.set(m.id, m)));
    matchById.current = map;
  }, [orderedRounds]);

  const calculateConnectors = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const getRect = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left - canvasRect.left,
        right: r.right - canvasRect.left,
        top: r.top - canvasRect.top,
        bottom: r.bottom - canvasRect.top,
        cx: r.left - canvasRect.left + r.width / 2,
        cy: r.top - canvasRect.top + r.height / 2,
      };
    };

    const next: ConnectorPath[] = [];

    for (const round of orderedRounds) {
      for (const match of round.matches) {
        const childEl = matchRefs.current.get(match.id);
        if (!childEl) continue;
        const child = getRect(childEl);

        const parentIds = [match.parentMatch1Id, match.parentMatch2Id].filter(
          (id): id is number => id != null
        );
        if (parentIds.length === 0) continue;

        const parentEls = parentIds
          .map((id) => matchRefs.current.get(id))
          .filter((el): el is HTMLDivElement => el != null);
        if (parentEls.length === 0) continue;

        const isWinnerPath = (source: BracketMatch) =>
          source.status === "completed" && source.winnerId != null;

        if (parentEls.length === 1) {
          const pEl = parentEls[0];
          const p = getRect(pEl);
          const midX = p.right + (child.left - p.right) / 2;
          const d = `M ${p.right} ${p.cy} L ${midX} ${p.cy} L ${midX} ${child.cy} L ${child.left} ${child.cy}`;
          const sourceMatch = matchById.current.get(parentIds[0]);
          const color = sourceMatch && isWinnerPath(sourceMatch) ? "#f5b82e" : "rgba(150,100,255,0.75)";
          next.push({ id: `conn-${match.id}`, d, color });
        } else {
          const rects = parentEls.map(getRect).sort((a, b) => a.cy - b.cy);
          const [a, b] = rects;
          const midX = a.right + (child.left - a.right) / 2;
          const midY = (a.cy + b.cy) / 2;
          const dFork = `M ${a.right} ${a.cy} L ${midX} ${a.cy} L ${midX} ${b.cy} L ${b.right} ${b.cy}`;
          const dTarget = `M ${midX} ${midY} L ${child.left} ${child.cy}`;
          const sourceA = matchById.current.get(parentIds[0]);
          const sourceB = matchById.current.get(parentIds[1]);
          const colorA = sourceA && isWinnerPath(sourceA) ? "#f5b82e" : "rgba(150,100,255,0.75)";
          const colorB = sourceB && isWinnerPath(sourceB) ? "#f5b82e" : "rgba(150,100,255,0.75)";
          const targetColor =
            match.status === "completed" && match.winnerId != null
              ? "#f5b82e"
              : "rgba(150,100,255,0.75)";
          // Draw each segment so winner paths can be highlighted independently.
          next.push({ id: `conn-${match.id}-a`, d: `M ${a.right} ${a.cy} L ${midX} ${a.cy}`, color: colorA });
          next.push({ id: `conn-${match.id}-b`, d: `M ${b.right} ${b.cy} L ${midX} ${b.cy}`, color: colorB });
          next.push({ id: `conn-${match.id}-v`, d: `M ${midX} ${a.cy} L ${midX} ${b.cy}`, color: "rgba(150,100,255,0.75)" });
          next.push({ id: `conn-${match.id}-t`, d: dTarget, color: targetColor });
        }
      }
    }

    // Champion connector from the final match.
    if (finalMatch) {
      const finalEl = matchRefs.current.get(finalMatch.id);
      const champEl = championRef.current;
      if (finalEl && champEl) {
        const f = getRect(finalEl);
        const c = getRect(champEl);
        const midX = f.right + (c.left - f.right) / 2;
        const d = `M ${f.right} ${f.cy} L ${midX} ${f.cy} L ${midX} ${c.cy} L ${c.left} ${c.cy}`;
        const color =
          finalMatch.status === "completed" && finalMatch.winnerId != null
            ? "#f5b82e"
            : "rgba(150,100,255,0.75)";
        next.push({ id: "conn-champion", d, color });
      }
    }

    setPaths(next);
  }, [orderedRounds, finalMatch]);

  useLayoutEffect(() => {
    const raf = requestAnimationFrame(calculateConnectors);
    const timer = setTimeout(calculateConnectors, 100);
    const ro = new ResizeObserver(() => calculateConnectors());
    if (canvasRef.current) ro.observe(canvasRef.current);
    window.addEventListener("resize", calculateConnectors);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener("resize", calculateConnectors);
    };
  }, [calculateConnectors]);

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

  const totalWidth = orderedRounds.length * COL_W + orderedRounds.length * COL_GAP + CHAMP_W + 80;

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

      {/* Viewport */}
      <div className="flex-1 overflow-x-auto overflow-y-auto w-full">
        <div
          ref={canvasRef}
          className="relative mx-auto"
          style={{ minWidth: totalWidth, minHeight: canvasHeight + 80, padding: "40px 40px 60px" }}
        >
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

          <div className="flex relative z-10" style={{ gap: COL_GAP }}>
            {orderedRounds.map((round) => {
              const isFinalRound = round.matches.some((m) => isFinalRoundName(m.roundName ?? ""));
              return (
                <div key={round.roundNumber} className="flex flex-col" style={{ width: COL_W }}>
                  <div className={`text-center mb-4 ${isFinalRound ? "text-amber-400" : "text-[var(--acc)]"}`}>
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider border ${
                        isFinalRound ? "bg-amber-500/10 border-amber-500/30" : "bg-[var(--acc)]/10 border-[var(--acc)]/20"
                      }`}
                    >
                      {isFinalRound && <Trophy className="w-3 h-3" />}
                      {round.name}
                    </div>
                  </div>

                  <div className="relative" style={{ height: canvasHeight }}>
                    {round.matches.map((match, idx) => {
                      const pos = positions.get(match.id);
                      if (!pos) return null;
                      const isFinal = isFinalRoundName(match.roundName ?? "");
                      const labelPrefix = roundAbbreviation(match.roundName ?? round.name);
                      const labelNumber = String(idx + 1).padStart(2, "0");
                      return (
                        <MatchCard
                          key={match.id}
                          match={match}
                          label={`${labelPrefix} - ${labelNumber}`}
                          isFinal={isFinal}
                          matchRef={setMatchRef(match.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Champion column */}
            <div className="flex flex-col" style={{ width: CHAMP_W }}>
              <div className="text-center mb-4 text-amber-400">
                <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider border bg-amber-500/10 border-amber-500/30">
                  <Crown className="w-3 h-3" /> Champion
                </div>
              </div>
              <div className="relative" style={{ height: canvasHeight }}>
                <ChampionCard name={championName} championRef={(el) => (championRef.current = el)} />
              </div>
            </div>
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
