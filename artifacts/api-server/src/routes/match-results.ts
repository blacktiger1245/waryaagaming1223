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

// â”€â”€ Auth helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
 *   â€¢ Discord-authenticated staff â€” `session.userId` points at their player row.
 *   â€¢ Legacy password admin â€” only `session.adminUsername` / `session.isAdmin`
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

// â”€â”€ Serializers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

// â”€â”€ OCR provenance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  homeNameConfidence: number;
  awayNameConfidence: number;
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
    homeNameConfidence: detection.homeNameConfidence,
    awayNameConfidence: detection.awayNameConfidence,
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

// -- Admin-controlled player assignment -------------------------------------------
/**
 * The OCR-detected statistics are keyed by SCREENSHOT SIDE (Home / Away). The
 * administrator chooses which registered player each side belongs to at approval
 * time. This builds the assignment input from the review payload. Returns null
 * when the selection is incomplete or not numeric.
 */
function buildPlayerAssignment(
  body: Record<string, unknown>,
): { homePlayerId: number; awayPlayerId: number } | null {
  const homePlayerId = Number(body.homePlayerId);
  const awayPlayerId = Number(body.awayPlayerId);
  if (!Number.isInteger(homePlayerId) || !Number.isInteger(awayPlayerId)) return null;
  if (homePlayerId <= 0 || awayPlayerId <= 0) return null;
  return { homePlayerId, awayPlayerId };
}

/** A side of a player-vs-player matchup (or solo fixture), resolved for assignment. */
interface AssignmentSide { id: number | null; name: string | null }

interface AssignmentValidation {
  home: AssignmentSide;
  away: AssignmentSide;
  assignmentSet: Record<string, unknown>;
}

/**
 * Validate the administrator-chosen Home/Away players against the players
 * registered for this exact matchup, and build the column set that freezes the
 * assignment on the submission. Returns null + sets `err` when the selection is
 * invalid. For a player-vs-player matchup the two options are the matchup's home
 * and away players; for a solo fixture they are the fixture's two participants.
 */
