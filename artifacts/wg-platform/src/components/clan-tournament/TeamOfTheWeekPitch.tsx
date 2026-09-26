/**
 * TeamOfTheWeekPitch — the "Team of the Week" widget.
 *
 * A dark-green pitch with the week's best players placed in a 4-3-3 formation.
 * Each node shows the player's headshot (or initials), name, and match rating.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clanCard, clanTheme } from "./theme";
import type { PitchPlayer, PitchPosition } from "./types";

interface TeamOfTheWeekPitchProps {
  players: PitchPlayer[];
  round: number;
  minRound: number;
  maxRound: number;
  onRoundChange: (round: number) => void;
}

/** Rows rendered top → bottom: attacking line first, goalkeeper last. */
const FORMATION_ROWS: PitchPosition[] = ["FWD", "MID", "DEF", "GK"];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Static pitch markings (halfway line, centre circle, penalty areas). */
function PitchMarkings() {
  const line = `1px solid ${clanTheme.pitchLine}`;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* halfway line */}
      <div className="absolute inset-x-0 top-1/2" style={{ borderTop: line }} />
      {/* centre circle */}
      <div
        className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ border: line }}
      />
      {/* centre spot */}
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />
      {/* penalty areas */}
      <div
        className="absolute left-1/2 h-[14%] w-[62%] -translate-x-1/2 top-0 border-x border-b"
        style={{ borderColor: clanTheme.pitchLine }}
      />
      <div
        className="absolute left-1/2 h-[14%] w-[62%] -translate-x-1/2 bottom-0 border-x border-t"
        style={{ borderColor: clanTheme.pitchLine }}
      />
      {/* goal areas */}
      <div
        className="absolute left-1/2 h-[6%] w-[30%] -translate-x-1/2 top-0 border-x border-b"
        style={{ borderColor: clanTheme.pitchLine }}
      />
      <div
        className="absolute left-1/2 h-[6%] w-[30%] -translate-x-1/2 bottom-0 border-x border-t"
        style={{ borderColor: clanTheme.pitchLine }}
      />
    </div>
  );
}

function PlayerNode({ player }: { player: PitchPlayer }) {
  return (
    <div className="flex w-[74px] flex-col items-center gap-1">
      <div className="relative">
        <div
          className="h-12 w-12 overflow-hidden rounded-full"
          style={{ border: "2px solid rgba(255,255,255,0.75)", background: "rgba(0,0,0,0.35)" }}
        >
          {player.avatarUrl ? (
            <img
              src={player.avatarUrl}
              alt={player.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[13px] font-black text-white/80">
              {initials(player.name)}
            </span>
          )}
        </div>

        <span
          className="absolute -right-2 -top-1.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none shadow-[0_1px_4px_rgba(0,0,0,0.5)]"
          style={{ background: clanTheme.rating, color: "#171717" }}
        >
          {player.rating.toFixed(1)}
          {player.starred ? " ★" : ""}
        </span>
      </div>

      <span
        className="max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
        style={{ background: "rgba(0,0,0,0.45)" }}
        title={player.name}
      >
        {player.name}
      </span>
    </div>
  );
}

export function TeamOfTheWeekPitch({
  players,
  round,
  minRound,
  maxRound,
  onRoundChange,
}: TeamOfTheWeekPitchProps) {
  const byPosition = (position: PitchPosition) => players.filter((p) => p.position === position);
  const navButton =
    "flex h-6 w-6 items-center justify-center rounded-md transition-colors disabled:opacity-35";

  return (
    <section
      className={clanCard}
      style={{ background: clanTheme.card, borderColor: clanTheme.border }}
    >
      <header
        className="flex items-center justify-between gap-2 border-b px-4 py-3"
        style={{ borderColor: clanTheme.border }}
      >
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">
          Team of the Week
        </h2>

        {/* `< Round N >` selector */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Previous round"
            disabled={round <= minRound}
            onClick={() => onRoundChange(round - 1)}
            className={navButton}
            style={{
              background: clanTheme.surfaceAlt,
              color: clanTheme.text,
              border: `1px solid ${clanTheme.border}`,
            }}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          <span
            className="min-w-[62px] text-center text-[11px] font-bold tabular-nums"
            style={{ color: clanTheme.muted }}
          >
            Round {round}
          </span>

          <button
            type="button"
            aria-label="Next round"
            disabled={round >= maxRound}
            onClick={() => onRoundChange(round + 1)}
            className={navButton}
            style={{
              background: clanTheme.surfaceAlt,
              color: clanTheme.text,
              border: `1px solid ${clanTheme.border}`,
            }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="p-3">
        <div
          className="relative overflow-hidden rounded-lg"
          style={{
            aspectRatio: "3 / 4",
            background: `repeating-linear-gradient(180deg, ${clanTheme.pitch} 0 8%, ${clanTheme.pitchAlt} 8% 16%)`,
            border: `1px solid ${clanTheme.border}`,
          }}
        >
          <PitchMarkings />

          <div className="relative flex h-full flex-col justify-between py-4">
            {FORMATION_ROWS.map((position) => {
              const row = byPosition(position);
              if (row.length === 0) return null;
              return (
                <div key={position} className="flex items-start justify-around gap-1 px-2">
                  {row.map((player) => (
                    <PlayerNode key={player.id} player={player} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {players.length === 0 && (
        <p className="px-4 pb-6 text-center text-xs" style={{ color: clanTheme.muted }}>
          No ratings recorded for this round yet.
        </p>
      )}
    </section>
  );
}

export default TeamOfTheWeekPitch;
