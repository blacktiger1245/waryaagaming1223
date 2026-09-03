import * as opentype from "opentype.js";
import { WG_LOGO_PNG_BASE64 } from "./logo-asset";
import { POPPINS_400_BASE64 } from "./poppins-regular-asset";
import { POPPINS_700_BASE64 } from "./poppins-bold-asset";

/**
 * Server-side WG-SHOP order-transcript PNG generator.
 *
 * Renders a professional vector purchase receipt as an SVG (real Poppins
 * typography, metallic-gold gradients, cards, color-coded status badge) and
 * rasterizes it to PNG with sharp (libvips/librsvg). The manager's browser only
 * sends the order id — the server builds everything from live order data, so no
 * huge base64 payload ever crosses the API.
 */

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

// ─── Small helpers ──────────────────────────────────────────────────────────

/** Truncate so long values never overflow a column. */
function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "...";
}

function statusTheme(status: string): { color: string; bg: string } {
  const s = status.toLowerCase();
  if (s === "completed") return { color: "#22c55e", bg: "#12281a" };
  if (s === "processing") return { color: "#3b82f6", bg: "#13233f" };
  if (s === "cancelled") return { color: "#ef4444", bg: "#2a1517" };
  return { color: "#f5a623", bg: "#2a1f10" };
}

// ─── Layout constants (1200 × 1600 portrait certificate) ────────────────────

const W = 1200;
const H = 1600;
const M = 88; // outer margin
const R = 1112; // right content edge
const CW = R - M; // 1024 content width
const LX = M + 52; // left column x (140)
const RX = M + CW - 52 - 440; // right column x (620)
const COLW = 440; // column width
const GOLD = "#d4af37";

// Real Poppins outlines converted to SVG paths — this removes any dependency on
// fonts being installed in the runtime. librsvg on Alpine has none, which made
// every <text> element render blank in production (only the design/logo showed).
const regularFont = opentype.parse(Buffer.from(POPPINS_400_BASE64, "base64"));
const boldFont = opentype.parse(Buffer.from(POPPINS_700_BASE64, "base64"));

interface TextOpts {
  bold?: boolean;
  anchor?: "start" | "middle" | "end";
  spacing?: number;
}

function fontFor(bold: boolean): opentype.Font {
  return bold ? boldFont : regularFont;
}

function measureText(font: opentype.Font, value: string, size: number, spacing: number): number {
  let w = 0;
  for (const ch of value) w += font.getAdvanceWidth(ch, size);
  if (value.length > 1) w += spacing * (value.length - 1);
  return w;
}

function text(
  x: number,
  y: number,
  value: string,
  size: number,
  fill: string,
  opts: TextOpts = {},
): string {
  const font = fontFor(opts.bold ?? false);
  const anchor = opts.anchor ?? "start";
  const spacing = opts.spacing ?? 0;
  const width = measureText(font, value, size, spacing);
  let cx = x;
  if (anchor === "middle") cx = x - width / 2;
  else if (anchor === "end") cx = x - width;
  let d = "";
  for (const ch of value) {
    d += font.getPath(ch, cx, y, size).toPathData(2);
    cx += font.getAdvanceWidth(ch, size) + spacing;
  }
  if (!d) return "";
  return `<path d="${d}" fill="${fill}"/>`;
}

function label(x: number, y: number, value: string): string {
  return text(x, y, value.toUpperCase(), 14, "#93a3bd", { spacing: 2.4 });
}

function fieldValue(x: number, y: number, val: string, size: number, fill: string, max: number): string {
  return text(x, y, truncate(val, max), size, fill, { bold: true });
}

// ─── SVG assembly ───────────────────────────────────────────────────────────

