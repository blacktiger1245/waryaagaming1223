import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { hallOfFameTable, playersTable, seasonsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

// Admin-only (role admin/owner or legacy admin session).
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = req.session?.role;
  const admin = !!req.session?.userId && (role === "admin" || role === "owner");
  if (admin || req.session?.isAdmin) return next();
  return res.status(401).json({ error: "Admin authentication required" });
}

// ── Public: active Hall of Fame players (Homepage) ────────────────────────────
// Exposes only what the cards need; never fails the page (returns [] on error).
router.get("/hall-of-fame", async (req, res) => {
  try {
    const rows = await db
      .select({
        hof: hallOfFameTable,
        playerId: playersTable.id,
        playerUsername: playersTable.username,
        playerDisplayName: playersTable.displayName,
        playerAvatarUrl: playersTable.avatarUrl,
        seasonName: seasonsTable.name,
      })
      .from(hallOfFameTable)
      .innerJoin(playersTable, eq(playersTable.id, hallOfFameTable.playerId))
      .leftJoin(seasonsTable, eq(seasonsTable.id, hallOfFameTable.seasonId))
      .where(eq(hallOfFameTable.status, true))
      .orderBy(desc(hallOfFameTable.updatedAt));

    return res.json(
      rows.map((r) => ({
        id: r.hof.id,
        playerId: r.playerId,
        playerName: r.playerDisplayName ?? r.playerUsername,
        username: r.playerUsername,
        avatarUrl: r.playerAvatarUrl,
        seasonId: r.hof.seasonId,
        seasonName: r.seasonName,
        games: r.hof.games,
        trophies: r.hof.trophies,
        goals: r.hof.goals,
        motmAwards: r.hof.motmAwards,
      })),
    );
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error fetching Hall of Fame");
    return res.json([]);
  }
});

function seasonYear(season: { name: string }): number {
  const match = season.name.match(/\d{4}/);
  return match ? Number(match[0]) : new Date().getFullYear();
}

// ── Admin: all players with their active Hall of Fame record ─────────────────
router.get("/admin/hall-of-fame/players", requireAdmin, async (req, res) => {
  try {
    const players = await db.select().from(playersTable).orderBy(desc(playersTable.points));
    const active = await db
      .select({
        playerId: hallOfFameTable.playerId,
        hofId: hallOfFameTable.id,
        seasonId: hallOfFameTable.seasonId,
        seasonName: seasonsTable.name,
      })
      .from(hallOfFameTable)
      .leftJoin(seasonsTable, eq(seasonsTable.id, hallOfFameTable.seasonId))
      .where(eq(hallOfFameTable.status, true));

    const activeMap = new Map<number, { hofId: number; seasonId: number | null; seasonName: string | null }>();
    for (const a of active) {
      if (!activeMap.has(a.playerId)) {
        activeMap.set(a.playerId, { hofId: a.hofId, seasonId: a.seasonId, seasonName: a.seasonName ?? null });
      }
    }

    return res.json(
      players.map((p) => ({
        id: p.id,
        username: p.username,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        role: p.role,
        games: p.matchesPlayed,
        trophies: p.tournamentWins,
        goals: p.goalsScored,
        motmAwards: p.manOfTheMatch,
        hof: activeMap.get(p.id) ?? null,
      })),
    );
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error listing Hall of Fame players");
    return res.status(500).json({ error: "Failed to load players" });
  }
});

// ── Admin: activate / deactivate a player in the Hall of Fame ────────────────
router.post("/admin/hall-of-fame/toggle", requireAdmin, async (req, res) => {
  const body = req.body as { playerId?: unknown; on?: unknown; seasonId?: unknown };
  const playerId = Number(body.playerId);
  if (!Number.isInteger(playerId)) return res.status(400).json({ error: "A valid playerId is required" });
  const on = body.on === true;

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) return res.status(404).json({ error: "Player not found" });

  try {
    if (!on) {
      const [updated] = await db
        .update(hallOfFameTable)
        .set({ status: false, updatedAt: new Date() })
        .where(and(eq(hallOfFameTable.playerId, playerId), eq(hallOfFameTable.status, true)))
        .returning({ id: hallOfFameTable.id });
      return res.json({ ok: true, deactivatedHofId: updated?.id ?? null });
    }

    const seasonId = Number(body.seasonId);
    if (!Number.isInteger(seasonId)) {
      return res.status(400).json({ error: "Please select a season" });
    }
    const [season] = await db.select().from(seasonsTable).where(eq(seasonsTable.id, seasonId));
    if (!season) return res.status(400).json({ error: "Please select an existing season" });

    // Keep a single active record per player: clear any previous then insert.
    await db
      .update(hallOfFameTable)
      .set({ status: false, updatedAt: new Date() })
      .where(and(eq(hallOfFameTable.playerId, playerId), eq(hallOfFameTable.status, true)));

    const [created] = await db
      .insert(hallOfFameTable)
      .values({
        playerId,
        seasonId,
        status: true,
        games: player.matchesPlayed,
        trophies: player.tournamentWins,
        goals: player.goalsScored,
        motmAwards: player.manOfTheMatch,
        achievement: "Hall of Fame",
        year: seasonYear(season),
        description: null,
      })
      .returning();

    return res.status(201).json({
      hof: {
        hofId: created.id,
        playerId,
        seasonId,
        seasonName: season.name,
        games: created.games,
        trophies: created.trophies,
        goals: created.goals,
        motmAwards: created.motmAwards,
      },
    });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error toggling Hall of Fame");
    return res.status(500).json({ error: "Failed to update Hall of Fame" });
  }
});

export default router;