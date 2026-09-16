/**
 * Fixture match-result image validation + statistics extraction.
 *
 * Pipeline (see `detectMatchResultFromImage`):
 *   1. Verify the bytes really decode as a safe raster image (`assertSafeImage`,
 *      powered by `sharp`, already an api-server dependency and externalized by
 *      the build / lazily imported exactly like `lib/transcript.ts`).
 *   2. Read the text out of the screenshot with a real OCR engine
 *      (`detectMatchResultReading` in `matchResultOcr.ts` â€” tesseract.js running
 *      locally over WASM, no API key required). The engine is resolved lazily so
 *      a missing/broken engine degrades to "Not detected" instead of a crash.
 *   3. Map the recognised values onto the fixture's score + statistic fields.
 *
 * IMPORTANT (honesty over hallucination):
 *   OCR is best-effort. A value is only ever populated when the engine actually
 *   recognised a numeric token with sufficient confidence. When a value cannot be
 *   read we MUST NOT invent a number â€” the field stays `null` (`"Not detected"`)
 *   and the administrator confirms/corrects it on the review screen before
 *   approval. An unavailable engine only ever *removes* detected values; it never
 *   changes this fallback.
 */

import {
  OCR_ENGINE,
  detectMatchResultReading,
  type CanonicalStat,
  type OcrScreenshotReading,
} from "./matchResultOcr";

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_SHARP_FORMATS = new Set(["png", "jpeg", "webp", "gif"]);
const MAX_DIMENSION = 12000; // guard against decompression bombs

/**
 * Lazily load sharp the same way `lib/transcript.ts` does: a native-module
 * failure can then never crash the whole API server â€” only the upload endpoint
 * that needs it returns an error.
 */
async function loadSharp() {
  const { default: sharp } = await import("sharp");
  return sharp;
}

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

/**
 * Normalize the declared content-type and reject anything that is not a safe,
 * web-friendly image within the size limit.
 */
export function validateUploadedImage(contentType: string | undefined, bytes: Buffer): string {
  const rawType = (contentType ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(rawType as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw new ImageValidationError("Invalid file type. Upload a PNG, JPEG, WEBP or GIF image.");
  }
  if (bytes.length === 0) {
    throw new ImageValidationError("The uploaded file is empty.");
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new ImageValidationError("Image is too large. Maximum size is 8 MB.");
  }
  return rawType;
}

/**
 * Prove the bytes are a genuine, decodable raster image. This blocks files that
 * merely claim an image content-type (e.g. an SVG or HTML payload renamed to
 * `.png`) from ever being stored.
 */
export async function assertSafeImage(bytes: Buffer): Promise<{ format: string; width: number; height: number }> {
  let sharp: Awaited<ReturnType<typeof loadSharp>>;
  try {
    sharp = await loadSharp();
  } catch {
    // The native module is unavailable â€” refuse the upload rather than storing an
    // unverified file.
    throw new ImageValidationError("Image processing is unavailable on the server. Please try again later.");
  }

  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(bytes, { failOn: "error" }).metadata();
  } catch {
    throw new ImageValidationError("The file could not be decoded as an image.");
  }
  const format = (meta.format ?? "").toLowerCase();
  if (!ALLOWED_SHARP_FORMATS.has(format)) {
    throw new ImageValidationError("Invalid image format. Upload a PNG, JPEG, WEBP or GIF image.");
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new ImageValidationError("The image has no readable dimensions.");
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new ImageValidationError("The image dimensions are too large.");
  }
  return { format, width, height };
}

/**
 * The 14 numeric result fields, in display order.
 *
 * Kept as an explicit list so tests and serializers can enumerate exactly the
 * numeric payload without being affected by the OCR provenance metadata that
 * `DetectedResult` also carries.
 */
export const DETECTED_NUMERIC_FIELDS = [
  "homeScore",
  "awayScore",
  "homePosition",
  "awayPosition",
  "homeShots",
  "awayShots",
  "homeShotsOnTarget",
  "awayShotsOnTarget",
  "homeCorners",
  "awayCorners",
  "homeYellowCards",
  "awayYellowCards",
  "homeRedCards",
  "awayRedCards",
] as const;

