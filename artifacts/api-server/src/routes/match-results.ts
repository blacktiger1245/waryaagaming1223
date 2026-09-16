import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  matchesTable,
  tournamentsTable,
  playersTable,
  matchResultSubmissionsTable,
  matchResultAuditLogTable,
  matchPlayerGamesTable,
} from "@workspace/db";
import { eq, and, desc, isNull } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import { detectMatchResultFromImage, validateUploadedImage, assertSafeImage, isNullableCount, type DetectedResult } from "../lib/matchResultDetection";
import { recomputePlayerStatsForCompletedMatch } from "./matches";
import { advanceKnockoutWinner, computeWinnerFromResult } from "../lib/knockout";
import { recalculateTeamScore } from "../lib/teamScore";

const router = Router();
const objectStorageService = new ObjectStorageService();

// ── Auth helpers ─────────────────────────────────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.userId) return next();
  return res.status(401).json({ error: "You must be logged in" });
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = req.session?.role;
  const isAdmin = !!req.session?.userId && (role === "admin" || role === "owner");
  if (isAdmin || req.session?.isAdmin) return next();
  // Distinguish "not logged in" from "logged in but not an administrator" so the
  // caller learns whether re-authenticating could help.
  const hasSession = !!req.session?.userId || !!req.session?.isAdmin || !!req.session?.adminUsername;
  return res
    .status(hasSession ? 403 : 401)
    .json({ error: hasSession ? "Admin authentication required" : "You must be logged in" });
}

/**
 * Identify the administrator performing an action.
 *
 * Two session styles exist in this codebase:
 *   • Discord-authenticated staff — `session.userId` points at their player row.
 *   • Legacy password admin — only `session.adminUsername` / `session.isAdmin`
 *     are set, so the player row (when one exists) is looked up by username.
 *
 * The audit trail always records a name; `adminId` is null when no player row can
 * be resolved so logging can never fail an approval.
 */
async function resolveAdminIdentity(req: Request): Promise<{ adminId: number | null; adminName: string }> {
  const sessionUserId = req.session?.userId as number | undefined;
  if (typeof sessionUserId === "number" && !isNaN(sessionUserId)) {
    const [player] = await db
      .select({ username: playersTable.username, displayName: playersTable.displayName })
      .from(playersTable)
      .where(eq(playersTable.id, sessionUserId));
    return {
      adminId: sessionUserId,
      adminName:
        player?.displayName ?? player?.username ?? req.session?.adminUsername ?? `admin #${sessionUserId}`,
    };
  }

  const username = req.session?.adminUsername ?? req.session?.username ?? "admin";
  const [player] = await db
    .select({ id: playersTable.id, displayName: playersTable.displayName })
    .from(playersTable)
    .where(eq(playersTable.username, username));
  return { adminId: player?.id ?? null, adminName: player?.displayName ?? username };
}

// ── Serializers ──────────────────────────────────────────────────────────────
function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

// ── OCR provenance ───────────────────────────────────────────────────────────
/**
 * Everything the recognition pass learnt about a screenshot, kept so the admin can
 * audit exactly where each extracted number came from. Persisted as a JSON string.
 */
interface OcrMetadata {
  engine: string;
  available: boolean;
  error: string | null;
  durationMs: number;
  homeName: string | null;
  awayName: string | null;
  confidence: Record<string, number>;
  sources: Record<string, string>;
  uncertainFields: string[];
  rawText: string;
  notes: string[];
}

function buildOcrMetadata(detection: DetectedResult): string {
  const metadata: OcrMetadata = {
    engine: detection.ocrEngine,
    available: detection.ocrAvailable,
    error: detection.ocrError,
    durationMs: detection.ocrDurationMs,
    homeName: detection.homeName,
    awayName: detection.awayName,
    confidence: detection.confidence,
    sources: detection.sources,
    uncertainFields: detection.uncertainFields,
    // Cap the stored text: a screenshot should never yield more than a few hundred
    // characters, and the column must not be abusable as free storage.
    rawText: detection.rawText.slice(0, 8000),
    notes: detection.notes,
  };
  return JSON.stringify(metadata);
}

/** Parse stored provenance. Legacy/malformed values degrade to `null`. */
function parseOcrMetadata(raw: string | null): OcrMetadata | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as OcrMetadata;
  } catch {
    return null;
  }
}

