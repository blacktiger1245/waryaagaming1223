import { deflateSync, inflateSync } from "node:zlib";
import { WG_LOGO_PNG_BASE64 } from "./logo-asset";
import { POPPINS_400_BASE64 } from "./poppins-regular-asset";
import { POPPINS_700_BASE64 } from "./poppins-bold-asset";

/**
 * Server-side WG-SHOP order-transcript PNG generator.
 *
 * Professional, reliable typography: the REAL Poppins font outlines (embedded
 * TTF assets) are parsed and rasterized to anti-aliased pixels — no hand-drawn
 * pixel/stroke font, so glyphs never overlap or distort. The REAL WG logo is
 * decoded from the embedded PNG asset. The manager's browser only sends the
 * order id; the server renders the dark gold/white purchase receipt, uploads
 * it to object storage and posts it into the order chat.
 */

// ─── PNG encoding (color type 2, 8-bit RGB, filter 0) ────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type RGB = [number, number, number];

interface RgbaImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

class RgbCanvas {
  readonly width: number;
  readonly height: number;
  private readonly pixels: Uint8Array;

  constructor(width: number, height: number, background: RGB) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      this.pixels[i * 3] = background[0];
      this.pixels[i * 3 + 1] = background[1];
      this.pixels[i * 3 + 2] = background[2];
    }
  }

  private setPixel(x: number, y: number, color: RGB) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    this.pixels[i] = color[0];
    this.pixels[i + 1] = color[1];
    this.pixels[i + 2] = color[2];
  }

  /** Alpha-blend a single pixel (used by the anti-aliased rasterizer). */
  blendPixel(x: number, y: number, color: RGB, alpha: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const a = Math.max(0, Math.min(1, alpha));
    const i = (y * this.width + x) * 3;
    this.pixels[i] = Math.round(this.pixels[i] * (1 - a) + color[0] * a);
    this.pixels[i + 1] = Math.round(this.pixels[i + 1] * (1 - a) + color[1] * a);
    this.pixels[i + 2] = Math.round(this.pixels[i + 2] * (1 - a) + color[2] * a);
  }

  fillRect(x: number, y: number, w: number, h: number, color: RGB) {
    const x1 = Math.max(0, x);
    const y1 = Math.max(0, y);
    const x2 = Math.min(this.width, x + w);
    const y2 = Math.min(this.height, y + h);
    for (let py = y1; py < y2; py++) {
      for (let px = x1; px < x2; px++) this.setPixel(px, py, color);
    }
  }

  /** Filled rounded rectangle (per-pixel corner membership). */
  fillRoundRect(x: number, y: number, w: number, h: number, r: number, color: RGB) {
    const x1 = Math.max(0, x);
    const y1 = Math.max(0, y);
    const x2 = Math.min(this.width, x + w);
    const y2 = Math.min(this.height, y + h);
    for (let py = y1; py < y2; py++) {
      for (let px = x1; px < x2; px++) {
        const dx = px < x + r ? x + r - px : px >= x + w - r ? px - (x + w - r - 1) : 0;
        const dy = py < y + r ? y + r - py : py >= y + h - r ? py - (y + h - r - 1) : 0;
        if (dx * dx + dy * dy <= r * r) this.setPixel(px, py, color);
      }
    }
  }

  hLine(x: number, y: number, w: number, color: RGB) {
    this.fillRect(x, y, w, 2, color);
  }

  toPng(): Buffer {
    return encodePng(this.width, this.height, this.pixels);
  }

  /** Draw an RGBA image scaled to dx/dy/dw/dh with bilinear sampling + smooth
   * alpha edge (transparent logo pixels blend over the target). */
  drawImage(img: RgbaImage, dx: number, dy: number, dw: number, dh: number) {
    for (let py = 0; py < dh; py++) {
      for (let px = 0; px < dw; px++) {
        const sx = (px + 0.5) * (img.width / dw) - 0.5;
        const sy = (py + 0.5) * (img.height / dh) - 0.5;
        const x0 = Math.min(Math.max(Math.floor(sx), 0), img.width - 1);
        const x1 = Math.min(x0 + 1, img.width - 1);
        const y0 = Math.min(Math.max(Math.floor(sy), 0), img.height - 1);
        const y1 = Math.min(y0 + 1, img.height - 1);
        const fx = Math.min(Math.max(sx - x0, 0), 1);
        const fy = Math.min(Math.max(sy - y0, 0), 1);

        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        const sample = (sx2: number, sy2: number, wgt: number) => {
          const i = (sy2 * img.width + sx2) * 4;
          r += img.rgba[i] * wgt;
          g += img.rgba[i + 1] * wgt;
          b += img.rgba[i + 2] * wgt;
          a += img.rgba[i + 3] * wgt;
        };
        sample(x0, y0, (1 - fx) * (1 - fy));
        sample(x1, y0, fx * (1 - fy));
        sample(x0, y1, (1 - fx) * fy);
        sample(x1, y1, fx * fy);

        const alpha = a / 255;
        if (alpha <= 0) continue;
        this.blendPixel(dx + px, dy + py, [r, g, b], alpha);
      }
    }
  }
}

