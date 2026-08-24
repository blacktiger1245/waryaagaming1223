import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { Trophy, Shield, Swords } from "lucide-react";
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

interface LineCoords {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

/* ── Team Avatar ────────────────────────────────────────────────────────── */
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

/* ── Knockout Match Card ────────────────────────────────────────────────── */
function KnockoutMatchCard({
  match,
  isFinal,
  matchRef,
}: {
  match: BracketMatch;
  isFinal: boolean;
  matchRef: (el: HTMLDivElement | null) => void;
}) {
  const p1Name = match.participant1Name ?? "TBD";
  const p2Name = match.participant2Name ?? "TBD";
  const p1Score = match.participant1Score;
  const p2Score = match.participant2Score;
  const isCompleted = match.status === "completed";
  const isLive = match.status === "live";

  const p1Winner = isCompleted && match.winnerId != null && match.winnerId === match.participant1Id;
  const p2Winner = isCompleted && match.winnerId != null && match.winnerId === match.participant2Id;
  const p1Loser = isCompleted && match.winnerId != null && match.winnerId !== match.participant1Id && match.participant1Id != null;
  const p2Loser = isCompleted && match.winnerId != null && match.winnerId !== match.participant2Id && match.participant2Id != null;

  return (
    <div
      ref={matchRef}
      data-match-id={match.id}
      className={`
        relative w-56 shrink-0 rounded-xl border p-0 overflow-hidden transition-all duration-300
        ${isFinal
          ? "border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-amber-600/10 shadow-[0_0_30px_-8px_rgba(245,158,11,0.35)]"
          : isLive
          ? "border-red-500/30 bg-gradient-to-br from-red-500/8 to-transparent shadow-[0_0_20px_-8px_rgba(239,68,68,0.3)]"
          : "border-[var(--card-border)] bg-card/80 backdrop-blur-sm shadow-[0_8px_24px_-16px_var(--card-glow)]"
        }
        hover:shadow-[0_12px_32px_-12px_var(--card-glow)] hover:border-[var(--acc)]/30 hover:-translate-y-0.5
      `}
    >
      {isFinal && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-black shadow-lg">
          <Trophy className="w-3 h-3" /> Final
        </div>
      )}
      {isLive && !isFinal && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-white live-pulse" /> Live
        </div>
      )}

      <div className="p-3 pt-4">
        {/* Participant 1 */}
        <div className={`flex items-center gap-2.5 py-1 ${p1Winner ? "text-amber-300" : p1Loser ? "text-muted-foreground/60" : "text-foreground"}`}>
          <TeamAvatar name={p1Name} isWinner={!!p1Winner} />
          <span className={`text-sm font-semibold truncate flex-1 ${p1Loser ? "line-through decoration-2 decoration-destructive/50" : ""} ${p1Winner ? "font-black" : ""}`}>
            {p1Name}
          </span>
          <span className={`text-sm font-mono font-bold tabular-nums ml-2 min-w-[1.5rem] text-right ${p1Winner ? "text-amber-300" : ""}`}>
            {p1Score !== null && p1Score !== undefined ? p1Score : "—"}
          </span>
        </div>

        <div className="border-t border-border/40 my-1.5" />

        {/* Participant 2 */}
        <div className={`flex items-center gap-2.5 py-1 ${p2Winner ? "text-amber-300" : p2Loser ? "text-muted-foreground/60" : "text-foreground"}`}>
          <TeamAvatar name={p2Name} isWinner={!!p2Winner} />
          <span className={`text-sm font-semibold truncate flex-1 ${p2Loser ? "line-through decoration-2 decoration-destructive/50" : ""} ${p2Winner ? "font-black" : ""}`}>
            {p2Name}
          </span>
          <span className={`text-sm font-mono font-bold tabular-nums ml-2 min-w-[1.5rem] text-right ${p2Winner ? "text-amber-300" : ""}`}>
            {p2Score !== null && p2Score !== undefined ? p2Score : "—"}
          </span>
        </div>
      </div>

