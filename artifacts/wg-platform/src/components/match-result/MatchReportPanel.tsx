/**
 * MatchReportPanel — one fixture's "Verified Result + Man of the Match" report.
 *
 * Every surface that shows a finished match (tournament knockout bracket,
 * tournament fixture list, fixtures page) renders this panel so the result card,
 * the MOTM banner and the MOTM view are always the identical UI:
 *   • clan fixture → built from its player-vs-player rows (`/api/matches/:id/player-games`);
 *   • solo fixture → the fixture row itself *is* the duel (man vs man).
 *
 * The panel loads what it needs itself, so a caller only hands over the fixture —
 * it never hard-codes a team, player, score or rating.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildMatchResultData, type MatchResultApiPlayerGame } from "./from-api";
import { buildSoloMatchResultData } from "./from-solo";
import { MatchResultMOTM } from "./MatchResultMOTM";
import type { MatchResultData } from "./types";

/** The fixture fields the report reads (a `Match` row from the API satisfies this). */
export interface MatchReportFixture {
  id: number;
  status?: string | null;
  round?: number | null;
  roundName?: string | null;
  tournamentName?: string | null;
  /** Team ids in a clan fixture, player ids in a solo fixture. */
  participant1Id?: number | null;
  participant1Name?: string | null;
  participant1Score?: number | null;
  participant2Id?: number | null;
  participant2Name?: string | null;
  participant2Score?: number | null;
  manOfTheMatchId?: number | null;
  manOfTheMatchName?: string | null;
}

export interface MatchReportPanelProps {
  fixture: MatchReportFixture;
  /** Clan fixture (participants are teams) or solo man-vs-man fixture. */
  isTeamMatch?: boolean;
  /** Participant id → crest (clan) / avatar (player). Ids never collide. */
  imageById?: Map<number, string | null>;
  className?: string;
}

export function MatchReportPanel({
  fixture,
  isTeamMatch = false,
  imageById,
  className,
}: MatchReportPanelProps) {
  const hasScore = fixture.participant1Score != null && fixture.participant2Score != null;
  const finalised = fixture.status === "completed";

  // A clan fixture aggregates its 1v1 rows; a solo fixture has none to load.
  const { data: games, isLoading, isError } = useQuery<MatchResultApiPlayerGame[]>({
    queryKey: ["match-report-games", fixture.id],
    queryFn: async () => {
      const res = await fetch(`/api/matches/${fixture.id}/player-games`);
      if (!res.ok) throw new Error("Failed to load player matchups");
      return res.json();
    },
    enabled: isTeamMatch && hasScore,
  });

  const report = useMemo<MatchResultData | null>(() => {
    if (!hasScore) return null;
    const built = isTeamMatch
      ? buildMatchResultData({
          fixture,
          playerGames: games ?? [],
          teamLogoMap: imageById,
          playerAvatarMap: imageById,
          matchNumber: fixture.id,
          deriveMotmWhenMissing: true,
        })
      : buildSoloMatchResultData({
          match: fixture,
          avatarMap: imageById,
          matchNumber: fixture.id,
        });
    // Only a completed fixture may claim a verified result.
    return built ? { ...built, verified: finalised } : null;
  }, [fixture, hasScore, isTeamMatch, games, imageById, finalised]);

  if (!hasScore) {
    return (
      <p className={cn("text-[11px] text-zinc-500", className)}>
        The verified result appears once both scores are recorded.
      </p>
    );
  }

  if (isTeamMatch && isLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-[11px] text-zinc-500", className)}>
        <Loader2 className="h-3 w-3 animate-spin" /> Loading match report…
      </div>
    );
  }

  if (!report) {
    return (
      <p className={cn("text-[11px] text-zinc-500", className)}>
        {isTeamMatch && isError
          ? "Could not load the player matchups for this report."
          : "No match report available for this fixture yet."}
      </p>
    );
  }

  return <MatchResultMOTM data={report} className={className} />;
}

export default MatchReportPanel;