// ─── TrueType font parsing (real Poppins outlines) ──────────────────────────

interface FontMetric {
  unitsPerEm: number;
  ascender: number;
  capHeight: number;
}

interface ParsedGlyph {
  /** Contours of raw TrueType points (x,y in font units, y-up). `on` marks an
   * on-curve point; off-curve points are quadratic control points. */
  contours: Array<Array<{ x: number; y: number; on: boolean }>>;
  advance: number;
}

interface ParsedFont {
  glyphs: Map<number, ParsedGlyph>;
  /** Unicode code point → glyph id (from the cmap table). */
  charToGlyph: Map<number, number>;
  metric: FontMetric;
}

/** Parse the minimum TrueType tables needed to rasterize glyphs: glyf, loca,
 * head (unitsPerEm), hhea (ascender), hmtx, cmap, maxp, OS/2 (capHeight). */
function parseTrueType(buf: Buffer): ParsedFont {
  if (buf.subarray(0, 4).toString("ascii") === "OTTO") {
    throw new Error("CFF (OpenType PostScript) fonts are not supported");
  }
  const numTables = buf.readUInt16BE(4);
  const tables: Record<string, { offset: number; length: number }> = {};
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = buf.subarray(rec, rec + 4).toString("ascii");
    tables[tag] = { offset: buf.readUInt32BE(rec + 8), length: buf.readUInt32BE(rec + 12) };
  }

  const getTable = (tag: string) => {
    const t = tables[tag];
    if (!t) throw new Error(`Missing font table: ${tag}`);
    return buf.subarray(t.offset, t.offset + t.length);
  };

  const head = getTable("head");
  const unitsPerEm = head.readUInt16BE(18);
  const indexToLocFormat = head.readInt16BE(50);
  const maxp = getTable("maxp");
  const numGlyphs = maxp.readUInt16BE(4);
  const hhea = getTable("hhea");
  const ascender = hhea.readInt16BE(4);
  const numHMetrics = hhea.readUInt16BE(34);
  const hmtx = getTable("hmtx");
  // Store the horizontal advances (one per hMetric; subsequent glyphs reuse the
  // final entry per the TrueType spec).
  const advancesArr: number[] = [];
  for (let i = 0; i < numHMetrics; i++) advancesArr.push(hmtx.readUInt16BE(i * 4));
  const os2 = getTable("OS/2");
  const capHeight = os2.readInt16BE(88);

  const cmap = getTable("cmap");
  const subtableCount = cmap.readUInt16BE(2);
  let cmapOffset = -1;
  let cmapFormat = 0;
  for (let i = 0; i < subtableCount; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const encoding = cmap.readUInt16BE(6 + i * 8);
    const off = cmap.readUInt32BE(8 + i * 8);
    if (platform === 3 && encoding === 1) {
      cmapOffset = off;
      cmapFormat = cmap.readUInt16BE(off);
      break;
    }
    if (cmapOffset === -1 && (platform === 0 || (platform === 3 && encoding === 10))) {
      cmapOffset = off;
      cmapFormat = cmap.readUInt16BE(off);
    }
  }
  if (cmapOffset === -1) throw new Error("No usable cmap subtable in font");

  const charToGlyph = new Map<number, number>();
  if (cmapFormat === 4) {
    const segCountX2 = cmap.readUInt16BE(cmapOffset + 6);
    const segCount = segCountX2 / 2;
    const endCodesOff = cmapOffset + 14;
    const startCodesOff = endCodesOff + segCountX2 + 2;
    const idDeltaOff = startCodesOff + segCountX2;
    const idRangeOff = idDeltaOff + segCountX2;
    for (let i = 0; i < segCount; i++) {
      const end = cmap.readUInt16BE(endCodesOff + i * 2);
      const start = cmap.readUInt16BE(startCodesOff + i * 2);
      const delta = cmap.readInt16BE(idDeltaOff + i * 2);
      const rangeOff = cmap.readUInt16BE(idRangeOff + i * 2);
      for (let c = start; c <= end && c <= 0xffff; c++) {
        let g = 0;
        if (rangeOff === 0) {
          g = (c + delta) & 0xffff;
        } else {
          // idRangeOffset is measured from the location of this very field.
          const addr = idRangeOff + i * 2 + rangeOff + (c - start) * 2;
          if (addr <= cmapOffset + cmap.length - 2) {
            const glyph = cmap.readUInt16BE(addr);
            g = glyph === 0 ? 0 : (glyph + delta) & 0xffff;
          }
        }
        if (g !== 0) charToGlyph.set(c, g);
      }
    }
  } else if (cmapFormat === 12 || cmapFormat === 13) {
    const numGroups = cmap.readUInt32BE(cmapOffset + 12);
    for (let i = 0; i < numGroups; i++) {
      const gOff = cmapOffset + 16 + i * 12;
      const start = cmap.readUInt32BE(gOff);
      const end = cmap.readUInt32BE(gOff + 4);
      const startGlyph = cmap.readUInt32BE(gOff + 8);
      for (let c = start; c <= end; c++) {
        charToGlyph.set(c, cmapFormat === 12 ? startGlyph + (c - start) : startGlyph);
      }
    }
  } else {
    throw new Error(`Unsupported cmap format ${cmapFormat}`);
  }

  // Build glyph→contours from glyf/loca + the char map.
  const glyf = getTable("glyf");
  const loca = getTable("loca");
  const readLoca = (idx: number): number => {
    if (indexToLocFormat === 0) return loca.readUInt16BE(idx * 2) * 2;
    return loca.readUInt32BE(idx * 4);
  };

  const getAdvance = (gid: number): number =>
    gid < numHMetrics ? advancesArr[gid] : advancesArr[advancesArr.length - 1];

  const glyphs: Map<number, ParsedGlyph> = new Map();
  const loadGlyph = (gid: number): ParsedGlyph | null => {
    if (gid >= numGlyphs) return null;
    if (glyphs.has(gid)) return glyphs.get(gid)!;
    const start = readLoca(gid);
    const end = readLoca(gid + 1);
    if (start === end) {
      const empty: ParsedGlyph = { contours: [], advance: getAdvance(gid) };
      glyphs.set(gid, empty);
      return empty;
    }
    const g = glyf.subarray(start, end);
    const numberOfContours = g.readInt16BE(0);
    const advance = getAdvance(gid);
    const contours: Array<Array<{ x: number; y: number; on: boolean }>> = [];

    if (numberOfContours >= 0) {
      const n = numberOfContours;
      const endPts: number[] = [];
      for (let i = 0; i < n; i++) endPts.push(g.readUInt16BE(10 + i * 2));
      const insLen = g.readUInt16BE(10 + n * 2);
      const flagsOff = 10 + n * 2 + 2 + insLen;
      const numPoints = endPts.length > 0 ? endPts[endPts.length - 1] + 1 : 0;

      const flags: number[] = [];
      let f = flagsOff;
      while (flags.length < numPoints) {
        const fl = g[f++];
        flags.push(fl);
        if (fl & 0x08) {
          const repeat = g[f++];
          for (let r = 0; r < repeat; r++) flags.push(fl);
        }
      }

      const xs: number[] = [];
      let x = 0;
      // The x-coordinate deltas begin immediately after the flag bytes, NOT after
      // `flags.length` entries (that count includes expanded repeat flags, so it
      // points too far into the glyph data for any glyph using flag repeats —
      // this was corrupting glyphs like "G"/"A").
      let fx = f;
      for (let i = 0; i < numPoints; i++) {
        const fl = flags[i];
        if (fl & 0x02) {
          if (fl & 0x10) x += g[fx++];
          else x -= g[fx++];
        } else if (!(fl & 0x10)) {
          x += g.readInt16BE(fx);
          fx += 2;
        }
        xs.push(x);
      }

      const ys: number[] = [];
      let y = 0;
      for (let i = 0; i < numPoints; i++) {
        const fl = flags[i];
        if (fl & 0x04) {
          if (fl & 0x20) y += g[fx++];
          else y -= g[fx++];
        } else if (!(fl & 0x20)) {
          y += g.readInt16BE(fx);
          fx += 2;
        }
        ys.push(y);
      }

      let prevEndpoint = 0;
      for (let c = 0; c < n; c++) {
        const endpoint = endPts[c];
        const contour: Array<{ x: number; y: number; on: boolean }> = [];
        for (let i = prevEndpoint; i <= endpoint; i++) {
          contour.push({ x: xs[i], y: ys[i], on: (flags[i] & 0x01) !== 0 });
        }
        contours.push(contour);
        prevEndpoint = endpoint + 1;
      }
    }
    // Composite glyphs (few in this ASCII range) are skipped; the outline data
    // for letters/digits/punctuation in Poppins are simple glyphs.

    const parsed: ParsedGlyph = { contours, advance };
    glyphs.set(gid, parsed);
    return parsed;
  };

  for (const [, gid] of charToGlyph) loadGlyph(gid);

  return {
    glyphs,
    charToGlyph,
    metric: { unitsPerEm, ascender, capHeight: capHeight > 0 ? capHeight : 700 },
  };
}

