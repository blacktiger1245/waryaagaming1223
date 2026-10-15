/**
 * Dark esports palette + gradients shared by the match result and MOTM surfaces.
 * Gradients are plain CSS strings so they render identically inside the app and
 * inside any rasterised export (html-to-image) without a Tailwind build step.
 */
export const mr = {
  bg: "#0D0D0D",
  panel: "#121212",
  panelSoft: "#161616",
  /** Gold hairlines / borders. */
  line: "rgba(255,153,0,0.22)",
  lineStrong: "rgba(255,153,0,0.40)",
  gold: "#FF9900",
  goldBright: "#FFB800",
  green: "#22C55E",
  text: "#F4F4F5",
  muted: "#9A9A9A",
} as const;

/** Gold CTA fill (buttons, progress bars). */
export const goldCta = "linear-gradient(135deg,#FFC24D,#FF9900 55%,#B35F00)";
/** Card surface. */
export const panelGradient = "linear-gradient(160deg,#151515,#0E0E0E 55%,#111111)";
/** MOTM hero surface. */
export const heroGradient = "linear-gradient(150deg,#1F1305,#121212 48%,#0F0F0F)";
/** 3px bar along the top edge of each card. */
export const goldHairline = "linear-gradient(90deg,transparent,#FFB800,#FF9900,transparent)";
export const goldBorder = "1px solid rgba(255,153,0,0.22)";
export const cardShadow = "0 26px 60px -32px rgba(0,0,0,0.95)";
/** Metallic ring around the MVP portrait. */
export const mvPortraitRing =
  "0 0 0 4px #FFB800, 0 0 0 10px rgba(255,153,0,0.18), 0 24px 48px -16px rgba(255,153,0,0.55)";
