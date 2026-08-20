import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { matchesTable, tournamentsTable, matchPlayerGamesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetMatchParams, UpdateMatchParams, UpdateMatchBody } from "@workspace/api-zod";

const router = Router();

// Staff = referee, admin, owner (or the legacy password-based admin session).
// Only these accounts may mutate match results. Everyone else is rejected.
function requireStaff(req: Request, res: Response, next: NextFunction) {
  const role = req.session?.role;
  const staff = !!req.session?.userId && (role === "referee" || role === "admin" || role === "owner");
  if (staff || req.session?.isAdmin) return next();
  return res.status(403).json({ error: "Staff access required" });
}

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

router.patch("/matches/:id", requireStaff, async (req, res) => {
  const params = UpdateMatchParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const body = UpdateMatchBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid body" });

  const { scheduledAt, ...rest } = body.data as typeof body.data & { scheduledAt?: string | null };
  const updateData = {
    ...rest,
    ...(scheduledAt !== undefined
      ? { scheduledAt: scheduledAt ? scheduledAt : null }
      : {}),
  };

  const [match] = await db
    .update(matchesTable)
    .set(updateData as Parameters<ReturnType<typeof db.update>["set"]>[0])
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
  return res.json(games);
});

// Staff: list all matches with their tournament name — used by the Referee
// Panel so referees can see the matches they are allowed to edit results for.
router.get("/staff/matches", requireStaff, async (req, res) => {
  const rows = await db
    .select({ match: matchesTable, tournamentName: tournamentsTable.name })
    .from(matchesTable)
    .leftJoin(tournamentsTable, eq(matchesTable.tournamentId, tournamentsTable.id))
    .orderBy(matchesTable.tournamentId, matchesTable.round, matchesTable.id);
  return res.json(
    rows.map((r) => ({
      ...r.match,
      tournamentName: r.tournamentName ?? null,
      createdAt: r.match.createdAt.toISOString(),
    })),
  );
});

export default router;
