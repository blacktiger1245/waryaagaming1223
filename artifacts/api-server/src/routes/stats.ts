import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, teamsTable, tournamentsTable, matchesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

router.get("/stats/summary", async (req, res) => {
  const [playerCount] = await db.select({ count: sql<number>`count(*)::int` }).from(playersTable);
  const [teamCount] = await db.select({ count: sql<number>`count(*)::int` }).from(teamsTable);
  const [tournamentCount] = await db.select({ count: sql<number>`count(*)::int` }).from(tournamentsTable);
  const [activeCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tournamentsTable)
    .where(eq(tournamentsTable.status, "active"));
  const [completedMatches] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matchesTable)
    .where(eq(matchesTable.status, "completed"));
  const [liveMatches] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matchesTable)
    .where(eq(matchesTable.status, "live"));

  const topPlayers = await db
    .select()
    .from(playersTable)
    .orderBy(playersTable.points)
    .limit(1);
  const topTeams = await db
    .select()
    .from(teamsTable)
    .orderBy(teamsTable.points)
    .limit(1);

  const topPlayer = topPlayers[0]
    ? {
        ...topPlayers[0],
        teamName: null,
        createdAt: topPlayers[0].createdAt.toISOString(),
      }
    : null;

  const topTeam = topTeams[0]
    ? {
        ...topTeams[0],
        captainName: "Unknown",
        memberCount: 0,
        members: [],
        createdAt: topTeams[0].createdAt.toISOString(),
      }
    : null;

  return res.json({
    totalPlayers: playerCount?.count ?? 0,
    totalTeams: teamCount?.count ?? 0,
    totalTournaments: tournamentCount?.count ?? 0,
    activeTournaments: activeCount?.count ?? 0,
    completedMatches: completedMatches?.count ?? 0,
    liveMatches: liveMatches?.count ?? 0,
    topPlayer,
    topTeam,
  });
});

router.get("/stats/live", async (req, res) => {
  const matches = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.status, "live"));

  return res.json(
    matches.map((m) => ({ ...m, tournamentName: null, createdAt: m.createdAt.toISOString() }))
  );
});

export default router;