// ─── Font rasterization (even-odd fill + AA via 3x3 supersampling) ──────────

interface LoadedFont {
  regular: ParsedFont;
  bold: ParsedFont;
}

const loadedFonts: LoadedFont = {
  regular: parseTrueType(Buffer.from(POPPINS_400_BASE64, "base64")),
  bold: parseTrueType(Buffer.from(POPPINS_700_BASE64, "base64")),
};

type FontWeight = "regular" | "bold";

interface DrawTextOptions {
  weight?: FontWeight;
  /** Fit-to-width cap: the string is squeezed/truncated to fit this many px. */
  maxWidth?: number;
  align?: "left" | "center" | "right";
}

function fontFor(weight: FontWeight): ParsedFont {
  return weight === "bold" ? loadedFonts.bold : loadedFonts.regular;
}

function glyphFor(font: ParsedFont, ch: string): ParsedGlyph | null {
  const code = ch.codePointAt(0);
  if (code === undefined) return null;
  const gid = font.charToGlyph.get(code);
  if (gid === undefined) return null;
  return font.glyphs.get(gid) ?? null;
}

function advanceFor(font: ParsedFont, ch: string): number {
  const g = glyphFor(font, ch);
  if (g) return g.advance;
  return 0.5 * font.metric.unitsPerEm; // fallback for .notdef
}

