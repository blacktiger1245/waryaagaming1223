import { Router } from "express";
import { db } from "@workspace/db";
import { matchesTable, tournamentsTable, matchPlayerGamesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetMatchParams, UpdateMatchParams, UpdateMatchBody } from "@workspace/api-zod";

const router = Router();

router.get("/matches/:id", async (req, res) => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, params.data.id));
  if (!match) return res.status(404).json({ error: "Match not found" });

  const [tournament] = await db
    .select({ name: tournamentsTable.name })
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, match.tournamentId));

  return res.json({ ...match, tournamentName: tournament?.name ?? null, createdAt: match.createdAt.toISOString() });
});

router.patch("/matches/:id", async (req, res) => {
  const params = UpdateMatchParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const body = UpdateMatchBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid body" });

  const { scheduledAt, ...rest } = body.data;
  const updateData = {
    ...rest,
    ...(scheduledAt !== undefined
      ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }
      : {}),
  };

  const [match] = await db
    .update(matchesTable)
    .set(updateData)
    .where(eq(matchesTable.id, params.data.id))
    .returning();

  if (!match) return res.status(404).json({ error: "Match not found" });
  return res.json({ ...match, tournamentName: null, createdAt: match.createdAt.toISOString() });
});

// Public: player games for a match (read-only)
router.get("/matches/:id/player-games", async (req, res) => {
  const matchId = Number(req.params.id);
  if (isNaN(matchId)) return res.status(400).json({ error: "Invalid id" });
  const games = await db
    .select()
    .from(matchPlayerGamesTable)
    .where(eq(matchPlayerGamesTable.matchId, matchId))
    .orderBy(matchPlayerGamesTable.id);
  res.json(games);
});

export default router;
