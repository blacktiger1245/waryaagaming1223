/**
 * ClanBadge — clan crest used in the "Clan / Team" column and the "Next" column.
 *
 * Renders the uploaded crest when available; otherwise falls back to a flat
 * dark tile containing the clan tag so every row stays visually aligned.
 */
import { clanTheme } from "./theme";

interface ClanBadgeProps {
  name: string;
  tag: string;
  logoUrl?: string | null;
  size?: number;
}

export function ClanBadge({ name, tag, logoUrl, size = 26 }: ClanBadgeProps) {
  const label = tag.trim() || name.slice(0, 2).toUpperCase();

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-[6px] object-cover"
        style={{ width: size, height: size, border: `1px solid ${clanTheme.borderStrong}` }}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      className="inline-flex shrink-0 items-center justify-center rounded-[6px] font-black"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        letterSpacing: "0.02em",
        color: clanTheme.muted,
        background: clanTheme.surfaceAlt,
        border: `1px solid ${clanTheme.borderStrong}`,
      }}
    >
      {label.slice(0, 3)}
    </span>
  );
}

export default ClanBadge;
