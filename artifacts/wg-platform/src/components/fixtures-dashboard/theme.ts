/**
 * Design tokens for the Waryaa tournament dashboard.
 * Dark metallic/slate baseline with neon accents + glassmorphism.
 */

export const palette = {
  bg: "#0B0E14",
  panel: "#111624",
  panelAlt: "#0D1220",
  line: "rgba(120, 140, 190, 0.16)",
  cyan: "#00F0FF",
  crimson: "#FF2A5F",
  emerald: "#00E676",
  gold: "#FFB800",
  text: "#E7ECF5",
  muted: "#8A93A8",
} as const;

const hexToRgbaCache: Record<string, string> = {};

/** Convert a hex color to an rgba() string. */
export function hexToRgba(hex: string, alpha: number): string {
  const key = `${hex}:${alpha}`;
  if (hexToRgbaCache[key]) return hexToRgbaCache[key];
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) {
    const fallback = `rgba(34, 211, 238, ${alpha})`;
    hexToRgbaCache[key] = fallback;
    return fallback;
  }
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const v = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  hexToRgbaCache[key] = v;
  return v;
}

/** Soft neon outer glow box-shadow string. */
export function glowHex(hex: string, alpha = 0.15, blur = "15px"): string {
  return `0 0 ${blur} ${hexToRgba(hex, alpha)}`;
}

/** Glass panel shared class (metallic slate + 12px backdrop blur + 12px radius). */
export const glassPanel =
  "relative rounded-xl border backdrop-blur-[12px]";

/** Subtle inset top highlight for the metallic slate feel. */
export const insetSheen: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 40%)",
};