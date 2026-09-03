import { deflateSync } from "node:zlib";

/**
 * Server-side WG-SHOP order-transcript PNG generator.
 *
 * Zero external dependencies: a minimal PNG encoder (Node's built-in zlib) plus
 * a compact 5x7 bitmap font. The manager's browser only sends the order id —
 * the whole image is rendered here from the database and uploaded to object
 * storage, so no large base64 payload ever crosses the API.
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

function blend(base: RGB, top: RGB, alpha: number): RGB {
  return [
    Math.round(base[0] * (1 - alpha) + top[0] * alpha),
    Math.round(base[1] * (1 - alpha) + top[1] * alpha),
    Math.round(base[2] * (1 - alpha) + top[2] * alpha),
  ];
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
}

// ─── 5x7 bitmap font (columns MSB→LSB, row bytes are 5 bits wide) ────────────
// Covers A-Z, 0-9 and the punctuation used on transcripts. Text is rendered
// uppercase for a clean, bold, gaming-style look.

const FONT_5X7: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x11, 0x0a, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  "#": [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  ":": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  "-": [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  ",": [0x00, 0x00, 0x00, 0x00, 0x0c, 0x04, 0x08],
  "'": [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00],
  "!": [0x04, 0x04, 0x04, 0x04, 0x00, 0x00, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  "+": [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

function textWidth(text: string, scale: number): number {
  const chars = text.toUpperCase().split("");
  return chars.length * (GLYPH_W + 1) * scale - scale;
}

function drawText(canvas: RgbCanvas, x: number, y: number, text: string, scale: number, color: RGB): number {
  const chars = text.toUpperCase().split("");
  let cursor = x;
  for (const ch of chars) {
    const glyph = FONT_5X7[ch];
    if (glyph) {
      for (let row = 0; row < GLYPH_H; row++) {
        const bits = glyph[row];
        for (let col = 0; col < GLYPH_W; col++) {
          if (bits & (0x10 >> col)) {
            canvas.fillRect(cursor + col * scale, y + row * scale, scale, scale, color);
          }
        }
      }
    }
    cursor += (GLYPH_W + 1) * scale;
  }
  return cursor - x;
}

// ─── Transcript layout ───────────────────────────────────────────────────────

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

const W = 860;
const COL: Record<string, RGB> = {
  bg: [7, 11, 20], // #070b14
  card: [13, 22, 38], // #0d1626
  border: [34, 48, 79], // #22304f
  panel: [21, 30, 50],
  text: [241, 245, 249], // #f1f5f9
  green: [134, 239, 172], // #86efac
  gold: [250, 204, 21], // #facc15
};

function truncate(text: string, scale: number): string {
  const maxChars = Math.floor((W - 144) / ((GLYPH_W + 1) * scale));
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > maxChars ? `${clean.slice(0, Math.max(0, maxChars - 2))}..` : clean;
}

function drawField(
  canvas: RgbCanvas,
  label: string,
  value: string,
  y: number,
): number {
  const muted = blend(COL.text, COL.card, 0.45);
  drawText(canvas, 72, y, label, 2, muted);
  drawText(canvas, 72, y + 24, truncate(value, 4), 4, COL.text);
  return y + 82;
}

export function renderOrderTranscriptPng(info: TranscriptInfo): Buffer {
  const H = info.accountNo ? 1120 : 1042;
  const canvas = new RgbCanvas(W, H, COL.bg);

  // Neon glow accent (top right)
  canvas.radialGlow(790, 100, 430, COL.green, 0.14);

  // Main card with border ring
  canvas.fillRoundRect(36, 36, W - 72, H - 72, 20, COL.border);
  canvas.fillRoundRect(38, 38, W - 76, H - 76, 18, COL.card);

  // Brand mark: rounded accent square with "WG"
  canvas.fillRoundRect(72, 74, 64, 64, 12, COL.green);
  drawText(canvas, 72 + (64 - textWidth("WG", 5)) / 2, 74 + (64 - GLYPH_H * 5) / 2, "WG", 5, COL.bg);

  // Header
  drawText(canvas, 156, 78, "WG-SHOP", 7, COL.green);
  drawText(canvas, 158, 132, "W A R Y A A  G A M I N G", 2, blend(COL.text, COL.card, 0.45));
  const headerRight = "ORDER TRANSCRIPT";
  drawText(canvas, W - 72 - textWidth(headerRight, 3), 92, headerRight, 3, COL.gold);

  canvas.hLine(72, 172, W - 144, COL.border);

  // Fields
  let y = 202;
  y = drawField(canvas, "Full Name", info.fullName, y);
  y = drawField(canvas, "Number", info.phone, y);
  if (info.accountNo) y = drawField(canvas, "Account No", info.accountNo, y);
  y = drawField(canvas, "Discord Username", info.discord, y);
  y = drawField(canvas, "Price", info.price, y);

  // Order meta panel
  const panelTop = y - 6;
  canvas.fillRoundRect(52, panelTop, W - 104, 218, 14, COL.panel);
  let py = panelTop + 26;
  py = drawField(canvas, "Order ID", info.orderId, py);
  py = drawField(canvas, "Product", info.productName, py);

  const muted = blend(COL.text, COL.card, 0.45);
  drawText(canvas, 72, py, "DATE", 2, muted);
  drawText(canvas, 72, py + 24, truncate(info.date, 4), 4, COL.text);
  drawText(canvas, W - 72 - textWidth("STATUS", 2), py, "STATUS", 2, muted);
  drawText(canvas, W - 72 - textWidth(info.status, 4), py + 24, truncate(info.status, 4), 4, COL.green);

  // Footer
  const footer = "GENERATED BY WG-SHOP - WARYAA GAMING OFFICIAL MARKETPLACE";
  drawText(canvas, (W - textWidth(footer, 2)) / 2, H - 66, footer, 2, blend(COL.text, COL.bg, 0.35));

  return canvas.toPng();
}


