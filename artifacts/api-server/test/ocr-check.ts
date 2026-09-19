/**
 * OCR verification for the match-result screenshot pipeline.
 *
 * Exercises the *production* detection entry point
 * (`src/lib/matchResultDetection.ts#detectMatchResultFromImage`), which is exactly
 * what the upload route calls, and which delegates to the real OCR engine in
 * `src/lib/matchResultOcr.ts` (tesseract.js, local WASM).
 *
 * Run with:  pnpm --filter @workspace/api-server test:ocr
 * Or:        node test/run-ocr-check.mjs [path-to-screenshot.png]
 *
 * The expected values below describe the bundled fixture
 * `test/fixtures/efootball-match-result.png`. Point the argument at a different
 * screenshot to inspect what the engine reads from it (the assertions are then
 * reported as informational only).
 */
import { readFileSync } from "node:fs";
import { detectMatchResultFromImage, validateUploadedImage, assertSafeImage } from "../src/lib/matchResultDetection";
import { shutdownOcrEngine, detectMatchResultReading } from "../src/lib/matchResultOcr";

const src = process.argv[2] ?? "test/fixtures/efootball-match-result.png";
const bytes = readFileSync(src);
const usingFixture = /efootball-match-result\.png$/.test(src.replace(/\\/g, "/"));
console.log("FILE:", src, "| BYTES:", bytes.length);

// ── 1. Upload validation the route performs before detection ─────────────────
const contentType = "image/png";
console.log("\n=== UPLOAD VALIDATION ===");
console.log("validateUploadedImage:", validateUploadedImage(contentType, bytes));
console.log("assertSafeImage      :", JSON.stringify(await assertSafeImage(bytes)));

// ── 2. Production detection entry point ─────────────────────────────────────
const t0 = Date.now();
const d = await detectMatchResultFromImage(bytes, contentType);
const wall = Date.now() - t0;

console.log("\n=== DETECTION RESULT (route contract) ===");
console.log("ocrAvailable :", d.ocrAvailable);
console.log("ocrEngine    :", d.ocrEngine);
console.log("ocrError     :", d.ocrError);
console.log("durationMs   :", d.ocrDurationMs, "(wall", wall + "ms)");
console.log("homeName     :", JSON.stringify(d.homeName));
console.log("awayName     :", JSON.stringify(d.awayName));
console.log("score        :", d.homeScore, "-", d.awayScore);

const FIELDS = [
  "homePossession", "awayPossession",
  "homeShots", "awayShots",
  "homeShotsOnTarget", "awayShotsOnTarget",
  "homeCornerKicks", "awayCornerKicks",
  "homeOffside", "awayOffside",
  "homeFreeKicks", "awayFreeKicks",
  "homeFouls", "awayFouls",
  "homeSuccessfulPasses", "awaySuccessfulPasses",
  "homeCrosses", "awayCrosses",
  "homeInterceptions", "awayInterceptions",
  "homeTackles", "awayTackles",
  "homeSaves", "awaySaves",
] as const;

console.log("\n--- statistic fields ---");
for (const f of FIELDS) {
  const v = d[f] as number | null;
  const conf = d.confidence[f];
  const source = d.sources[f];
  console.log(
    `${f.padEnd(20)} ${String(v === null ? "NOT DETECTED" : v).padStart(12)}  source=${source ?? "-"} conf=${conf ?? "-"}`,
  );
}

console.log("\nuncertainFields:", JSON.stringify(d.uncertainFields));
console.log("notes:");
for (const n of d.notes) console.log("  -", n);

console.log("\n=== RAW TEXT READ BY OCR ===");
console.log(d.rawText.trim());

// ── 3. Assertions against the bundled fixture ───────────────────────────────
// Values rendered into test/fixtures/efootball-match-result.png by
// `node test/make-ocr-fixture.mjs`.
const EXPECT: Array<[string, number]> = [
  ["homeScore", 3], ["awayScore", 1],
  ["homePossession", 58], ["awayPossession", 42],
  ["homeShots", 8], ["awayShots", 4],
  ["homeShotsOnTarget", 5], ["awayShotsOnTarget", 2],
  ["homeCornerKicks", 4], ["awayCornerKicks", 2],
  ["homeOffside", 1], ["awayOffside", 2],
  ["homeFreeKicks", 12], ["awayFreeKicks", 9],
  ["homeFouls", 7], ["awayFouls", 10],
  ["homeSuccessfulPasses", 148], ["awaySuccessfulPasses", 121],
  ["homeCrosses", 6], ["awayCrosses", 3],
  ["homeInterceptions", 9], ["awayInterceptions", 11],
  ["homeTackles", 14], ["awayTackles", 16],
  ["homeSaves", 2], ["awaySaves", 5],
];