function serializeSubmission(row: typeof matchResultSubmissionsTable.$inferSelect) {
  return {
    id: row.id,
    fixtureId: row.fixtureId,
    playerGameId: row.playerGameId,
    submittedBy: row.submittedBy,
    status: row.status,
    imagePath: row.imagePath,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    homePosition: row.homePosition,
    awayPosition: row.awayPosition,
    homeShots: row.homeShots,
    awayShots: row.awayShots,
    homeShotsOnTarget: row.homeShotsOnTarget,
    awayShotsOnTarget: row.awayShotsOnTarget,
    homeCorners: row.homeCorners,
    awayCorners: row.awayCorners,
    homeYellowCards: row.homeYellowCards,
    awayYellowCards: row.awayYellowCards,
    homeRedCards: row.homeRedCards,
    awayRedCards: row.awayRedCards,
    rejectionReason: row.rejectionReason,
    ocrMetadata: parseOcrMetadata(row.ocrMetadata),
    approvedBy: row.approvedBy,
    approvedAt: iso(row.approvedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

// ── Authorization: is this logged-in player/team assigned to the fixture? ─────
async function isFixtureParticipant(
  match: { tournamentId: number; participant1Id: number | null; participant2Id: number | null },
  userId: number,
): Promise<boolean> {
  if (match.participant1Id === userId || match.participant2Id === userId) return true;

  // Team-format fixture: participant ids are team ids. A player belongs if their
  // team is one of the two fixture sides.
  const [tournament] = match.tournamentId
    ? await db
        .select({ tournamentType: tournamentsTable.tournamentType })
        .from(tournamentsTable)
        .where(eq(tournamentsTable.id, match.tournamentId))
    : [null];
  if (tournament?.tournamentType === "team") {
    const [player] = await db
      .select({ teamId: playersTable.teamId })
      .from(playersTable)
      .where(eq(playersTable.id, userId));
    return !!player?.teamId && (player.teamId === match.participant1Id || player.teamId === match.participant2Id);
  }
  return false;
}

/**
 * Authorization for a player-vs-player matchup inside a team fixture: only the
 * two players actually named on the game may act on it. Team membership alone
 * is NOT enough — a teammate who is not playing this specific game cannot
 * submit its screenshot.
 */
function isPlayerGameParticipant(
  game: { homePlayerId: number | null; awayPlayerId: number | null },
  userId: number,
): boolean {
  return game.homePlayerId === userId || game.awayPlayerId === userId;
}
// ── Player: read my latest submission for a fixture ──────────────────────────
router.get("/matches/:id/result-submission", requireAuth, async (req: Request, res: Response) => {
  const fixtureId = Number(req.params.id);
  if (isNaN(fixtureId)) return res.status(400).json({ error: "Invalid id" });
  const userId = req.session?.userId as number;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, fixtureId));
  if (!match) return res.status(404).json({ error: "Fixture not found" });

  const role = req.session?.role;
  const isAdmin = role === "admin" || role === "owner" || !!req.session?.isAdmin;
  if (!isAdmin && !(await isFixtureParticipant(match, userId))) {
    return res.status(403).json({ error: "Only participants can view this submission" });
  }

  const [submission] = await db
    .select()
    .from(matchResultSubmissionsTable)
    .where(and(
      eq(matchResultSubmissionsTable.fixtureId, fixtureId),
      eq(matchResultSubmissionsTable.submittedBy, userId),
      // Player-vs-player submissions are read through /player-games/:id instead.
      isNull(matchResultSubmissionsTable.playerGameId),
    ))
    .orderBy(desc(matchResultSubmissionsTable.createdAt))
    .limit(1);

  return res.json(submission ? serializeSubmission(submission) : null);
});

// ── Player: upload match-result screenshot ───────────────────────────────────
router.post("/matches/:id/result-submission", requireAuth, async (req: Request, res: Response) => {
  const fixtureId = Number(req.params.id);
  if (isNaN(fixtureId)) return res.status(400).json({ error: "Invalid id" });
  const userId = req.session?.userId as number;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, fixtureId));
  if (!match) return res.status(404).json({ error: "Fixture not found" });

  // Only players/teams assigned to this fixture may submit a result — admins and
  // owners are exempt so they can upload a screenshot on a player's behalf.
  const role = req.session?.role;
  const isAdmin = role === "admin" || role === "owner" || !!req.session?.isAdmin;
  if (!isAdmin && !(await isFixtureParticipant(match, userId))) {
    return res.status(403).json({ error: "You are not a participant in this fixture" });
  }

  // A team-vs-team fixture is only a container: the result belongs to the
  // individual player-vs-player matchup, which has its own upload endpoint.
  const [tournament] = match.tournamentId
    ? await db
        .select({ tournamentType: tournamentsTable.tournamentType })
        .from(tournamentsTable)
        .where(eq(tournamentsTable.id, match.tournamentId))
    : [null];
  if (tournament?.tournamentType === "team") {
    return res.status(400).json({
      error: "This is a team fixture — open it and upload the screenshot on your player-vs-player matchup instead",
    });
  }

  // A completed fixture cannot be submitted again unless an admin reopens it.
  if (match.status === "completed" || match.status === "cancelled") {
    return res.status(409).json({ error: "This fixture is already completed and cannot be resubmitted" });
  }

  // Duplicate-submission guard: one open (pending) submission per fixture+player.
  const [existing] = await db
    .select()
    .from(matchResultSubmissionsTable)
    .where(and(
      eq(matchResultSubmissionsTable.fixtureId, fixtureId),
      eq(matchResultSubmissionsTable.submittedBy, userId),
      isNull(matchResultSubmissionsTable.playerGameId),
    ))
    .orderBy(desc(matchResultSubmissionsTable.createdAt))
    .limit(1);
  if (existing?.status === "pending") {
    return res.status(409).json({ error: "A result for this fixture is already awaiting admin approval" });
  }
  if (existing?.status === "approved") {
    return res.status(409).json({ error: "This fixture result has already been approved" });
  }

  // Validate + upload the image (safe types, reasonable size).
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "A screenshot image is required" });
  }
  const contentType = req.get("content-type") || "application/octet-stream";
  let objectPath: string;
  try {
    validateUploadedImage(contentType, req.body);
    // Deep verification: the bytes must genuinely decode as a raster image, so a
    // renamed SVG/HTML/executable payload can never reach object storage.
    await assertSafeImage(req.body);
    objectPath = await objectStorageService.uploadObject(req.body, contentType.split(";")[0].trim());
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Failed to store the image" });
  }

  // Attempt to read statistics from the screenshot. Anything not confidently
  // read stays null ("Not detected") and is confirmed by the admin on approval.
  const detection = await detectMatchResultFromImage(req.body, contentType);

  const [submission] = await db
    .insert(matchResultSubmissionsTable)
    .values({
      fixtureId,
      submittedBy: userId,
      status: "pending",
      imagePath: objectPath,
      homeScore: detection.homeScore,
      awayScore: detection.awayScore,
      homePosition: detection.homePosition,
      awayPosition: detection.awayPosition,
      homeShots: detection.homeShots,
      awayShots: detection.awayShots,
      homeShotsOnTarget: detection.homeShotsOnTarget,
      awayShotsOnTarget: detection.awayShotsOnTarget,
      homeCorners: detection.homeCorners,
      awayCorners: detection.awayCorners,
      homeYellowCards: detection.homeYellowCards,
      awayYellowCards: detection.awayYellowCards,
      homeRedCards: detection.homeRedCards,
      awayRedCards: detection.awayRedCards,
      rejectionReason: null,
      ocrMetadata: buildOcrMetadata(detection),
    })
    .returning();

  return res.status(201).json({
    ...serializeSubmission(submission),
    // Player-facing: keep it neutral. The OCR provenance (confidence, raw text,
    // uncertain fields) lives in ocrMetadata and is for the administrator only.
    detectionNotes: [
      "Your screenshot was received and queued for administrator verification.",
      "The official result is only updated once an administrator approves it.",
    ],
  });
});

