/**
 * TeamEmblem — the hexagonal badge rendered for a clan.
 * Uses the team accent color for the edge + glow so every clan is identifiable.
 */
import { glaze } from "./glaze";
import type { Team } from "./types";

interface TeamEmblemProps {
  team: Team;
  size?: number;
}

export function TeamEmblem({ team, size = 44 }: TeamEmblemProps) {
  const label = team.tag || team.name.slice(0, 2).toUpperCase();
  return (
    <div
      role="img"
      aria-label={team.name}
      className="relative flex items-center justify-center rounded-lg font-black text-white shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.3,
        letterSpacing: "0.02em",
        color: team.color,
        border: `1px solid ${glaze(team.color, 0.55)}`,
        background: `linear-gradient(140deg, ${glaze(team.color, 0.22)}, ${glaze(team.color, 0.05)} 60%), #10162a`,
        boxShadow: `0 0 ${size * 0.35}px ${glaze(team.color, 0.4)}, inset 0 0 ${size * 0.2}px ${glaze(team.color, 0.12)}`,
      }}
    >
      <span className="drop-shadow-[0_0_6px_currentColor]">{label}</span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg"
        style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25)` }}
      />
    </div>
  );
}