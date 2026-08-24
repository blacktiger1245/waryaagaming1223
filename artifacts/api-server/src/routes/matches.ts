import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  matchesTable,
  tournamentsTable,
  matchPlayerGamesTable,
  playersTable,
  tournamentAdminsTable,
} from "@workspace/db";
import { playerPoints, pointsToMarketValue } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { GetMatchParams, UpdateMatchParams, UpdateMatchBody } from "@workspace/api-zod";
import { advanceKnockoutWinner, computeWinnerFromResult } from "../lib/knockout";

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

// Recompute a player's statistics from all completed matches — the canonical
// ranking/stats system (same formulas as the admin player-stats sync). Only
// runs for solo-tournament matches (participant ids are player ids).
async function recomputePlayerStatsForCompletedMatch(match: typeof matchesTable.$inferSelect): Promise<void> {
  if (match.status !== "completed") return;
  const [tournament] = match.tournamentId
    ? await db
        .select({ tournamentType: tournamentsTable.tournamentType })
        .from(tournamentsTable)
        .where(eq(tournamentsTable.id, match.tournamentId))
    : [null];
  if (tournament?.tournamentType === "team") return;

  const playerIds = [match.participant1Id, match.participant2Id].filter((x): x is number => x != null);
  if (playerIds.length === 0) return;

  const completedMatches = await db
    .select({
      participant1Id: matchesTable.participant1Id,
      participant2Id: matchesTable.participant2Id,
      participant1Score: matchesTable.participant1Score,
      participant2Score: matchesTable.participant2Score,
      winnerId: matchesTable.winnerId,
      manOfTheMatchId: matchesTable.manOfTheMatchId,
      participant1YellowCards: matchesTable.participant1YellowCards,
      participant1RedCards: matchesTable.participant1RedCards,
      participant2YellowCards: matchesTable.participant2YellowCards,
      participant2RedCards: matchesTable.participant2RedCards,
    })
    .from(matchesTable)
    .where(eq(matchesTable.status, "completed"));

  for (const playerId of playerIds) {
    let matchesPlayed = 0;
    let matchesWon = 0;
    let cleanSheets = 0;
    let goalsScored = 0;
    let goalsConceded = 0;
    let draws = 0;
    let manOfTheMatch = 0;
    let yellowCards = 0;
    let redCards = 0;

    for (const m of completedMatches) {
      const asP1 = m.participant1Id === playerId;
      const asP2 = m.participant2Id === playerId;
      if (!asP1 && !asP2) continue;

      matchesPlayed++;
      const myScore = asP1 ? (m.participant1Score ?? 0) : (m.participant2Score ?? 0);
      const oppScore = asP1 ? (m.participant2Score ?? 0) : (m.participant1Score ?? 0);
      goalsScored += myScore;
      goalsConceded += oppScore;
      if (oppScore === 0) cleanSheets++;

      if (m.manOfTheMatchId != null) {
        if ((asP1 && m.manOfTheMatchId === m.participant1Id) || (asP2 && m.manOfTheMatchId === m.participant2Id)) {
          manOfTheMatch++;
        }
      }
      if (asP1) {
        yellowCards += m.participant1YellowCards ?? 0;
        redCards += m.participant1RedCards ?? 0;
      } else {
        yellowCards += m.participant2YellowCards ?? 0;
        redCards += m.participant2RedCards ?? 0;
      }
      if (myScore === oppScore) { draws++; continue; }

      const s1 = m.participant1Score ?? 0;
      const s2 = m.participant2Score ?? 0;
      const winnerPlayerId = m.winnerId != null ? m.winnerId : s1 > s2 ? m.participant1Id : s2 > s1 ? m.participant2Id : null;
      if (winnerPlayerId === playerId) matchesWon++;
    }

    const [player] = await db
      .select({ tournamentWins: playersTable.tournamentWins })
      .from(playersTable)
      .where(eq(playersTable.id, playerId));
    const tournamentWins = player?.tournamentWins ?? 0;

    const matchesLost = matchesPlayed - matchesWon;
    const winRate = matchesWon * 0.4;
    const lossRate = matchesLost * 0.4;
    const points = playerPoints({
      appearances: matchesPlayed,
      wins: matchesWon,
      cleanSheets,
      goals: goalsScored,
      motm: manOfTheMatch,
      draws,
    });
    const marketValue = pointsToMarketValue(points);

    await db
      .update(playersTable)
      .set({
        points,
        marketValue,
        matchesPlayed,
        matchesWon,
        matchesLost,
        draws,
        goalsScored,
        goalsConceded,
        cleanSheets,
        manOfTheMatch,
        yellowCards,
        redCards,
        winRate,
        lossRate,
        tournamentWins,
      })
      .where(eq(playersTable.id, playerId));
  }
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

  const updateData: Record<string, unknown> = {
    ...data,
    ...(hasResult ? { resultSetBy: req.session?.userId ?? null, resultSetAt: new Date() } : {}),
  };

  const [match] = await db
    .update(matchesTable)
    .set(updateData as Parameters<ReturnType<typeof db.update>["set"]>[0])
    .where(eq(matchesTable.id, params.data.id))
    .returning();

  if (!match) return res.status(404).json({ error: "Match not found" });

  // Propagate knockout winner to the next round.
  await advanceKnockoutWinner(match);

  // Update rankings/statistics with the existing ranking system.
  if (match.status === "completed") {
    await recomputePlayerStatsForCompletedMatch(match).catch((err: unknown) => {
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
