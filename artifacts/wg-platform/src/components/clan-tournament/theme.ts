/**
 * Design tokens for the Clan Tournament arena.
 *
 * "Midnight Arena": deep indigo surfaces lit by a cyan → violet → magenta glow
 * field, with champion gold reserved for the podium and the trophy race. The
 * card shells, medals, podium rows and pitch texture live in index.css under the
 * `.clan-*` namespace so every panel shares one visual language.
 */
export const clanTheme = {
  /** Page canvas — the `.clan-page` class paints the real (gradient) backdrop. */
  bg: "#070b1c",
  /** Navigation / header surface. */
  surface: "#0b1024",
  /** Recessed surface used for table headers and inputs. */
  surfaceAlt: "#0a0f20",
  /** Elevated panel surface. */
  card: "#111838",
  /** Deepest panel surface. */
  cardAlt: "#0d1329",
  border: "rgba(148, 163, 255, 0.17)",
  borderStrong: "rgba(148, 163, 255, 0.32)",
  /** Primary text. */
  text: "#f8fafc",
  /** Secondary / label text. */
  muted: "#93a2c9",
  /** Primary accent (cyan). */
  accent: "#22d3ee",
  /** Secondary accent (violet). */
  accentAlt: "#a855f7",
  /** Tertiary accent (magenta). */
  accentWarm: "#f472b6",
  /** Podium metals. */
  gold: "#f59e0b",
  silver: "#cbd5e1",
  bronze: "#ea580c",
  win: "#22c55e",
  draw: "#7c8aa8",
  loss: "#f43f5e",
  /** Pitch surfaces for the Team of the Week widget. */
  pitch: "#0f5132",
  pitchAlt: "#0b3d27",
  pitchLine: "rgba(255, 255, 255, 0.26)",
  /** Rating badge text. */
  rating: "#fbbf24",
} as const;

/** Gradient strings shared by medals, headings and hairlines. */
export const clanGradient = {
  brand: "linear-gradient(135deg, #22d3ee 0%, #6366f1 48%, #a855f7 100%)",
  brandText: "linear-gradient(92deg, #67e8f9 0%, #c4b5fd 55%, #f9a8d4 100%)",
  gold: "linear-gradient(135deg, #fde68a 0%, #f59e0b 55%, #b45309 100%)",
  silver: "linear-gradient(135deg, #f8fafc 0%, #cbd5e1 55%, #94a3b8 100%)",
  bronze: "linear-gradient(135deg, #fdba74 0%, #ea580c 55%, #9a3412 100%)",
  rail: "linear-gradient(90deg, transparent, rgba(34,211,238,0.7), rgba(168,85,247,0.7), rgba(244,114,182,0.6), transparent)",
} as const;

/**
 * The top-three podium treatment: medal class, row highlight class and metal
 * colour, in rank order. Reused by the standings table and the stats boards.
 */
export const clanPodium = [
  { medal: "clan-medal-1", row: "clan-podium-1", color: clanTheme.gold, label: "Champions" },
  { medal: "clan-medal-2", row: "clan-podium-2", color: clanTheme.silver, label: "Runners-up" },
  { medal: "clan-medal-3", row: "clan-podium-3", color: clanTheme.bronze, label: "Third place" },
] as const;

/** The podium entry for a rank, or `null` when outside the top three. */
export function podiumFor(rank: number) {
  return rank >= 1 && rank <= clanPodium.length ? clanPodium[rank - 1] : null;
}

/**
 * Rounded glass card shell shared by every panel. The visual treatment (gradient
 * surface, iridescent top hairline, soft shadow) comes from `.clan-card` in
 * index.css, so panels must not set their own background/border colours.
 */
export const clanCard = "clan-card rounded-2xl border overflow-hidden" as const;

/** Muted uppercase micro-label used above table headers. */
export const clanLabel = "text-[10px] font-bold uppercase tracking-[0.14em]" as const;