      {/* Status footer */}
      <div className={`
        px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-center border-t
        ${isCompleted ? "bg-primary/5 text-primary border-primary/10" : isLive ? "bg-red-500/10 text-red-400 border-red-500/10" : "bg-muted/30 text-muted-foreground border-border/30"}
      `}>
        {isLive && <span className="inline-block mr-1 w-1.5 h-1.5 rounded-full bg-red-500 live-pulse" />}
        {match.roundName ?? `Round ${match.round}`}
        {isCompleted && match.winnerName && (
          <span className="ml-1.5 text-amber-400/80">• {match.winnerName} advances</span>
        )}
      </div>
    </div>
  );
}

/* ── Champion Banner ────────────────────────────────────────────────────── */
function ChampionBanner({ championName }: { championName: string | null }) {
  if (!championName) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 p-8 text-center shadow-[0_0_50px_-12px_rgba(245,158,11,0.35)] animate-in fade-in zoom-in duration-500">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjQ1LDE1OCwxMSwwLjE1KSIvPjwvc3ZnPg==')] opacity-40" />
      <div className="relative">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-[0_0_30px_rgba(245,158,11,0.4)]">
          <Trophy className="h-8 w-8 text-black" />
        </div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-400 mb-1">Tournament Champion</p>
        <h3 className="text-3xl font-black text-amber-300 tracking-tight">{championName}</h3>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Shield className="w-4 h-4 text-amber-400/60" />
          <Swords className="w-4 h-4 text-amber-400/60" />
          <Shield className="w-4 h-4 text-amber-400/60" />
        </div>
      </div>
    </div>
  );
}

/* ── SVG Connector Lines ────────────────────────────────────────────────── */
function BracketConnectors({ lines }: { lines: LineCoords[] }) {
  if (lines.length === 0) return null;
  return (
    <svg className="absolute inset-0 pointer-events-none z-10" style={{ width: "100%", height: "100%", overflow: "visible" }}>
      <defs>
        <linearGradient id="bracketLine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(139,92,246,0.5)" />
          <stop offset="100%" stopColor="rgba(139,92,246,0.2)" />
        </linearGradient>
        <linearGradient id="bracketLineFinal" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(245,158,11,0.5)" />
          <stop offset="100%" stopColor="rgba(245,158,11,0.3)" />
        </linearGradient>
      </defs>
      {lines.map((line) => {
        const midX = (line.x1 + line.x2) / 2;
        const path = `M ${line.x1} ${line.y1} C ${midX} ${line.y1}, ${midX} ${line.y2}, ${line.x2} ${line.y2}`;
        const isFinalConnector = line.color.includes("amber");
        return (
          <g key={line.key}>
            <path d={path} fill="none" stroke={isFinalConnector ? "rgba(245,158,11,0.12)" : "rgba(139,92,246,0.12)"} strokeWidth={5} strokeLinecap="round" />
            <path d={path} fill="none" stroke={isFinalConnector ? "url(#bracketLineFinal)" : "url(#bracketLine)"} strokeWidth={1.5} strokeLinecap="round" />
            <circle cx={line.x2} cy={line.y2} r={3} fill={isFinalConnector ? "rgba(245,158,11,0.6)" : "rgba(139,92,246,0.6)"} />
          </g>
        );
      })}
    </svg>
  );
}

