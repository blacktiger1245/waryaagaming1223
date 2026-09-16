/**
 * Real OCR / image-text recognition for match-result screenshots.
 *
 * Engine: `tesseract.js` â€” a WASM build of Tesseract that runs entirely inside
 * the api-server process. It needs **no API key, no network access and no
 * external service**, which is why it is the engine of choice for this project:
 * the deployment target (a Render-hosted Node service) cannot be relied on to
 * reach a third-party vision API, and shipping match screenshots to an external
 * provider would leak player data. `tesseract.js` is already a declared
 * dependency of `artifacts/api-server`.
 *
 * Recognition pipeline
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *   Pass 1 â€” full page:       `sharp` normalises the image (EXIF rotation,
 *                             greyscale, contrast stretch, upscale to 2200px),
 *                             then Tesseract reads the whole page and returns
 *                             every word with its pixel bounding box.
 *   Layout parsing:           words are clustered into lines. Statistic rows are
 *                             identified by their *label* (position, shots,
 *                             shots on target, corners, yellow cards, red cards)
 *                             and the two numbers either side of that label are
 *                             read from their geometric columns.
 *   Pass 2 â€” digit repair:    any cell that pass 1 could not turn into a clean
 *                             number (e.g. `pi` where `2` was printed) is
 *                             cropped and re-read on its own with a digits-only
 *                             whitelist. This is what makes small scoreboard
 *                             digits legible.
 *
 * Honesty rules (non-negotiable)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *   â€¢ A value is only ever returned when a numeric token was actually
 *     recognised. Nothing is guessed, interpolated or carried over between rows.
 *   â€¢ A cell containing two *conflicting* numbers is ambiguous â†’ returned as
 *     `null` so the administrator decides.
 *   â€¢ If the engine is missing, unreachable or times out, every value is `null`
 *     and `available:false` is reported â€” the upload still succeeds and the
 *     admin fills the fields in by hand. OCR never blocks a submission.
 */

export interface OcrWord {
  text: string;
  confidence: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The statistic rows this project understands. */
export type CanonicalStat =
  | "Position"
  | "Shots"
  | "ShotsOnTarget"
  | "Corners"
  | "YellowCards"
  | "RedCards";

/** Which pass produced a recognised number. */
export type OcrValueSource = "page" | "digit-pass" | "none";

/** One statistic row: both sides plus how each side was obtained. */
export interface OcrStatRow {
  label: CanonicalStat;
  home: number | null;
  away: number | null;
  homeConfidence: number;
  awayConfidence: number;
  homeSource: OcrValueSource;
  awaySource: OcrValueSource;
  /** Non-fatal observation for the admin (e.g. shots-on-target > shots). */
  warning: string | null;
}

export interface OcrScreenshotReading {
  /** `false` â‡’ engine unavailable/timed out; every value must be treated as NULL. */
  available: boolean;
  engine: string;
  /** Populated when something went wrong, so the admin UI can explain itself. */
  error: string | null;
  durationMs: number;
  /** Raw full-page text â€” shown to the admin for transparency and debugging. */
  fullText: string;
  /** Full-page word boxes (used for the admin's confidence display). */
  words: OcrWord[];
  /** Dimensions of the preprocessed image the boxes refer to. */
  width: number;
  height: number;
  /** One entry per canonical statistic row. */
  rows: OcrStatRow[];
  /** Participant names read either side of the score (best effort, display only). */
  homeName: string | null;
  awayName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeScoreConfidence: number;
  awayScoreConfidence: number;
  /** Warnings that concern the whole reading rather than a single cell. */
  warnings: string[];
}

export const OCR_ENGINE = "tesseract.js (local WASM Tesseract â€” offline, no API key required)";
export const OCR_LANG = process.env.MATCH_RESULT_OCR_LANG?.trim() || "eng";

/**
 * Where Tesseract finds its language data.
 *
 * Tesseract needs one `traineddata` file per language (~5 MB for English). Out of
 * the box tesseract.js downloads it from a public CDN on first use and caches it
 * next to the process working directory, so later runs — and later restarts — are
 * fully offline.
 *
 * Air-gapped, rate-limited or reproducible deployments can pre-seed that file and
 * point `MATCH_RESULT_OCR_LANG_PATH` at the directory containing it (and
 * `MATCH_RESULT_OCR_CACHE_PATH` at a writable cache dir). Both default to the
 * tesseract.js behaviour when unset, so no configuration is required to start.
 * When the language data can be neither downloaded nor found, recognition reports
 * `available:false` and every field falls back to "Not detected".
 */
export const OCR_LANG_PATH = process.env.MATCH_RESULT_OCR_LANG_PATH?.trim() || undefined;
export const OCR_CACHE_PATH = process.env.MATCH_RESULT_OCR_CACHE_PATH?.trim() || undefined;

/** Upper bound for one screenshot, including the digit pass. */
const OCR_TIMEOUT_MS = Number(process.env.MATCH_RESULT_OCR_TIMEOUT_MS ?? 90_000);
const MAX_OCR_WIDTH = 2200;
/** Below this word confidence a reading is treated as unreliable. */
const MIN_WORD_CONFIDENCE = 40;
/** Below this confidence a digit-pass reading is treated as unreliable. */
const MIN_DIGIT_CONFIDENCE = 30;
const MAX_PLAUSIBLE_STAT = 999;

/** Set `MATCH_RESULT_OCR_DEBUG=1` to trace the recognition passes in the server log. */
const OCR_DEBUG = /^(1|true|yes)$/i.test(process.env.MATCH_RESULT_OCR_DEBUG ?? "");

function ocrDebug(message: string, detail?: unknown): void {
  if (!OCR_DEBUG) return;
  // eslint-disable-next-line no-console
  console.log(`[match-result-ocr] ${message}`, detail === undefined ? "" : detail);
}

// â”€â”€ sharp (image preprocessing) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface SharpInstance {
  rotate(): SharpInstance;
  greyscale(): SharpInstance;
  normalize(): SharpInstance;
  resize(options: Record<string, unknown>): SharpInstance;
  extract(options: Record<string, unknown>): SharpInstance;
  png(): SharpInstance;
  composite(inputs: Array<Record<string, unknown>>): SharpInstance;
  toBuffer(): Promise<Buffer>;
  metadata(): Promise<Record<string, unknown>>;
}

