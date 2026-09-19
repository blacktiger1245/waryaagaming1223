/**
 * End-to-end test for the match-result upload / OCR / approval workflow.
 *
 * Exercises the real `src/routes/match-results.ts` router over real HTTP against
 * the real database, using the real eFootball-style fixture screenshot
 * (`test/fixtures/efootball-match-result.png`). Only object storage is stubbed
 * (R2 credentials are external infrastructure) — image validation, `sharp` deep
 * decoding and tesseract.js OCR all run as they do in production.
 *
 * Covered:
 *   • authentication / participant-only submission / cross-fixture attempt
 *   • invalid + oversize image rejection
 *   • upload → OCR extraction → pending submission
 *   • admin review listing with fixture + tournament context
 *   • admin-only approval, duplicate-approval guard, negative-value rejection
 *   • approve → completed fixture + official result + statistics + audit log
 *   • completed-fixture lock
 *   • reject with reason → player resubmits
 *   • admin reopen → fixture rolled back
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import { db, pool } from "@workspace/db";
import {
  matchesTable,
  tournamentsTable,
  playersTable,
  teamsTable,
  matchResultSubmissionsTable,
  matchResultAuditLogTable,
  matchPlayerGamesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import matchResultsRouter from "../src/routes/match-results";
import {
  emptyDetection,
  displayDetected,
  DETECTED_NUMERIC_FIELDS,
} from "../src/lib/matchResultDetection";
import { shutdownOcrEngine } from "../src/lib/matchResultOcr";
import { renderResultScreenshot } from "./fixtureImage";
import { stubStoredObjects } from "./stubs/objectStorage";

// ── Tiny assertion harness ───────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

function eq_(name: string, actual: unknown, expected: unknown): void {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Fixture users ────────────────────────────────────────────────────────────
// `userId` identifies the acting player; `role`/`isAdmin` drive the auth guards.
interface Actor {
  id: number;
  role: string;
}

const suffix = Date.now().toString(36).slice(-6);
let playerA: Actor;
let playerB: Actor;
let outsider: Actor;
let admin: Actor;

let tournamentId: number;
let fixtureOneId: number;
let fixtureTwoId: number;

// Team-fixture state: two teams, three rostered players, one team-vs-team
// fixture with TWO player-vs-player matchups inside it (the second exists so a
// screenshot belonging to another pairing can be recognised and refused).
let teamHomeId: number;
let teamAwayId: number;
let teamPlayerA1: Actor; // plays matchup 1 for the home team
let teamPlayerA2: Actor; // plays matchup 2 for the home team
let teamPlayerB1: Actor; // plays both matchups for the away team
let teamFixtureId: number;
let teamGameId: number;
let teamGame2Id: number;

// Registered names of the two matchups (digit-free on purpose: a token like
// "P1" reads as a number to OCR and would pollute the score line).
const GAME1_HOME_NAME = "Abdulaziz Mohamed";
const GAME1_AWAY_NAME = "Mohamed Ali";
const GAME2_HOME_NAME = "Yusuf Omar";
const GAME2_AWAY_NAME = "Ahmed Hassan";

/** Screenshot whose score line shows matchup 1's players (rendered in setup). */
let teamScreenshot: Buffer;

const createdPlayerIds: number[] = [];
const createdTournamentIds: number[] = [];
const createdTeamIds: number[] = [];

// ── HTTP plumbing ────────────────────────────────────────────────────────────
// The real router is mounted behind a middleware that injects the session, so the
// route's own `requireAuth`/`requireAdmin`/participant checks all execute.
let server: http.Server;
let baseUrl: string;
let currentActor: Actor | null = null;

interface ApiResponse {
  status: number;
  body: any;
}

async function call(method: string, urlPath: string, body?: unknown, contentType = "application/json"): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  let payload: Buffer | undefined;
  if (body instanceof Buffer) {
    payload = body;
    headers["Content-Type"] = contentType;
  } else if (body !== undefined) {
    payload = Buffer.from(JSON.stringify(body));
    headers["Content-Type"] = contentType;
  }

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: payload as unknown as BodyInit | undefined,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

/** Act as a given user for subsequent requests (null = anonymous). */
function as(actor: Actor | null): void {
  currentActor = actor;
}

// ── Setup / teardown ─────────────────────────────────────────────────────────
async function createPlayer(username: string, role: string): Promise<Actor> {
  const [row] = await db
    .insert(playersTable)
    .values({
      username,
      displayName: username.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      role,
      email: `${username}@example.test`,
    } as typeof playersTable.$inferInsert)
    .returning({ id: playersTable.id, role: playersTable.role });
  createdPlayerIds.push(row!.id);
  return { id: row!.id, role: row!.role };
}

async function setup(): Promise<void> {
  playerA = await createPlayer(`e2e_home_${suffix}`, "player");
  playerB = await createPlayer(`e2e_away_${suffix}`, "player");
  outsider = await createPlayer(`e2e_other_${suffix}`, "player");
  admin = await createPlayer(`e2e_admin_${suffix}`, "admin");

  const [tournament] = await db
    .insert(tournamentsTable)
    .values({
      name: `E2E OCR Cup ${suffix}`,
      status: "active",
      format: "single-elimination",
      game: "eFootball",
      tournamentType: "solo",
    })
    .returning({ id: tournamentsTable.id });
  tournamentId = tournament!.id;
  createdTournamentIds.push(tournamentId);

  // Two scheduled fixtures between the same two players, so the rejection /
  // resubmission flow can run without interfering with the approval flow.
  const fixtureValues = (label: string) => ({
    tournamentId,
    round: 1,
    stage: 1,
    status: "scheduled",
    participant1Id: playerA.id,
    // The names match the committed fixture screenshot exactly, so the upload
    // passes player-name verification. (The label no longer feeds the name —
    // both fixtures register the same two players.)
    participant1Name: "Player A",
    participant2Id: playerB.id,
    participant2Name: "Player B",
  });

  const inserted = await db
    .insert(matchesTable)
    .values([fixtureValues("1"), fixtureValues("2")])
    .returning({ id: matchesTable.id });
  fixtureOneId = inserted[0]!.id;
  fixtureTwoId = inserted[1]!.id;

  // ── Team fixture: Team A vs Team B with one player-vs-player matchup ──
  teamPlayerA1 = await createPlayer(`e2e_teamA_p1_${suffix}`, "player");
  teamPlayerA2 = await createPlayer(`e2e_teamA_p2_${suffix}`, "player");
  teamPlayerB1 = await createPlayer(`e2e_teamB_p1_${suffix}`, "player");

  const [teamHome] = await db
    .insert(teamsTable)
    .values({ name: `E2E Team A ${suffix}`, captainId: teamPlayerA1.id })
    .returning({ id: teamsTable.id });
  const [teamAway] = await db
    .insert(teamsTable)
    .values({ name: `E2E Team B ${suffix}`, captainId: teamPlayerB1.id })
    .returning({ id: teamsTable.id });
  teamHomeId = teamHome!.id;
  teamAwayId = teamAway!.id;
  createdTeamIds.push(teamHomeId, teamAwayId);

  // Rosters: A1 + A2 on the home team, B1 on the away team.
  await db.update(playersTable).set({ teamId: teamHomeId }).where(inArray(playersTable.id, [teamPlayerA1.id, teamPlayerA2.id]));
  await db.update(playersTable).set({ teamId: teamAwayId }).where(eq(playersTable.id, teamPlayerB1.id));

  const [teamTournament] = await db
    .insert(tournamentsTable)
    .values({
      name: `E2E Team Cup ${suffix}`,
      status: "active",
      format: "single-elimination",
      game: "eFootball",
      tournamentType: "team",
    })
    .returning({ id: tournamentsTable.id });
  createdTournamentIds.push(teamTournament!.id);

  const [teamFixture] = await db
    .insert(matchesTable)
    .values({
      tournamentId: teamTournament!.id,
      round: 1,
      stage: 1,
      status: "scheduled",
      participant1Id: teamHomeId,
      participant1Name: `E2E Team A ${suffix}`,
      participant2Id: teamAwayId,
      participant2Name: `E2E Team B ${suffix}`,
    })
    .returning({ id: matchesTable.id });
  teamFixtureId = teamFixture!.id;

  // Matchup 1: A1 vs B1. (Matchup 2 is only created later, inside the
  // name-verification section — the parent-propagation tests above assume a
  // single outstanding matchup.)
  const [teamGame] = await db
    .insert(matchPlayerGamesTable)
    .values({
      matchId: teamFixtureId,
      homePlayerId: teamPlayerA1.id,
      homePlayerName: GAME1_HOME_NAME,
      awayPlayerId: teamPlayerB1.id,
      awayPlayerName: GAME1_AWAY_NAME,
      status: "scheduled",
    })
    .returning({ id: matchPlayerGamesTable.id });
  teamGameId = teamGame!.id;

  // The screenshot that genuinely belongs to matchup 1 (names on the score
  // line are the two registered players).
  teamScreenshot = await renderResultScreenshot({
    homeName: GAME1_HOME_NAME,
    awayName: GAME1_AWAY_NAME,
    homeScore: EXPECTED.homeScore,
    awayScore: EXPECTED.awayScore,
  });
}