/** Measure a string's width in font units. */
function measureUnits(font: ParsedFont, text: string): number {
  let w = 0;
  for (const ch of text) w += advanceFor(font, ch);
  return w;
}

function measurePx(font: ParsedFont, text: string, scale: number): number {
  // `scale` is already px-per-font-unit (pxHeight / unitsPerEm), so the width in
  // pixels is simply measureUnits * scale. The previous `… / unitsPerEm * scale`
  // double-divided by unitsPerEm, making every measurement ~1000x too small —
  // fitToWidth then never truncated long values and they overflowed the card.
  return measureUnits(font, text) * scale;
}

/** Truncate a string with "…" so it fits within maxPx at the given scale. */
function fitToWidth(text: string, font: ParsedFont, scale: number, maxPx: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (measurePx(font, clean, scale) <= maxPx) return clean;
  const ell = "\u2026";
  let result = clean;
  for (let len = clean.length - 1; len > 0; len--) {
    const candidate = `${clean.slice(0, len).replace(/\s+\S*$/, "")}${ell}`;
    if (measurePx(font, candidate, scale) <= maxPx) return candidate;
  }
  return ell;
}

/**
 * Flatten a TrueType closed contour (on/off curve points, font units) into a
 * polyline via quadratic Bézier subdivision. Off-curve pairs get implicit
 * on-curve midpoints per the TrueType glyph format, so letters render smooth.
 */