export type DetectedNumericField = (typeof DETECTED_NUMERIC_FIELDS)[number];

export interface DetectedResult {
  homeScore: number | null;
  awayScore: number | null;
  homePosition: number | null;
  awayPosition: number | null;
  homeShots: number | null;
  awayShots: number | null;
  homeShotsOnTarget: number | null;
  awayShotsOnTarget: number | null;
  homeCorners: number | null;
  awayCorners: number | null;
  homeYellowCards: number | null;
  awayYellowCards: number | null;
  homeRedCards: number | null;
  awayRedCards: number | null;
  // â”€â”€ OCR provenance (surfaced to the administrator beside the screenshot) â”€â”€â”€
  /** True when the OCR engine actually ran and produced a reading. */
  ocrAvailable: boolean;
  /** Which engine performed the recognition. */
  ocrEngine: string;
  /** Why recognition failed, when it did. */
  ocrError: string | null;
  ocrDurationMs: number;
  /** Raw text the engine read â€” shown so the admin can audit the extraction. */
  rawText: string;
  /** Names read either side of the score (best effort, display only). */
  homeName: string | null;
  awayName: string | null;
  /** Per-field engine confidence (0â€“100); uncertain cells are highlighted. */
  confidence: Record<string, number>;
  /** Per-field provenance, e.g. "page" | "digit-pass" | "score" | "none". */
  sources: Record<string, string>;
  /** Field keys the engine could not confidently read ("Not detected"). */
  uncertainFields: string[];
  /** Human-readable summary of what was (or was not) detected. */
  notes: string[];
}

export function emptyDetection(): DetectedResult {
  return {
    homeScore: null,
    awayScore: null,
    homePosition: null,
    awayPosition: null,
    homeShots: null,
    awayShots: null,
    homeShotsOnTarget: null,
    awayShotsOnTarget: null,
    homeCorners: null,
    awayCorners: null,
    homeYellowCards: null,
    awayYellowCards: null,
    homeRedCards: null,
    awayRedCards: null,
    ocrAvailable: false,
    ocrEngine: OCR_ENGINE,
    ocrError: null,
    ocrDurationMs: 0,
    rawText: "",
    homeName: null,
    awayName: null,
    confidence: {},
    sources: {},
    uncertainFields: [],
    notes: [
      "The screenshot could not be read automatically, so no values were extracted.",
      "Review the screenshot and confirm/correct each field before approving.",
    ],
  };
}

/**
 * A stat row as it appears on a match screenshot: the label plus the ordered
 * values for the home team first and the away team second.
 */
const STAT_FIELD_PATTERNS: { field: NumericField; patterns: RegExp[] }[] = [
  { field: "homePosition", patterns: [/^\s*(?:position|pos|rank|placement)\b/i] },
  { field: "homeShotsOnTarget", patterns: [/^\s*shots?\s*on\s*target\b/i, /^\s*(?:sot|on\s*target)\b/i] },
  { field: "homeShots", patterns: [/^\s*(?:total\s*)?shots?\b/i] },
  { field: "homeCorners", patterns: [/^\s*corners?\b/i] },
  { field: "homeYellowCards", patterns: [/^\s*(?:yellow\s*cards?|yellows?|yc)\b/i] },
  { field: "homeRedCards", patterns: [/^\s*(?:red\s*cards?|reds?|rc)\b/i] },
];

/** The away counterpart of each home field. */
const AWAY_FIELD: Record<string, NumericField> = {
  homePosition: "awayPosition",
  homeShots: "awayShots",
  homeShotsOnTarget: "awayShotsOnTarget",
  homeCorners: "awayCorners",
  homeYellowCards: "awayYellowCards",
  homeRedCards: "awayRedCards",
};

const MAX_PLAUSIBLE_STAT = 999;

