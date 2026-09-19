// Regenerates `test/fixtures/efootball-match-result.png`.
//
// The fixture is a clean, digitally rendered eFootball-style match-results screen
// (rasterised from SVG by sharp). It exists so the REAL OCR pipeline can be
// verified end to end without shipping a licensed screenshot: the same layout a
// player uploads — the score line with both names and the statistics table.
//
// Run with:  node test/make-ocr-fixture.mjs
//
// The rendered rows are the canonical player-vs-player statistics
// (see MATCH_RESULT_STAT_COLUMNS in src/lib/ensure-schema.ts). `Successful Passes`
// is ONE row — it is never split into "Passes" and "Successful".
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "efootball-match-result.png");

const HOME_NAME = "Player A";
const AWAY_NAME = "Player B";
const SCORE = [3, 1];

// [label, home value, away value]
const ROWS = [
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
const HEIGHT = TABLE_TOP + ROWS.length * ROW_H + 40;
const FONT = "Arial, Helvetica, sans-serif";
const HOME_X = 300;
const LABEL_X = 500;
const AWAY_X = 700;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rowSvg = ROWS.map(([label, home, away], i) => {
  const y = TABLE_TOP + i * ROW_H;
  return [
    `<text x="${HOME_X}" y="${y}" font-family="${FONT}" font-size="30" font-weight="bold" fill="#ffffff" text-anchor="middle">${esc(String(home))}</text>`,
    `<text x="${LABEL_X}" y="${y}" font-family="${FONT}" font-size="28" fill="#d5dced" text-anchor="middle">${esc(label)}</text>`,
    `<text x="${AWAY_X}" y="${y}" font-family="${FONT}" font-size="30" font-weight="bold" fill="#ffffff" text-anchor="middle">${esc(String(away))}</text>`,
  ].join("\n  ");
}).join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#101a2e"/>
  <text x="${WIDTH / 2}" y="72" font-family="${FONT}" font-size="44" font-weight="bold" fill="#00e0ff" text-anchor="middle">MATCH RESULTS</text>
  <text x="140" y="180" font-family="${FONT}" font-size="32" font-weight="bold" fill="#ffffff">${esc(HOME_NAME)}</text>
  <text x="${WIDTH / 2}" y="182" font-family="${FONT}" font-size="44" font-weight="bold" fill="#28e07a" text-anchor="middle">${SCORE[0]} - ${SCORE[1]}</text>
  <text x="${WIDTH - 140}" y="180" font-family="${FONT}" font-size="32" font-weight="bold" fill="#ffffff" text-anchor="end">${esc(AWAY_NAME)}</text>
  <text x="${WIDTH / 2}" y="240" font-family="${FONT}" font-size="24" font-weight="bold" fill="#8b97ad" text-anchor="middle">MATCH STATISTICS</text>
  ${rowSvg}
</svg>`;

const info = await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log(`fixture written: ${OUT} (${info.width}x${info.height}, ${ROWS.length} statistic rows)`);