function flattenContour(raw: Array<{ x: number; y: number; on: boolean }>): Array<[number, number]> {
  const n = raw.length;
  if (n === 0) return [];
  // Rotate so an on-curve point is first when available.
  let start = raw.findIndex((p) => p.on);
  if (start === -1) start = 0;
  const arr: Array<{ x: number; y: number; on: boolean }> = [];
  for (let i = 0; i < n; i++) arr.push(raw[(start + i) % n]);

  const flat: Array<[number, number]> = [];
  const last = n;
  const seq = arr.concat(arr); // double-length for cyclic wrapping
  const onCurve: number[] = [];
  for (let i = 0; i < last; i++) if (seq[i].on) onCurve.push(i);
  if (onCurve.length === 0) {
    // All-off-curve (degenerate): just emit the polygon.
    for (let i = 0; i < last; i++) flat.push([arr[i].x, arr[i].y]);
    return flat;
  }

  const quad = (p0: [number, number], c: [number, number], p2: [number, number]) => {
    for (let t = 1; t <= 10; t++) {
      const u = t / 10;
      const uu = 1 - u;
      flat.push([
        uu * uu * p0[0] + 2 * uu * u * c[0] + u * u * p2[0],
        uu * uu * p0[1] + 2 * uu * u * c[1] + u * u * p2[1],
      ]);
    }
  };

  const m = onCurve.length;
  for (let k = 0; k < m; k++) {
    const a = onCurve[k];
    const b = k + 1 < m ? onCurve[k + 1] : onCurve[0] + last;
    const A = seq[a];
    const B = seq[b];
    const offs: Array<{ x: number; y: number }> = [];
    for (let j = a + 1; j < b; j++) offs.push(seq[j]);
    if (offs.length === 0) {
      flat.push([B.x, B.y]);
    } else {
      const offPts = offs.map((o) => [o.x, o.y] as [number, number]);
      if (offPts.length === 1) {
        quad([A.x, A.y], offPts[0], [B.x, B.y]);
      } else {
        quad([A.x, A.y], offPts[0], [
          (offPts[0][0] + offPts[1][0]) / 2,
          (offPts[0][1] + offPts[1][1]) / 2,
        ]);
        for (let j = 1; j < offPts.length - 1; j++) {
          const mid1: [number, number] = [(offPts[j - 1][0] + offPts[j][0]) / 2, (offPts[j - 1][1] + offPts[j][1]) / 2];
          const mid2: [number, number] = [(offPts[j][0] + offPts[j + 1][0]) / 2, (offPts[j][1] + offPts[j + 1][1]) / 2];
          quad(mid1, offPts[j], mid2);
        }
        const f2 = offPts[offPts.length - 2];
        const lastO = offPts[offPts.length - 1];
        quad([(f2[0] + lastO[0]) / 2, (f2[1] + lastO[1]) / 2], lastO, [B.x, B.y]);
      }
    }
  }
  return flat;
}

const AA_SUBS = [1 / 6, 0.5, 5 / 6];