async function teardown(): Promise<void> {
  // Submissions and audit rows cascade from the fixtures.
  if (fixtureOneId) await db.delete(matchesTable).where(eq(matchesTable.id, fixtureOneId));
  if (fixtureTwoId) await db.delete(matchesTable).where(eq(matchesTable.id, fixtureTwoId));
  if (teamFixtureId) await db.delete(matchesTable).where(eq(matchesTable.id, teamFixtureId));
  if (playerA) {
    await db
      .delete(matchPlayerGamesTable)
      .where(inArray(matchPlayerGamesTable.homePlayerId, createdPlayerIds));
    await db
      .delete(matchPlayerGamesTable)
      .where(inArray(matchPlayerGamesTable.awayPlayerId, createdPlayerIds));
  }
  // The team fixture's game has no FK cascade from matches — remove it directly.
  if (teamFixtureId) await db.delete(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.matchId, teamFixtureId));
  for (const id of createdTournamentIds) await db.delete(tournamentsTable).where(eq(tournamentsTable.id, id));
  for (const id of createdTeamIds) await db.delete(teamsTable).where(eq(teamsTable.id, id));
  for (const id of createdPlayerIds) await db.delete(playersTable).where(eq(playersTable.id, id));

  const leftovers = await db
    .select({ id: matchResultSubmissionsTable.id })
    .from(matchResultSubmissionsTable)
    .where(inArray(matchResultSubmissionsTable.fixtureId, [fixtureOneId, fixtureTwoId, teamFixtureId].filter(Boolean)));
  check("teardown: submissions removed", leftovers.length === 0, `${leftovers.length} left`);

  const auditLeftovers = await db
    .select({ id: matchResultAuditLogTable.id })
    .from(matchResultAuditLogTable)
    .where(inArray(matchResultAuditLogTable.fixtureId, [fixtureOneId, fixtureTwoId, teamFixtureId].filter(Boolean)));
  check("teardown: audit rows removed", auditLeftovers.length === 0, `${auditLeftovers.length} left`);
}

// ── Test entry point ─────────────────────────────────────────────────────────
const SCREENSHOT_PATH = path.join(process.cwd(), "test", "fixtures", "efootball-match-result.png");
const screenshot = readFileSync(SCREENSHOT_PATH);
/** What the fixture screenshot visibly contains — the OCR ground truth. */
const EXPECTED = {
  homeScore: 3,
  awayScore: 1,
  homePossession: 58,
  awayPossession: 42,
  homeShots: 8,
  awayShots: 4,
  homeShotsOnTarget: 5,
  awayShotsOnTarget: 2,
  homeCornerKicks: 4,
  awayCornerKicks: 2,
  homeOffside: 1,
  awayOffside: 2,
  homeFreeKicks: 12,
  awayFreeKicks: 9,
  homeFouls: 7,
  awayFouls: 10,
  homeSuccessfulPasses: 148,
  awaySuccessfulPasses: 121,
  homeCrosses: 6,
  awayCrosses: 3,
  homeInterceptions: 9,
  awayInterceptions: 11,
  homeTackles: 14,
  awayTackles: 16,
  homeSaves: 2,
  awaySaves: 5,
};

/** The statistic fields of `EXPECTED` (everything except the two scores). */
const EXPECTED_STAT_FIELDS = Object.keys(EXPECTED).filter((k) => k !== "homeScore" && k !== "awayScore");

