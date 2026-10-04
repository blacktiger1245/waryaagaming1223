/**
 * TeamOfTheWeek — the automatically selected best XI of the current tournament
 * week, laid out in a 4-3-3.
 *
 * The eleven come straight from GET /api/clan-tournament/top-players: the
 * highest-ranked players of the selected round, ranked by their real tournament
 * statistics (goals, assists, results and the derived performance rating). Rank
 * #1 plays RW, #2 ST, #3 LW, #4-#6 CM, #7 RB, #8/#9 CB, #10 LB and #11 GK.
 *
 * Pitch rows are derived from each player's slot, so a week with fewer than
 * eleven results simply shows the players it earned — there are never
 * placeholder or hardcoded names.
 */
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { clanCard, clanGradient, clanTheme } from "./theme";
import { PITCH_ROW_OF, type ClanWeekOption, type PitchPlayer } from "./types";

interface TeamOfTheWeekProps {
  players: PitchPlayer[];
  /** Selected week label, e.g. "Round 3". */
  label: string | null;
  /** True once every fixture in the selected week is completed. */
  isComplete: boolean;
  /** Weeks that carry statistics, oldest → newest. */
  weeks: ClanWeekOption[];
  activeRound: number | null;
  onRoundChange: (round: number) => void;
  isLoading: boolean;
}

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
      <div className="absolute inset-x-0 top-1/2" style={{ borderTop: line }} />
      <div
        className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ border: line }}
      />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />
      <div
        className="absolute left-1/2 top-0 h-[14%] w-[62%] -translate-x-1/2 border-x border-b"
        style={{ borderColor: clanTheme.pitchLine }}
      />
      <div
        className="absolute bottom-0 left-1/2 h-[14%] w-[62%] -translate-x-1/2 border-x border-t"
        style={{ borderColor: clanTheme.pitchLine }}
      />
      <div
        className="absolute left-1/2 top-0 h-[6%] w-[30%] -translate-x-1/2 border-x border-b"
        style={{ borderColor: clanTheme.pitchLine }}
      />
      <div
        className="absolute bottom-0 left-1/2 h-[6%] w-[30%] -translate-x-1/2 border-x border-t"
        style={{ borderColor: clanTheme.pitchLine }}
      />
    </div>
  );
}