function upperBoundSorted(arr: number[], value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function drawGlyph(
  canvas: RgbCanvas,
  glyph: ParsedGlyph,
  sx: number,
  sy: number,
  scale: number,
  color: RGB,
) {
  if (glyph.contours.length === 0) return;
  const flat = glyph.contours.map(flattenContour).filter((c) => c.length >= 3);
  if (flat.length === 0) return;

  // Glyph AABB (font units, y-up).
  let gxMin = Infinity;
  let gxMax = -Infinity;
  let gyMin = Infinity;
  let gyMax = -Infinity;
  const edges: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  for (const contour of flat) {
    const n = contour.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const e0 = contour[j];
      const e1 = contour[i];
      const xm = Math.min(e0[0], e1[0]);
      const xM = Math.max(e0[0], e1[0]);
      const ym = Math.min(e0[1], e1[1]);
      const yM = Math.max(e0[1], e1[1]);
      if (xm < gxMin) gxMin = xm;
      if (xM > gxMax) gxMax = xM;
      if (ym < gyMin) gyMin = ym;
      if (yM > gyMax) gyMax = yM;
      if (e0[1] !== e1[1]) edges.push({ x0: e0[0], y0: e0[1], x1: e1[0], y1: e1[1] });
    }
  }
  if (edges.length === 0) return;

  const x0 = Math.max(0, Math.floor(sx + gxMin * scale));
  const x1 = Math.min(canvas.width - 1, Math.ceil(sx + gxMax * scale));
  const y0 = Math.max(0, Math.floor(sy - gyMax * scale));
  const y1 = Math.min(canvas.height - 1, Math.ceil(sy - gyMin * scale));

  for (let py = y0; py <= y1; py++) {
    // Compute crossing x-positions for each of 3 subpixel rows (anti-aliasing).
    const crossings: number[][] = [[], [], []];
    for (let s = 0; s < 3; s++) {
      const fy = (sy - (py + AA_SUBS[s])) / scale;
      const list = crossings[s];
      for (const e of edges) {
        if ((e.y0 <= fy && fy < e.y1) || (e.y1 <= fy && fy < e.y0)) {
          list.push(e.x0 + ((fy - e.y0) * (e.x1 - e.x0)) / (e.y1 - e.y0));
        }
      }
      list.sort((a, b) => a - b);
    }
    for (let px = x0; px <= x1; px++) {
      const fc = (px + 0.5 - sx) / scale;
      let hits = 0;
      for (let s = 0; s < 3; s++) {
        const count = upperBoundSorted(crossings[s], fc);
        if (count & 1) hits++;
      }
      if (hits > 0) {
        canvas.blendPixel(px, py, color, hits / 3);
      }
    }
  }
}

/** Draw text (uppercase-normalized for emphasis) left/center/right aligned. */
function drawText(
  canvas: RgbCanvas,
  x: number,
  baselineY: number,
  text: string,
  pxHeight: number,
  color: RGB,
  options: DrawTextOptions = {},
) {
  const font = fontFor(options.weight ?? "bold");
  const unitsPerEm = font.metric.unitsPerEm;
  const scale = pxHeight / unitsPerEm;

  let str = text;
  if (options.maxWidth !== undefined) {
    str = fitToWidth(str, font, scale, options.maxWidth);
  }

  const totalW = measureUnits(font, str) * scale;
  let cx = x;
  if (options.align === "center") cx = x - totalW / 2;
  else if (options.align === "right") cx = x - totalW;

  for (const ch of str) {
    const glyph = glyphFor(font, ch);
    const adv = advanceFor(font, ch) * scale;
    if (glyph) {
      drawGlyph(canvas, glyph, cx, baselineY, scale, color);
    }
    cx += adv;
  }
}

// ─── Real WG logo decode + theme + layout ────────────────────────────────────

function decodePngRgba(buf: Buffer): RgbaImage {
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString("ascii");
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!width || !height) throw new Error("Invalid PNG header");
  if (colorType !== 6 && colorType !== 2) throw new Error("Unsupported logo PNG format");
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    for (let x = 0; x < stride; x++) {
      const i = rowStart + 1 + x;
      const left = x >= channels ? raw[i - channels] : 0;
      const up = y > 0 ? raw[i - (stride + 1)] : 0;
      const upLeft = x >= channels && y > 0 ? raw[i - (stride + 1) - channels] : 0;
      let val = raw[i];
      if (filter === 1) val += left;
      else if (filter === 2) val += up;
      else if (filter === 3) val += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        val += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      val &= 0xff;
      const o = (y * width + x) * 4;
      rgba[o] = val;
      rgba[o + 1] = channels === 4 ? raw[i + 1] : raw[i + 1];
      rgba[o + 2] = channels === 4 ? raw[i + 2] : raw[i + 2];
      rgba[o + 3] = channels === 4 ? raw[i + 3] : 255;
    }
  }
  return { width, height, rgba };
}

let wgLogo: RgbaImage | null = null;
function getWgLogo(): RgbaImage | null {
  if (wgLogo) return wgLogo;
  try {
    wgLogo = decodePngRgba(Buffer.from(WG_LOGO_PNG_BASE64, "base64"));
  } catch (e) {
    console.error("Failed to decode embedded WG logo:", e);
    wgLogo = null;
  }
  return wgLogo;
}