type SharpFactory = (input: Buffer | Record<string, unknown>, options?: Record<string, unknown>) => SharpInstance;

let sharpPromise: Promise<SharpFactory> | null = null;

/**
 * Lazily load sharp exactly like `lib/transcript.ts` does, so a native-module
 * failure can never crash the API server â€” only OCR degrades.
 */
export async function loadSharp(): Promise<SharpFactory> {
  if (!sharpPromise) {
    sharpPromise = (async () => {
      const mod = (await import("sharp")) as unknown as { default?: unknown };
      const factory = (mod.default ?? mod) as unknown as SharpFactory;
      if (typeof factory !== "function") throw new Error("sharp is unavailable");
      return factory;
    })().catch((err) => {
      sharpPromise = null;
      throw err;
    });
  }
  return sharpPromise;
}

// â”€â”€ tesseract.js (recognition engine) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface TesseractWorker {
  recognize(image: Buffer, options?: unknown, output?: unknown): Promise<{ data: Record<string, unknown> }>;
  setParameters(params: Record<string, string>): Promise<unknown>;
  terminate(): Promise<unknown>;
}

interface TesseractWorkerOptions {
  langPath?: string;
  cachePath?: string;
}

interface TesseractModule {
  createWorker(lang: string, oem?: number, options?: TesseractWorkerOptions): Promise<TesseractWorker>;
}

/**
 * Language-data override passed to tesseract.js. Empty unless the operator set
 * `MATCH_RESULT_OCR_LANG_PATH` / `MATCH_RESULT_OCR_CACHE_PATH`.
 */
function workerOptions(): TesseractWorkerOptions {
  const options: TesseractWorkerOptions = {};
  if (OCR_LANG_PATH) options.langPath = OCR_LANG_PATH;
  if (OCR_CACHE_PATH) options.cachePath = OCR_CACHE_PATH;
  return options;
}

let workerPromise: Promise<TesseractWorker> | null = null;
/** Set once the engine has definitively failed, so we stop retrying per upload. */
let engineDisabledReason: string | null = null;

/**
 * The worker is created once and reused: starting Tesseract costs ~2s, while a
 * subsequent page recognition costs ~3s. Booting it per upload would be wasteful.
 */
async function getWorker(): Promise<TesseractWorker> {
  if (engineDisabledReason) throw new Error(engineDisabledReason);
  if (!workerPromise) {
    workerPromise = (async () => {
      const mod = (await import("tesseract.js")) as unknown as TesseractModule;
      if (typeof mod.createWorker !== "function") {
        throw new Error("tesseract.js is installed but exposes no createWorker()");
      }
      return mod.createWorker(OCR_LANG, undefined, workerOptions());
    })().catch((err) => {
      workerPromise = null;
      engineDisabledReason = err instanceof Error ? err.message : String(err);
      throw err;
    });
  }
  return workerPromise;
}

/**
 * Release the Tesseract worker. Long-lived API processes keep the worker cached for
 * speed; this exists so a shutdown (or a test runner) can let the process exit.
 */
export async function shutdownOcrEngine(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // Nothing to release.
  }
}

