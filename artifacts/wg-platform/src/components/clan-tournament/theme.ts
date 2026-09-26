/**
 * Design tokens for the Clan Tournament section.
 *
 * FotMob-inspired: flat dark surfaces, muted grey labels, high-contrast tabular
 * data, and a single neon-green accent reserved for the active tab indicator and
 * win states.
 */
export const clanTheme = {
  /** Page canvas — equivalent to bg-[#1a1a1a]. */
  bg: "#1a1a1a",
  /** Navigation / header surface — equivalent to bg-zinc-900. */
  surface: "#18181b",
  /** Slightly recessed surface used for table headers and cards. */
  surfaceAlt: "#111113",
  /** Elevated card surface. */
  card: "#1f1f23",
  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.14)",
  /** Active tab text + primary values. */
  text: "#ffffff",
  /** Inactive tab text — equivalent to #a1a1aa. */
  muted: "#a1a1aa",
  /** Neon green accent — equivalent to #22c55e / #10b981. */
  accent: "#22c55e",
  accentAlt: "#10b981",
  win: "#22c55e",
  draw: "#71717a",
  loss: "#ef4444",
  /** Pitch surfaces for the Team of the Week widget. */
  pitch: "#1b4332",
  pitchAlt: "#14342a",
  pitchLine: "rgba(255, 255, 255, 0.22)",
  /** Rating badge text. */
  rating: "#facc15",
} as const;

/** Rounded card shell shared by the standings table and pitch widget. */
export const clanCard =
  "rounded-xl border overflow-hidden" as const;

/** Muted uppercase micro-label used above table headers. */
export const clanLabel =
  "text-[10px] font-bold uppercase tracking-[0.14em]" as const;