/** camelCase statistic field → database column (`homeShotsOnTarget` → `home_shots_on_target`). */
function columnOf(field: string): string {
  return field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

// ── Tests ────────────────────────────────────────────────────────────────────
async function securityAndValidationTests(): Promise<void> {
  console.log("\n=== A. SECURITY & VALIDATION ===");

  // OCR-unavailable fallback contract: nothing may be invented.
  const blank = emptyDetection();
  const numericValues = DETECTED_NUMERIC_FIELDS.map((k) => blank[k]);
  check(
    "A1 OCR-unavailable fallback marks every value Not detected",
    numericValues.every((v) => v === null) && DETECTED_NUMERIC_FIELDS.length === Object.keys(EXPECTED).length,
    `${numericValues.length} numeric fields, ${numericValues.filter((v) => v === null).length} null`,
  );
  eq_("A2 displayDetected(null) renders Not detected", displayDetected(null), "Not detected");

  // Anonymous requests are rejected.
  as(null);
  eq_("A3 anonymous upload rejected", (await call("POST", `/api/matches/${fixtureOneId}/result-submission`, screenshot, "image/png")).status, 401);
  eq_("A4 anonymous admin list rejected", (await call("GET", "/api/admin/match-result-submissions")).status, 401);
  eq_("A5 anonymous approve rejected", (await call("POST", "/api/admin/match-result-submissions/1/approve", {})).status, 401);

  // Only participants may submit.
  as(outsider);
  const crossFixture = await call("POST", `/api/matches/${fixtureOneId}/result-submission`, screenshot, "image/png");
  eq_("A6 non-participant cannot submit for another fixture", crossFixture.status, 403);
  check("A7 non-participant gets a clear error", /not a participant/i.test(String(crossFixture.body?.error)), String(crossFixture.body?.error));

  // Only admins may approve/reject/list.
  eq_("A8 player cannot list submissions", (await call("GET", "/api/admin/match-result-submissions")).status, 403);
  eq_("A9 player cannot approve", (await call("POST", "/api/admin/match-result-submissions/1/approve", {})).status, 403);
  eq_("A10 player cannot reject", (await call("POST", "/api/admin/match-result-submissions/1/reject", { reason: "x" })).status, 403);

  // Upload validation, exercised as a real participant.
  as(playerA);
  const wrongType = await call("POST", `/api/matches/${fixtureOneId}/result-submission`, Buffer.from("<html>not an image</html>"), "text/plain");
  eq_("A11 disallowed content-type rejected", wrongType.status, 400);

  const htmlAsPng = await call("POST", `/api/matches/${fixtureOneId}/result-submission`, Buffer.from("<html>not an image</html>"), "image/png");
  eq_("A12 non-image bytes disguised as image/png rejected", htmlAsPng.status, 400);
  check("A13 deep image validation explains the failure", /image/i.test(String(htmlAsPng.body?.error)), String(htmlAsPng.body?.error));

  const oversized = Buffer.alloc(8 * 1024 * 1024 + 1024, 0x41);
  const tooBig = await call("POST", `/api/matches/${fixtureOneId}/result-submission`, oversized, "image/png");
  eq_("A14 oversize upload (>8 MB) rejected", tooBig.status, 400);
  check("A15 oversize error mentions the limit", /large|size|8\s*MB/i.test(String(tooBig.body?.error)), String(tooBig.body?.error));

  const empty = await call("POST", `/api/matches/${fixtureOneId}/result-submission`, Buffer.alloc(0), "image/png");
  eq_("A16 empty upload rejected", empty.status, 400);

  check("A17 no rejected upload was persisted", stubStoredObjects.length === 0, `${stubStoredObjects.length} stored`);
}

// ─ B. Upload → real OCR extraction → pending submission ─────────────────────
async function uploadAndOcrTests(): Promise<{ submissionId: number }> {
  console.log("\n=== B. UPLOAD + OCR DETECTION ===");

  as(playerA);
  const upload = await call("POST", `/api/matches/${fixtureOneId}/result-submission`, screenshot, "image/png");
  eq_("B1 participant upload accepted", upload.status, 201);
  const submissionId = Number(upload.body?.id);
  check("B2 submission id returned", Number.isInteger(submissionId) && submissionId > 0, `id=${submissionId}`);
  eq_("B3 submission starts pending", upload.body?.status, "pending");
  check("B4 original screenshot stored", stubStoredObjects.length === 1, `${stubStoredObjects.length} stored`);
  check("B5 imagePath points at the stored object", String(upload.body?.imagePath ?? "").length > 0, String(upload.body?.imagePath));

  // ─ The heart of this feature: values read from the actual screenshot. ──
  console.log("\n  --- OCR extraction from the real screenshot ---");
  const extracted: Record<string, number | null> = {};
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const actual = upload.body?.[key] ?? null;
    extracted[key] = actual;
    eq_(`B6 ${key} read from screenshot`, actual, expected);
  }
  const readCount = Object.values(extracted).filter((v) => v !== null).length;
  console.log(`  --- OCR read ${readCount}/${Object.keys(EXPECTED).length} numeric fields correctly ---`);

  check("B7 OCR notes are reported to the admin", Array.isArray(upload.body?.detectionNotes) && upload.body.detectionNotes.length > 0);

  // The automatic name-matching gate is GONE: an upload produces no verdict and
  // approval is never blocked because OCR read a different name. The names OCR
  // read are still recorded as information.
  eq_("B7a no automatic name-verification verdict is produced", upload.body?.nameVerification, undefined);
  eq_("B7b OCR still records the home name it read", upload.body?.ocrMetadata?.homeName, "Player A");
  eq_("B7c OCR still records the away name it read", upload.body?.ocrMetadata?.awayName, "Player B");
  eq_("B7d no Home player is assigned before approval", upload.body?.assignment?.homePlayerId, null);
  eq_("B7e no Away player is assigned before approval", upload.body?.assignment?.awayPlayerId, null);

  // A duplicate pending submission for the same fixture+player is blocked.
  const dupe = await call("POST", `/api/matches/${fixtureOneId}/result-submission`, screenshot, "image/png");
  eq_("B8 duplicate pending submission blocked", dupe.status, 409);

  // The other participant may also submit (independent submission).
  as(playerB);
  const other = await call("POST", `/api/matches/${fixtureOneId}/result-submission`, screenshot, "image/png");
  eq_("B9 the opposing participant may submit too", other.status, 201);

  // The uploader can read back their own submission; an outsider cannot.
  as(outsider);
  eq_("B10 outsider cannot read another player's submission", (await call("GET", `/api/matches/${fixtureOneId}/result-submission`)).status, 403);

  return { submissionId };
}

// ─ C. Admin review + approval → completed fixture ───────────────────────────
async function adminApprovalTests(submissionId: number): Promise<void> {
  console.log("\n=== C. ADMIN REVIEW + APPROVAL ===");

  as(admin);
  const list = await call("GET", "/api/admin/match-result-submissions");
  eq_("C1 admin can list submissions", list.status, 200);
  const row = (list.body as any[])?.find((r) => r.id === submissionId);
  check("C2 submitted result appears in the verification queue", !!row, `id=${submissionId}`);

  if (row) {
    eq_("C3 fixture id exposed for the review card", row.fixtureId, fixtureOneId);
    eq_("C4 tournament name exposed", row.tournamentName, `E2E OCR Cup ${suffix}`);
    eq_("C5 home participant name exposed", row.fixture?.participant1Name, "Player A");
    eq_("C6 away participant name exposed", row.fixture?.participant2Name, "Player B");
    check("C7 submitter name exposed", String(row.submittedByName ?? "").length > 0, String(row.submittedByName));
    check("C8 submission time exposed", !!row.createdAt, String(row.createdAt));
    check("C9 screenshot path exposed for review", String(row.imagePath ?? "").length > 0);
    eq_("C10 status shown to the admin", row.status, "pending");
  }

  // The OCR reading must already be visible to the admin before approval.
  eq_("C11 detected home score persisted for review", row?.homeScore, 3);
  eq_("C12 detected away score persisted for review", row?.awayScore, 1);

  // Approving REQUIRES the administrator to name the Home and Away players.
  const noSelection = await call("POST", `/api/admin/match-result-submissions/${submissionId}/approve`, {});
  eq_("C12a approval without a player selection is refused", noSelection.status, 400);
  check(
    "C12b the refusal explains the selection requirement",
    /home player and the away player/i.test(String(noSelection.body?.error)),
    String(noSelection.body?.error),
  );

  const approve = await call("POST", `/api/admin/match-result-submissions/${submissionId}/approve`, {
    homePlayerId: playerA.id,
    awayPlayerId: playerB.id,
  });
  eq_("C13 approve succeeds", approve.status, 200);
  eq_("C14 submission frozen as approved", approve.body?.submission?.status, "approved");
  eq_("C15 fixture marked completed", approve.body?.match?.status, "completed");
  // The assignment is frozen on the submission: the official record now knows
  // which registered player received the Home statistics and which received Away.
  eq_("C15a the approved submission records the HOME player", approve.body?.submission?.assignment?.homePlayerId, playerA.id);
  eq_("C15b the approved submission records the AWAY player", approve.body?.submission?.assignment?.awayPlayerId, playerB.id);
  eq_("C15c the HOME player name is frozen too", approve.body?.submission?.assignment?.homePlayerName, "Player A");
  eq_("C15d the AWAY player name is frozen too", approve.body?.submission?.assignment?.awayPlayerName, "Player B");

  // The official result now shows on the fixture.
  eq_("C16 official home score written", approve.body?.match?.participant1Score, 3);
  eq_("C17 official away score written", approve.body?.match?.participant2Score, 1);
  eq_("C18 winner derived from the scores", approve.body?.match?.winnerId, playerA.id);
}