export function __diagDraw(text: string, pxHeight: number): Buffer {
  const c = new RgbCanvas(800, 240, [0, 0, 0]);
  drawText(c, 20, 170, text, pxHeight, [255, 255, 255], { weight: "bold" });
  return c.toPng();
}

export function __diag() {
  return loadedFonts;
}

export interface TranscriptInfo {
  fullName: string;
  phone: string;
  /** Aqoonsi / Account No — included only for eFootball orders (manager path). */
  accountNo?: string | null;
  discord: string;
  price: string;
  orderId: string;
  productName: string;
  date: string;
  status: string;
}

const W = 1200;
const H = 1600;

const COL: Record<string, RGB> = {
  bg: [10, 15, 28], // deep navy/black
  bgAccent: [15, 23, 42],
  panel: [18, 27, 48],
  panelBorder: [34, 46, 74],
  gold: [212, 175, 55], // metallic gold
  goldSoft: [180, 145, 60],
  white: [245, 247, 250],
  muted: [158, 170, 190], // soft gray-blue
  ink: [222, 226, 235],
};

function statusColor(status: string): RGB {
  const s = status.toLowerCase();
  if (s === "completed") return [34, 197, 94]; // green
  if (s === "processing") return [59, 130, 246]; // blue
  if (s === "cancelled") return [239, 68, 68]; // red
  return [245, 158, 11]; // pending → gold/orange
}

function statusBg(status: string): RGB {
  const s = status.toLowerCase();
  if (s === "completed") return [20, 60, 35];
  if (s === "processing") return [23, 40, 70];
  if (s === "cancelled") return [60, 22, 24];
  return [58, 44, 18];
}

/** Elegant card (dark panel + gold border ring + subtle inner tint). */
function drawCard(canvas: RgbCanvas, x: number, y: number, w: number, h: number, r: number) {
  canvas.fillRoundRect(x, y, w, h, r, COL.gold);
  canvas.fillRoundRect(x + 2, y + 2, w - 4, h - 4, Math.max(2, r - 2), COL.panel);
  canvas.fillRoundRect(x + 16, y + 14, w - 32, h - 28, Math.max(2, r - 4), COL.panel);
}

function drawSectionTitle(canvas: RgbCanvas, x: number, baseline: number, text: string) {
  drawText(canvas, x, baseline, text, 26, COL.gold, { weight: "bold" });
  // Small gold accent tick under the title
  canvas.fillRoundRect(x + 2, baseline + 16, 64, 4, 2, COL.goldSoft);
}

function drawFieldLabelValue(
  canvas: RgbCanvas,
  x: number,
  labelBaseline: number,
  label: string,
  value: string,
  maxValuePx: number,
  valueColor: RGB = COL.white,
  valueHeight = 40,
) {
  drawText(canvas, x, labelBaseline, label, 16, COL.muted, { weight: "regular", maxWidth: maxValuePx });
  drawText(canvas, x, labelBaseline + 44, value, valueHeight, valueColor, {
    weight: "bold",
    maxWidth: maxValuePx,
  });
}

function drawStatusBadge(canvas: RgbCanvas, x: number, centerY: number, status: string) {
  const label = status.toUpperCase();
  const textPx = 30;
  const width = Math.min(360, measurePx(loadedFonts.bold, label, textPx / loadedFonts.bold.metric.unitsPerEm) + 64);
  const height = 62;
  const bg = statusBg(status);
  const color = statusColor(status);
  canvas.fillRoundRect(x, centerY - height / 2, width, height, 31, bg);
  canvas.fillRoundRect(x + 2, centerY - height / 2 + 2, width - 4, height - 4, 29, [Math.min(255, bg[0] + 14), Math.min(255, bg[1] + 14), Math.min(255, bg[2] + 14)]);
  drawText(canvas, x + width / 2, centerY + 10, label, textPx, color, { weight: "bold", align: "center" });
}

const MARGIN = 88;