// ── Player: read my latest submission for a player-vs-player matchup ─────────
router.get("/player-games/:id/result-submission", requireAuth, async (req: Request, res: Response) => {
  const gameId = Number(req.params.id);
  if (isNaN(gameId)) return res.status(400).json({ error: "Invalid id" });
  const userId = req.session?.userId as number;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const [game] = await db.select().from(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.id, gameId));
  if (!game) return res.status(404).json({ error: "Player matchup not found" });

  const role = req.session?.role;
  const isAdmin = role === "admin" || role === "owner" || !!req.session?.isAdmin;
  if (!isAdmin && !isPlayerGameParticipant(game, userId)) {
    return res.status(403).json({ error: "Only the two players in this matchup can view its submission" });
  }

  const [submission] = await db
    .select()
    .from(matchResultSubmissionsTable)
    .where(and(eq(matchResultSubmissionsTable.playerGameId, gameId), eq(matchResultSubmissionsTable.submittedBy, userId)))
    .orderBy(desc(matchResultSubmissionsTable.createdAt))
    .limit(1);

  return res.json(submission ? serializeSubmission(submission) : null);
});

// ── Player: upload match-result screenshot for a player-vs-player matchup ────
// This is where team-fixture results live: the submission is bound to the exact
// matchup (match_player_games.id) AND to the parent fixture (fixture_id) so the
// admin queue, audit trail and cascade behaviour are unchanged.
router.post("/player-games/:id/result-submission", requireAuth, async (req: Request, res: Response) => {
  const gameId = Number(req.params.id);
  if (isNaN(gameId)) return res.status(400).json({ error: "Invalid id" });
  const userId = req.session?.userId as number;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const [game] = await db.select().from(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.id, gameId));
  if (!game) return res.status(404).json({ error: "Player matchup not found" });

  // Only the two players actually playing this matchup may submit its result —
  // a teammate who is not in this pairing cannot. Admins/owners are exempt so
  // they can upload a screenshot on a player's behalf.
  const role = req.session?.role;
  const isAdmin = role === "admin" || role === "owner" || !!req.session?.isAdmin;
  if (!isAdmin && !isPlayerGameParticipant(game, userId)) {
    return res.status(403).json({ error: "Only the two players in this matchup can submit its result" });
  }

  // A completed matchup cannot be submitted again unless an admin reopens it.
  if (game.status === "completed") {
    return res.status(409).json({ error: "This matchup is already completed and cannot be resubmitted" });
  }

  // Duplicate-submission guard: one open (pending) submission per matchup+player.
  const [existing] = await db
    .select()
    .from(matchResultSubmissionsTable)
    .where(and(eq(matchResultSubmissionsTable.playerGameId, gameId), eq(matchResultSubmissionsTable.submittedBy, userId)))
    .orderBy(desc(matchResultSubmissionsTable.createdAt))
    .limit(1);
  if (existing?.status === "pending") {
    return res.status(409).json({ error: "A result for this matchup is already awaiting admin approval" });
  }
  if (existing?.status === "approved") {
    return res.status(409).json({ error: "This matchup result has already been approved" });
  }

  // Validate + upload the image (safe types, reasonable size).
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "A screenshot image is required" });
  }
  const contentType = req.get("content-type") || "application/octet-stream";
  let objectPath: string;
  try {
    validateUploadedImage(contentType, req.body);
    await assertSafeImage(req.body);
    objectPath = await objectStorageService.uploadObject(req.body, contentType.split(";")[0].trim());
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Failed to store the image" });
  }

  // Same real OCR pass as the solo-fixture flow; unreadable values stay NULL.
  const detection = await detectMatchResultFromImage(req.body, contentType);

  const [submission] = await db
    .insert(matchResultSubmissionsTable)
    .values({
      fixtureId: game.matchId,
      playerGameId: game.id,
      submittedBy: userId,
      status: "pending",
      imagePath: objectPath,
      homeScore: detection.homeScore,
      awayScore: detection.awayScore,
      homePosition: detection.homePosition,
      awayPosition: detection.awayPosition,
      homeShots: detection.homeShots,
      awayShots: detection.awayShots,
      homeShotsOnTarget: detection.homeShotsOnTarget,
      awayShotsOnTarget: detection.awayShotsOnTarget,
      homeCorners: detection.homeCorners,
      awayCorners: detection.awayCorners,
      homeYellowCards: detection.homeYellowCards,
      awayYellowCards: detection.awayYellowCards,
      homeRedCards: detection.homeRedCards,
      awayRedCards: detection.awayRedCards,
      rejectionReason: null,
      ocrMetadata: buildOcrMetadata(detection),
    })
    .returning();

  return res.status(201).json({
    ...serializeSubmission(submission),
    detectionNotes: [
      "Your screenshot was received and queued for administrator verification.",
      "The official result is only updated once an administrator approves it.",
    ],
  });
});
// ── Admin: list all submissions with fixture + tournament context ────────────
router.get("/admin/match-result-submissions", requireAdmin, async (req: Request, res: Response) => {
  const rows = await db
    .select({
      submission: matchResultSubmissionsTable,
      participant1Name: matchesTable.participant1Name,
      participant2Name: matchesTable.participant2Name,
      participant1Id: matchesTable.participant1Id,
      participant2Id: matchesTable.participant2Id,
      matchStatus: matchesTable.status,
      tournamentName: tournamentsTable.name,
      submitterName: playersTable.displayName,
      submitterUsername: playersTable.username,
      // Player-vs-player matchup context when the submission belongs to a game
      // inside a team fixture (null for solo-fixture submissions).
      gameHomePlayerName: matchPlayerGamesTable.homePlayerName,
      gameAwayPlayerName: matchPlayerGamesTable.awayPlayerName,
    })
    .from(matchResultSubmissionsTable)
    .leftJoin(matchesTable, eq(matchResultSubmissionsTable.fixtureId, matchesTable.id))
    .leftJoin(tournamentsTable, eq(matchesTable.tournamentId, tournamentsTable.id))
    .leftJoin(playersTable, eq(matchResultSubmissionsTable.submittedBy, playersTable.id))
    .leftJoin(matchPlayerGamesTable, eq(matchResultSubmissionsTable.playerGameId, matchPlayerGamesTable.id))
    .orderBy(desc(matchResultSubmissionsTable.createdAt));

  return res.json(
    rows.map((r) => ({
      ...serializeSubmission(r.submission),
      fixture: {
        participant1Id: r.participant1Id,
        participant1Name: r.participant1Name,
        participant2Id: r.participant2Id,
        participant2Name: r.participant2Name,
        status: r.matchStatus,
      },
      playerGame:
        r.submission.playerGameId != null
          ? {
              id: r.submission.playerGameId,
              homePlayerName: r.gameHomePlayerName,
              awayPlayerName: r.gameAwayPlayerName,
            }
          : null,
      tournamentName: r.tournamentName,
      submittedByName: r.submitterName ?? r.submitterUsername ?? null,
    })),
  );
});