// ─ D. Extracted statistics propagated to the official records ───────────────
async function statisticsPropagationTests(submissionId: number): Promise<void> {
  console.log("\n=== D. STATISTICS PROPAGATION ===");

  as(admin);
  const [submission] = await db
    .select()
    .from(matchResultSubmissionsTable)
    .where(eq(matchResultSubmissionsTable.id, submissionId));

  const [matchRow] = await db.select().from(matchesTable).where(eq(matchesTable.id, fixtureOneId));
  eq_("D1 database fixture status completed", matchRow?.status, "completed");
  eq_("D2 database fixture home score", matchRow?.participant1Score, 3);
  eq_("D3 database fixture away score", matchRow?.participant2Score, 1);
  // Yellow/red cards are no longer part of the player-vs-player statistics set
  // (Offside and Free Kicks replaced them), so approving a screenshot must not
  // write a card count anywhere on the fixture.
  eq_("D4 approval wrote no yellow cards to the fixture", matchRow?.participant1YellowCards, 0);
  eq_("D5 approval wrote no red cards to the fixture", matchRow?.participant1RedCards, 0);

  const [game] = await db.select().from(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.matchId, fixtureOneId));
  check("D6 official per-match statistics row created", !!game, game ? `id=${game.id}` : "missing");
  if (game) {
    // Every statistic the OCR read is written to its own column on the
    // player-game row — one column per statistic, both sides.
    const row = game as unknown as Record<string, unknown>;
    for (const field of EXPECTED_STAT_FIELDS) {
      eq_(`D7 ${field} written to the player-game row`, row[field], EXPECTED[field as keyof typeof EXPECTED]);
    }
    eq_("D8 fixture marked completed on the game row", game.status, "completed");
  }

  // ── Statistic inventory: the schema holds exactly the 12 canonical statistics
  // per side, `Successful Passes` as ONE column, and no duplicate/legacy columns.
  const { rows: statCols } = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name IN ('match_result_submissions', 'match_player_games')
       AND (column_name LIKE 'home\\_%' OR column_name LIKE 'away\\_%')`,
  );
  for (const table of ["match_result_submissions", "match_player_games"]) {
    const cols = statCols.filter((c) => c.table_name === table).map((c) => c.column_name);
    const missing = EXPECTED_STAT_FIELDS.filter((f) => !cols.includes(columnOf(f)));
    eq_(`D9 ${table}: every one of the 12 statistics exists per side (24 columns)`, missing.length, 0);
    if (missing.length) console.log(`      missing columns: ${missing.map(columnOf).join(", ")}`);

    check(
      `D10 ${table}: 'Successful Passes' is stored as ONE column`,
      cols.includes("home_successful_passes") && cols.includes("away_successful_passes"),
      `home_successful_passes=${cols.includes("home_successful_passes")}`,
    );

    // Nothing may survive under a legacy name, and `Successful Passes` must not be
    // split into a separate `passes` / `successful` column. Matched on the whole
    // column name so `home_successful_passes` is not mistaken for a stray `passes`.
    const forbidden = /^(home|away)_(position|corners|yellow_cards|red_cards|passes|successful)$/;
    const leftovers = cols.filter((c) => forbidden.test(c));
    eq_(`D11 ${table}: no legacy or duplicate statistic columns`, leftovers.length, 0);
    if (leftovers.length) console.log(`      leftover columns: ${leftovers.join(", ")}`);
  }

  eq_("D12 approved submission keeps its value", submission?.homeScore, 3);
}

// ─ E. Duplicate approval guard + completed-fixture lock ────────────────────
async function duplicateAndLockTests(submissionId: number): Promise<void> {
  console.log("\n=== E. DUPLICATE APPROVAL + COMPLETED LOCK ===");

  as(admin);
  const again = await call("POST", `/api/admin/match-result-submissions/${submissionId}/approve`, {});
  eq_("E1 the same submission cannot be approved twice", again.status, 409);

  const rejectAfterApprove = await call("POST", `/api/admin/match-result-submissions/${submissionId}/reject`, { reason: "x" });
  eq_("E2 an approved submission cannot be rejected", rejectAfterApprove.status, 409);

  // A completed fixture is frozen for players.
  as(playerA);
  const resubmit = await call("POST", `/api/matches/${fixtureOneId}/result-submission`, screenshot, "image/png");
  eq_("E3 completed fixture cannot be resubmitted", resubmit.status, 409);

  // ...and for the opposing participant too.
  as(playerB);
  const resubmitB = await call("POST", `/api/matches/${fixtureOneId}/result-submission`, screenshot, "image/png");
  eq_("E4 the opposing participant also cannot resubmit a completed fixture", resubmitB.status, 409);
}

// ─ F. Rejection with a reason → player resubmits ─────────────────────────────
async function rejectionTests(): Promise<{ rejectedId: number; resubmittedId: number }> {
  console.log("\n=== F. REJECTION + RESUBMISSION ===");

  // Fixture two is untouched by the approval flow, so it is still `scheduled`.
  as(playerA);
  const upload = await call("POST", `/api/matches/${fixtureTwoId}/result-submission`, screenshot, "image/png");
  eq_("F1 participant upload accepted on the second fixture", upload.status, 201);
  const rejectedId = Number(upload.body?.id);

  as(admin);
  const noReason = await call("POST", `/api/admin/match-result-submissions/${rejectedId}/reject`, { reason: "   " });
  eq_("F2 rejection without a reason is refused", noReason.status, 400);
  check("F3 error explains that a reason is required", /reason/i.test(String(noReason.body?.error)), String(noReason.body?.error));

  // F4/F5: negative case — the submission is still pending, so it is not finalised.
  const [stillPending] = await db
    .select({ status: matchResultSubmissionsTable.status })
    .from(matchResultSubmissionsTable)
    .where(eq(matchResultSubmissionsTable.id, rejectedId));
  eq_("F4 a refused rejection leaves the submission pending", stillPending?.status, "pending");

  const reason = "Screenshot is unclear";
  const reject = await call("POST", `/api/admin/match-result-submissions/${rejectedId}/reject`, { reason });
  eq_("F5 rejection with a reason succeeds", reject.status, 200);
  eq_("F6 submission marked rejected", reject.body?.status, "rejected");
  eq_("F7 rejection reason stored", reject.body?.rejectionReason, reason);

  // The fixture must NOT be completed by a rejection.
  const [fixtureAfterReject] = await db.select().from(matchesTable).where(eq(matchesTable.id, fixtureTwoId));
  eq_("F8 fixture still scheduled after rejection", fixtureAfterReject?.status, "scheduled");
  eq_("F9 no official score written by a rejection", fixtureAfterReject?.participant1Score, null);

  // The player sees the rejection and the reason.
  as(playerA);
  const mine = await call("GET", `/api/matches/${fixtureTwoId}/result-submission`);
  eq_("F10 player can read their own submission", mine.status, 200);
  eq_("F11 player sees the rejected status", mine.body?.status, "rejected");
  eq_("F12 player sees the rejection reason", mine.body?.rejectionReason, reason);

  // ...and can submit a new screenshot.
  const resubmit = await call("POST", `/api/matches/${fixtureTwoId}/result-submission`, screenshot, "image/png");
  eq_("F13 player can resubmit after rejection", resubmit.status, 201);
  const resubmittedId = Number(resubmit.body?.id);
  check("F14 resubmission is a new record", resubmittedId !== rejectedId, `${rejectedId} → ${resubmittedId}`);
  eq_("F15 resubmission starts pending", resubmit.body?.status, "pending");

  // The rejected record is preserved as history.
  const [rejectedRow] = await db
    .select({ status: matchResultSubmissionsTable.status, rejectionReason: matchResultSubmissionsTable.rejectionReason })
    .from(matchResultSubmissionsTable)
    .where(eq(matchResultSubmissionsTable.id, rejectedId));
  eq_("F16 rejected submission kept in history", rejectedRow?.status, "rejected");
  eq_("F17 its rejection reason is preserved", rejectedRow?.rejectionReason, reason);

  return { rejectedId, resubmittedId };
}

// ─ G. Audit trail ────────────────────────────────────────────────────────────
async function auditLogTests(approvedId: number, rejectedId: number): Promise<void> {
  console.log("\n=== G. AUDIT LOG ===");

  as(playerA);
  eq_("G1 players cannot read the audit log", (await call("GET", "/api/admin/match-result-audit")).status, 403);

  as(admin);
  const res = await call("GET", "/api/admin/match-result-audit");
  eq_("G2 admin can read the audit log", res.status, 200);
  const rows = (res.body as AuditRowLike[]) ?? [];
  check("G3 audit log is populated", rows.length > 0, `${rows.length} entries`);

  const approveRow = rows.find((r) => r.submissionId === approvedId && r.action === "approve");
  check("G4 approval recorded", !!approveRow);
  if (approveRow) {
    eq_("G5 approval previous status", approveRow.previousStatus, "pending");
    eq_("G6 approval new status", approveRow.newStatus, "approved");
    eq_("G7 approval names the fixture", approveRow.fixtureId, fixtureOneId);
    check("G8 approval records the admin", !!approveRow.adminName, String(approveRow.adminName));
    check("G9 approval records a timestamp", !!approveRow.createdAt, String(approveRow.createdAt));
  }

  const rejectRow = rows.find((r) => r.submissionId === rejectedId && r.action === "reject");
  check("G10 rejection recorded", !!rejectRow);
  if (rejectRow) {
    eq_("G11 rejection previous status", rejectRow.previousStatus, "pending");
    eq_("G12 rejection new status", rejectRow.newStatus, "rejected");
    eq_("G13 rejection reason logged", rejectRow.rejectionReason, "Screenshot is unclear");
  }

  // No audit entry may exist for a request that was refused.
  check(
    "G14 refused rejection produced no audit entry",
    rows.filter((r) => r.submissionId === rejectedId && r.action === "reject").length === 1,
  );
}

interface AuditRowLike {
  adminName: string | null;
  action: string;
  fixtureId: number;
  submissionId: number;
  previousStatus: string;
  newStatus: string;
  rejectionReason: string | null;
  createdAt: string | null;
}

// ─ H. Admin reopen → fixture rolled back → player resubmits ──────────────────
async function reopenTests(approvedId: number): Promise<void> {
  console.log("\n=== H. ADMIN REOPEN ===");

  as(playerA);
  const beforeReopen = await call("POST", `/api/matches/${fixtureOneId}/result-submission`, screenshot, "image/png");
  eq_("H1 completed fixture stays locked before an admin reopen", beforeReopen.status, 409);

  as(admin);
  const reopen = await call("POST", `/api/admin/match-result-submissions/${approvedId}/reopen`, {
    reason: "Result disputed — please resubmit the screenshot.",
  });
  eq_("H2 admin can reopen an approved result", reopen.status, 200);
  eq_("H3 submission released as reopened", reopen.body?.status, "reopened");

  const [fixture] = await db.select().from(matchesTable).where(eq(matchesTable.id, fixtureOneId));
  eq_("H4 fixture rolled back to scheduled", fixture?.status, "scheduled");
  eq_("H5 official home score cleared", fixture?.participant1Score, null);
  eq_("H6 official away score cleared", fixture?.participant2Score, null);

  as(playerA);
  const resubmit = await call("POST", `/api/matches/${fixtureOneId}/result-submission`, screenshot, "image/png");
  eq_("H7 player can submit again once reopened", resubmit.status, 201);
  eq_("H8 reopened resubmission is pending", resubmit.body?.status, "pending");

  as(admin);
  const audit = await call("GET", "/api/admin/match-result-audit");
  const rows = ((audit.body as AuditRowLike[]) ?? []).filter((r) => r.action === "reopen" && r.submissionId === approvedId);
  check("H9 reopen recorded in the audit log", rows.length === 1, `${rows.length} entries`);
  if (rows.length === 1) {
    eq_("H10 reopen previous status", rows[0]!.previousStatus, "approved");
    eq_("H11 reopen new status", rows[0]!.newStatus, "reopened");
  }
}

async function adminUploadTests(): Promise<{ adminSubmissionId: number }> {
  console.log("\n=== I. ADMIN UPLOAD ON BEHALF OF PLAYERS ===");

  // The admin is NOT a participant in fixture two (also Player A vs Player B).
  // Admins/owners are exempt from the participant rule so they can upload a
  // screenshot on a player's behalf.
  as(admin);
  const upload = await call("POST", `/api/matches/${fixtureTwoId}/result-submission`, screenshot, "image/png");
  eq_("I1 admin can upload for a fixture they are not in", upload.status, 201);
  eq_("I2 admin submission starts pending", upload.body?.status, "pending");
  const adminSubmissionId = upload.body?.id;

  const mine = await call("GET", `/api/matches/${fixtureTwoId}/result-submission`);
  eq_("I3 admin can read their own upload back", mine.status, 200);
  eq_("I4 admin sees their pending submission", mine.body?.status, "pending");

  const list = await call("GET", "/api/admin/match-result-submissions");
  const rows = (list.body as Array<{ id: number; fixtureId: number; submittedByName: string | null }> | null) ?? [];
  const row = rows.find((r) => r.id === adminSubmissionId);
  check("I5 admin upload appears in the verification queue", !!row, `id=${adminSubmissionId}`);
  if (row) {
    eq_("I6 queue row is for fixture two", row.fixtureId, fixtureTwoId);
    check("I7 queue row names the admin as submitter", String(row.submittedByName ?? "").length > 0, String(row.submittedByName));
  }

  // The duplicate-pending guard applies to admins exactly as it does to players.
  const dupe = await call("POST", `/api/matches/${fixtureTwoId}/result-submission`, screenshot, "image/png");
  eq_("I8 admin duplicate pending submission blocked", dupe.status, 409);

  return { adminSubmissionId: Number(adminSubmissionId) };
}

// ─ J. Team fixture → result belongs to the player-vs-player matchup ──────────
async function teamFixtureTests(): Promise<void> {
  console.log("\n=== J. TEAM FIXTURE → PLAYER-VS-PLAYER MATCHUP ===");

  const gamePath = `/api/player-games/${teamGameId}/result-submission`;

  // The parent team-vs-team card must not accept a result directly.
  as(teamPlayerA1);
  const onParent = await call("POST", `/api/matches/${teamFixtureId}/result-submission`, screenshot, "image/png");
  eq_("J1 team fixture rejects a parent-level upload", onParent.status, 400);
  check(
    "J2 error points the player at their matchup",
    /player-vs-player|matchup/i.test(String(onParent.body?.error)),
    String(onParent.body?.error),
  );

  // Only the two players in this exact matchup may submit.
  as(teamPlayerA2);
  const otherTeamMember = await call("POST", gamePath, screenshot, "image/png");
  eq_("J3 rostered teammate not in the matchup is refused", otherTeamMember.status, 403);
  check(
    "J3b error explains it is matchup-specific",
    /matchup/i.test(String(otherTeamMember.body?.error)),
    String(otherTeamMember.body?.error),
  );

  as(outsider);
  eq_("J4 unrelated player is refused", (await call("POST", gamePath, screenshot, "image/png")).status, 403);

  // A player in the matchup uploads; the submission is bound to the game. The
  // screenshot is the one rendered with THIS matchup's registered names.
  as(teamPlayerA1);
  const upload = await call("POST", gamePath, teamScreenshot, "image/png");
  eq_("J5 matchup player upload accepted", upload.status, 201);
  eq_("J6 submission is bound to the exact matchup", upload.body?.playerGameId, teamGameId);
  eq_("J7 submission also records the parent fixture", upload.body?.fixtureId, teamFixtureId);
  const gameSubmissionId = upload.body?.id;

  // The upload itself carries no verdict and no assignment: the administrator
  // makes that decision later, on the review screen.
  eq_("J7a no automatic verdict is produced for a matchup upload", upload.body?.nameVerification, undefined);
  eq_("J7b no Home player is assigned at upload", upload.body?.assignment?.homePlayerId, null);
  eq_("J7c no Away player is assigned at upload", upload.body?.assignment?.awayPlayerId, null);
  eq_("J7d OCR still records the home name it read", upload.body?.ocrMetadata?.homeName, GAME1_HOME_NAME);
  eq_("J7e OCR still records the away name it read", upload.body?.ocrMetadata?.awayName, GAME1_AWAY_NAME);

  // Same real OCR pass as the solo flow.
  if (upload.body?.homeScore == null) {
    // Diagnose a failed recognition pass instead of only reporting null values.
    console.log(`      OCR metadata: ${JSON.stringify(upload.body?.ocrMetadata ?? null)}`);
  }
  eq_("J8 OCR home score read for the matchup", upload.body?.homeScore, EXPECTED.homeScore);
  eq_("J9 OCR away score read for the matchup", upload.body?.awayScore, EXPECTED.awayScore);
  eq_("J10 OCR shots read for the matchup", upload.body?.homeShots, EXPECTED.homeShots);

  // The two players can read it back; other team members cannot.
  const mine = await call("GET", gamePath);
  eq_("J11 matchup player can read the submission", mine.status, 200);
  eq_("J12 submission is pending", mine.body?.status, "pending");
  as(teamPlayerA2);
  eq_("J13 other team member cannot read the matchup submission", (await call("GET", gamePath)).status, 403);

  // The duplicate-pending guard is per matchup+player.
  as(teamPlayerA1);
  eq_("J14 duplicate pending submission blocked", (await call("POST", gamePath, teamScreenshot, "image/png")).status, 409);

  // The opposing player in the same matchup may also submit.
  as(teamPlayerB1);
  const opposing = await call("POST", gamePath, teamScreenshot, "image/png");
  eq_("J15 the opposing matchup player may also submit", opposing.status, 201);
  eq_("J15b the opposing upload also carries no verdict", opposing.body?.nameVerification, undefined);

  // Admin sees the submission in the queue with its player-matchup context.
  as(admin);
  const list = await call("GET", "/api/admin/match-result-submissions");
  const rows = (list.body as Array<Record<string, any>> | null) ?? [];
  const row = rows.find((r) => r.id === gameSubmissionId);
  check("J16 matchup submission appears in the verification queue", !!row, `id=${gameSubmissionId}`);
  if (row) {
    eq_("J17 queue row exposes the parent fixture", row.fixtureId, teamFixtureId);
    eq_("J18 queue row exposes the matchup id", row.playerGameId, teamGameId);
    eq_("J19 queue row shows the home player name", row.playerGame?.homePlayerName, GAME1_HOME_NAME);
    eq_("J20 queue row shows the away player name", row.playerGame?.awayPlayerName, GAME1_AWAY_NAME);
    // The queue row exposes the matchup's registered player IDS, which is what
    // the admin chooses from in the Home/Away assignment dialog.
    eq_("J20a queue row exposes the matchup HOME player id", row.playerGame?.homePlayerId, teamPlayerA1.id);
    eq_("J20b queue row exposes the matchup AWAY player id", row.playerGame?.awayPlayerId, teamPlayerB1.id);
    eq_("J20c queue row has no assignment while pending", row.assignment?.homePlayerId, null);
  }

  // Approve → the matchup becomes completed and the parent propagates. The
  // administrator first names the two players taking each side of the screenshot.
  const approve = await call("POST", `/api/admin/match-result-submissions/${gameSubmissionId}/approve`, {
    homePlayerId: teamPlayerA1.id,
    awayPlayerId: teamPlayerB1.id,
  });
  eq_("J21 admin can approve a matchup submission", approve.status, 200);
  eq_("J21f the matchup assignment is frozen (home)", approve.body?.submission?.assignment?.homePlayerId, teamPlayerA1.id);
  eq_("J21g the matchup assignment is frozen (away)", approve.body?.submission?.assignment?.awayPlayerId, teamPlayerB1.id);
  // The approval response reports each player's statistics on the correct side:
  // home = matchup home player, away = matchup away player, never swapped.
  eq_("J21b home statistics belong to the home player", approve.body?.statistics?.possession?.home, EXPECTED.homePossession);
  eq_("J21c away statistics belong to the away player", approve.body?.statistics?.possession?.away, EXPECTED.awayPossession);
  eq_("J21d home shots on the home side", approve.body?.statistics?.shots?.home, EXPECTED.homeShots);
  eq_("J21e away shots on the away side", approve.body?.statistics?.shots?.away, EXPECTED.awayShots);

  const [game] = await db.select().from(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.id, teamGameId));
  eq_("J22 matchup marked completed", game?.status, "completed");
  eq_("J23 matchup home score written", game?.homeScore, EXPECTED.homeScore);
  eq_("J24 matchup away score written", game?.awayScore, EXPECTED.awayScore);
  // The full statistics set lands on the exact player-vs-player matchup.
  const gameRow = game as unknown as Record<string, unknown> | undefined;
  for (const field of EXPECTED_STAT_FIELDS) {
    eq_(`J25 ${field} written to the matchup`, gameRow?.[field], EXPECTED[field as keyof typeof EXPECTED]);
  }

  // The registered identities are untouched by the submission: a submission is
  // only ever associated with the matchup, it never changes who plays in it.
  eq_("J26 home player identity unchanged by the submission", game?.homePlayerName, GAME1_HOME_NAME);
  eq_("J26b home player id unchanged by the submission", game?.homePlayerId, teamPlayerA1.id);
  eq_("J27 away player identity unchanged by the submission", game?.awayPlayerName, GAME1_AWAY_NAME);
  eq_("J27b away player id unchanged by the submission", game?.awayPlayerId, teamPlayerB1.id);

  // Parent propagation: one matchup decided → home team wins the set 1-0 and
  // the fixture completes because no other matchup is outstanding.
  const [parent] = await db.select().from(matchesTable).where(eq(matchesTable.id, teamFixtureId));
  eq_("J28 parent fixture completed", parent?.status, "completed");
  eq_("J29 parent score counts matchup wins", parent?.participant1Score, 1);
  eq_("J30 parent away score counts matchup wins", parent?.participant2Score, 0);
  eq_("J31 parent winner is the home team", parent?.winnerId, teamHomeId);

  // Reopen → the matchup is released and the parent rolls back.
  const reopen = await call("POST", `/api/admin/match-result-submissions/${gameSubmissionId}/reopen`, {
    reason: "Matchup screenshot disputed.",
  });
  eq_("J32 admin can reopen a matchup result", reopen.status, 200);
  const [gameAfter] = await db.select().from(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.id, teamGameId));
  eq_("J33 matchup released back to scheduled", gameAfter?.status, "scheduled");
  eq_("J34 matchup score cleared", gameAfter?.homeScore, null);
  const [parentAfter] = await db.select().from(matchesTable).where(eq(matchesTable.id, teamFixtureId));
  eq_("J35 parent fixture rolled back to scheduled", parentAfter?.status, "scheduled");
  eq_("J36 parent score cleared", parentAfter?.participant1Score, null);
}
// ── K. Admin player assignment — validation rules (solo fixture) ────────────
// Approving is a two-part decision: the administrator must name the HOME player
// and the AWAY player. The same player can never take both sides, and a player
// who does not belong to the matchup can never be assigned — the official
// result is never attached to an arbitrary participant.
async function adminAssignmentValidationTests(submissionId: number): Promise<void> {
  console.log("\n=== K. ADMIN PLAYER ASSIGNMENT — VALIDATION ===");

  as(admin);
  const path = `/api/admin/match-result-submissions/${submissionId}/approve`;

  // 1. No selection at all.
  const none = await call("POST", path, {});
  eq_("K1 approval without a player selection is refused", none.status, 400);
  check(
    "K1b the refusal asks for both sides",
    /home player and the away player/i.test(String(none.body?.error)),
    String(none.body?.error),
  );

  // 2. Only one side selected.
  eq_("K2 approval with only one side selected is refused", (await call("POST", path, { homePlayerId: playerA.id })).status, 400);

  // 3. The SAME player on both sides.
  const same = await call("POST", path, { homePlayerId: playerA.id, awayPlayerId: playerA.id });
  eq_("K3 the same player cannot take both Home and Away", same.status, 400);
  check("K3b the refusal explains the rule", /must be different/i.test(String(same.body?.error)), String(same.body?.error));

  // 4. A player who is not in this fixture.
  const foreign = await call("POST", path, { homePlayerId: outsider.id, awayPlayerId: playerB.id });
  eq_("K4 a player outside the fixture cannot be assigned", foreign.status, 400);
  check("K4b the refusal explains the rule", /must belong to this matchup/i.test(String(foreign.body?.error)), String(foreign.body?.error));

  // 5. A non-numeric selection.
  eq_("K5 a non-numeric selection is refused", (await call("POST", path, { homePlayerId: "abc", awayPlayerId: playerB.id })).status, 400);

  // Nothing above approved the submission.
  const list = await call("GET", "/api/admin/match-result-submissions");
  const row = ((list.body as Array<Record<string, any>> | null) ?? []).find((r) => r.id === submissionId);
  eq_("K6 the submission is still pending after every refused attempt", row?.status, "pending");

  // 6. The valid assignment: HOME = Player A, AWAY = Player B.
  const ok = await call("POST", path, { homePlayerId: playerA.id, awayPlayerId: playerB.id });
  eq_("K7 a valid Home/Away selection approves the result", ok.status, 200);
  eq_("K7b the HOME player is frozen on the submission", ok.body?.submission?.assignment?.homePlayerId, playerA.id);
  eq_("K7c the AWAY player is frozen on the submission", ok.body?.submission?.assignment?.awayPlayerId, playerB.id);
  eq_("K7d the HOME player name is frozen too", ok.body?.submission?.assignment?.homePlayerName, "Player A");
  eq_("K7e the AWAY player name is frozen too", ok.body?.submission?.assignment?.awayPlayerName, "Player B");
  eq_("K8 home statistics belong to the selected HOME player", ok.body?.statistics?.possession?.home, EXPECTED.homePossession);
  eq_("K9 away statistics belong to the selected AWAY player", ok.body?.statistics?.possession?.away, EXPECTED.awayPossession);

  // 7. The official fixture result carries the score assigned by screenshot side.
  const [fixture] = await db.select().from(matchesTable).where(eq(matchesTable.id, fixtureTwoId));
  eq_("K10 fixture marked completed", fixture?.status, "completed");
  eq_("K11 official home score written", fixture?.participant1Score, EXPECTED.homeScore);
  eq_("K12 official away score written", fixture?.participant2Score, EXPECTED.awayScore);

  // 8. The per-player game row records the assignment and the statistics.
  const [game] = await db.select().from(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.matchId, fixtureTwoId));
  eq_("K13 the player game records the assigned HOME player", game?.homePlayerId, playerA.id);
  eq_("K14 the player game records the assigned AWAY player", game?.awayPlayerId, playerB.id);
  eq_("K15 home score on the home side of the player game", game?.homeScore, EXPECTED.homeScore);
  eq_("K16 away score on the away side of the player game", game?.awayScore, EXPECTED.awayScore);
  check(
    "K17 the statistics are not swapped for the solo fixture",
    game?.homePossession === EXPECTED.homePossession && game?.awayPossession === EXPECTED.awayPossession,
    `home=${game?.homePossession} away=${game?.awayPossession}`,
  );
}

// ── L. Player-vs-player matchup — admin upload + assignment ─────────────────
// The complete admin-controlled workflow at the Player vs Player level: the admin
// uploads the screenshot, real OCR reads the Home/Away sides, the admin assigns
// the two registered players of that matchup, and only then is the result
// approved and propagated to the parent Team vs Team fixture.
async function adminMatchupAssignmentTests(): Promise<void> {
  console.log("\n=== L. PLAYER-VS-PLAYER MATCHUP — ADMIN ASSIGNMENT ===");

  // Players may not use the admin upload endpoints.
  as(playerA);
  eq_("L1 a player cannot use the admin matchup upload endpoint", (await call("POST", `/api/admin/player-games/${teamGameId}/result-submission`, teamScreenshot, "image/png")).status, 403);
  eq_("L2 a player cannot use the admin fixture upload endpoint", (await call("POST", `/api/admin/matches/${teamFixtureId}/result-submission`, teamScreenshot, "image/png")).status, 403);

  // A second matchup of the same fixture: A2 vs B1. Its players are different
  // people, so matchup 1's players must be refused here.
  const [teamGame2] = await db
    .insert(matchPlayerGamesTable)
    .values({
      matchId: teamFixtureId,
      homePlayerId: teamPlayerA2.id,
      homePlayerName: GAME2_HOME_NAME,
      awayPlayerId: teamPlayerB1.id,
      awayPlayerName: GAME2_AWAY_NAME,
      status: "scheduled",
    })
    .returning({ id: matchPlayerGamesTable.id });
  teamGame2Id = teamGame2!.id;

  // 1. The ADMIN uploads the screenshot for the matchup.
  as(admin);
  const upload = await call("POST", `/api/admin/player-games/${teamGame2Id}/result-submission`, teamScreenshot, "image/png");
  eq_("L3 the admin can upload a screenshot for a player matchup", upload.status, 201);
  eq_("L4 the submission is bound to that matchup", upload.body?.playerGameId, teamGame2Id);
  eq_("L5 the parent fixture is recorded too", upload.body?.fixtureId, teamFixtureId);
  const submissionId = Number(upload.body?.id);

  // 2. OCR ran for real: both sides of the screenshot were read.
  eq_("L6 OCR read the home score", upload.body?.homeScore, EXPECTED.homeScore);
  eq_("L7 OCR read the away score", upload.body?.awayScore, EXPECTED.awayScore);
  for (const field of EXPECTED_STAT_FIELDS) {
    eq_(`L8 OCR read the home ${field}`, (upload.body as Record<string, unknown>)?.[field], EXPECTED[field as keyof typeof EXPECTED]);
  }
  eq_("L8b no Home player assigned by the upload", upload.body?.assignment?.homePlayerId, null);
  eq_("L8c no Away player assigned by the upload", upload.body?.assignment?.awayPlayerId, null);

  // The screenshot is visible in the admin review workflow only.
  const list = await call("GET", "/api/admin/match-result-submissions");
  const row = ((list.body as Array<Record<string, any>> | null) ?? []).find((r) => r.id === submissionId);
  check("L9 the uploaded screenshot appears in the admin review list", !!row, `id=${submissionId}`);
  check("L10 the review row exposes the screenshot", String(row?.imagePath ?? "").length > 0, String(row?.imagePath));
  eq_(
    "L11 the review row exposes both matchup player ids",
    [row?.playerGame?.homePlayerId, row?.playerGame?.awayPlayerId].join(","),
    `${teamPlayerA2.id},${teamPlayerB1.id}`,
  );
  as(playerA);
  eq_("L11b a player still cannot read the admin queue", (await call("GET", "/api/admin/match-result-submissions")).status, 403);

  // 3. A player from a DIFFERENT matchup of the same fixture is refused.
  as(admin);
  const foreign = await call("POST", `/api/admin/match-result-submissions/${submissionId}/approve`, {
    homePlayerId: teamPlayerA1.id,
    awayPlayerId: teamPlayerB1.id,
  });
  eq_("L12 a player from another matchup cannot be assigned", foreign.status, 400);
  check("L13 the refusal explains the rule", /must belong to this matchup/i.test(String(foreign.body?.error)), String(foreign.body?.error));

  // 4. The same player on both sides is refused.
  eq_(
    "L14 the same player cannot take both sides of a matchup",
    (
      await call("POST", `/api/admin/match-result-submissions/${submissionId}/approve`, {
        homePlayerId: teamPlayerA2.id,
        awayPlayerId: teamPlayerA2.id,
      })
    ).status,
    400,
  );

  // 5. The correct assignment for this matchup: HOME = A2, AWAY = B1.
  const ok = await call("POST", `/api/admin/match-result-submissions/${submissionId}/approve`, {
    homePlayerId: teamPlayerA2.id,
    awayPlayerId: teamPlayerB1.id,
  });
  eq_("L15 approving with the matchup's own players succeeds", ok.status, 200);
  eq_("L15b the assignment is frozen on the submission (home)", ok.body?.submission?.assignment?.homePlayerId, teamPlayerA2.id);
  eq_("L15c the assignment is frozen on the submission (away)", ok.body?.submission?.assignment?.awayPlayerId, teamPlayerB1.id);

  // 6. The statistics are attributed by screenshot side to the selected player.
  const [game] = await db.select().from(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.id, teamGame2Id));
  eq_("L16 the matchup records the assigned HOME player", game?.homePlayerId, teamPlayerA2.id);
  eq_("L17 the matchup records the assigned AWAY player", game?.awayPlayerId, teamPlayerB1.id);
  eq_("L18 the matchup is completed", game?.status, "completed");
  for (const field of EXPECTED_STAT_FIELDS) {
    eq_(`L19 ${field} assigned to the HOME side`, (game as unknown as Record<string, unknown>)?.[field], EXPECTED[field as keyof typeof EXPECTED]);
  }
  // Never swapped: the home columns hold the screenshot's home column.
  check(
    "L20 home and away statistics are not swapped",
    game?.homePossession === EXPECTED.homePossession && game?.awayPossession === EXPECTED.awayPossession,
    `home=${game?.homePossession} away=${game?.awayPossession}`,
  );
  eq_("L21 the home player keeps his own score", game?.homeScore, EXPECTED.homeScore);
  eq_("L22 the away player keeps her own score", game?.awayScore, EXPECTED.awayScore);

  // 7. The parent Team vs Team fixture counts the set win (one matchup is still
  //    outstanding, so the parent is live rather than completed).
  const [parentLive] = await db.select().from(matchesTable).where(eq(matchesTable.id, teamFixtureId));
  eq_("L23 the parent fixture counts the matchup win", parentLive?.participant1Score, 1);
  eq_("L24 the parent fixture counts no away win yet", parentLive?.participant2Score, 0);
  eq_("L25 the parent is live while one matchup is outstanding", parentLive?.status, "live");

  // 8. The admin uploads and approves the first matchup too, completing the set.
  const upload1 = await call("POST", `/api/admin/player-games/${teamGameId}/result-submission`, teamScreenshot, "image/png");
  eq_("L26 the admin can upload for the first matchup as well", upload1.status, 201);
  const ok1 = await call("POST", `/api/admin/match-result-submissions/${Number(upload1.body?.id)}/approve`, {
    homePlayerId: teamPlayerA1.id,
    awayPlayerId: teamPlayerB1.id,
  });
  eq_("L27 the first matchup is approved with its own players", ok1.status, 200);

  const [parent] = await db.select().from(matchesTable).where(eq(matchesTable.id, teamFixtureId));
  eq_("L28 the parent fixture is now completed", parent?.status, "completed");
  eq_("L29 the parent score counts both matchup wins", parent?.participant1Score, 2);
  eq_("L30 the parent away score counts no set win", parent?.participant2Score, 0);
  eq_("L31 the parent winner is the home team", parent?.winnerId, teamHomeId);
}
//  Server bootstrap ─────────────────────────────────────────────────────────
// The real router is mounted exactly as production mounts it, behind a
// middleware that injects the acting user's session. Every guard in the route
// (`requireAuth`, `requireAdmin`, participant checks) therefore really executes.
async function startServer(): Promise<void> {
  const app = express();
  app.use(express.raw({ type: ["image/*", "video/*", "application/octet-stream"], limit: "10mb" }));
  app.use(express.json());

  app.use((req, _res, next) => {
    const actor = currentActor;
    const isAdmin = !!actor && (actor.role === "admin" || actor.role === "owner");
    (req as Request & { session?: Record<string, unknown> }).session = actor
      ? { userId: actor.id, role: actor.role, isAdmin, adminUsername: `admin_${actor.id}` }
      : {};
    next();
  });

  app.use("/api", matchResultsRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

async function main(): Promise<void> {
  console.log("=== MATCH RESULT SUBMISSION — END-TO-END ROUTE TEST ===");
  console.log(`fixture: test/fixtures/efootball-match-result.png (${screenshot.length} bytes)`);

  await startServer();
  try {
    await setup();
    await securityAndValidationTests();
    const { submissionId } = await uploadAndOcrTests();
    await adminApprovalTests(submissionId);
    await statisticsPropagationTests(submissionId);
    await duplicateAndLockTests(submissionId);
    const { rejectedId } = await rejectionTests();
    await auditLogTests(submissionId, rejectedId);
    await reopenTests(submissionId);
    const { adminSubmissionId } = await adminUploadTests();
    await adminAssignmentValidationTests(adminSubmissionId);
    await teamFixtureTests();
    await adminMatchupAssignmentTests();
  } finally {
    await teardown();
    await new Promise((resolve) => server.close(resolve));
    // Release the cached tesseract.js worker and the pg pool; without this the
    // open handles keep the event loop alive and the process never exits (which
    // is what made buffered output from earlier runs disappear).
    await shutdownOcrEngine().catch(() => {});
    await pool.end().catch(() => {});
  }

  console.log(`\n=== RESULT: ${passed} passed, ${failures.length} failed ===`);
  if (failures.length) {
    for (const f of failures) console.log(`  FAILED: ${f}`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (err) {
  console.error("\nE2E TEST CRASHED:", err);
  process.exitCode = 1;
}