function resolvePlayerAssignment(
  sel: { homePlayerId: number; awayPlayerId: number },
  sideA: AssignmentSide,
  sideB: AssignmentSide,
  err: { message: string },
): AssignmentValidation | null {
  if (sel.homePlayerId === sel.awayPlayerId) {
    err.message = "Home player and Away player must be different players.";
    return null;
  }
  const options = [sideA, sideB].filter((s): s is { id: number; name: string | null } => s.id != null);
  const home = options.find((s) => s.id === sel.homePlayerId) ?? null;
  const away = options.find((s) => s.id === sel.awayPlayerId) ?? null;
  if (!home || !away) {
    err.message = "Both selected players must belong to this matchup.";
    return null;
  }
  return {
    home,
    away,
    assignmentSet: {
      assignedHomePlayerId: home.id,
      assignedHomePlayerName: home.name,
      assignedAwayPlayerId: away.id,
      assignedAwayPlayerName: away.name,
    },
  };
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
    homePossession: row.homePossession,
    awayPossession: row.awayPossession,
    homeShots: row.homeShots,
    awayShots: row.awayShots,
    homeShotsOnTarget: row.homeShotsOnTarget,
    awayShotsOnTarget: row.awayShotsOnTarget,
    homeCornerKicks: row.homeCornerKicks,
    awayCornerKicks: row.awayCornerKicks,
    homeOffside: row.homeOffside,
    awayOffside: row.awayOffside,
    homeFreeKicks: row.homeFreeKicks,
    awayFreeKicks: row.awayFreeKicks,
    homeFouls: row.homeFouls,
    awayFouls: row.awayFouls,
    homeSuccessfulPasses: row.homeSuccessfulPasses,
    awaySuccessfulPasses: row.awaySuccessfulPasses,
    homeCrosses: row.homeCrosses,
    awayCrosses: row.awayCrosses,
    homeInterceptions: row.homeInterceptions,
    awayInterceptions: row.awayInterceptions,
    homeTackles: row.homeTackles,
    awayTackles: row.awayTackles,
    homeSaves: row.homeSaves,
    awaySaves: row.awaySaves,
    // The administrator's Home/Away player assignment (frozen at approval). This
    // is the authoritative record of which registered player received the Home
    // statistics and which received the Away statistics.
    assignment: {
      homePlayerId: row.assignedHomePlayerId,
      homePlayerName: row.assignedHomePlayerName,
      awayPlayerId: row.assignedAwayPlayerId,
      awayPlayerName: row.assignedAwayPlayerName,
    },
    rejectionReason: row.rejectionReason,
    ocrMetadata: parseOcrMetadata(row.ocrMetadata),
    approvedBy: row.approvedBy,
    approvedAt: iso(row.approvedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

// â”€â”€ Canonical player-vs-player statistics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * The statistics list, in display order. This is the ONE place the list lives on
 * the API side, so a rename can never drift between the submission row, the
 * player-matchup row and the approve response.
 *
 * `Successful Passes` is deliberately a single field (`homeSuccessfulPasses` /
 * `awaySuccessfulPasses`) â€” there is no separate `passes` or `successful` field.
 */
const STAT_KEYS = [
  "homePossession",
  "awayPossession",
  "homeShots",
  "awayShots",
  "homeShotsOnTarget",
  "awayShotsOnTarget",
  "homeCornerKicks",
  "awayCornerKicks",
  "homeOffside",
  "awayOffside",
  "homeFreeKicks",
  "awayFreeKicks",
  "homeFouls",
  "awayFouls",
  "homeSuccessfulPasses",
  "awaySuccessfulPasses",
  "homeCrosses",
  "awayCrosses",
  "homeInterceptions",
  "awayInterceptions",
  "homeTackles",
  "awayTackles",
  "homeSaves",
  "awaySaves",
] as const;

type StatKey = (typeof STAT_KEYS)[number];

/** Pick the confirmed statistics out of a validated detection in canonical order. */
function statColumns(source: Partial<Record<StatKey, number | null>>): Record<StatKey, number | null> {
  const out = {} as Record<StatKey, number | null>;
  for (const key of STAT_KEYS) out[key] = source[key] ?? null;
  return out;
}

/**
 * The same statistics grouped by statistic name with both sides alongside it â€”
 * the shape the approve response reports, so a caller never has to know the
 * home/away field naming.
 */
function statSides(
  source: Partial<Record<StatKey, number | null>>,
): Record<string, { home: number | null; away: number | null }> {
  const out: Record<string, { home: number | null; away: number | null }> = {};
  for (const key of STAT_KEYS) {
    if (!key.startsWith("home")) continue;
    const name = key.slice("home".length);
    out[name.charAt(0).toLowerCase() + name.slice(1)] = {
      home: source[key] ?? null,
      away: source[`away${name}` as StatKey] ?? null,
    };
  }
  return out;
}

// â”€â”€ Authorization: is this logged-in player/team assigned to the fixture? â”€â”€â”€â”€â”€
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
 * is NOT enough â€” a teammate who is not playing this specific game cannot
 * submit its screenshot.
 */
function isPlayerGameParticipant(
  game: { homePlayerId: number | null; awayPlayerId: number | null },
  userId: number,
): boolean {
  return game.homePlayerId === userId || game.awayPlayerId === userId;
}
// â”€â”€ Player: read my latest submission for a fixture â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Player: upload match-result screenshot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post("/matches/:id/result-submission", requireAuth, async (req: Request, res: Response) => {
  const fixtureId = Number(req.params.id);
  if (isNaN(fixtureId)) return res.status(400).json({ error: "Invalid id" });
  const userId = req.session?.userId as number;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, fixtureId));
  if (!match) return res.status(404).json({ error: "Fixture not found" });

  // Only players/teams assigned to this fixture may submit a result â€” admins and
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
      error: "This is a team fixture â€” open it and upload the screenshot on your player-vs-player matchup instead",
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

  // The verdict is frozen on the submission and enforced again at approval.

  const [submission] = await db
    .insert(matchResultSubmissionsTable)
    .values({
      fixtureId,
      submittedBy: userId,
      status: "pending",
      imagePath: objectPath,
      homeScore: detection.homeScore,
      awayScore: detection.awayScore,
      ...statColumns(detection),
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

// â”€â”€ Player: read my latest submission for a player-vs-player matchup â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Player: upload match-result screenshot for a player-vs-player matchup â”€â”€â”€â”€
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

  // Only the two players actually playing this matchup may submit its result â€”
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
      ...statColumns(detection),
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

// -- Admin: upload a match-result screenshot on behalf of a fixture ----------------
// In the admin-controlled workflow the administrator is the person who uploads the
// screenshot, reviews the OCR result, and assigns the Home/Away players. No name
// verification gate is applied here.
async function adminUploadSubmission(
  req: Request,
  res: Response,
  context: { fixtureId: number; playerGameId: number | null },
) {
  const userId = req.session?.userId as number | undefined;
  const submittedBy = typeof userId === "number" && !isNaN(userId) ? userId : null;
  if (submittedBy == null) {
    return res.status(401).json({ error: "A logged-in administrator account is required to upload." });
  }

  const contentType = req.get("content-type") || "application/octet-stream";
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "Image body is required (send the file as the request body)." });
  }
  try {
    validateUploadedImage(contentType, req.body);
    await assertSafeImage(req.body);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid image file" });
  }

  const imagePath = await objectStorageService.uploadObject(req.body, contentType.split(";")[0].trim());
  const detection = await detectMatchResultFromImage(req.body, contentType);

  const [submission] = await db
    .insert(matchResultSubmissionsTable)
    .values({
      fixtureId: context.fixtureId,
      playerGameId: context.playerGameId,
      submittedBy,
      imagePath,
      homeScore: detection.homeScore,
      awayScore: detection.awayScore,
      ...statColumns(detection),
      ocrMetadata: buildOcrMetadata(detection),
    })
    .returning();

  return res.status(201).json({
    ...serializeSubmission(submission),
    detectionNotes: detection.notes,
  });
}

