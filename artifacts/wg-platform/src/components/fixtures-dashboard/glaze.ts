/** Shared gamma/alpha color helpers (kept separate from palette tokens). */
import { hexToRgba } from "./theme";

/** Convert a hex color + alpha to an rgba() string (alias for theme.hexToRgba). */
export function glaze(hex: string, alpha: number): string {
  return hexToRgba(hex, alpha);
}