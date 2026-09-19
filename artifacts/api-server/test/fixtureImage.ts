/**
 * In-memory renderer for eFootball-style match-results screenshots.
 *
 * This is the same layout `make-ocr-fixture.mjs` bakes into the committed PNG
 * (score line with both player names + the 12-statistic table), parameterised
 * so the route tests can render *variants* on the fly: correct names, a wrong
 * name on either side, two strangers, another matchup's pair, or no names at
 * all. The OCR pipeline then reads these for real — nothing about the name
 * verification is mocked.
 */
import sharp from "sharp";

export interface ResultImageSpec {
  /** Names printed either side of the score; `null` prints nothing there. */
  homeName: string | null;
  awayName: string | null;
  homeScore: number;
  awayScore: number;
  /** Defaults to FIXTURE_ROWS (the same values ocr-check asserts). */
  rows?: ReadonlyArray<readonly [string, number, number]>;
}

/** The canonical statistics table rendered into the screenshots. */
export const FIXTURE_ROWS: ReadonlyArray<readonly [string, number, number]> = [
  ["Possession", 58, 42],
  ["Shots", 8, 4],
  ["Shots on Target", 5, 2],
  ["Corner Kicks", 4, 2],
  ["Offside", 1, 2],
  ["Free Kicks", 12, 9],
  ["Fouls", 7, 10],
  ["Successful Passes", 148, 121],
  ["Crosses", 6, 3],
  ["Interceptions", 9, 11],
  ["Tackles", 14, 16],
  ["Saves", 2, 5],
];

const WIDTH = 1000;
const ROW_H = 58;
const TABLE_TOP = 300;
const FONT = "Arial, Helvetica, sans-serif";
const HOME_X = 300;
const LABEL_X = 500;
const AWAY_X = 700;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function renderResultScreenshot(spec: ResultImageSpec): Promise<Buffer> {
  const rows = spec.rows ?? FIXTURE_ROWS;
  const height = TABLE_TOP + rows.length * ROW_H + 40;

  const rowSvg = rows
    .map(([label, home, away], i) => {
      const y = TABLE_TOP + i * ROW_H;
      return [
        `<text x="${HOME_X}" y="${y}" font-family="${FONT}" font-size="30" font-weight="bold" fill="#ffffff" text-anchor="middle">${esc(String(home))}</text>`,
        `<text x="${LABEL_X}" y="${y}" font-family="${FONT}" font-size="28" fill="#d5dced" text-anchor="middle">${esc(label)}</text>`,
        `<text x="${AWAY_X}" y="${y}" font-family="${FONT}" font-size="30" font-weight="bold" fill="#ffffff" text-anchor="middle">${esc(String(away))}</text>`,
      ].join("\n  ");
    })
    .join("\n  ");

  const homeNameSvg = spec.homeName
    ? `<text x="140" y="180" font-family="${FONT}" font-size="32" font-weight="bold" fill="#ffffff">${esc(spec.homeName)}</text>`
    : "";
  const awayNameSvg = spec.awayName
    ? `<text x="${WIDTH - 140}" y="180" font-family="${FONT}" font-size="32" font-weight="bold" fill="#ffffff" text-anchor="end">${esc(spec.awayName)}</text>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}">
  <rect width="${WIDTH}" height="${height}" fill="#101a2e"/>
  <text x="${WIDTH / 2}" y="72" font-family="${FONT}" font-size="44" font-weight="bold" fill="#00e0ff" text-anchor="middle">MATCH RESULTS</text>
  ${homeNameSvg}
  <text x="${WIDTH / 2}" y="182" font-family="${FONT}" font-size="44" font-weight="bold" fill="#28e07a" text-anchor="middle">${spec.homeScore} - ${spec.awayScore}</text>
  ${awayNameSvg}
  <text x="${WIDTH / 2}" y="240" font-family="${FONT}" font-size="24" font-weight="bold" fill="#8b97ad" text-anchor="middle">MATCH STATISTICS</text>
  ${rowSvg}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