/** Normalize OCR noise so labels can be matched reliably. */
function normalizeLine(line: string): string {
  return line
    .replace(/[|_]/g, " ")
    .replace(/[Â·â€¢]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a line is clearly a statistics row rather than the score line. */
function isStatLine(line: string): boolean {
  return STAT_FIELD_PATTERNS.some(({ patterns }) => patterns.some((re) => re.test(line)));
}

/**
 * Parse OCR text into the match score and statistics.
 *
 * The screenshot layouts this project targets list one statistic per line with
 * the home value first and the away value second, e.g.
 *
 *     Manchester United 3 - 1 Liverpool
 *     Position          1     2
 *     Shots             8     4
 *     Shots on Target   5     2
 *
 * Anything that cannot be read as two plausible integers on a recognized row is
 * left `null` so the administrator is asked to confirm it ("Not detected").
 */
export function parseMatchStatsFromText(rawText: string): DetectedResult {
  const detected = emptyDetection();
  detected.notes = [];

  const lines = (rawText ?? "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((l) => l.length > 0);

  let sawStatRow = false;

  for (const line of lines) {
    // â”€â”€ Score (never take numbers off a statistics row) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!isStatLine(line) && detected.homeScore === null) {
      const score = line.match(/\b(\d{1,2})\s*(?:[-â€“â€”:x]|\s-\s)\s*(\d{1,2})\b/i);
      if (score) {
        const home = Number(score[1]);
        const away = Number(score[2]);
        if (home <= MAX_PLAUSIBLE_STAT && away <= MAX_PLAUSIBLE_STAT) {
          detected.homeScore = home;
          detected.awayScore = away;
          continue;
        }
      }
    }

    // â”€â”€ Statistics rows: label followed by home & away values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    for (const { field, patterns } of STAT_FIELD_PATTERNS) {
      if (!patterns.some((re) => re.test(line))) continue;

      // Strip the label itself, then read the two leading integers that follow.
      const numbers = line.match(/\d+/g);
      if (!numbers || numbers.length < 2) continue;

      const home = Number(numbers[0]);
      const away = Number(numbers[1]);
      if (home > MAX_PLAUSIBLE_STAT || away > MAX_PLAUSIBLE_STAT) continue;

      detected[field] = home;
      detected[AWAY_FIELD[field]] = away;
      sawStatRow = true;
      break;
    }
  }

  const missing: string[] = [];
  if (detected.homeScore === null || detected.awayScore === null) missing.push("score");
  if (!sawStatRow) missing.push("statistics");

  if (missing.length === 0) {
    detected.notes.push("Score and statistics read from the screenshot â€” confirm before approving.");
  } else {
    detected.notes.push(
      `Could not confidently read the ${missing.join(" and ")} from the screenshot.`,
      "Confirm or correct every field marked \"Not detected\" before approving.",
    );
  }
  return detected;
}
// â”€â”€ OCR reading â†’ fixture statistic mapping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Maps each recognised statistic row onto its home/away detection fields. */
const ROW_TO_FIELD: Record<CanonicalStat, { home: NumericField; away: NumericField }> = {
  Position: { home: "homePosition", away: "awayPosition" },
  Shots: { home: "homeShots", away: "awayShots" },
  ShotsOnTarget: { home: "homeShotsOnTarget", away: "awayShotsOnTarget" },
  Corners: { home: "homeCorners", away: "awayCorners" },
  YellowCards: { home: "homeYellowCards", away: "awayYellowCards" },
  RedCards: { home: "homeRedCards", away: "awayRedCards" },
};

/** The numeric detection fields (everything except the OCR metadata block). */
type NumericField = Exclude<
  keyof DetectedResult,
  | "notes"
  | "ocrAvailable"
  | "ocrEngine"
  | "ocrError"
  | "ocrDurationMs"
  | "rawText"
  | "homeName"
  | "awayName"
  | "confidence"
  | "sources"
  | "uncertainFields"
>;

/** Human labels used in the "Not detected" summary shown to the admin. */
const FIELD_LABEL: Record<string, string> = {
  homeScore: "home score",
  awayScore: "away score",
  homePosition: "home position",
  awayPosition: "away position",
  homeShots: "home shots",
  awayShots: "away shots",
  homeShotsOnTarget: "home shots on target",
  awayShotsOnTarget: "away shots on target",
  homeCorners: "home corners",
  awayCorners: "away corners",
  homeYellowCards: "home yellow cards",
  awayYellowCards: "away yellow cards",
  homeRedCards: "home red cards",
  awayRedCards: "away red cards",
};

/** Reject implausible values so OCR noise can never become an official statistic. */
function bounded(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0 || value > MAX_PLAUSIBLE_STAT) return null;
  return value;
}