function buildSvg(info: TranscriptInfo): string {
  const status = statusTheme(info.status);
  const statusLabel = info.status.toUpperCase();
  const badgeW = Math.max(150, boldFont.getAdvanceWidth(statusLabel, 26) + 64);

  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a0f1c"/>
      <stop offset="0.55" stop-color="#0d1526"/>
      <stop offset="1" stop-color="#0a0f1c"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8c6d1f"/>
      <stop offset="0.45" stop-color="#e9cf7a"/>
      <stop offset="1" stop-color="#a9862a"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#141d33"/>
      <stop offset="1" stop-color="#0e1626"/>
    </linearGradient>
    <radialGradient id="topGlow" cx="0.5" cy="0" r="0.75">
      <stop offset="0" stop-color="#1c2a4a" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#1c2a4a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="logoGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="0.7" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="cardShadow" x="-4%" y="-4%" width="108%" height="108%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#topGlow)"/>

  <!-- Header -->
  <circle cx="${M + 66}" cy="${70 + 66}" r="96" fill="url(#logoGlow)"/>
  <image href="data:image/png;base64,${WG_LOGO_PNG_BASE64}" x="${M}" y="70" width="132" height="132" preserveAspectRatio="xMidYMid meet"/>
  ${text(M + 160, 148, "WG-SHOP", 56, "url(#gold)", { bold: true })}
  ${text(M + 162, 186, "WARYAA GAMING OFFICIAL MARKETPLACE", 16, "#93a3bd", { spacing: 1.5 })}
  ${text(R, 134, "ORDER", 42, "#f5f7fa", { bold: true, anchor: "end" })}
  ${text(R, 180, "TRANSCRIPT", 42, "url(#gold)", { bold: true, anchor: "end" })}
  ${text(R, 210, "OFFICIAL PURCHASE RECEIPT", 14, "#93a3bd", { anchor: "end", spacing: 2.4 })}
  <rect x="${M}" y="238" width="${CW}" height="3" rx="1.5" fill="url(#gold)"/>

  <!-- Customer information -->
  ${text(M, 308, "CUSTOMER INFORMATION", 24, GOLD, { bold: true, spacing: 2.6 })}
  <rect x="${M + 2}" y="324" width="56" height="3" rx="1.5" fill="url(#gold)"/>

  <g filter="url(#cardShadow)">
    <rect x="${M}" y="346" width="${CW}" height="430" rx="22" fill="url(#panel)" stroke="#2a3650" stroke-width="1.5"/>
    <rect x="${M + 2}" y="348" width="${CW - 4}" height="426" rx="20" fill="none" stroke="${GOLD}" stroke-opacity="0.35" stroke-width="1"/>
  </g>

  ${label(LX, 414, "Full Name")}${label(RX, 414, "Number")}
  ${fieldValue(LX, 462, info.fullName, 34, "#f5f7fa", 22)}${fieldValue(RX, 462, info.phone, 34, "#f5f7fa", 20)}
  <line x1="${LX}" y1="494" x2="${RX + COLW}" y2="494" stroke="#26324a" stroke-width="1.5" stroke-opacity="0.7"/>

  ${label(LX, 556, "Account No")}${label(RX, 556, "Discord Username")}
  ${fieldValue(LX, 604, info.accountNo ?? "-", 34, "#f5f7fa", 20)}${fieldValue(RX, 604, info.discord, 34, "#f5f7fa", 20)}
  <line x1="${LX}" y1="636" x2="${RX + COLW}" y2="636" stroke="#26324a" stroke-width="1.5" stroke-opacity="0.7"/>

  ${label(LX, 698, "Price")}
  ${text(LX, 746, truncate(info.price, 20), 44, GOLD, { bold: true })}`;

  const tail = `
  <!-- Order information -->
  ${text(M, 852, "ORDER INFORMATION", 24, GOLD, { bold: true, spacing: 2.6 })}
  <rect x="${M + 2}" y="868" width="56" height="3" rx="1.5" fill="url(#gold)"/>

  <g filter="url(#cardShadow)">
    <rect x="${M}" y="890" width="${CW}" height="300" rx="22" fill="url(#panel)" stroke="#2a3650" stroke-width="1.5"/>
    <rect x="${M + 2}" y="892" width="${CW - 4}" height="296" rx="20" fill="none" stroke="${GOLD}" stroke-opacity="0.35" stroke-width="1"/>
  </g>

  ${label(LX, 954, "Order ID")}${label(RX, 954, "Product")}
  ${fieldValue(LX, 1002, info.orderId, 32, "#f5f7fa", 20)}${fieldValue(RX, 1002, info.productName, 32, "#f5f7fa", 24)}
  <line x1="${LX}" y1="1034" x2="${RX + COLW}" y2="1034" stroke="#26324a" stroke-width="1.5" stroke-opacity="0.7"/>

  ${label(LX, 1092, "Date")}${label(RX, 1092, "Status")}
  ${fieldValue(LX, 1140, info.date, 30, "#f5f7fa", 14)}
  <g>
    <rect x="${RX}" y="1104" width="${badgeW}" height="56" rx="28" fill="${status.bg}"/>
    <rect x="${RX + 1}" y="1105" width="${badgeW - 2}" height="54" rx="27" fill="none" stroke="${status.color}" stroke-opacity="0.6" stroke-width="1.5"/>
    ${text(RX + badgeW / 2, 1140, statusLabel, 26, status.color, { bold: true, anchor: "middle" })}
  </g>

  <!-- Footer -->
  <rect x="${M}" y="1280" width="${CW}" height="3" rx="1.5" fill="url(#gold)"/>
  ${text(W / 2, 1352, "THANK YOU FOR CHOOSING WG-SHOP", 34, "#f5f7fa", { bold: true, anchor: "middle", spacing: 1.5 })}
  ${text(W / 2, 1402, "WARYAA GAMING OFFICIAL MARKETPLACE", 20, GOLD, { bold: true, anchor: "middle", spacing: 2 })}
  ${text(W / 2, 1442, "Your trust is our priority.", 15, "#93a3bd", { anchor: "middle" })}
</svg>`;

  return head + tail;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function renderOrderTranscriptPng(info: TranscriptInfo): Promise<Buffer> {
  const svg = buildSvg(info);
  // Lazy-load sharp so a native-module failure can never crash the whole API
  // server — only this endpoint would return an error, caught by the caller.
  const { default: sharp } = await import("sharp");
  return sharp(Buffer.from(svg)).png({ quality: 95 }).toBuffer();
}
