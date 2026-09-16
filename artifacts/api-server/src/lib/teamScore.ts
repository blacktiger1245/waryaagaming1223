import { db } from "@workspace/db";
import { matchesTable, matchPlayerGamesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Recalculate a team-vs-team fixture's score from its child player-vs-player
 * games: each finished game awards one "set" win to the side that scored more.
 * The parent fixture becomes `live` once any game has a score and `completed`
 * (with a winner) once every game has one. Shared by the admin player-game
 * editor and the screenshot-approval flow so both propagate identically.
 */
export async function recalculateTeamScore(matchId: number): Promise<void> {
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
  if (!match) return;

  const games = await db
    .select()
    .from(matchPlayerGamesTable)
    .where(eq(matchPlayerGamesTable.matchId, matchId));

  if (games.length === 0) return;

  let homeWins = 0;
  let awayWins = 0;
  let allDone = true;

  for (const g of games) {
    if (g.homeScore === null || g.awayScore === null) { allDone = false; continue; }
    if (g.homeScore > g.awayScore) homeWins++;
    else if (g.awayScore > g.homeScore) awayWins++;
  }

  let winnerId: number | null = null;
  let winnerName: string | null = null;
  let newStatus = match.status;

  if (allDone) {
    newStatus = "completed";
    if (homeWins > awayWins) {
      winnerId = match.participant1Id;
      winnerName = match.participant1Name;
    } else if (awayWins > homeWins) {
      winnerId = match.participant2Id;
      winnerName = match.participant2Name;
    }
  } else if (games.some((g) => g.homeScore !== null || g.awayScore !== null)) {
    newStatus = "live";
  }

  await db
    .update(matchesTable)
    .set({ participant1Score: homeWins, participant2Score: awayWins, winnerId, winnerName, status: newStatus })
    .where(eq(matchesTable.id, matchId));
}
