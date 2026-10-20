import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  matchesTable,
  tournamentsTable,
  matchPlayerGamesTable,
  playersTable,
  tournamentAdminsTable,
} from "@workspace/db";
import { eq, and, aliasedTable } from "drizzle-orm";
import { GetMatchParams, UpdateMatchParams, UpdateMatchBody } from "@workspace/api-zod";
import { advanceKnockoutWinner, computeWinnerFromResult } from "../lib/knockout";
import { syncStatsAfterFixture } from "../lib/stats-sync";

const router = Router();

// Read-only staff access (referee / admin / owner / legacy admin session).
function requireStaff(req: Request, res: Response, next: NextFunction) {
  const role = req.session?.role;
  const staff = !!req.session?.userId && (role === "referee" || role === "admin" || role === "owner");
  if (staff || req.session?.isAdmin) return next();
  return res.status(403).json({ error: "Staff access required" });
}

// ── Result-edit authorization ─────────────────────────────────────────────────
// Allowed: Owner, global Admin (incl. legacy admin), Tournament Admin (creator
// or listed in tournament_admins), or the Referee assigned to this match.
// Everyone else (regular players / unauthenticated) is denied.
async function canEditMatchResult(
  req: Request,
  match: { tournamentId: number; assignedRefereeId?: number | null },
): Promise<boolean> {
  const userId = req.session?.userId;
  if (!userId) return false;
  const role = req.session?.role;

  if (role === "owner" || role === "admin" || req.session?.isAdmin) return true;

  // Assigned referee — only the exact match they are assigned to.
  if (role === "referee") return match.assignedRefereeId === userId;

  // Tournament admin: the tournament creator or a member of tournament_admins.
  const [tournament] = await db
    .select({ createdBy: tournamentsTable.createdBy })
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, match.tournamentId));
  if (tournament?.createdBy === userId) return true;

  const [ta] = await db
    .select({ id: tournamentAdminsTable.id })
    .from(tournamentAdminsTable)
    .where(
      and(
        eq(tournamentAdminsTable.tournamentId, match.tournamentId),
        eq(tournamentAdminsTable.playerId, userId),
      ),
    );
  return !!ta;
}

// Match result *management* (e.g. assigning a referee) — Owner / Admin /
// Tournament Admin only. A referee may not assign anybody.
async function canManageMatchAssignment(
  req: Request,
  match: { tournamentId: number; assignedRefereeId?: number | null },
): Promise<boolean> {
  if (req.session?.role === "referee") return false;
  return canEditMatchResult(req, match);
}

// Player statistics are maintained by the canonical synchroniser, which handles
// solo matches (participant ids are players) AND clan fixtures (numbers come from
// each player-vs-player game), plus MOTM awards for both competition shapes.
export async function recomputePlayerStatsForCompletedMatch(match: typeof matchesTable.$inferSelect): Promise<void> {
  await syncStatsAfterFixture(match);
}

function serializeMatchRow(match: typeof matchesTable.$inferSelect, tournamentName: string | null) {
  return {
    ...match,
    tournamentName,
    createdAt: match.createdAt.toISOString(),
    resultSetAt: match.resultSetAt ? match.resultSetAt.toISOString() : null,
  };
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

router.patch("/matches/:id", async (req, res) => {
  const params = UpdateMatchParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const body = UpdateMatchBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid body" });

  const data = body.data as {
    participant1Score?: number;
    participant2Score?: number;
    winnerId?: number | null;
    winnerName?: string | null;
    status?: string;
  };

  // Result validation: whole, non-negative scores only.
  if (data.participant1Score !== undefined && (!Number.isInteger(data.participant1Score) || data.participant1Score < 0)) {
    return res.status(400).json({ error: "Player 1 score must be a whole, non-negative number" });
  }
  if (data.participant2Score !== undefined && (!Number.isInteger(data.participant2Score) || data.participant2Score < 0)) {
    return res.status(400).json({ error: "Player 2 score must be a whole, non-negative number" });
  }

  const [existing] = await db.select().from(matchesTable).where(eq(matchesTable.id, params.data.id));
  if (!existing) return res.status(404).json({ error: "Match not found" });

  if (!(await canEditMatchResult(req, existing))) {
    return res.status(403).json({ error: "You are not authorized to edit this match result" });
  }

  const hasResult =
    data.participant1Score !== undefined || data.participant2Score !== undefined || data.winnerId !== undefined;

  // Auto-compute winner from scores if not explicitly provided.
  const computed = computeWinnerFromResult(existing, data);
  if (computed.winnerId !== undefined) data.winnerId = computed.winnerId;
  if (computed.winnerName !== undefined) data.winnerName = computed.winnerName;

  // If a winner was determined, mark the match completed unless another status
  // was explicitly supplied.
  if (computed.winnerId != null && data.status == null) {
    data.status = "completed";
  }

  const updateData: Record<string, unknown> = {
    ...data,
    ...(hasResult ? { resultSetBy: req.session?.userId ?? null, resultSetAt: new Date() } : {}),
  };

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  // Filter undefined values so Drizzle never receives an empty set object.
  const definedUpdate: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updateData)) {
    if (v !== undefined) definedUpdate[k] = v;
  }
  if (Object.keys(definedUpdate).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const [match] = await db
    .update(matchesTable)
    .set(definedUpdate as Parameters<ReturnType<typeof db.update>["set"]>[0])
    .where(eq(matchesTable.id, params.data.id))
    .returning();

  if (!match) return res.status(404).json({ error: "Match not found" });

  // Propagate knockout winner to the next round.
  await advanceKnockoutWinner(match);

  // Update rankings/statistics with the existing ranking system.
  if (match.status === "completed") {
    recomputePlayerStatsForCompletedMatch(match).catch((err: unknown) => {
      req.log.error({ err }, "Player stats recompute failed after result save");
    });
  }

  return res.json({
    ...match,
    tournamentName: null,
    createdAt: match.createdAt.toISOString(),
    resultSetAt: match.resultSetAt ? match.resultSetAt.toISOString() : null,
  });
});

