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
// fixture with a single player-vs-player matchup inside it.
let teamHomeId: number;
let teamAwayId: number;
let teamPlayerA1: Actor; // plays the matchup for the home team
let teamPlayerA2: Actor; // rostered on the home team but NOT in the matchup
let teamPlayerB1: Actor; // plays the matchup for the away team
let teamFixtureId: number;
let teamGameId: number;

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
    participant1Name: `Player A ${label}`,
    participant2Id: playerB.id,
    participant2Name: `Player B ${label}`,
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

  // The exact matchup: A1 vs B1. A2 is on the roster but not in this pairing.
  const [teamGame] = await db
    .insert(matchPlayerGamesTable)
    .values({
      matchId: teamFixtureId,
      homePlayerId: teamPlayerA1.id,
      homePlayerName: `TeamA P1`,
      awayPlayerId: teamPlayerB1.id,
      awayPlayerName: `TeamB P1`,
      status: "scheduled",
    })
    .returning({ id: matchPlayerGamesTable.id });
  teamGameId = teamGame!.id;
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
  homePosition: 1,
  awayPosition: 2,
  homeShots: 8,
  awayShots: 4,
  homeShotsOnTarget: 5,
  awayShotsOnTarget: 2,
  homeCorners: 4,
  awayCorners: 2,
  homeYellowCards: 1,
  awayYellowCards: 2,
  homeRedCards: 0,
  awayRedCards: 0,
};

// ── Tests ────────────────────────────────────────────────────────────────────
async function securityAndValidationTests(): Promise<void> {
  console.log("\n=== A. SECURITY & VALIDATION ===");

  // OCR-unavailable fallback contract: nothing may be invented.
  const blank = emptyDetection();
  const numericValues = DETECTED_NUMERIC_FIELDS.map((k) => blank[k]);
  check(
    "A1 OCR-unavailable fallback marks every value Not detected",
    numericValues.every((v) => v === null) && DETECTED_NUMERIC_FIELDS.length === 14,
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
    eq_("C5 home participant name exposed", row.fixture?.participant1Name, "Player A 1");
    eq_("C6 away participant name exposed", row.fixture?.participant2Name, "Player B 1");
    check("C7 submitter name exposed", String(row.submittedByName ?? "").length > 0, String(row.submittedByName));
    check("C8 submission time exposed", !!row.createdAt, String(row.createdAt));
    check("C9 screenshot path exposed for review", String(row.imagePath ?? "").length > 0);
    eq_("C10 status shown to the admin", row.status, "pending");
  }

  // The OCR reading must already be visible to the admin before approval.
  eq_("C11 detected home score persisted for review", row?.homeScore, 3);
  eq_("C12 detected away score persisted for review", row?.awayScore, 1);

  const approve = await call("POST", `/api/admin/match-result-submissions/${submissionId}/approve`, {});
  eq_("C13 approve succeeds", approve.status, 200);
  eq_("C14 submission frozen as approved", approve.body?.submission?.status, "approved");
  eq_("C15 fixture marked completed", approve.body?.match?.status, "completed");

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
  eq_("D4 database yellow cards stored on the fixture", matchRow?.participant1YellowCards, 1);
  eq_("D5 database away yellow cards stored on the fixture", matchRow?.participant2YellowCards, 2);

  const [game] = await db.select().from(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.matchId, fixtureOneId));
  check("D6 official per-match statistics row created", !!game, game ? `id=${game.id}` : "missing");
  if (game) {
    eq_("D7 official statistics home shots", game.homeShots, 8);
    eq_("D8 official statistics away shots", game.awayShots, 4);
    eq_("D9 official statistics home shots on target", game.homeShotsOnTarget, 5);
    eq_("D10 official statistics away shots on target", game.awayShotsOnTarget, 2);
    eq_("D11 official statistics home corners", game.homeCorners, 4);
    eq_("D12 official statistics away corners", game.awayCorners, 2);
    eq_("D13 official statistics home position", game.homePosition, 1);
    eq_("D14 official statistics away position", game.awayPosition, 2);
    eq_("D15 official statistics home yellow cards", game.homeYellowCards, 1);
    eq_("D16 official statistics away yellow cards", game.awayYellowCards, 2);
    eq_("D17 official statistics home red cards", game.homeRedCards, 0);
    eq_("D18 official statistics away red cards", game.awayRedCards, 0);
    eq_("D19 fixture marked completed on the game row", game.status, "completed");
  }
  eq_("D20 approved submission keeps its value", submission?.homeScore, 3);
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

async function adminUploadTests(): Promise<void> {
  console.log("\n=== I. ADMIN UPLOAD ON BEHALF OF PLAYERS ===");

  // The admin is NOT a participant in fixture two (Player A 2 vs Player B 2).
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

  // A player in the matchup uploads; the submission is bound to the game.
  as(teamPlayerA1);
  const upload = await call("POST", gamePath, screenshot, "image/png");
  eq_("J5 matchup player upload accepted", upload.status, 201);
  eq_("J6 submission is bound to the exact matchup", upload.body?.playerGameId, teamGameId);
  eq_("J7 submission also records the parent fixture", upload.body?.fixtureId, teamFixtureId);
  const gameSubmissionId = upload.body?.id;

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
  eq_("J14 duplicate pending submission blocked", (await call("POST", gamePath, screenshot, "image/png")).status, 409);

  // The opposing player in the same matchup may also submit.
  as(teamPlayerB1);
  const opposing = await call("POST", gamePath, screenshot, "image/png");
  eq_("J15 the opposing matchup player may also submit", opposing.status, 201);

  // Admin sees the submission in the queue with its player-matchup context.
  as(admin);
  const list = await call("GET", "/api/admin/match-result-submissions");
  const rows = (list.body as Array<Record<string, any>> | null) ?? [];
  const row = rows.find((r) => r.id === gameSubmissionId);
  check("J16 matchup submission appears in the verification queue", !!row, `id=${gameSubmissionId}`);
  if (row) {
    eq_("J17 queue row exposes the parent fixture", row.fixtureId, teamFixtureId);
    eq_("J18 queue row exposes the matchup id", row.playerGameId, teamGameId);
    eq_("J19 queue row shows the home player name", row.playerGame?.homePlayerName, "TeamA P1");
    eq_("J20 queue row shows the away player name", row.playerGame?.awayPlayerName, "TeamB P1");
  }

  // Approve → the matchup becomes completed and the parent propagates.
  const approve = await call("POST", `/api/admin/match-result-submissions/${gameSubmissionId}/approve`, {});
  eq_("J21 admin can approve a matchup submission", approve.status, 200);

  const [game] = await db.select().from(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.id, teamGameId));
  eq_("J22 matchup marked completed", game?.status, "completed");
  eq_("J23 matchup home score written", game?.homeScore, EXPECTED.homeScore);
  eq_("J24 matchup away score written", game?.awayScore, EXPECTED.awayScore);
  eq_("J25 matchup home shots written", game?.homeShots, EXPECTED.homeShots);
  eq_("J26 matchup home position written", game?.homePosition, EXPECTED.homePosition);
  eq_("J27 matchup yellow cards written", game?.homeYellowCards, EXPECTED.homeYellowCards);

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
    await adminUploadTests();
    await teamFixtureTests();
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