export function renderOrderTranscriptPng(info: TranscriptInfo): Buffer {
  const canvas = new RgbCanvas(W, H, COL.bg);
  const logo = getWgLogo();
  const contentW = W - MARGIN * 2;

  // Subtle background glow accents
  canvas.fillRoundRect(0, 0, W, H, 0, COL.bgAccent);
  canvas.fillRoundRect(MARGIN - 8, 36, contentW + 16, H - 72, 24, COL.bg);

  // ── HEADER ──────────────────────────────────────────────────────────────
  if (logo) {
    const logoSize = 132;
    canvas.drawImage(logo, MARGIN, 78, logoSize, logoSize);
  }
  const brandX = MARGIN + (logo ? 160 : 0);
  drawText(canvas, brandX, 150, "WG-SHOP", 64, COL.gold, { weight: "bold", maxWidth: 500 });
  drawText(canvas, brandX + 2, 190, "WARYAA GAMING OFFICIAL MARKETPLACE", 20, COL.muted, {
    weight: "regular",
    maxWidth: 520,
  });

  // Right: ORDER / TRANSCRIPT
  drawText(canvas, W - MARGIN, 128, "ORDER", 44, COL.white, { weight: "bold", align: "right" });
  drawText(canvas, W - MARGIN, 176, "TRANSCRIPT", 44, COL.gold, { weight: "bold", align: "right" });
  drawText(canvas, W - MARGIN, 208, "OFFICIAL PURCHASE RECEIPT", 16, COL.muted, {
    weight: "regular",
    align: "right",
  });

  // Gold divider
  canvas.fillRoundRect(MARGIN, 248, contentW, 4, 2, COL.goldSoft);

  // ── CUSTOMER INFORMATION ────────────────────────────────────────────────
  drawSectionTitle(canvas, MARGIN, 316, "CUSTOMER INFORMATION");
  drawCard(canvas, MARGIN, 336, contentW, 400, 20);

  const labelW = 460;
  const lx = MARGIN + 48;
  const rx = MARGIN + contentW - 48 - labelW;

  drawFieldLabelValue(canvas, lx, 400, "FULL NAME", info.fullName, labelW);
  drawFieldLabelValue(canvas, rx, 400, "NUMBER", info.phone, labelW);
  canvas.hLine(lx, 500, rx + labelW - lx, COL.panelBorder);
  drawFieldLabelValue(canvas, lx, 560, "ACCOUNT NO", info.accountNo ?? "-", labelW);
  drawFieldLabelValue(canvas, rx, 560, "DISCORD USERNAME", info.discord, labelW);
  canvas.hLine(lx, 660, rx + labelW - lx, COL.panelBorder);
  drawFieldLabelValue(canvas, lx, 700, "PRICE", info.price, labelW, COL.gold, 46);

  // ── ORDER INFORMATION ───────────────────────────────────────────────────
  drawSectionTitle(canvas, MARGIN, 812, "ORDER INFORMATION");
  drawCard(canvas, MARGIN, 832, contentW, 340, 20);

  drawFieldLabelValue(canvas, lx, 900, "ORDER ID", info.orderId, labelW);
  drawFieldLabelValue(canvas, rx, 900, "PRODUCT", info.productName, labelW);
  canvas.hLine(lx, 1000, rx + labelW - lx, COL.panelBorder);
  drawFieldLabelValue(canvas, lx, 1060, "DATE", info.date, labelW);
  drawText(canvas, rx, 1060, "STATUS", 16, COL.muted, { weight: "regular" });
  drawStatusBadge(canvas, rx, 1096, info.status);

  // ── FOOTER ──────────────────────────────────────────────────────────────
  canvas.fillRoundRect(MARGIN, 1290, contentW, 3, 1, COL.goldSoft);
  drawText(canvas, W / 2, 1380, "THANK YOU FOR CHOOSING WG-SHOP", 36, COL.white, {
    weight: "bold",
    align: "center",
  });
  drawText(canvas, W / 2, 1430, "WARYAA GAMING OFFICIAL MARKETPLACE", 20, COL.gold, {
    weight: "bold",
    align: "center",
  });
  drawText(canvas, W / 2, 1472, "Your trust is our priority.", 16, COL.muted, {
    weight: "regular",
    align: "center",
  });

  return canvas.toPng();
}