/** Guard every engine call so one pathological screenshot cannot hang the API. */
async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${OCR_TIMEOUT_MS}ms`)), OCR_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** An all-NULL reading, used whenever the engine cannot be used at all. */
export function unavailableReading(error: string, durationMs = 0): OcrScreenshotReading {
  return {
    available: false,
    engine: OCR_ENGINE,
    error,
    durationMs,
    fullText: "",
    words: [],
    width: 0,
    height: 0,
    rows: [],
    homeName: null,
    awayName: null,
    homeScore: null,
    awayScore: null,
    homeScoreConfidence: 0,
    awayScoreConfidence: 0,
    warnings: [error],
  };
}

// â”€â”€ Text / geometry helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface OcrLine {
  y0: number;
  y1: number;
  centerY: number;
  height: number;
  words: OcrWord[];
}

/** Letters only, lowercased â€” makes label matching immune to OCR punctuation. */
function lettersOnly(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, "");
}

/** Flatten tesseract.js's nested block/paragraph/line/word tree. */
function collectWords(data: Record<string, unknown>): OcrWord[] {
  const words: OcrWord[] = [];
  const blocks = (data.blocks ?? []) as Array<Record<string, unknown>>;
  for (const block of blocks) {
    for (const paragraph of (block.paragraphs ?? []) as Array<Record<string, unknown>>) {
      for (const line of (paragraph.lines ?? []) as Array<Record<string, unknown>>) {
        for (const word of (line.words ?? []) as Array<Record<string, unknown>>) {
          const bbox = word.bbox as Partial<Box> | undefined;
          const text = typeof word.text === "string" ? word.text : "";
          if (!text.trim() || !bbox) continue;
          words.push({
            text,
            confidence: Number(word.confidence ?? 0),
            x0: Number(bbox.x0 ?? 0),
            y0: Number(bbox.y0 ?? 0),
            x1: Number(bbox.x1 ?? 0),
            y1: Number(bbox.y1 ?? 0),
          });
        }
      }
    }
  }
  return words;
}

interface RecognizeResult {
  text: string;
  words: OcrWord[];
  confidence: number;
}

/**
 * Tesseract parameter sets for the two passes.
 *
 * These are always applied in full (see `recognize`): parameters are sticky on
 * the worker, so a partial update from one pass would corrupt the other. The
 * empty whitelist on the page pass is what *clears* the digit whitelist.
 */
/**
 * Page-pass segmentation mode.
 *
 * psm 6 (a single uniform block of text) is what this engine's layout detection
 * is tuned for and what tesseract.js uses by default; other modes were measured
 * against the reference eFootball screenshot and read noticeably fewer cells
 * (psm 3 → 2/14, psm 4 → 12/14, psm 6 → 14/14). Overridable so an operator can
 * tune recognition for an unusual scoreboard layout without a code change.
 */
const PAGE_PSM = process.env.MATCH_RESULT_OCR_PAGE_PSM?.trim() || "6";

const PAGE_RECOGNIZE_PARAMS: Record<string, string> = {
  tessedit_pageseg_mode: PAGE_PSM,
  tessedit_char_whitelist: "",
};
const DIGIT_RECOGNIZE_PARAMS: Record<string, string> = {
  tessedit_pageseg_mode: "7", // treat the crop as a single text line
  tessedit_char_whitelist: "0123456789",
};

async function recognize(
  worker: TesseractWorker,
  image: Buffer,
  params: Record<string, string>,
): Promise<RecognizeResult> {
  // Always send the *complete* parameter set. Tesseract keeps parameters on the
  // worker between calls, so updating only one key leaks the digit pass's
  // single-line mode (`psm 7`) and digit whitelist into the next full-page pass,
  // which then recognises almost nothing. Every pass states its own mode and
  // whitelist explicitly so the two passes can never contaminate each other.
  await worker.setParameters(params);
  const result = await worker.recognize(image, {}, { text: true, blocks: true });
  const data = (result?.data ?? {}) as Record<string, unknown>;
  return {
    text: typeof data.text === "string" ? data.text : "",
    words: collectWords(data),
    confidence: Number(data.confidence ?? 0),
  };
}

/**
 * Reduce a recognised token to digits.
 *
 * `1]` â†’ `"1"` is accepted (trailing OCR punctuation is extremely common), but a
 * token containing no digit at all (`pi` where `2` was printed) returns `null` so
 * the digit pass gets a chance to re-read that cell.
 */
function digitsOf(text: string): string | null {
  const digits = text.replace(/[^0-9]/g, "");
  if (!digits || digits.length > 3) return null;
  return digits;
}

function toPlausibleCount(digits: string): number | null {
  const value = Number(digits);
  if (!Number.isInteger(value) || value < 0 || value > MAX_PLAUSIBLE_STAT) return null;
  return value;
}

/**
 * Find the single unambiguous number inside a box from the page pass.
 * Returns `null` when nothing numeric is there, or when two conflicting numbers
 * are â€” an ambiguous cell is never guessed; it is handed to the digit pass and
 * ultimately to the admin.
 */
function numberInBox(words: OcrWord[], box: Box): { value: number; confidence: number } | null {
  const inside = words.filter((w) => {
    const cx = (w.x0 + w.x1) / 2;
    const cy = (w.y0 + w.y1) / 2;
    return cx >= box.x0 && cx <= box.x1 && cy >= box.y0 && cy <= box.y1;
  });

  const candidates = inside
    .map((w) => ({ digits: digitsOf(w.text), confidence: w.confidence }))
    .filter((c): c is { digits: string; confidence: number } => !!c.digits && c.confidence >= MIN_WORD_CONFIDENCE);
  if (!candidates.length) return null;
  if (new Set(candidates.map((c) => c.digits)).size > 1) return null;

  const value = toPlausibleCount(candidates[0]!.digits);
  if (value === null) return null;
  return { value, confidence: candidates[0]!.confidence };
}

/** Cluster word boxes into visual lines, leftâ†’right within each line. */
function groupIntoLines(words: OcrWord[]): OcrLine[] {
  const sorted = [...words].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const lines: OcrLine[] = [];

  for (const word of sorted) {
    const centerY = (word.y0 + word.y1) / 2;
    const height = Math.max(1, word.y1 - word.y0);
    const last = lines[lines.length - 1];
    // Same line when vertical centres nearly coincide â€” tolerant of ascenders and
    // descenders, which is what keeps `Shots on Target` on a single line.
    if (last && Math.abs(centerY - last.centerY) <= Math.max(height, last.height) * 0.7) {
      last.words.push(word);
      last.centerY = (last.centerY * (last.words.length - 1) + centerY) / last.words.length;
      last.height = Math.max(last.height, height);
      last.y0 = Math.min(last.y0, word.y0);
      last.y1 = Math.max(last.y1, word.y1);
    } else {
      lines.push({ y0: word.y0, y1: word.y1, centerY, height, words: [word] });
    }
  }

  for (const line of lines) line.words.sort((a, b) => a.x0 - b.x0);
  return lines;
}

/** The recognisable label of a statistic row, in match priority order. */
const STAT_LABELS: Array<{ label: CanonicalStat; matches: (letters: string) => boolean }> = [
  // `Shots on Target` must be tested before `Shots` â€” it is the more specific one.
  { label: "ShotsOnTarget", matches: (t) => t.includes("shotsontarget") || t.includes("ontarget") || t === "sot" },
  { label: "Position", matches: (t) => t === "position" || t === "pos" || t === "rank" || t === "placement" },
  { label: "Corners", matches: (t) => t.startsWith("corner") },
  {
    label: "YellowCards",
    matches: (t) => t === "yc" || t === "ye" || t === "yel" || t.startsWith("yell"),
  },
  { label: "RedCards", matches: (t) => t === "rc" || t === "red" || t.startsWith("redcards") },
  { label: "Shots", matches: (t) => t === "sh" || t.startsWith("shot") },
];

/** The canonical order rows are reported in. */
const CANONICAL_ORDER: CanonicalStat[] = [
  "Position",
  "Shots",
  "ShotsOnTarget",
  "Corners",
  "YellowCards",
  "RedCards",
];

/** Identify the statistic a line describes, or `null` when it is not a stat row. */
function statisticOf(line: OcrLine): CanonicalStat | null {
  const letters = lettersOnly(line.words.map((w) => w.text).join(" "));
  if (!letters) return null;
  // A statistics row always carries at least one number.
  if (!line.words.some((w) => digitsOf(w.text) !== null)) return null;
  for (const { label, matches } of STAT_LABELS) if (matches(letters)) return label;
  return null;
}

// â”€ Pass 2: digit repair on isolated cells â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CELL_RENDER_HEIGHT = 90;
const CELL_SCALE = 4;

/**
 * Re-read one isolated numeric cell with a digits-only whitelist.
 *
 * Isolated digits are read far more reliably one cell at a time in
 * single-line mode (`psm 7`). Batched multi-cell strips were tested against the
 * reference eFootball screenshot and intermittently returned nothing, so each
 * cell gets its own job. Only cells the page pass missed or misread get here, so
 * the number of jobs stays small in practice.
 *
 * The crop hugs the glyph (`pad` scales with the digit's own width) because
 * Tesseract rejects a lone digit adrift in white space.
 */
async function readDigitCell(
  worker: TesseractWorker,
  prepared: Buffer,
  box: Box,
): Promise<{ value: number; confidence: number } | null> {
  const sharp = await loadSharp().catch(() => null);
  if (!sharp) return null;

  const boxWidth = Math.max(1, box.x1 - box.x0);
  const boxHeight = Math.max(1, box.y1 - box.y0);
  const pad = Math.max(6, Math.round(boxWidth * 0.18));
  const left = Math.max(0, Math.round(box.x0) - pad);
  const top = Math.max(0, Math.round(box.y0) - pad);
  const width = Math.max(1, Math.round(boxWidth) + pad * 2);
  const height = Math.max(1, Math.round(boxHeight) + pad * 2);

  let tile: Buffer;
  try {
    const crop = await sharp(prepared)
      .extract({ left, top, width, height })
      .resize({ height: CELL_RENDER_HEIGHT, fit: "contain", background: "#ffffff" })
      .toBuffer();
    // Upscaling the small digits is what makes them legible to Tesseract.
    tile = await sharp(crop)
      .resize({ width: width * CELL_SCALE, kernel: "lanczos3" })
      .png()
      .toBuffer();
  } catch {
    return null;
  }

  try {
    const result = await recognize(worker, tile, DIGIT_RECOGNIZE_PARAMS);

    const candidates = result.words
      .map((w) => ({ digits: digitsOf(w.text), confidence: w.confidence }))
      .filter((c): c is { digits: string; confidence: number } => !!c.digits && c.confidence >= MIN_DIGIT_CONFIDENCE);

    if (candidates.length) {
      // Two different numbers in one cell is ambiguous â€” leave it to the admin.
      if (new Set(candidates.map((c) => c.digits)).size > 1) return null;
      const value = toPlausibleCount(candidates[0]!.digits);
      if (value === null) return null;
      return { value, confidence: candidates[0]!.confidence };
    }

    // Single-line mode sometimes reports the digits only in the raw text.
    const digits = digitsOf(result.text);
    if (digits === null) return null;
    const value = toPlausibleCount(digits);
    if (value === null) return null;
    return { value, confidence: Math.max(result.confidence, MIN_DIGIT_CONFIDENCE + 1) };
  } catch {
    return null;
  }
}

/**
 * Run the digit pass over every cell the page pass could not trust.
 * Anything still unreadable is simply absent from the map â‡’ "Not detected".
 */
async function readDigitCells(
  worker: TesseractWorker,
  prepared: Buffer,
  cells: Array<{ id: string; box: Box }>,
): Promise<Map<string, { value: number; confidence: number }>> {
  const out = new Map<string, { value: number; confidence: number }>();
  if (!cells.length) return out;

  ocrDebug(
    "digit pass start",
    cells.map(
      (c) =>
        `${c.id}@${Math.round(c.box.x0)},${Math.round(c.box.y0)}-${Math.round(c.box.x1)},${Math.round(c.box.y1)}`,
    ),
  );

  for (const cell of cells) {
    const read = await readDigitCell(worker, prepared, cell.box);
    if (!read) continue;
    out.set(cell.id, read);
    ocrDebug("digit pass hit", { id: cell.id, value: read.value, confidence: Math.round(read.confidence) });
  }

  return out;
}
// â”€ Image preparation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface PreparedImage {
  bytes: Buffer;
  width: number;
  height: number;
}

/**
 * Normalise a screenshot for recognition: honour the EXIF rotation, drop colour
 * (Tesseract reads luminance), stretch contrast, and upscale small phone
 * screenshots so the scoreboard digits are large enough to be recognised.
 *
 * Preprocessing must never block recognition â€” any failure falls back to using
 * the original bytes, and the geometry then simply matches the original size.
 */
async function prepareImage(bytes: Buffer): Promise<PreparedImage> {
  try {
    const sharp = await loadSharp();
    const prepared = await sharp(bytes)
      .rotate()
      .greyscale()
      .normalize()
      .resize({ width: MAX_OCR_WIDTH, fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();
    const meta = await sharp(prepared).metadata();
    return {
      bytes: prepared,
      width: Number(meta.width ?? 0),
      height: Number(meta.height ?? 0),
    };
  } catch {
    return { bytes, width: 0, height: 0 };
  }
}

// â”€ Score line detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Tokens that sit between the two scores on a results screen. */
const SCORE_SEPARATORS = new Set(["-", "â€“", "â€”", ":", "x", "vs", "v", "l"]);

interface ScoreReading {
  home: number | null;
  away: number | null;
  homeConfidence: number;
  awayConfidence: number;
  homeName: string | null;
  awayName: string | null;
  homeWord: OcrWord | null;
  awayWord: OcrWord | null;
  line: OcrLine | null;
}

function emptyScoreReading(): ScoreReading {
  return {
    home: null,
    away: null,
    homeConfidence: 0,
    awayConfidence: 0,
    homeName: null,
    awayName: null,
    homeWord: null,
    awayWord: null,
    line: null,
  };
}

/** Join candidate display words into a participant name, or `null`. */
function nameFromWords(words: OcrWord[]): string | null {
  const parts = words
    .map((w) => w.text.replace(/[^A-Za-z0-9 .'&_-]/g, "").trim())
    .filter((t) => t.length > 0);
  const name = parts.join(" ").replace(/\s+/g, " ").trim();
  return name.length >= 2 ? name : null;
}

/**
 * Locate the score line and the participant names either side of it.
 *
 * The result line is the non-statistics line with the strongest evidence of being
 * a score: a separator token between the two numbers, the tallest text on the
 * page, positioned in the upper half, and carrying exactly two numbers.
 * Candidates are *ranked* rather than filtered so an unusual layout still yields a
 * best effort â€” and whatever is chosen is then re-verified by the digit pass.
 */
function findScoreLine(lines: OcrLine[], imageHeight: number): ScoreReading {
  const candidates: Array<{ line: OcrLine; score: number; numeric: OcrWord[] }> = [];

  for (const line of lines) {
    // A statistics row can never be the score line.
    if (statisticOf(line) !== null) continue;
    const numeric = line.words.filter((w) => digitsOf(w.text) !== null);
    if (numeric.length < 2 || numeric.length > 4) continue;

    let score = 0;
    const first = numeric[0]!;
    const last = numeric[numeric.length - 1]!;
    const between = line.words.filter((w) => w.x0 >= first.x1 && w.x1 <= last.x0);
    if (between.some((w) => SCORE_SEPARATORS.has(w.text.trim().toLowerCase()))) score += 3;
    if (numeric.length === 2) score += 1;
    if (imageHeight > 0 && line.centerY < imageHeight * 0.5) score += 1;
    candidates.push({ line, score, numeric });
  }

  if (!candidates.length) return emptyScoreReading();

  const maxHeight = Math.max(...candidates.map((c) => c.line.height));
  for (const candidate of candidates) {
    if (candidate.line.height >= maxHeight * 0.95) candidate.score += 2;
  }
  candidates.sort((a, b) => b.score - a.score);

  const winner = candidates[0]!;
  const homeWord = winner.numeric[0]!;
  const awayWord = winner.numeric[winner.numeric.length - 1]!;

  const left = winner.line.words.filter((w) => w.x1 <= homeWord.x0 && lettersOnly(w.text).length > 0);
  const right = winner.line.words.filter((w) => w.x0 >= awayWord.x1 && lettersOnly(w.text).length > 0);

  return {
    home: toPlausibleCount(digitsOf(homeWord.text) ?? ""),
    away: toPlausibleCount(digitsOf(awayWord.text) ?? ""),
    homeConfidence: digitsOf(homeWord.text) ? homeWord.confidence : 0,
    awayConfidence: digitsOf(awayWord.text) ? awayWord.confidence : 0,
    // The words nearest the score form the name, e.g. `Player A` / `Player B`.
    homeName: nameFromWords(left.slice(-3)),
    awayName: nameFromWords(right.slice(0, 3)),
    homeWord,
    awayWord,
    line: winner.line,
  };
}

// â”€ Statistic extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface SideValue {
  value: number | null;
  confidence: number;
  source: OcrValueSource;
}

interface RowWork {
  label: CanonicalStat;
  line: OcrLine;
  home: SideValue;
  away: SideValue;
  homeBox: Box | null;
  awayBox: Box | null;
}

const NOT_READ: SideValue = { value: null, confidence: 0, source: "none" };

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Read a statistic row by splitting the line at its label.
 *
 * Everything left of the label belongs to the home side and everything right of
 * it to the away side. Using the *alphabetic* words to bound the label makes this
 * resilient to the numeric columns moving between layouts.
 */
function rowsFromLines(lines: OcrLine[], words: OcrWord[], imageWidth: number): RowWork[] {
  const seen = new Set<CanonicalStat>();
  const rows: RowWork[] = [];
  const rightEdge = Math.max(imageWidth, 1) + 5000;

  for (const line of lines) {
    const label = statisticOf(line);
    if (label === null || seen.has(label)) continue;
    seen.add(label);

    const labelWords = line.words.filter((w) => lettersOnly(w.text).length > 0);
    const labelX0 = labelWords.length ? Math.min(...labelWords.map((w) => w.x0)) : 0;
    const labelX1 = labelWords.length ? Math.max(...labelWords.map((w) => w.x1)) : 0;

    const homeBox: Box = { x0: 0, y0: line.y0 - 2, x1: labelX0 - 2, y1: line.y1 + 2 };
    const awayBox: Box = { x0: labelX1 + 2, y0: line.y0 - 2, x1: rightEdge, y1: line.y1 + 2 };

    const home = numberInBox(words, homeBox);
    const away = numberInBox(words, awayBox);

    rows.push({
      label,
      line,
      home: home ? { value: home.value, confidence: home.confidence, source: "page" } : { ...NOT_READ },
      away: away ? { value: away.value, confidence: away.confidence, source: "page" } : { ...NOT_READ },
      homeBox,
      awayBox,
    });
  }

  return rows;
}

/**
 * Choose a box for the digit pass covering one side of one row.
 *
 * When the page pass saw *something* there (even a misread like `pi`) its exact
 * box is reused. Otherwise the box is synthesised from the median column position
 * of the numbers already read on that side, which keeps the repair pass targeted
 * at real digits instead of inventing a location.
 */
function repairBox(
  words: OcrWord[],
  sideBox: Box,
  line: OcrLine,
  columnCenter: number | null,
): Box | null {
  const onLine = words.filter((w) => {
    const cx = (w.x0 + w.x1) / 2;
    const cy = (w.y0 + w.y1) / 2;
    return cx >= sideBox.x0 && cx <= sideBox.x1 && cy >= sideBox.y0 && cy <= sideBox.y1;
  });

  if (onLine.length) {
    return {
      x0: Math.min(...onLine.map((w) => w.x0)),
      y0: Math.min(...onLine.map((w) => w.y0)),
      x1: Math.max(...onLine.map((w) => w.x1)),
      y1: Math.max(...onLine.map((w) => w.y1)),
    };
  }

  if (columnCenter === null) return null;
  const halfWidth = Math.max(18, line.height * 0.45);
  return {
    x0: columnCenter - halfWidth,
    y0: line.y0 - 2,
    x1: columnCenter + halfWidth,
    y1: line.y1 + 2,
  };
}

/** Centre-x of the digit words that actually sit in the home / away column. */
function columnCenters(rows: RowWork[], words: OcrWord[]): { home: number | null; away: number | null } {
  // Only digits that actually sit on a statistic row. The score line is excluded so
  // its digits cannot drag a column sideways.
  const onRows = words.filter(
    (w) =>
      digitsOf(w.text) !== null &&
      rows.some((r) => {
        const cy = (w.y0 + w.y1) / 2;
        return cy >= r.line.y0 - 2 && cy <= r.line.y1 + 2;
      }),
  );
  if (onRows.length < 2) return { home: null, away: null };

  const centers = onRows.map((w) => (w.x0 + w.x1) / 2).sort((a, b) => a - b);

  // Split at the widest gap: a two-column grid has an obvious chasm between the
  // home and away columns, and this never depends on label boxes (which a misread
  // token such as `pi` can widen).
  let splitAt = -1;
  let widestGap = 0;
  for (let i = 1; i < centers.length; i += 1) {
    const gap = centers[i]! - centers[i - 1]!;
    if (gap > widestGap) {
      widestGap = gap;
      splitAt = i;
    }
  }

  const medianWidth = median(onRows.map((w) => w.x1 - w.x0)) ?? 0;
  if (splitAt < 1 || widestGap < Math.max(24, medianWidth * 1.5)) {
    // A single numeric column is all that can be distinguished â€” treat it as home
    // and leave the away side to the repair pass / the administrator.
    return { home: median(centers), away: null };
  }

  return { home: median(centers.slice(0, splitAt)), away: median(centers.slice(splitAt)) };
}

/**
 * Advisory cross-checks over the resolved rows.
 *
 * These NEVER change a detected value â€” they only annotate rows the administrator
 * should look at twice. Per-row notes are written onto `row.warning`; genuinely
 * global observations are returned.
 */
function crossCheck(rows: OcrStatRow[]): string[] {
  const byLabel = new Map<CanonicalStat, OcrStatRow>();
  for (const row of rows) byLabel.set(row.label, row);

  const global: string[] = [];
  const mark = (row: OcrStatRow | undefined, note: string) => {
    if (!row) return;
    row.warning = row.warning ? `${row.warning} ${note}` : note;
  };

  const shots = byLabel.get("Shots");
  const sot = byLabel.get("ShotsOnTarget");

  // Shots on target can never exceed total shots.
  for (const side of ["home", "away"] as const) {
    const total = shots?.[side] ?? null;
    const onTarget = sot?.[side] ?? null;
    if (total !== null && onTarget !== null && onTarget > total) {
      mark(shots, `Shots on target (${onTarget}) exceeds total shots (${total}) â€” please verify.`);
    }
  }

  // A statistic present on one side but not the other is worth confirming.
  for (const row of rows) {
    if ((row.home === null) !== (row.away === null)) {
      mark(row, "Only one side of this statistic was read â€” confirm the other value.");
    }
  }

  // Position and cards are bounded by the shape of the game.
  const position = byLabel.get("Position");
  for (const side of ["home", "away"] as const) {
    const v = position?.[side] ?? null;
    if (v !== null && (v < 1 || v > 20)) {
      mark(position, `Position ${v} is outside the expected 1â€“20 range â€” please verify.`);
    }
  }

  for (const label of ["YellowCards", "RedCards"] as const) {
    const row = byLabel.get(label);
    for (const side of ["home", "away"] as const) {
      const v = row?.[side] ?? null;
      if (v !== null && v > 11) {
        mark(row, `${label} value ${v} looks too high for a single match â€” please verify.`);
      }
    }
  }

  return global;
}

/**
 * Read a completed-match screenshot end to end.
 *
 * Flow:
 *   1. normalise the image (rotation, greyscale, contrast, upscale);
 *   2. full-page recognition â†’ words + geometry;
 *   3. locate the score line and the statistic rows from that geometry;
 *   4. re-read, with a digits-only whitelist, any numeric cell that was missed or
 *      misread in step 2;
 *   5. report everything, marking anything not confidently read as `null`.
 *
 * A `null` always means "Not detected" â€” the function never guesses a number, so
 * the administrator confirms or corrects it before approval.
 */
export async function detectMatchResultReading(bytes: Buffer): Promise<OcrScreenshotReading> {
  const started = Date.now();

  let prepared: PreparedImage;
  try {
    prepared = await prepareImage(bytes);
  } catch {
    return unavailableReading("The screenshot could not be prepared for reading.", Date.now() - started);
  }

  let worker: TesseractWorker;
  try {
    worker = await getWorker();
  } catch (err) {
    return unavailableReading(err instanceof Error ? err.message : String(err), Date.now() - started);
  }

  let page: RecognizeResult;
  try {
    page = await withTimeout(recognize(worker, prepared.bytes, PAGE_RECOGNIZE_PARAMS), "Page recognition");
  } catch (err) {
    return unavailableReading(err instanceof Error ? err.message : String(err), Date.now() - started);
  }

  const lines = groupIntoLines(page.words);
  const score = findScoreLine(lines, prepared.height);
  const rows = rowsFromLines(lines, page.words, prepared.width);
  const centers = columnCenters(rows, page.words);

  // â”€ Repair pass: collect every side the page pass missed or misread â”€â”€
  // The box is taken from the *tight bounding box of the words already observed*
  // in that cell whenever possible. Tesseract reads an isolated digit far more
  // reliably when the crop hugs the glyph; a generous crop leaves the digit adrift
  // in white space and is frequently rejected outright (verified empirically).
  const cells: Array<{ id: string; box: Box }> = [];
  const rowBoxById = new Map<string, { row: RowWork; side: "home" | "away" }>();

  for (const row of rows) {
    for (const side of ["home", "away"] as const) {
      if (row[side].value !== null) continue;
      const sideBox = side === "home" ? row.homeBox : row.awayBox;
      if (!sideBox) continue;
      const box = repairBox(page.words, sideBox, row.line, centers[side]);
      if (!box) continue;
      const id = `${row.label}:${side}`;
      cells.push({ id, box });
      rowBoxById.set(id, { row, side });
    }
  }

  // The score line is repaired from the boxes the page pass saw beside the names.
  for (const side of ["home", "away"] as const) {
    const word = side === "home" ? score.homeWord : score.awayWord;
    const value = side === "home" ? score.home : score.away;
    if (value !== null || !word) continue;
    const id = `Score:${side}`;
    cells.push({ id, box: { x0: word.x0 - 8, y0: word.y0 - 8, x1: word.x1 + 8, y1: word.y1 + 8 } });
  }

  ocrDebug("repair cells collected", {
    cells: cells.map((c) => `${c.id}@${Math.round(c.box.x0)},${Math.round(c.box.y0)}-${Math.round(c.box.x1)},${Math.round(c.box.y1)}`),
    centers,
    rows: rows.map((r) => ({ label: r.label, home: r.home.value, away: r.away.value, homeBox: r.homeBox, awayBox: r.awayBox, line: { y0: r.line.y0, y1: r.line.y1 } })),
  });

  const repaired = cells.length
    ? await withTimeout(readDigitCells(worker, prepared.bytes, cells), "Digit pass").catch(() => new Map<string, { value: number; confidence: number }>())
    : new Map();

  let usedDigitPass = false;

  // â”€â”€ Merge the repaired values back onto the rows â”€â”€
  const resolvedRows: OcrStatRow[] = rows.map((row) => {
    const merged: Record<"home" | "away", SideValue> = { home: row.home, away: row.away };
    for (const side of ["home", "away"] as const) {
      const hit = repaired.get(`${row.label}:${side}`);
      if (!hit) continue;
      merged[side] = { value: hit.value, confidence: hit.confidence, source: "digit-pass" };
      usedDigitPass = true;
    }

    return {
      label: row.label,
      home: merged.home.value,
      away: merged.away.value,
      homeConfidence: Math.round(merged.home.confidence),
      awayConfidence: Math.round(merged.away.confidence),
      homeSource: merged.home.source,
      awaySource: merged.away.source,
      warning: null,
    };
  });

  // â”€â”€ Merge the repaired score digits â”€â”€
  let homeScore = score.home;
  let awayScore = score.away;
  let homeScoreConfidence = Math.round(score.homeConfidence);
  let awayScoreConfidence = Math.round(score.awayConfidence);

  const repairedHomeScore = repaired.get("Score:home");
  if (repairedHomeScore && homeScore === null) {
    homeScore = repairedHomeScore.value;
    homeScoreConfidence = Math.round(repairedHomeScore.confidence);
    usedDigitPass = true;
  }
  const repairedAwayScore = repaired.get("Score:away");
  if (repairedAwayScore && awayScore === null) {
    awayScore = repairedAwayScore.value;
    awayScoreConfidence = Math.round(repairedAwayScore.confidence);
    usedDigitPass = true;
  }

  // â”€â”€ Consistency checks (advisory only â€” never change a value) â”€â”€
  const warnings = crossCheck(resolvedRows);
  if (usedDigitPass) {
    warnings.push(
      "Some values were re-read from cropped, enlarged cells (digits-only pass) because the first full-page read was unclear.",
    );
  }
  if (homeScore === null || awayScore === null) {
    warnings.push(
      "The final score could not be read confidently from this screenshot â€” enter it manually and confirm it against the image.",
    );
  } else if (homeScore === awayScore) {
    warnings.push("The detected score is a draw â€” confirm this is correct for this fixture.");
  }
  if (homeScore !== null && awayScore !== null && (homeScore > 30 || awayScore > 30)) {
    warnings.push(`An unusually high score was detected (${homeScore}â€“${awayScore}) â€” please verify.`);
  }
  if (!resolvedRows.length) {
    warnings.push(
      "No statistics table was recognised in this screenshot. If the image does show statistics, they must be typed in manually.",
    );
  }
  if (page.confidence > 0 && page.confidence < 55) {
    warnings.push(`Overall image recognition confidence is low (${Math.round(page.confidence)}%). Review every field carefully.`);
  }

  return {
    available: true,
    engine: OCR_ENGINE,
    error: null,
    durationMs: Date.now() - started,
    fullText: page.text,
    words: page.words.length > 400 ? [] : page.words,
    width: prepared.width,
    height: prepared.height,
    rows: resolvedRows,
    homeName: score.homeName,
    awayName: score.awayName,
    homeScore,
    awayScore,
    homeScoreConfidence,
    awayScoreConfidence,
    warnings,
  };
}