router.post("/admin/matches/:id/result-submission", requireAdmin, async (req: Request, res: Response) => {
  const fixtureId = Number(req.params.id);
  if (isNaN(fixtureId)) return res.status(400).json({ error: "Invalid id" });
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, fixtureId));
  if (!match) return res.status(404).json({ error: "Fixture not found" });
  return adminUploadSubmission(req, res, { fixtureId, playerGameId: null });
});

router.post("/admin/player-games/:id/result-submission", requireAdmin, async (req: Request, res: Response) => {
  const gameId = Number(req.params.id);
  if (isNaN(gameId)) return res.status(400).json({ error: "Invalid id" });
  const [game] = await db.select().from(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.id, gameId));
  if (!game) return res.status(404).json({ error: "Player matchup not found" });
  return adminUploadSubmission(req, res, { fixtureId: game.matchId, playerGameId: game.id });
});
// â”€â”€ Admin: list all submissions with fixture + tournament context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      gameHomePlayerId: matchPlayerGamesTable.homePlayerId,
      gameHomePlayerName: matchPlayerGamesTable.homePlayerName,
      gameAwayPlayerId: matchPlayerGamesTable.awayPlayerId,
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
              homePlayerId: r.gameHomePlayerId,
              awayPlayerId: r.gameAwayPlayerId,
              homePlayerName: r.gameHomePlayerName,
              awayPlayerName: r.gameAwayPlayerName,
            }
          : null,
      tournamentName: r.tournamentName,
      submittedByName: r.submitterName ?? r.submitterUsername ?? null,
    })),
  );
});