/**
 * Project an OCR reading onto the fixture's detection fields.
 *
 * Only values the engine actually recognised are copied across. A field with no
 * confident reading stays `null` and is listed in `uncertainFields` so the review
 * screen can highlight it as "Not detected" for the administrator to complete.
 */
export function mapReadingToDetection(reading: OcrScreenshotReading): DetectedResult {
  const detected = emptyDetection();
  detected.notes = [];

  detected.ocrAvailable = reading.available;
  detected.ocrEngine = reading.engine || OCR_ENGINE;
  detected.ocrError = reading.error;
  detected.ocrDurationMs = reading.durationMs;
  detected.rawText = reading.fullText;
  detected.homeName = reading.homeName;
  detected.awayName = reading.awayName;

  // â”€â”€ Score â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  detected.homeScore = bounded(reading.homeScore);
  detected.awayScore = bounded(reading.awayScore);
  detected.sources.homeScore = detected.homeScore === null ? "none" : "score";
  detected.sources.awayScore = detected.awayScore === null ? "none" : "score";
  if (detected.homeScore !== null) detected.confidence.homeScore = reading.homeScoreConfidence;
  if (detected.awayScore !== null) detected.confidence.awayScore = reading.awayScoreConfidence;

  // â”€ Statistic rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (const row of reading.rows) {
    const fields = ROW_TO_FIELD[row.label];
    if (!fields) continue;

    const home = bounded(row.home);
    const away = bounded(row.away);

    detected[fields.home] = home;
    detected[fields.away] = away;
    detected.sources[fields.home] = home === null ? "none" : row.homeSource;
    detected.sources[fields.away] = away === null ? "none" : row.awaySource;
    if (home !== null) detected.confidence[fields.home] = row.homeConfidence;
    if (away !== null) detected.confidence[fields.away] = row.awayConfidence;
  }

  // â”€â”€ Report every field the administrator has to complete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (const key of Object.keys(FIELD_LABEL)) {
    if (detected[key as NumericField] === null) detected.uncertainFields.push(key);
  }

  const missing = detected.uncertainFields.map((key) => FIELD_LABEL[key] ?? key);
  if (!reading.available) {
    detected.notes.push(
      reading.error
        ? `Automatic reading was unavailable (${reading.error}). Every value must be confirmed by hand.`
        : "Automatic reading was unavailable. Every value must be confirmed by hand.",
    );
  } else if (missing.length === 0) {
    detected.notes.push("Score and statistics were read from the screenshot â€” confirm before approving.");
  } else {
    detected.notes.push(
      `Could not confidently read: ${missing.join(", ")}.`,
      'Confirm or correct every field marked "Not detected" before approving.',
    );
  }
  for (const warning of reading.warnings) detected.notes.push(warning);

  return detected;
}

/**
 * Run OCR against an uploaded screenshot and map the result onto the fixture's
 * statistic fields.
 *
 * Values are only ever populated when the engine recognised a numeric token with
 * sufficient confidence; anything uncertain stays `null` ("Not detected") so no
 * number is ever invented. An unavailable engine still lets the upload succeed â€”
 * the administrator simply confirms every field by hand.
 */
export async function detectMatchResultFromImage(
  bytes: Buffer,
  _contentType: string,
): Promise<DetectedResult> {
  try {
    const reading = await detectMatchResultReading(bytes);
    return mapReadingToDetection(reading);
  } catch (err) {
    const failed = emptyDetection();
    failed.ocrError = err instanceof Error ? err.message : String(err);
    failed.notes = [
      `Automatic reading failed (${failed.ocrError}).`,
      "Confirm or correct every field before approving.",
    ];
    return failed;
  }
}
/** Format a detected value for display â€” null renders as "Not detected". */
export function displayDetected(value: number | null): string {
  return value === null ? "Not detected" : String(value);
}

/** Validate that a submitted integer is a whole, non-negative number (or null). */
export function isNullableCount(value: unknown): value is number | null {
  if (value === null || value === undefined) return true;
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