// ── Admin: approve a submission and auto-write the official result ───────────
router.post("/admin/match-result-submissions/:id/approve", requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const admin = await resolveAdminIdentity(req);

  const [submission] = await db
    .select()
    .from(matchResultSubmissionsTable)
    .where(eq(matchResultSubmissionsTable.id, id));
  if (!submission) return res.status(404).json({ error: "Submission not found" });

  // A pending submission may only be approved once.
  if (submission.status !== "pending") {
    return res.status(409).json({ error: "This submission has already been processed" });
  }

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, submission.fixtureId));
  if (!match) return res.status(404).json({ error: "Fixture not found" });

  // Build the confirmed statistics: prefer the admin's corrections, fall back to
  // the values extracted from the screenshot. Home = participant1, away = participant2.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const pick = (key: string, fallback: number | null | undefined): number | null =>
    body[key] === undefined || body[key] === null || body[key] === ""
      ? (fallback ?? null)
      : Number(body[key]);

  const confirmed = {
    homeScore: pick("homeScore", submission.homeScore),
    awayScore: pick("awayScore", submission.awayScore),
    homePosition: pick("homePosition", submission.homePosition),
    awayPosition: pick("awayPosition", submission.awayPosition),
    homeShots: pick("homeShots", submission.homeShots),
    awayShots: pick("awayShots", submission.awayShots),
    homeShotsOnTarget: pick("homeShotsOnTarget", submission.homeShotsOnTarget),
    awayShotsOnTarget: pick("awayShotsOnTarget", submission.awayShotsOnTarget),
    homeCorners: pick("homeCorners", submission.homeCorners),
    awayCorners: pick("awayCorners", submission.awayCorners),
    homeYellowCards: pick("homeYellowCards", submission.homeYellowCards),
    awayYellowCards: pick("awayYellowCards", submission.awayYellowCards),
    homeRedCards: pick("homeRedCards", submission.homeRedCards),
    awayRedCards: pick("awayRedCards", submission.awayRedCards),
  };

  // The score is required to finalise a result; every numeric field must be valid.
  if (confirmed.homeScore == null || confirmed.awayScore == null) {
    return res.status(400).json({ error: "Both home and away scores are required before approval" });
  }
  for (const value of Object.values(confirmed)) {
    if (!isNullableCount(value)) {
      return res.status(400).json({ error: "Statistics must be whole, non-negative numbers" });
    }
  }

  // Auto-detect the winner from the scores, then mark the fixture completed.
  const computed = computeWinnerFromResult(match, {
    participant1Score: confirmed.homeScore,
    participant2Score: confirmed.awayScore,
  });

  const isPlayerGameSubmission = submission.playerGameId != null;

  let updatedMatch: typeof matchesTable.$inferSelect;
  if (isPlayerGameSubmission) {
    // Player-vs-player approval: write the confirmed result to the exact matchup
    // row, then propagate to the parent team-vs-team fixture (score in set wins;
    // the parent only completes once every matchup has a score).
    const [game] = await db
      .select()
      .from(matchPlayerGamesTable)
      .where(eq(matchPlayerGamesTable.id, submission.playerGameId!));
    if (!game) return res.status(404).json({ error: "Player matchup not found" });
    if (game.status === "completed") {
      return res.status(409).json({ error: "This matchup result has already been finalised" });
    }

    await db
      .update(matchPlayerGamesTable)
      .set({
        status: "completed",
        homeScore: confirmed.homeScore,
        awayScore: confirmed.awayScore,
        homePosition: confirmed.homePosition,
        awayPosition: confirmed.awayPosition,
        homeShots: confirmed.homeShots,
        awayShots: confirmed.awayShots,
        homeShotsOnTarget: confirmed.homeShotsOnTarget,
        awayShotsOnTarget: confirmed.awayShotsOnTarget,
        homeCorners: confirmed.homeCorners,
        awayCorners: confirmed.awayCorners,
        homeYellowCards: confirmed.homeYellowCards,
        awayYellowCards: confirmed.awayYellowCards,
        homeRedCards: confirmed.homeRedCards,
        awayRedCards: confirmed.awayRedCards,
      })
      .where(eq(matchPlayerGamesTable.id, game.id));

    await recalculateTeamScore(match.id);
    const [refetched] = await db.select().from(matchesTable).where(eq(matchesTable.id, match.id));
    updatedMatch = refetched!;
  } else {
    [updatedMatch] = await db
      .update(matchesTable)
      .set({
        participant1Score: confirmed.homeScore,
        participant2Score: confirmed.awayScore,
        winnerId: computed.winnerId !== undefined ? computed.winnerId : match.winnerId,
        winnerName: computed.winnerName !== undefined ? computed.winnerName : match.winnerName,
        status: "completed",
        resultSetBy: admin.adminId ?? match.resultSetBy,
        resultSetAt: new Date(),
        participant1YellowCards: confirmed.homeYellowCards ?? 0,
        participant1RedCards: confirmed.homeRedCards ?? 0,
        participant2YellowCards: confirmed.awayYellowCards ?? 0,
        participant2RedCards: confirmed.awayRedCards ?? 0,
      })
      .where(eq(matchesTable.id, match.id))
      .returning();

    // Write/update the per-match player game statistics.
    const [existingGame] = await db
      .select()
      .from(matchPlayerGamesTable)
      .where(eq(matchPlayerGamesTable.matchId, match.id))
      .limit(1);
    const gameStats = {
      matchId: match.id,
      status: "completed",
      homePlayerId: match.participant1Id,
      homePlayerName: match.participant1Name,
      awayPlayerId: match.participant2Id,
      awayPlayerName: match.participant2Name,
      homeScore: confirmed.homeScore,
      awayScore: confirmed.awayScore,
      homePosition: confirmed.homePosition,
      awayPosition: confirmed.awayPosition,
      homeShots: confirmed.homeShots,
      awayShots: confirmed.awayShots,
      homeShotsOnTarget: confirmed.homeShotsOnTarget,
      awayShotsOnTarget: confirmed.awayShotsOnTarget,
      homeCorners: confirmed.homeCorners,
      awayCorners: confirmed.awayCorners,
      homeYellowCards: confirmed.homeYellowCards,
      awayYellowCards: confirmed.awayYellowCards,
      homeRedCards: confirmed.homeRedCards,
      awayRedCards: confirmed.awayRedCards,
    };
    if (existingGame) {
      await db
        .update(matchPlayerGamesTable)
        .set(gameStats)
        .where(eq(matchPlayerGamesTable.id, existingGame.id));
    } else {
      await db.insert(matchPlayerGamesTable).values(gameStats);
    }
  }

  // Freeze the submission + append to the audit trail.
  const [approved] = await db
    .update(matchResultSubmissionsTable)
    .set({
      status: "approved",
      approvedBy: admin.adminId,
      approvedAt: new Date(),
      homeScore: confirmed.homeScore,
      awayScore: confirmed.awayScore,
      homePosition: confirmed.homePosition,
      awayPosition: confirmed.awayPosition,
      homeShots: confirmed.homeShots,
      awayShots: confirmed.awayShots,
      homeShotsOnTarget: confirmed.homeShotsOnTarget,
      awayShotsOnTarget: confirmed.awayShotsOnTarget,
      homeCorners: confirmed.homeCorners,
      awayCorners: confirmed.awayCorners,
      homeYellowCards: confirmed.homeYellowCards,
      awayYellowCards: confirmed.awayYellowCards,
      homeRedCards: confirmed.homeRedCards,
      awayRedCards: confirmed.awayRedCards,
    })
    .where(eq(matchResultSubmissionsTable.id, id))
    .returning();

  await db
    .insert(matchResultAuditLogTable)
    .values({
      adminId: admin.adminId,
      adminName: admin.adminName,
      action: "approve",
      fixtureId: match.id,
      submissionId: id,
      previousStatus: submission.status,
      newStatus: "approved",
      rejectionReason: null,
    });

  // Propagate to the bracket and refresh player rankings/statistics. For a
  // player-vs-player approval the parent fixture may still be waiting on other
  // matchups — only advance the bracket once the parent itself is completed.
  try {
    await advanceKnockoutWinner(updatedMatch);
  } catch (err) {
    req.log.error({ err, fixtureId: match.id }, "Knockout advancement failed after result approval");
  }
  recomputePlayerStatsForCompletedMatch(updatedMatch).catch((err: unknown) => {
    req.log.error({ err }, "Player stats recompute failed after result approval");
  });

  return res.json({
    submission: serializeSubmission(approved),
    match: {
      ...updatedMatch,
      createdAt: updatedMatch.createdAt.toISOString(),
      resultSetAt: updatedMatch.resultSetAt ? updatedMatch.resultSetAt.toISOString() : null,
    },
    statistics: {
      home: {
        position: confirmed.homePosition,
        shots: confirmed.homeShots,
        shotsOnTarget: confirmed.homeShotsOnTarget,
        corners: confirmed.homeCorners,
        yellowCards: confirmed.homeYellowCards,
        redCards: confirmed.homeRedCards,
      },
      away: {
        position: confirmed.awayPosition,
        shots: confirmed.awayShots,
        shotsOnTarget: confirmed.awayShotsOnTarget,
        corners: confirmed.awayCorners,
        yellowCards: confirmed.awayYellowCards,
        redCards: confirmed.awayRedCards,
      },
    },
  });
});
// ── Admin: reject a submission with a reason ─────────────────────────────────
router.post("/admin/match-result-submissions/:id/reject", requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const admin = await resolveAdminIdentity(req);

  const [submission] = await db
    .select()
    .from(matchResultSubmissionsTable)
    .where(eq(matchResultSubmissionsTable.id, id));
  if (!submission) return res.status(404).json({ error: "Submission not found" });
  if (submission.status !== "pending") {
    return res.status(409).json({ error: "This submission has already been processed" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const reason = String(body.reason ?? "").trim();
  if (!reason) return res.status(400).json({ error: "A rejection reason is required" });

  const [rejected] = await db
    .update(matchResultSubmissionsTable)
    .set({ status: "rejected", rejectionReason: reason })
    .where(eq(matchResultSubmissionsTable.id, id))
    .returning();

  await db
    .insert(matchResultAuditLogTable)
    .values({
      adminId: admin.adminId,
      adminName: admin.adminName,
      action: "reject",
      fixtureId: submission.fixtureId,
      submissionId: id,
      previousStatus: submission.status,
      newStatus: "rejected",
      rejectionReason: reason,
    });

  return res.json(serializeSubmission(rejected));
});

// ── Admin: reopen an approved result so the player can resubmit ──────────────
// A completed fixture is frozen: the player cannot upload again until an admin
// reopens it. Reopening reverts the fixture to its pre-result state, releases the
// frozen submission ("reopened") and is recorded in the audit trail.
router.post("/admin/match-result-submissions/:id/reopen", requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const admin = await resolveAdminIdentity(req);

  const [submission] = await db
    .select()
    .from(matchResultSubmissionsTable)
    .where(eq(matchResultSubmissionsTable.id, id));
  if (!submission) return res.status(404).json({ error: "Submission not found" });
  if (submission.status !== "approved") {
    return res.status(409).json({ error: "Only an approved result can be reopened" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const reason = String(body.reason ?? "").trim() || "Fixture reopened by an administrator — please resubmit a screenshot.";

  const [reopened] = await db
    .update(matchResultSubmissionsTable)
    .set({ status: "reopened", rejectionReason: reason, approvedBy: null, approvedAt: null, updatedAt: new Date() })
    .where(eq(matchResultSubmissionsTable.id, id))
    .returning();

  // Roll the fixture back so a fresh submission can be accepted.
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, submission.fixtureId));
  if (match) {
    if (submission.playerGameId != null) {
      // Player-vs-player reopen: clear just that matchup, then recalculate the
      // parent team fixture from the remaining games.
      await db
        .update(matchPlayerGamesTable)
        .set({ status: "scheduled", homeScore: null, awayScore: null })
        .where(eq(matchPlayerGamesTable.id, submission.playerGameId));
      await recalculateTeamScore(match.id);
      // recalculateTeamScore leaves the parent status untouched when no game has
      // a score — if the parent was completed by this matchup and nothing scored
      // remains, roll it back to scheduled so it no longer shows a final result.
      const remaining = await db
        .select({ homeScore: matchPlayerGamesTable.homeScore, awayScore: matchPlayerGamesTable.awayScore })
        .from(matchPlayerGamesTable)
        .where(eq(matchPlayerGamesTable.matchId, match.id));
      const anyScored = remaining.some((g) => g.homeScore !== null || g.awayScore !== null);
      const [parent] = await db.select().from(matchesTable).where(eq(matchesTable.id, match.id));
      if (parent && parent.status === "completed" && !anyScored) {
        await db
          .update(matchesTable)
          .set({ status: "scheduled", participant1Score: null, participant2Score: null, winnerId: null, winnerName: null })
          .where(eq(matchesTable.id, match.id));
      }
    } else {
      await db
        .update(matchesTable)
        .set({
          status: "scheduled",
          participant1Score: null,
          participant2Score: null,
          winnerId: null,
          winnerName: null,
          resultSetBy: admin.adminId ?? match.resultSetBy,
          resultSetAt: new Date(),
        })
        .where(eq(matchesTable.id, match.id));
    }
  }

  await db
    .insert(matchResultAuditLogTable)
    .values({
      adminId: admin.adminId,
      adminName: admin.adminName,
      action: "reopen",
      fixtureId: submission.fixtureId,
      submissionId: id,
      previousStatus: submission.status,
      newStatus: "reopened",
      rejectionReason: reason,
    });

  return res.json(serializeSubmission(reopened));
});

// ── Admin: audit log of every approve/reject action ──────────────────────────
router.get("/admin/match-result-audit", requireAdmin, async (req: Request, res: Response) => {
  const rows = await db
    .select({
      log: matchResultAuditLogTable,
      adminUsername: playersTable.username,
      adminDisplayName: playersTable.displayName,
    })
    .from(matchResultAuditLogTable)
    .leftJoin(playersTable, eq(matchResultAuditLogTable.adminId, playersTable.id))
    .orderBy(desc(matchResultAuditLogTable.createdAt));

  return res.json(
    rows.map((r) => ({
      id: r.log.id,
      adminId: r.log.adminId,
      adminName: r.adminDisplayName ?? r.adminUsername ?? r.log.adminName,
      action: r.log.action,
      fixtureId: r.log.fixtureId,
      submissionId: r.log.submissionId,
      previousStatus: r.log.previousStatus,
      newStatus: r.log.newStatus,
      rejectionReason: r.log.rejectionReason,
      createdAt: iso(r.log.createdAt),
    })),
  );
});

export default router;