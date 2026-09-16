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
import { shutdownOcrEngine } from "../src/lib/matchResultOcr";

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
  "homePosition", "awayPosition",
  "homeShots", "awayShots",
  "homeShotsOnTarget", "awayShotsOnTarget",
  "homeCorners", "awayCorners",
  "homeYellowCards", "awayYellowCards",
  "homeRedCards", "awayRedCards",
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
const EXPECT: Array<[string, number]> = [
  ["homeScore", 3], ["awayScore", 1],
  ["homePosition", 1], ["awayPosition", 2],
  ["homeShots", 8], ["awayShots", 4],
  ["homeShotsOnTarget", 5], ["awayShotsOnTarget", 2],
  ["homeCorners", 4], ["awayCorners", 2],
  ["homeYellowCards", 1], ["awayYellowCards", 2],
  ["homeRedCards", 0], ["awayRedCards", 0],
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
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (!usingFixture && fail > 0) {
  console.log("(Informational only — a custom screenshot was supplied.)");
  fail = 0;
}

await shutdownOcrEngine();
process.exit(fail === 0 ? 0 : 1);
