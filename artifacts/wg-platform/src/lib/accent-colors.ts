/**
 * Deterministic accent colors — one distinct identity per player / team card.
 * Purely decorative (visual only); maps an entity id onto a small, curated
 * palette so every card has its own background glow, border and stat color.
 */

export interface Accent {
  /** uppercase label, e.g. "INDIGO" */
  label: string;
  /** main hex (used for stat values, icon color) */
  hex: string;
  /** soft translucent background tint */
  soft: string;
  /** translucent border / ring color */
  tint: string;
  /** glow color for shadows / text shadows */
  glow: string;
}

const ACCENTS: Accent[] = [
  { label: "INDIGO",   hex: "#6366f1", soft: "rgba(99,102,241,0.18)",  tint: "rgba(99,102,241,0.46)",  glow: "rgba(99,102,241,0.55)" },
  { label: "CYAN",     hex: "#22d3ee", soft: "rgba(34,211,238,0.16)",  tint: "rgba(34,211,238,0.46)",  glow: "rgba(34,211,238,0.5)" },
  { label: "VIOLET",   hex: "#a78bfa", soft: "rgba(167,139,250,0.18)", tint: "rgba(167,139,250,0.46)", glow: "rgba(167,139,250,0.5)" },
  { label: "EMERALD",  hex: "#34d399", soft: "rgba(52,211,153,0.16)",  tint: "rgba(52,211,153,0.45)",  glow: "rgba(52,211,153,0.5)" },
  { label: "ROSE",     hex: "#fb7185", soft: "rgba(251,113,133,0.18)", tint: "rgba(251,113,133,0.46)", glow: "rgba(251,113,133,0.55)" },
  { label: "SKY",      hex: "#38bdf8", soft: "rgba(56,189,248,0.16)",  tint: "rgba(56,189,248,0.46)",  glow: "rgba(56,189,248,0.5)" },
  { label: "FUCHSIA",  hex: "#e879f9", soft: "rgba(232,121,249,0.18)", tint: "rgba(232,121,249,0.46)", glow: "rgba(232,121,249,0.5)" },
  { label: "AMBER",    hex: "#fbbf24", soft: "rgba(251,191,36,0.15)",  tint: "rgba(251,191,36,0.45)",  glow: "rgba(251,191,36,0.5)" },
];

/** Pick a stable accent for a numeric id (falls back to the first accent). */
export function accentForId(id: number): Accent {
  if (!Number.isFinite(id)) return ACCENTS[0];
  return ACCENTS[Math.abs(id) % ACCENTS.length];
}

/** Card background made from the accent's soft tint + the theme card color. */
export function accentCardBackground(acc: Accent): string {
  return `linear-gradient(165deg, ${acc.soft}, transparent 62%), var(--color-card, #101c36)`;
}