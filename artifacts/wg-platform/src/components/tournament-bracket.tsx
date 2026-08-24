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
          <Trophy className="w-3 h-3" /> Grand Final
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
          <span className={`text-sm font-semibold truncate flex-1 ${p1Loser ? "line-through decoration-destructive/50" : ""}`}>
            {p1Name}
          </span>
          <span className={`text-sm font-black tabular-nums ${p1Winner ? "text-amber-400" : ""}`}>
            {p1Score ?? "-"}
          </span>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-1.5" />

        {/* Participant 2 */}
        <div className={`flex items-center gap-2.5 py-1 ${p2Winner ? "text-amber-300" : p2Loser ? "text-muted-foreground/60" : "text-foreground"}`}>
          <TeamAvatar name={p2Name} isWinner={!!p2Winner} />
          <span className={`text-sm font-semibold truncate flex-1 ${p2Loser ? "line-through decoration-destructive/50" : ""}`}>
            {p2Name}
          </span>
          <span className={`text-sm font-black tabular-nums ${p2Winner ? "text-amber-400" : ""}`}>
            {p2Score ?? "-"}
          </span>
        </div>
      </div>

      {/* Match meta */}
      <div className="px-3 pb-2.5 pt-0 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {match.status === "completed" && (
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              FT
            </span>
          )}
          {match.status === "live" && (
            <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded animate-pulse">
              LIVE
            </span>
          )}
          {match.status === "scheduled" && (
            <span className="text-[10px] font-bold text-muted-foreground bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
              {match.scheduledAt
                ? new Date(match.scheduledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                : "TBD"}
            </span>
          )}
        </div>
        {match.streamUrl && (
          <a
            href={match.streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 live-pulse" />
            Stream
          </a>
        )}
      </div>
    </div>
  );
}

/* ── Champion Banner ────────────────────────────────────────────────────── */
function ChampionBanner({ championName }: { championName: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-amber-600/10 p-6 text-center shadow-[0_0_40px_-12px_rgba(245,158,11,0.35)]">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjE1LDAsMC4wNSkiLz48L3N2Zz4=')] opacity-30" />
      <Trophy className="w-8 h-8 mx-auto mb-2 text-amber-400" />
      <p className="text-xs font-black uppercase tracking-wider text-amber-400/80 mb-1">Tournament Champion</p>
      <h3 className="text-2xl font-black text-amber-300">{championName}</h3>
    </div>
  );
}

/* ── Bracket Connectors (tree-style lines) ──────────────────────────────── */
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
        const isFinalConnector = line.color.includes("amber");
        return (
          <g key={line.key}>
            <line
              x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
              stroke={isFinalConnector ? "rgba(245,158,11,0.12)" : "rgba(139,92,246,0.12)"}
              strokeWidth={5} strokeLinecap="round"
            />
            <line
              x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
              stroke={isFinalConnector ? "url(#bracketLineFinal)" : "url(#bracketLine)"}
              strokeWidth={1.5} strokeLinecap="round"
            />
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
  const matchMap = useMemo(() => new Map(allMatches.map((m) => [m.id, m])), [allMatches]);
  const finalRound = useMemo(() => {
    const completed = allMatches.filter((m) => m.status === "completed" && m.winnerId != null);
    if (completed.length === 0) return null;
    return [...rounds].sort((a, b) => b.roundNumber - a.roundNumber)[0] ?? null;
  }, [allMatches, rounds]);

  const champion = useMemo(() => {
    const final = finalRound?.matches[0];
    if (!final || final.status !== "completed" || !final.winnerId) return null;
    if (final.winnerId === final.participant1Id) return { name: final.participant1Name ?? "Winner" };
    if (final.winnerId === final.participant2Id) return { name: final.participant2Name ?? "Winner" };
    return null;
  }, [finalRound]);

  /* Build tree-style bracket connectors from actual parent/child relationships */
  const calculateLines = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const newLines: LineCoords[] = [];

    // Build child -> parents map from both nextMatchId and parentMatchXId
    const parentsByChild = new Map<number, number[]>();
    for (const match of allMatches) {
      if (match.nextMatchId) {
        const list = parentsByChild.get(match.nextMatchId) ?? [];
        if (!list.includes(match.id)) list.push(match.id);
        parentsByChild.set(match.nextMatchId, list);
      }
    }
    for (const match of allMatches) {
      if (match.parentMatch1Id) {
        const list = parentsByChild.get(match.id) ?? [];
        if (!list.includes(match.parentMatch1Id)) list.push(match.parentMatch1Id);
        parentsByChild.set(match.id, list);
      }
      if (match.parentMatch2Id) {
        const list = parentsByChild.get(match.id) ?? [];
        if (!list.includes(match.parentMatch2Id)) list.push(match.parentMatch2Id);
        parentsByChild.set(match.id, list);
      }
    }

    for (const [childId, parentIds] of parentsByChild.entries()) {
      const childEl = matchRefs.current.get(childId);
      if (!childEl) continue;
      const cRect = childEl.getBoundingClientRect();
      const childX = cRect.left - containerRect.left;
      const childY = cRect.top + cRect.height / 2 - containerRect.top;

      const childMatch = matchMap.get(childId);
      const isFinalConnector = childMatch
        ? childMatch.roundName?.toLowerCase().includes("final") || childMatch.round === finalRound?.roundNumber
        : false;
      const color = isFinalConnector ? "amber" : "violet";

      if (parentIds.length === 1) {
        const parentEl = matchRefs.current.get(parentIds[0]);
        if (!parentEl) continue;
        const pRect = parentEl.getBoundingClientRect();
        const parentX = pRect.right - containerRect.left;
        const parentY = pRect.top + pRect.height / 2 - containerRect.top;
        newLines.push({ key: `${parentIds[0]}-${childId}`, x1: parentX, y1: parentY, x2: childX, y2: childY, color });
        continue;
      }

      const parentPositions = parentIds
        .map((id) => {
          const el = matchRefs.current.get(id);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return {
            id,
            x: rect.right - containerRect.left,
            y: rect.top + rect.height / 2 - containerRect.top,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .sort((a, b) => a.y - b.y);

      if (parentPositions.length < 2) continue;

      const top = parentPositions[0];
      const bottom = parentPositions[parentPositions.length - 1];
      const midX = (top.x + childX) / 2;
      const midY = (top.y + bottom.y) / 2;

      // Horizontal from top parent to midX
      newLines.push({ key: `${top.id}-h`, x1: top.x, y1: top.y, x2: midX, y2: top.y, color });
      // Horizontal from bottom parent to midX
      newLines.push({ key: `${bottom.id}-h`, x1: bottom.x, y1: bottom.y, x2: midX, y2: bottom.y, color });
      // Vertical connecting the two horizontals
      newLines.push({ key: `${childId}-v`, x1: midX, y1: top.y, x2: midX, y2: bottom.y, color });
      // Horizontal from mid to child
      newLines.push({ key: `${childId}-in`, x1: midX, y1: midY, x2: childX, y2: midY, color });
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
