import { deflateSync, inflateSync } from "node:zlib";
import { WG_LOGO_PNG_BASE64 } from "./logo-asset";

/**
 * Server-side WG-SHOP order-transcript PNG generator.
 *
 * Zero external dependencies: a minimal PNG encoder/decoder (Node's built-in
 * zlib), an anti-aliased vector stroke font (smooth, professional type — no
 * pixel look), and the REAL WG logo (embedded base64 asset decoded at
 * runtime). The manager's browser only sends the order id; the image is
 * rendered here from the database and uploaded to object storage.
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

// ─── RGB drawing surface ─────────────────────────────────────────────────────

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

  /** Alpha-blend a single pixel (used by the anti-aliased stroke renderer). */
  private blendPixel(x: number, y: number, color: RGB, alpha: number) {
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

  /** Soft radial glow blended over the current pixels. */
  radialGlow(cx: number, cy: number, radius: number, color: RGB, maxAlpha: number) {
    const x1 = Math.max(0, cx - radius);
    const x2 = Math.min(this.width, cx + radius);
    const y1 = Math.max(0, cy - radius);
    const y2 = Math.min(this.height, cy + radius);
    for (let py = y1; py < y2; py++) {
      for (let px = x1; px < x2; px++) {
        const dist = Math.hypot(px - cx, py - cy);
        if (dist >= radius) continue;
        const i = (py * this.width + px) * 3;
        const alpha = (1 - dist / radius) * maxAlpha;
        this.pixels[i] = Math.round(this.pixels[i] * (1 - alpha) + color[0] * alpha);
        this.pixels[i + 1] = Math.round(this.pixels[i + 1] * (1 - alpha) + color[1] * alpha);
        this.pixels[i + 2] = Math.round(this.pixels[i + 2] * (1 - alpha) + color[2] * alpha);
      }
    }
  }

  hLine(x: number, y: number, w: number, color: RGB) {
    this.fillRect(x, y, w, 2, color);
  }

  toPng(): Buffer {
    return encodePng(this.width, this.height, this.pixels);
  }

  /**
   * Anti-aliased round-cap stroke between two points. Coverage per pixel comes
   * from its distance to the segment (~1px AA edge), which produces smooth,
   * professional-looking type instead of the old pixel grid.
   */
  strokeSegment(x1: number, y1: number, x2: number, y2: number, radius: number, color: RGB) {
    const pad = radius + 1.5;
    const minX = Math.max(0, Math.floor(Math.min(x1, x2) - pad));
    const maxX = Math.min(this.width - 1, Math.ceil(Math.max(x1, x2) + pad));
    const minY = Math.max(0, Math.floor(Math.min(y1, y2) - pad));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(y1, y2) + pad));
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const cx = x1 + t * dx;
        const cy = y1 + t * dy;
        const dist = Math.hypot(px - cx, py - cy);
        const alpha = radius + 0.5 - dist;
        if (alpha <= 0) continue;
        this.blendPixel(px, py, color, Math.min(1, alpha));
      }
    }
  }

  /** Draw an RGBA image scaled to dx/dy/dw/dh with bilinear sampling + rounded
   * corner clipping (used for the WG logo). Transparent pixels blend over the
   * target surface. */
  drawImage(img: RgbaImage, dx: number, dy: number, dw: number, dh: number, clipRadius: number) {
    for (let py = 0; py < dh; py++) {
      for (let px = 0; px < dw; px++) {
        if (clipRadius > 0) {
          const ddx = px < clipRadius ? clipRadius - px : px >= dw - clipRadius ? px - (dw - clipRadius - 1) : 0;
          const ddy = py < clipRadius ? clipRadius - py : py >= dh - clipRadius ? py - (dh - clipRadius - 1) : 0;
          if (ddx * ddx + ddy * ddy > clipRadius * clipRadius) continue;
        }

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

// ─── PNG decoder (for the real WG logo) ──────────────────────────────────────

function decodePngRgba(buf: Buffer): RgbaImage {
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let idat: Buffer[] = [];

  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString("ascii");
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }

  if (!width || !height) throw new Error("Invalid PNG header");
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error("Unsupported logo PNG format (need 8-bit RGBA or RGB)");
  }

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
      if (channels === 4) {
        rgba[o] = val;
        rgba[o + 1] = raw[i + 1];
        rgba[o + 2] = raw[i + 2];
        rgba[o + 3] = raw[i + 3];
      } else {
        rgba[o] = val;
        rgba[o + 1] = raw[i + 1];
        rgba[o + 2] = raw[i + 2];
        rgba[o + 3] = 255;
      }
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

// ─── Anti-aliased vector stroke font ─────────────────────────────────────────

// Geometric sans-serif letterforms built from round-cap strokes. Coordinates
// are fractions of a 1.0 cap-height box; thickness defaults to 0.14. This is
// what makes text look like clean, professional typography instead of pixels.

type Stroke = [number, number, number, number, number];

function S(x1: number, y1: number, x2: number, y2: number, t = 0.14): Stroke {
  return [x1, y1, x2, y2, t];
}

const FONT_MASTERS: Record<string, Stroke[]> = {
  A: [S(0.02, 1.05, 0.28, 0.02), S(0.28, 0.02, 0.56, 1.05), S(0.12, 0.55, 0.46, 0.55, 0.12)],
  B: [
    S(0.08, 1.05, 0.08, 0.02), S(0.42, 0.55, 0.08, 0.55), S(0.08, 0.02, 0.42, 0.02),
    S(0.42, 0.02, 0.6, 0.2), S(0.6, 0.2, 0.6, 0.4), S(0.6, 0.4, 0.42, 0.55),
    S(0.08, 1.05, 0.42, 1.05), S(0.42, 1.05, 0.6, 0.86), S(0.6, 0.86, 0.6, 0.68),
    S(0.6, 0.68, 0.42, 0.55),
  ],
  C: [
    S(0.6, 0.3, 0.48, 0.12), S(0.48, 0.12, 0.22, 0.12), S(0.22, 0.12, 0.08, 0.3),
    S(0.08, 0.3, 0.08, 0.78), S(0.08, 0.78, 0.22, 0.95), S(0.22, 0.95, 0.48, 0.95),
    S(0.48, 0.95, 0.6, 0.78),
  ],
  D: [
    S(0.08, 1.05, 0.08, 0.02), S(0.08, 1.05, 0.42, 1.05), S(0.42, 1.05, 0.62, 0.86),
    S(0.62, 0.86, 0.62, 0.24), S(0.62, 0.24, 0.42, 0.02), S(0.08, 0.02, 0.42, 0.02),
  ],
  E: [S(0.08, 1.05, 0.08, 0.02), S(0.08, 1.05, 0.6, 1.05), S(0.08, 0.55, 0.5, 0.55, 0.12), S(0.08, 0.02, 0.6, 0.02)],
  F: [S(0.08, 1.05, 0.08, 0.02), S(0.08, 1.05, 0.6, 1.05), S(0.08, 0.55, 0.5, 0.55, 0.12)],
  G: [
    S(0.6, 0.3, 0.48, 0.12), S(0.48, 0.12, 0.22, 0.12), S(0.22, 0.12, 0.08, 0.3),
    S(0.08, 0.3, 0.08, 0.78), S(0.08, 0.78, 0.22, 0.95), S(0.22, 0.95, 0.48, 0.95),
    S(0.48, 0.95, 0.6, 0.8), S(0.34, 0.42, 0.62, 0.42), S(0.62, 0.42, 0.62, 0.55, 0.1),
  ],
  H: [S(0.08, 1.05, 0.08, 0.02), S(0.56, 1.05, 0.56, 0.02), S(0.08, 0.55, 0.56, 0.55, 0.12)],
  I: [S(0.3, 1.05, 0.3, 0.02), S(0.16, 1.05, 0.44, 1.05, 0.12), S(0.16, 0.02, 0.44, 0.02, 0.12)],
  J: [
    S(0.5, 1.05, 0.5, 0.24), S(0.5, 0.24, 0.36, 0.06), S(0.36, 0.06, 0.18, 0.06),
    S(0.18, 0.06, 0.08, 0.18), S(0.32, 1.05, 0.62, 1.05, 0.12),
  ],
  K: [S(0.08, 1.05, 0.08, 0.02), S(0.08, 0.55, 0.56, 1.05), S(0.22, 0.44, 0.56, 0.02)],
  L: [S(0.08, 1.05, 0.08, 0.02), S(0.08, 0.02, 0.56, 0.02)],
  M: [
    S(0.06, 1.05, 0.06, 0.02), S(0.06, 1.05, 0.28, 0.4), S(0.28, 0.4, 0.5, 1.05),
    S(0.5, 1.05, 0.5, 0.02),
  ],
  N: [S(0.06, 1.05, 0.06, 0.02), S(0.06, 1.05, 0.56, 0.02), S(0.56, 1.05, 0.56, 0.02)],
  O: [
    S(0.12, 1.05, 0.12, 0.02), S(0.56, 1.05, 0.56, 0.02), S(0.12, 0.02, 0.56, 0.02),
    S(0.12, 1.05, 0.56, 1.05),
  ],
  P: [
    S(0.08, 1.05, 0.08, 0.02), S(0.08, 1.05, 0.42, 1.05), S(0.42, 1.05, 0.6, 0.88),
    S(0.6, 0.88, 0.6, 0.68), S(0.6, 0.68, 0.42, 0.55), S(0.08, 0.55, 0.42, 0.55),
  ],
  Q: [
    S(0.12, 1.05, 0.12, 0.02), S(0.56, 1.05, 0.56, 0.02), S(0.12, 0.02, 0.56, 0.02),
    S(0.12, 1.05, 0.56, 1.05), S(0.62, 0.42, 0.4, 0.2, 0.1),
  ],
  R: [
    S(0.08, 1.05, 0.08, 0.02), S(0.08, 1.05, 0.42, 1.05), S(0.42, 1.05, 0.6, 0.88),
    S(0.6, 0.88, 0.6, 0.68), S(0.6, 0.68, 0.42, 0.55), S(0.08, 0.55, 0.42, 0.55),
    S(0.4, 0.55, 0.62, 0.02),
  ],
  S: [
    S(0.58, 0.88, 0.44, 1.05), S(0.44, 1.05, 0.2, 1.05), S(0.2, 1.05, 0.08, 0.88),
    S(0.08, 0.88, 0.08, 0.68), S(0.08, 0.68, 0.42, 0.55), S(0.42, 0.55, 0.58, 0.4),
    S(0.58, 0.4, 0.58, 0.2), S(0.58, 0.2, 0.42, 0.04), S(0.42, 0.04, 0.18, 0.02),
    S(0.18, 0.02, 0.08, 0.14),
  ],
  T: [S(0.06, 1.05, 0.6, 1.05), S(0.34, 1.05, 0.34, 0.02, 0.16)],
  U: [
    S(0.08, 1.05, 0.08, 0.35), S(0.08, 0.35, 0.28, 0.12), S(0.28, 0.12, 0.48, 0.12),
    S(0.48, 0.12, 0.6, 0.32), S(0.6, 0.32, 0.6, 1.05),
  ],
  V: [S(0.04, 1.05, 0.32, 0.02), S(0.32, 0.02, 0.62, 1.05)],
  W: [
    S(0.02, 1.05, 0.19, 0.02), S(0.19, 0.02, 0.32, 0.5), S(0.32, 0.5, 0.46, 0.02),
    S(0.46, 0.02, 0.6, 0.5), S(0.6, 0.5, 0.72, 0.02), S(0.72, 0.02, 0.96, 1.05),
  ],
  X: [S(0.06, 1.05, 0.58, 0.02), S(0.06, 0.02, 0.58, 1.05)],
  Y: [S(0.04, 1.05, 0.32, 0.42), S(0.6, 1.05, 0.32, 0.42), S(0.32, 0.42, 0.32, 0.02, 0.16)],
  Z: [S(0.06, 1.05, 0.6, 1.05), S(0.6, 1.05, 0.06, 0.02), S(0.06, 0.02, 0.6, 0.02)],
  "0": [
    S(0.12, 1.05, 0.12, 0.02), S(0.56, 1.05, 0.56, 0.02), S(0.12, 0.02, 0.56, 0.02),
    S(0.12, 1.05, 0.56, 1.05), S(0.32, 0.6, 0.32, 0.5, 0.1),
  ],
  "1": [S(0.3, 1.05, 0.3, 0.02), S(0.16, 0.02, 0.46, 0.02, 0.12), S(0.2, 1.05, 0.42, 1.05, 0.12)],
  "2": [
    S(0.12, 0.3, 0.24, 0.1), S(0.24, 0.1, 0.5, 0.1), S(0.5, 0.1, 0.6, 0.26),
    S(0.6, 0.26, 0.56, 0.5), S(0.56, 0.5, 0.1, 1.05), S(0.1, 1.05, 0.6, 1.05),
  ],
  "3": [
    S(0.5, 0.3, 0.38, 0.1), S(0.38, 0.1, 0.16, 0.1), S(0.16, 0.1, 0.06, 0.26),
    S(0.06, 0.26, 0.06, 0.44), S(0.06, 0.44, 0.42, 0.55), S(0.42, 0.55, 0.58, 0.68),
    S(0.58, 0.68, 0.58, 0.86), S(0.58, 0.86, 0.42, 1.05), S(0.42, 1.05, 0.16, 1.05),
    S(0.16, 1.05, 0.06, 0.9),
  ],
  "4": [S(0.2, 1.05, 0.2, 0.02), S(0.06, 0.45, 0.62, 0.45), S(0.52, 1.05, 0.52, 0.02)],
  "5": [
    S(0.56, 1.05, 0.16, 1.05), S(0.16, 1.05, 0.1, 0.7), S(0.1, 0.7, 0.42, 0.6),
    S(0.42, 0.6, 0.58, 0.5), S(0.58, 0.5, 0.58, 0.24), S(0.58, 0.24, 0.42, 0.04),
    S(0.42, 0.04, 0.16, 0.02), S(0.16, 0.02, 0.06, 0.12),
  ],
  "6": [
    S(0.55, 0.4, 0.55, 0.9), S(0.55, 0.9, 0.42, 1.05), S(0.42, 1.05, 0.2, 1.05),
    S(0.2, 1.05, 0.06, 0.88), S(0.06, 0.88, 0.06, 0.44), S(0.06, 0.44, 0.2, 0.26),
    S(0.2, 0.26, 0.44, 0.26), S(0.44, 0.26, 0.55, 0.4), S(0.55, 0.4, 0.3, 0.5, 0.1),
  ],
  "7": [S(0.06, 1.05, 0.62, 1.05), S(0.62, 1.05, 0.26, 0.02)],
  "8": [
    S(0.16, 1.05, 0.16, 0.3), S(0.16, 0.3, 0.3, 0.14), S(0.3, 0.14, 0.56, 0.14),
    S(0.56, 0.14, 0.58, 0.44), S(0.58, 0.44, 0.46, 0.56), S(0.46, 0.56, 0.58, 0.68),
    S(0.58, 0.68, 0.56, 0.94), S(0.56, 0.94, 0.34, 1.05), S(0.34, 1.05, 0.16, 1.05),
    S(0.16, 0.55, 0.56, 0.55, 0.1),
  ],
  "9": [
    S(0.56, 0.02, 0.56, 0.6), S(0.56, 0.6, 0.4, 0.9), S(0.4, 0.9, 0.2, 0.9),
    S(0.2, 0.9, 0.08, 0.7), S(0.08, 0.7, 0.08, 0.4), S(0.08, 0.4, 0.2, 0.24),
    S(0.2, 0.24, 0.4, 0.24), S(0.4, 0.24, 0.56, 0.4), S(0.08, 0.4, 0.4, 0.4),
  ],
  "#": [S(0.16, 1.05, 0.3, 0.02), S(0.42, 1.05, 0.56, 0.02), S(0.06, 0.68, 0.66, 0.68), S(0.08, 0.4, 0.66, 0.4)],
  ".": [S(0.18, 0.1, 0.18, 0.04, 0.14)],
  ":": [S(0.14, 0.78, 0.14, 0.72, 0.14), S(0.14, 0.32, 0.14, 0.26, 0.14)],
  "-": [S(0.08, 0.55, 0.6, 0.55, 0.12)],
  "/": [S(0.58, 1.05, 0.08, 0.02)],
  "&": [
    S(0.5, 0.2, 0.5, 0.6), S(0.5, 0.6, 0.4, 0.72), S(0.4, 0.72, 0.28, 0.6),
    S(0.28, 0.6, 0.34, 0.5), S(0.34, 0.5, 0.56, 0.9), S(0.56, 0.9, 0.46, 1.02),
    S(0.46, 1.02, 0.32, 1.02), S(0.32, 1.02, 0.22, 0.9), S(0.22, 0.9, 0.24, 0.74),
    S(0.24, 0.74, 0.5, 0.3), S(0.5, 0.3, 0.62, 0.14),
  ],
  ",": [S(0.16, 0.16, 0.16, 0.04, 0.14)],
  "'": [S(0.18, 0.9, 0.18, 0.7, 0.12)],
  "!": [S(0.2, 1.05, 0.2, 0.5, 0.14), S(0.2, 0.2, 0.2, 0.1, 0.14)],
  "(": [S(0.44, 1.05, 0.26, 0.52), S(0.26, 0.52, 0.44, 0.02)],
  ")": [S(0.2, 1.05, 0.38, 0.52), S(0.38, 0.52, 0.2, 0.02)],
  "+": [S(0.06, 0.52, 0.6, 0.52, 0.12), S(0.33, 0.28, 0.33, 0.78, 0.12)],
  "$": [
    S(0.3, 1.12, 0.3, -0.12, 0.09), S(0.3, 1.08, 0.52, 0.94), S(0.52, 0.94, 0.52, 0.74),
    S(0.52, 0.74, 0.3, 0.62), S(0.3, 0.4, 0.52, 0.28), S(0.52, 0.28, 0.52, 0.1),
    S(0.52, 0.1, 0.3, -0.04),
  ],
  " ": [],
};

// ─── Text rendering (anti-aliased strokes) ───────────────────────────────────

const GLYPH_ADVANCE = 0.62; // cap-height units per glyph (incl. spacing)

function textWidth(text: string, capHeight: number): number {
  const chars = text.toUpperCase().split("");
  return chars.length * GLYPH_ADVANCE * capHeight;
}

function fitText(text: string, capHeight: number, maxWidth: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const maxChars = Math.max(3, Math.floor(maxWidth / (GLYPH_ADVANCE * capHeight)));
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, Math.max(1, maxChars - 2));
  return `${cut.replace(/\s+\S*$/, "")}..`;
}

/** Draw text using the vector stroke font, centered at (cx, baseline). */
function drawTextCentered(
  canvas: RgbCanvas,
  cx: number,
  baseline: number,
  text: string,
  capHeight: number,
  color: RGB,
) {
  const w = textWidth(text, capHeight);
  let cursor = cx - w / 2;
  for (const ch of text.toUpperCase().split("")) {
    const strokes = FONT_MASTERS[ch];
    if (strokes && strokes.length > 0) {
      for (const [sx1, sy1, sx2, sy2, t] of strokes) {
        const x1 = cursor + sx1 * capHeight;
        const y1 = baseline - sy1 * capHeight;
        const x2 = cursor + sx2 * capHeight;
        const y2 = baseline - sy2 * capHeight;
        const radius = (t * capHeight) / 2;
        canvas.strokeSegment(x1, y1, x2, y2, radius, color);
      }
    }
    cursor += GLYPH_ADVANCE * capHeight;
  }
}

/** Draw text left-aligned at (x, baseline). */
function drawTextLeft(
  canvas: RgbCanvas,
  x: number,
  baseline: number,
  text: string,
  capHeight: number,
  color: RGB,
) {
  let cursor = x;
  for (const ch of text.toUpperCase().split("")) {
    const strokes = FONT_MASTERS[ch];
    if (strokes && strokes.length > 0) {
      for (const [sx1, sy1, sx2, sy2, t] of strokes) {
        canvas.strokeSegment(
          cursor + sx1 * capHeight,
          baseline - sy1 * capHeight,
          cursor + sx2 * capHeight,
          baseline - sy2 * capHeight,
          (t * capHeight) / 2,
          color,
        );
      }
    }
    cursor += GLYPH_ADVANCE * capHeight;
  }
}

// ─── White theme layout ──────────────────────────────────────────────────────

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
const M = 90; // left/right margin
const CONTENT_W = W - M * 2;

const COL: Record<string, RGB> = {
  white: [255, 255, 255],
  ink: [26, 31, 40], // near-black
  muted: [110, 120, 135], // dark gray secondary
  panel: [246, 248, 251], // light gray panel
  border: [223, 228, 236], // light gray border
  green: [22, 150, 92], // WG brand green (darker for white bg)
  gold: [198, 150, 28],
};

function statusColor(status: string): RGB {
  const s = status.toLowerCase();
  if (s === "completed") return [20, 120, 62];
  if (s === "processing") return [28, 76, 205];
  if (s === "cancelled") return [183, 30, 34];
  return [172, 118, 10]; // pending → amber
}

function statusTint(status: string): RGB {
  const s = status.toLowerCase();
  if (s === "completed") return [228, 244, 234];
  if (s === "processing") return [230, 237, 252];
  if (s === "cancelled") return [250, 229, 230];
  return [252, 244, 226];
}

/** Rounded panel with a light-gray border ring (professional card). */
function drawPanel(canvas: RgbCanvas, x: number, y: number, w: number, h: number, r: number) {
  canvas.fillRoundRect(x, y, w, h, r, COL.border);
  canvas.fillRoundRect(x + 2, y + 2, w - 4, h - 4, Math.max(2, r - 2), COL.panel);
}

/** Small uppercase label + large value row. Returns the next baseline. */
function drawField(
  canvas: RgbCanvas,
  x: number,
  labelBaseline: number,
  label: string,
  value: string,
  maxValueWidth: number,
  valueColor: RGB = COL.ink,
  valueCap = 40,
): number {
  drawTextLeft(canvas, x, labelBaseline, label, 16, COL.muted);
  drawTextLeft(canvas, x, labelBaseline + 48, fitText(value, valueCap, maxValueWidth), valueCap, valueColor);
  return labelBaseline + 118;
}

function drawStatusPill(canvas: RgbCanvas, rightEdge: number, centerY: number, status: string) {
  const cap = 34;
  const textW = textWidth(status, cap);
  const pw = textW + 56;
  const px = rightEdge - pw;
  const ph = 64;
  const py = centerY - ph / 2;
  const tint = statusTint(status);
  const color = statusColor(status);
  canvas.fillRoundRect(px, py, pw, ph, 32, tint);
  drawTextCentered(canvas, px + pw / 2, py + ph / 2 + cap / 3, status, cap, color);
}

export function renderOrderTranscriptPng(info: TranscriptInfo): Buffer {
  const canvas = new RgbCanvas(W, H, COL.white);
  const logo = getWgLogo();

  // ── Header ─────────────────────────────────────────────────────────────
  if (logo) {
    canvas.drawImage(logo, M, 74, 128, 128, 0);
  } else {
    canvas.fillRoundRect(M, 74, 128, 128, 30, COL.green);
    drawTextCentered(canvas, M + 64, 74 + 64 + 22, "WG", 52, COL.white);
  }
  drawTextLeft(canvas, M + 164, 138, "WG-SHOP", 60, COL.green);
  drawTextLeft(canvas, M + 166, 176, "WARYAA GAMING", 22, COL.ink);

  const tRight = "TRANSCRIPT";
  drawTextLeft(canvas, W - M - textWidth("ORDER", 44), 118, "ORDER", 44, COL.ink);
  drawTextLeft(canvas, W - M - textWidth(tRight, 40), 162, tRight, 40, COL.green);

  canvas.hLine(M, 232, CONTENT_W, COL.border);

  // ── Customer information ────────────────────────────────────────────────
  drawTextLeft(canvas, M, 292, "CUSTOMER INFORMATION", 20, COL.muted);
  drawPanel(canvas, M, 316, CONTENT_W, 380, 16);

  const colL = M + 26;
  const colR = M + 26 + (CONTENT_W - 52) / 2 + 34;
  const fieldW = (CONTENT_W - 52) / 2 - 40;
  const rowDividerW = colR + fieldW - colL;

  let y = 372;
  drawField(canvas, colL, y, "FULL NAME", info.fullName, fieldW);
  drawField(canvas, colR, y, "NUMBER", info.phone, fieldW);
  canvas.hLine(colL, 458, rowDividerW, COL.border);
  y = 490;
  drawField(canvas, colL, y, "ACCOUNT NO", info.accountNo ?? "-", fieldW);
  drawField(canvas, colR, y, "DISCORD USERNAME", info.discord, fieldW);
  y = 608;
  canvas.hLine(colL, y - 30, rowDividerW, COL.border);
  drawField(canvas, colL, y, "PRICE", info.price, fieldW, COL.green, 46);

  // ── Order information panel ─────────────────────────────────────────────
  drawTextLeft(canvas, M, 742, "ORDER INFORMATION", 20, COL.muted);
  drawPanel(canvas, M, 766, CONTENT_W, 336, 16);

  let oy = 834;
  drawField(canvas, colL, oy, "ORDER ID", info.orderId, fieldW, COL.green, 46);
  drawField(canvas, colR, oy, "PRODUCT", info.productName, fieldW);
  oy = 954;
  drawField(canvas, colL, oy, "DATE", info.date, fieldW);
  drawTextLeft(canvas, colR, oy, "STATUS", 16, COL.muted);
  drawStatusPill(canvas, W - M - 26, oy + 40, info.status);

  // ── Footer ──────────────────────────────────────────────────────────────
  canvas.hLine(M, 1436, CONTENT_W, COL.border);
  drawTextCentered(canvas, W / 2, 1490, "WG-SHOP", 40, COL.green);
  drawTextCentered(canvas, W / 2, 1528, "WARYAA GAMING", 18, COL.ink);
  drawTextCentered(canvas, W / 2, 1558, "OFFICIAL MARKETPLACE  -  SECURE TRANSACTION", 14, COL.muted);
  drawTextCentered(
    canvas,
    W / 2,
    1584,
    "THANK YOU FOR CHOOSING WG-SHOP  -  YOUR TRUST IS OUR PRIORITY",
    12,
    COL.muted,
  );

  return canvas.toPng();
}