/* ── Main Bracket Component ─────────────────────────────────────────────── */
export function TournamentBracket({ rounds }: TournamentBracketProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [lines, setLines] = useState<LineCoords[]>([]);

  const allMatches = useMemo(() => rounds.flatMap((r) => r.matches), [rounds]);
  const matchMap = useMemo(() => {
    const map = new Map<number, BracketMatch>();
    for (const m of allMatches) map.set(m.id, m);
    return map;
  }, [allMatches]);

  const { finalRound, champion } = useMemo(() => {
    const sorted = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
    const finalR = sorted[sorted.length - 1];
    const finalMatch = finalR?.matches[0];
    let champ: { name: string | null; id: number | null } | null = null;
    if (finalMatch?.status === "completed" && finalMatch.winnerId) {
      champ = { id: finalMatch.winnerId, name: finalMatch.winnerName ?? null };
    }
    return { finalRound: finalR, champion: champ };
  }, [rounds]);

  /* Calculate SVG connector lines from nextMatchId relationships */
  const calculateLines = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const newLines: LineCoords[] = [];

    for (const match of allMatches) {
      if (!match.nextMatchId) continue;
      const parentEl = matchRefs.current.get(match.id);
      const childEl = matchRefs.current.get(match.nextMatchId);
      if (!parentEl || !childEl) continue;

      const pRect = parentEl.getBoundingClientRect();
      const cRect = childEl.getBoundingClientRect();

      const x1 = pRect.right - containerRect.left;
      const y1 = pRect.top + pRect.height / 2 - containerRect.top;
      const x2 = cRect.left - containerRect.left;
      const y2 = cRect.top + cRect.height / 2 - containerRect.top;

      const childMatch = matchMap.get(match.nextMatchId);
      const isFinalConnector = childMatch
        ? childMatch.roundName?.toLowerCase().includes("final") || childMatch.round === finalRound?.roundNumber
        : false;

      newLines.push({
        key: `${match.id}-${match.nextMatchId}`,
        x1, y1, x2, y2,
        color: isFinalConnector ? "amber" : "violet",
      });
    }

    setLines(newLines);
  }, [allMatches, matchMap, finalRound?.roundNumber]);

  /* Draw lines after render and on resize */
  useEffect(() => {
    const timer = setTimeout(calculateLines, 150);
    const ro = new ResizeObserver(() => calculateLines());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", calculateLines);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener("resize", calculateLines);
    };
  }, [calculateLines]);

  const setMatchRef = useCallback(
    (id: number) => (el: HTMLDivElement | null) => {
      if (el) matchRefs.current.set(id, el);
      else matchRefs.current.delete(id);
    },
    []
  );

  const sortedRounds = useMemo(() => [...rounds].sort((a, b) => a.roundNumber - b.roundNumber), [rounds]);

  if (sortedRounds.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Swords className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No knockout matches available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {champion && <ChampionBanner championName={champion.name} />}

      <div className="overflow-x-auto pb-4 -mx-4 px-4">
        <div ref={containerRef} className="relative flex items-stretch gap-10 min-w-max py-4">
          <BracketConnectors lines={lines} />

          {sortedRounds.map((round) => {
            const isFinal = round.roundNumber === finalRound?.roundNumber;
            const matchCount = round.matches.length;
            const baseGap = matchCount <= 1 ? 24 : matchCount <= 2 ? 48 : matchCount <= 4 ? 72 : matchCount <= 8 ? 96 : 120;

            return (
              <div key={round.roundNumber} className="flex flex-col relative z-20">
                <div className={`text-center mb-5 ${isFinal ? "text-amber-400" : "text-[var(--acc)]"}`}>
                  <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider border ${isFinal ? "bg-amber-500/10 border-amber-500/30" : "bg-[var(--acc)]/10 border-[var(--acc)]/20"}`}>
                    {isFinal && <Trophy className="w-3 h-3" />}
                    {round.name}
                  </div>
                </div>

                <div className="flex flex-col justify-around flex-1" style={{ gap: `${baseGap}px` }}>
                  {round.matches.map((match) => (
                    <KnockoutMatchCard
                      key={match.id}
                      match={match}
                      isFinal={isFinal}
                      matchRef={setMatchRef(match.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/30" />
          <span>Winner</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-white/5 border border-white/10" />
          <span className="line-through decoration-destructive/50">Eliminated</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-500/10 border border-red-500/20" />
          <span>Live Match</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-0.5 bg-gradient-to-r from-violet-500/50 to-violet-500/20 rounded" />
          <span>Winner Path</span>
        </div>
      </div>
    </div>
  );
}
