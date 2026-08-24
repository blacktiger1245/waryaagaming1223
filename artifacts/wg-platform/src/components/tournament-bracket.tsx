import { useMemo } from "react";
import { Trophy } from "lucide-react";
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

function MatchCard({
  match,
  isFinal,
}: {
  match: BracketMatch;
  isFinal: boolean;
}) {
  const p1Winner = match.winnerId === match.participant1Id;
  const p2Winner = match.winnerId === match.participant2Id;
  const p1Loser = match.status === "completed" && match.winnerId != null && match.winnerId !== match.participant1Id;
  const p2Loser = match.status === "completed" && match.winnerId != null && match.winnerId !== match.participant2Id;

  return (
    <div
      className={`
        relative w-52 rounded-xl border p-3 transition-all
        ${isFinal
          ? "border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-amber-600/5 shadow-[0_0_30px_-10px_rgba(245,158,11,0.4)]"
          : "border-[var(--card-border)] bg-card shadow-[0_8px_24px_-16px_var(--card-glow)]"
        }
      `}
    >
      {isFinal && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">
          <Trophy className="w-3 h-3" /> Final
        </div>
      )}
      <div className={`flex justify-between items-center py-1 ${p1Winner ? "font-bold text-[var(--acc)]" : "text-foreground"}`}>
        <span className={`text-sm truncate ${p1Loser ? "line-through opacity-50" : ""}`}>
          {match.participant1Name ?? "TBD"}
        </span>
        <span className="text-sm font-mono ml-2 tabular-nums">{match.participant1Score ?? "-"}</span>
      </div>
      <div className="border-t border-border/50 my-1" />
      <div className={`flex justify-between items-center py-1 ${p2Winner ? "font-bold text-[var(--acc)]" : "text-foreground"}`}>
        <span className={`text-sm truncate ${p2Loser ? "line-through opacity-50" : ""}`}>
          {match.participant2Name ?? "TBD"}
        </span>
        <span className="text-sm font-mono ml-2 tabular-nums">{match.participant2Score ?? "-"}</span>
      </div>
      <div className={`text-[10px] uppercase tracking-wider mt-1 ${match.status === "live" ? "text-red-400" : match.status === "completed" ? "text-primary" : "text-muted-foreground"}`}>
        {match.status === "live" && <span className="live-pulse inline-block mr-1 w-1.5 h-1.5 rounded-full bg-red-500" />}
        {match.status}
      </div>
    </div>
  );
}

export function TournamentBracket({ rounds }: TournamentBracketProps) {
  const { finalRound, champion } = useMemo(() => {
    const finalR = rounds[rounds.length - 1];
    const finalMatch = finalR?.matches[0];
    let champ: { name: string | null; id: number | null } | null = null;
    if (finalMatch?.status === "completed" && finalMatch.winnerId) {
      champ = { id: finalMatch.winnerId, name: finalMatch.winnerName ?? null };
    }
    return { finalRound: finalR, champion: champ };
  }, [rounds]);

  // Calculate match positions for SVG connectors
  const roundRefs = useMemo(() => {
    return rounds.map((round) => ({
      ...round,
      matchPositions: round.matches.map(() => ({ top: 0, height: 0 })),
    }));
  }, [rounds]);

  return (
    <div className="space-y-8">
      {/* Champion banner */}
      {champion && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 p-6 text-center shadow-[0_0_40px_-12px_rgba(245,158,11,0.3)]">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjQ1LDE1OCwxMSwwLjEpIi8+PC9zdmc+')] opacity-30" />
          <Trophy className="mx-auto mb-2 h-8 w-8 text-amber-400" />
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">Tournament Champion</p>
          <h3 className="mt-1 text-2xl font-black text-amber-300">{champion.name}</h3>
        </div>
      )}

      {/* Bracket */}
      <div className="overflow-x-auto">
        <div className="flex gap-8 min-w-max pb-4 pt-2">
          {rounds.map((round, roundIdx) => {
            const isFinal = round.roundNumber === finalRound?.roundNumber;
            const matchCount = round.matches.length;
            // spacing grows as rounds shrink
            const gapY = matchCount <= 1 ? 16 : matchCount <= 2 ? 48 : matchCount <= 4 ? 80 : 120;

            return (
              <div key={round.roundNumber} className="flex flex-col">
                <div className="wg-chip mx-auto mb-4">{round.name}</div>
                <div
                  className="flex flex-col justify-around flex-1"
                  style={{ gap: `${gapY}px` }}
                >
                  {round.matches.map((match) => (
                    <MatchCard key={match.id} match={match} isFinal={isFinal} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