/** One player on the pitch: avatar, rating, position, rank and name. */
function PlayerNode({ player }: { player: PitchPlayer }) {
  return (
    <div className="flex w-[76px] flex-col items-center" data-testid={`totw-player-${player.playerId}`}>
      <div className="relative">
        <div
          className="h-12 w-12 overflow-hidden rounded-full"
          style={{
            border: "2px solid rgba(255,255,255,0.85)",
            background: "rgba(0,0,0,0.4)",
            boxShadow: player.starred
              ? "0 0 0 3px rgba(251,191,36,0.55), 0 0 22px -2px rgba(251,191,36,0.9)"
              : "0 6px 16px -8px rgba(0,0,0,0.9)",
          }}
        >
          {player.avatarUrl ? (
            <img
              src={player.avatarUrl}
              alt={player.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[13px] font-black text-white/85">
              {initials(player.name)}
            </span>
          )}
        </div>

        {/* total rating for the week */}
        <span
          className="absolute -right-2 -top-1.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none"
          style={{
            background: clanGradient.gold,
            color: "#221703",
            boxShadow: "0 2px 10px -2px rgba(245,158,11,0.9)",
          }}
          title={`Rating ${player.performance.toFixed(1)}`}
        >
          {player.performance.toFixed(1)}
          {player.starred ? " ★" : ""}
        </span>

        {/* the slot the ranking assigned this player */}
        <span
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-px text-[9px] font-black leading-none tracking-wide"
          style={{
            background: "rgba(8,12,28,0.92)",
            border: "1px solid rgba(148,163,255,0.45)",
            color: "#e0e7ff",
          }}
        >
          {player.position}
        </span>
      </div>

      <span
        className="mt-3 w-full truncate text-center text-[10px] font-bold text-white"
        title={player.name}
      >
        {player.name}
      </span>
      <span className="text-[9px] font-semibold tabular-nums" style={{ color: clanTheme.muted }}>
        #{player.rank} · {player.goals}G {player.assists}A
      </span>
    </div>
  );
}

/** The four pitch rows, top (attack) → bottom (goalkeeper). */
const ROWS = [0, 1, 2, 3] as const;

export function TeamOfTheWeek({
  players,
  label,
  isComplete,
  weeks,
  activeRound,
  onRoundChange,
  isLoading,
}: TeamOfTheWeekProps) {
  // Group the ranked eleven by the row their slot belongs to. A short week just
  // renders fewer rows — no filler players are ever added.
  const rows = ROWS.map((row) => players.filter((p) => PITCH_ROW_OF[p.position] === row)).filter(
    (row) => row.length > 0,
  );

  const weekIndex = weeks.findIndex((w) => w.round === activeRound);
  const previous = weekIndex > 0 ? weeks[weekIndex - 1] : null;
  const next = weekIndex >= 0 && weekIndex < weeks.length - 1 ? weeks[weekIndex + 1] : null;
  const navButton = "flex h-6 w-6 items-center justify-center rounded-md transition-colors disabled:opacity-35";

  return (
    <section className={clanCard} data-testid="team-of-the-week">
      <header
        className="flex items-center justify-between gap-2 border-b px-4 py-3"
        style={{ borderColor: clanTheme.border }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: clanGradient.brand, boxShadow: "0 0 18px -4px rgba(168,85,247,0.85)" }}
          >
            <Star className="h-3.5 w-3.5 text-white" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold uppercase tracking-[0.12em] text-white">
              Team of the Week
            </h2>
            {label ? (
              <p className="truncate text-[10px] font-semibold" style={{ color: clanTheme.muted }}>
                {label}
                {isComplete ? " · week complete" : ""}
              </p>
            ) : null}
          </div>
        </div>

        {weeks.length > 1 ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Previous week"
              disabled={!previous}
              onClick={() => previous && onRoundChange(previous.round)}
              className={navButton}
              style={{
                background: clanTheme.surfaceAlt,
                color: clanTheme.text,
                border: `1px solid ${clanTheme.border}`,
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <select
              aria-label="Tournament week"
              value={activeRound ?? ""}
              onChange={(e) => onRoundChange(Number(e.target.value))}
              className="rounded-md px-2 py-1 text-[11px] font-bold outline-none"
              style={{
                background: clanTheme.surfaceAlt,
                color: clanTheme.text,
                border: `1px solid ${clanTheme.border}`,
              }}
            >
              {weeks.map((week) => (
                <option key={week.round} value={week.round}>
                  {week.label}
                  {week.isComplete ? " ✓" : ""}
                </option>
              ))}
            </select>

            <button
              type="button"
              aria-label="Next week"
              disabled={!next}
              onClick={() => next && onRoundChange(next.round)}
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
        ) : null}
      </header>

      <div className="p-3">
        <div
          className="clan-pitch relative overflow-hidden rounded-xl"
          style={{ aspectRatio: "3 / 4", border: "1px solid rgba(16,185,129,0.35)" }}
        >
          <PitchMarkings />

          <div className="relative z-10 flex h-full flex-col justify-around py-5">
            {rows.map((row, index) => (
              <div key={index} className="flex items-start justify-around gap-1 px-2">
                {row.map((player) => (
                  <PlayerNode key={player.id} player={player} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {players.length === 0 ? (
        <p className="px-4 pb-6 text-center text-xs" style={{ color: clanTheme.muted }}>
          {isLoading
            ? "Loading this week's team…"
            : "No tournament statistics recorded for this week yet. The Team of the Week appears as soon as a clan fixture result is approved."}
        </p>
      ) : (
        <p className="px-4 pb-4 text-center text-[10px]" style={{ color: clanTheme.muted }}>
          Selected automatically from this week's tournament statistics — ranked #1 to #{players.length}.
        </p>
      )}
    </section>
  );
}

export default TeamOfTheWeek;