// â”€â”€ Admin: approve a submission and auto-write the official result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // -- Admin-controlled Home/Away player assignment ----------------------------
  // The OCR statistics are keyed by screenshot side (Home / Away). The admin
  // explicitly chooses which registered player each side belongs to; the OCR
  // read never decides this by itself. Both players must be selected, must be
  // different, and must belong to this exact matchup.
  const sel = buildPlayerAssignment(req.body ?? {});
  if (!sel) {
    return res.status(400).json({ error: "Select both the Home player and the Away player before approving." });
  }

  let assignmentSet: Record<string, unknown> = {};
  let assignedGame: typeof matchPlayerGamesTable.$inferSelect | null = null;
  if (submission.playerGameId != null) {
    const [game] = await db.select().from(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.id, submission.playerGameId));
    if (!game) return res.status(404).json({ error: "Player matchup not found" });
    if (game.status === "completed") {
      return res.status(409).json({ error: "This matchup result has already been finalised" });
    }
    const err = { message: "" };
    const validation = resolvePlayerAssignment(
      sel,
      { id: game.homePlayerId, name: game.homePlayerName },
      { id: game.awayPlayerId, name: game.awayPlayerName },
      err,
    );
    if (!validation) return res.status(400).json({ error: err.message });
    assignmentSet = validation.assignmentSet;
    assignedGame = game;
  } else {
    const err = { message: "" };
    const validation = resolvePlayerAssignment(
      sel,
      { id: match.participant1Id, name: match.participant1Name },
      { id: match.participant2Id, name: match.participant2Name },
      err,
    );
    if (!validation) return res.status(400).json({ error: err.message });
    assignmentSet = validation.assignmentSet;
  }

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
    homePossession: pick("homePossession", submission.homePossession),
    awayPossession: pick("awayPossession", submission.awayPossession),
    homeShots: pick("homeShots", submission.homeShots),
    awayShots: pick("awayShots", submission.awayShots),
    homeShotsOnTarget: pick("homeShotsOnTarget", submission.homeShotsOnTarget),
    awayShotsOnTarget: pick("awayShotsOnTarget", submission.awayShotsOnTarget),
    homeCornerKicks: pick("homeCornerKicks", submission.homeCornerKicks),
    awayCornerKicks: pick("awayCornerKicks", submission.awayCornerKicks),
    homeOffside: pick("homeOffside", submission.homeOffside),
    awayOffside: pick("awayOffside", submission.awayOffside),
    homeFreeKicks: pick("homeFreeKicks", submission.homeFreeKicks),
    awayFreeKicks: pick("awayFreeKicks", submission.awayFreeKicks),
    homeFouls: pick("homeFouls", submission.homeFouls),
    awayFouls: pick("awayFouls", submission.awayFouls),
    homeSuccessfulPasses: pick("homeSuccessfulPasses", submission.homeSuccessfulPasses),
    awaySuccessfulPasses: pick("awaySuccessfulPasses", submission.awaySuccessfulPasses),
    homeCrosses: pick("homeCrosses", submission.homeCrosses),
    awayCrosses: pick("awayCrosses", submission.awayCrosses),
    homeInterceptions: pick("homeInterceptions", submission.homeInterceptions),
    awayInterceptions: pick("awayInterceptions", submission.awayInterceptions),
    homeTackles: pick("homeTackles", submission.homeTackles),
    awayTackles: pick("awayTackles", submission.awayTackles),
    homeSaves: pick("homeSaves", submission.homeSaves),
    awaySaves: pick("awaySaves", submission.awaySaves),
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
        // Record the admin-selected players as the matchup's Home and Away so
        // the screenshot-side statistics are attributed to exactly the right
        // registered players.
        homePlayerId: sel!.homePlayerId,
        homePlayerName: assignmentSet.assignedHomePlayerName as string | null,
        awayPlayerId: sel!.awayPlayerId,
        awayPlayerName: assignmentSet.assignedAwayPlayerName as string | null,
        homeScore: confirmed.homeScore,
        awayScore: confirmed.awayScore,
        ...statColumns(confirmed),
      })
      .where(eq(matchPlayerGamesTable.id, game.id));

    await recalculateTeamScore(match.id);
    const [refetched] = await db.select().from(matchesTable).where(eq(matchesTable.id, match.id));
    updatedMatch = refetched!;
  } else {
    // Solo fixture: the fixture itself is the player matchup. The card columns on
    // `matches` are intentionally left untouched â€” yellow/red cards are not part of
    // the player-vs-player statistics set (they were replaced by Offside and Free
    // Kicks), so nothing here may write a card count.
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
      homePlayerId: sel!.homePlayerId,
      homePlayerName: assignmentSet.assignedHomePlayerName as string | null,
      awayPlayerId: sel!.awayPlayerId,
      awayPlayerName: assignmentSet.assignedAwayPlayerName as string | null,
      homeScore: confirmed.homeScore,
      awayScore: confirmed.awayScore,
      ...statColumns(confirmed),
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
      ...statColumns(confirmed),
      // Permanently record which registered player is Home and which is Away.
      ...assignmentSet,
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
  // matchups â€” only advance the bracket once the parent itself is completed.
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
    statistics: statSides(confirmed),
  });
});
// â”€â”€ Admin: reject a submission with a reason â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Admin: reopen an approved result so the player can resubmit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const reason = String(body.reason ?? "").trim() || "Fixture reopened by an administrator â€” please resubmit a screenshot.";

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
      // a score â€” if the parent was completed by this matchup and nothing scored
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

// â”€â”€ Admin: audit log of every approve/reject action â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
