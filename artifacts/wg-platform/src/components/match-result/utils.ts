import type { MatchResultMotm } from "./types";

/** Clamp any number into a whole 0–100 percentage. */
function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Dynamic goal split for the head-to-head bar.
 *
 * Always derived from the actual duel goals (`motm.goals` vs the rival's goals)
 * so the widths stay correct even when the totals change — `goalPercentage` is
 * only used as a fallback when the duel has no goals at all.
 */
export function goalShare(motm: MatchResultMotm): { motmPct: number; rivalPct: number } {
  const total = motm.totalDuelGoals > 0 ? motm.totalDuelGoals : motm.goals + motm.duelVsPlayer.goals;
  if (total <= 0) {
    const pct = clampPct(motm.goalPercentage);
    return { motmPct: pct, rivalPct: 100 - pct };
  }
  const motmPct = clampPct(Math.round((motm.goals / total) * 100));
  return { motmPct, rivalPct: 100 - motmPct };
}

/** `10` → `"10.0"`, `9.25` → `"9.3"` — used by the rating badge. */
export function formatRating(rating: number): string {
  return (Number.isFinite(rating) ? rating : 0).toFixed(1);
}

/** Initials used when a player has no portrait (e.g. “Abdiqani Yusuf” → “AY”). */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