// Public: player games for a match (read-only).
// Each matchup also carries both players' avatars so every fixture can render a
// face next to the name (and the profile link on top of it).
router.get("/matches/:id/player-games", async (req, res) => {
  const matchId = Number(req.params.id);
  if (isNaN(matchId)) return res.status(400).json({ error: "Invalid id" });

  const homePlayer = aliasedTable(playersTable, "home_game_player");
  const awayPlayer = aliasedTable(playersTable, "away_game_player");

  const rows = await db
    .select({
      game: matchPlayerGamesTable,
      homeAvatarUrl: homePlayer.avatarUrl,
      homeDisplayName: homePlayer.displayName,
      homeUsername: homePlayer.username,
      awayAvatarUrl: awayPlayer.avatarUrl,
      awayDisplayName: awayPlayer.displayName,
      awayUsername: awayPlayer.username,
    })
    .from(matchPlayerGamesTable)
    .leftJoin(homePlayer, eq(matchPlayerGamesTable.homePlayerId, homePlayer.id))
    .leftJoin(awayPlayer, eq(matchPlayerGamesTable.awayPlayerId, awayPlayer.id))
    .where(eq(matchPlayerGamesTable.matchId, matchId))
    .orderBy(matchPlayerGamesTable.id);

  return res.json(
    rows.map((row) => ({
      ...row.game,
      homeAvatarUrl: row.homeAvatarUrl ?? null,
      homeDisplayName: row.homeDisplayName ?? null,
      homeUsername: row.homeUsername ?? null,
      awayAvatarUrl: row.awayAvatarUrl ?? null,
      awayDisplayName: row.awayDisplayName ?? null,
      awayUsername: row.awayUsername ?? null,
    })),
  );
});

// Staff: list all matches with their tournament name (admin / tournament-admin view).
router.get("/staff/matches", requireStaff, async (req, res) => {
  const rows = await db
    .select({ match: matchesTable, tournamentName: tournamentsTable.name })
    .from(matchesTable)
    .leftJoin(tournamentsTable, eq(matchesTable.tournamentId, tournamentsTable.id))
    .orderBy(matchesTable.tournamentId, matchesTable.round, matchesTable.id);
  return res.json(rows.map((r) => serializeMatchRow(r.match, r.tournamentName ?? null)));
});

// Referee Panel: only the matches assigned to the current referee.
router.get("/referee/matches", requireStaff, async (req, res) => {
  if (req.session?.role !== "referee") {
    return res.status(403).json({ error: "Referee access required" });
  }
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  const rows = await db
    .select({ match: matchesTable, tournamentName: tournamentsTable.name })
    .from(matchesTable)
    .leftJoin(tournamentsTable, eq(matchesTable.tournamentId, tournamentsTable.id))
    .where(eq(matchesTable.assignedRefereeId, userId))
    .orderBy(matchesTable.tournamentId, matchesTable.round, matchesTable.id);
  return res.json(rows.map((r) => serializeMatchRow(r.match, r.tournamentName ?? null)));
});

// Owner / Admin / Tournament Admin: assign a referee to a match.
router.patch("/admin/matches/:id/referee", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const refereeId = Number((req.body as { refereeId?: unknown } | undefined)?.refereeId);
  if (!Number.isInteger(refereeId)) return res.status(400).json({ error: "A valid refereeId is required" });

  const [existing] = await db.select().from(matchesTable).where(eq(matchesTable.id, id));
  if (!existing) return res.status(404).json({ error: "Match not found" });

  if (!(await canManageMatchAssignment(req, existing))) {
    return res.status(403).json({ error: "Only owners, admins or tournament admins can assign referees" });
  }

  const [target] = await db
    .select({ id: playersTable.id, role: playersTable.role })
    .from(playersTable)
    .where(eq(playersTable.id, refereeId));
  if (!target) return res.status(404).json({ error: "Referee not found" });
  if (target.role !== "referee") return res.status(400).json({ error: "The selected user is not a referee" });

  const [match] = await db
    .update(matchesTable)
    .set({ assignedRefereeId: target.id })
    .where(eq(matchesTable.id, id))
    .returning();

  return res.json({ ...serializeMatchRow(match, null), assignedRefereeId: match.assignedRefereeId ?? null });
});

export default router;