let pass = 0;
let fail = 0;
console.log("\n=== VERIFICATION vs EXPECTED SCREENSHOT CONTENT ===");
for (const [field, expected] of EXPECT) {
  const got = d[field as keyof typeof d] as number | null;
  const ok = got === expected;
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${field.padEnd(20)} expected ${expected}  got ${got}`);
}
// ─ 3b. Player names on the score line ──────────────────────────────────────
// The names on the screenshot are reported to the administrator as OCR
// information so they can identify each side when assigning the Home and Away
// players. (They are no longer matched against the registration: the admin
// makes that decision explicitly on the review screen.)
if (usingFixture) {
  console.log("\n=== PLAYER NAMES ON THE SCORE LINE ===");
  console.log(`home: ${JSON.stringify(d.homeName)} (conf ${d.homeNameConfidence})`);
  console.log(`away: ${JSON.stringify(d.awayName)} (conf ${d.awayNameConfidence})`);

  const namesOk = d.homeName !== null && d.awayName !== null;
  console.log(`${namesOk ? "PASS" : "FAIL"} both player names read off the screenshot (home=${d.homeName}, away=${d.awayName})`);
  if (namesOk) pass += 1; else fail += 1;

  const confOk = d.homeNameConfidence > 0 && d.awayNameConfidence > 0;
  console.log(`${confOk ? "PASS" : "FAIL"} name readings carry a confidence score`);
  if (confOk) pass += 1; else fail += 1;
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (!usingFixture && fail > 0) {
  console.log("(Informational only — a custom screenshot was supplied.)");
  fail = 0;
}

// ── 4. Repeat-pass regression guard ─────────────────────────────────────────
// Tesseract keeps its parameters on the worker between calls, so a pass that
// only sets *some* parameters (e.g. the digit repair pass setting psm 7 + a digit
// whitelist) used to leak into the next full-page pass, which then recognised
// nothing. Only a second recognition could expose that, so re-read the image and
// require the very same values.
if (usingFixture) {
  console.log("\n=== SECOND PASS (worker state must not leak between uploads) ===");
  const d2 = await detectMatchResultFromImage(bytes, contentType);
  let repeatFail = 0;
  for (const [field, expected] of EXPECT) {
    const got = d2[field as keyof typeof d2] as number | null;
    const ok = got === expected;
    if (ok) pass += 1;
    else { repeatFail += 1; fail += 1; }
    console.log(`${ok ? "PASS" : "FAIL"} repeat ${field.padEnd(14)} expected ${expected}  got ${got}`);
  }
  console.log(`\nSECOND PASS: ${EXPECT.length - repeatFail}/${EXPECT.length} fields read correctly`);
  console.log(`\nFINAL RESULT: ${pass} passed, ${fail} failed`);
}

// ── 5. Statistic inventory: exactly the 12 canonical statistics ─────────────
// Guards the naming contract directly: the OCR must report the renamed statistics
// and must NOT report a legacy label (Position / Corners / Yellow Cards /
// Red Cards) or a split "Passes" + "Successful" pair.
if (usingFixture) {
  console.log("\n=== STATISTIC INVENTORY (labels actually recognised) ===");
  const reading = await detectMatchResultReading(bytes);
  const labels = reading.rows.map((r) => r.label);
  const expectedLabels = [
    "Possession", "Shots", "ShotsOnTarget", "CornerKicks", "Offside", "FreeKicks",
    "Fouls", "SuccessfulPasses", "Crosses", "Interceptions", "Tackles", "Saves",
  ];
  const forbidden = ["Position", "Corners", "YellowCards", "RedCards", "Passes", "Successful"];
  console.log("labels:", JSON.stringify(labels));

  const inventoryOk = JSON.stringify(labels) === JSON.stringify(expectedLabels);
  console.log(`${inventoryOk ? "PASS" : "FAIL"} exactly the 12 canonical statistics, in order (got ${labels.length})`);
  if (inventoryOk) pass += 1; else fail += 1;

  const successes = labels.filter((l) => l === "SuccessfulPasses").length;
  const oneStatistic = successes === 1;
  console.log(`${oneStatistic ? "PASS" : "FAIL"} 'Successful Passes' is exactly ONE statistic (rows: ${successes})`);
  if (oneStatistic) pass += 1; else fail += 1;

  const leaked = forbidden.filter((f) => labels.includes(f as never));
  const noLegacy = leaked.length === 0;
  console.log(`${noLegacy ? "PASS" : "FAIL"} no legacy/duplicate statistic labels (found: ${JSON.stringify(leaked)})`);
  if (noLegacy) pass += 1; else fail += 1;

  console.log(`\nINVENTORY RESULT: ${pass} passed, ${fail} failed`);
}

await shutdownOcrEngine();
process.exit(fail === 0 ? 0 : 1);
