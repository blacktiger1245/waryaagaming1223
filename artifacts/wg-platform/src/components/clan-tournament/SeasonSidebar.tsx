/**
 * SeasonSidebar — season / clan-tournament selector.
 *
 * Lists every season (newest first) with an "All time" option at the top. The
 * selected season expands to show the clan tournaments that belong to it, so the
 * user can scope the page either to a whole season or to a single tournament.
 */
import { useEffect, useState } from "react";
import { ChevronRight, Clock3 } from "lucide-react";
import { clanCard, clanLabel, clanTheme } from "./theme";

export interface SeasonOption {
  id: number;
  name: string;
  isCurrent: boolean;
}

export interface TournamentOption {
  id: number;
  name: string;
  seasonId: number | null;
  /** "upcoming" | "active" | "completed" | … (free-form from the API). */
  status: string;
}

interface SeasonSidebarProps {
  seasons: SeasonOption[];
  /** Already filtered to clan/team tournaments by the caller. */
  tournaments: TournamentOption[];
  /** `null` means "All time". */
  activeSeasonId: number | null;
  /** `null` means the whole season is selected. */
  activeTournamentId: number | null;
  isLoading: boolean;
  onSelectAllTime: () => void;
  onSelectSeason: (seasonId: number) => void;
  onSelectTournament: (seasonId: number, tournamentId: number) => void;
}

const ROW =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-semibold transition-colors";

/** Selected row treatment — a soft cyan → violet wash with a lit border. */
const ACTIVE_BG = "linear-gradient(135deg, rgba(34,211,238,0.18), rgba(168,85,247,0.22))";
const ACTIVE_BORDER = "1px solid rgba(148,163,255,0.45)";
const IDLE_BORDER = "1px solid transparent";

export function SeasonSidebar({
  seasons,
  tournaments,
  activeSeasonId,
  activeTournamentId,
  isLoading,
  onSelectAllTime,
  onSelectSeason,
  onSelectTournament,
}: SeasonSidebarProps) {
  const [openSeasonId, setOpenSeasonId] = useState<number | null>(activeSeasonId);

  // Keep the selected season expanded when selection changes from outside.
  useEffect(() => {
    if (activeSeasonId != null) setOpenSeasonId(activeSeasonId);
  }, [activeSeasonId]);

  const allTimeActive = activeSeasonId === null && activeTournamentId === null;

  return (
    <aside className={`${clanCard} p-3`} aria-label="Season and tournament selection">
      <p className={`${clanLabel} px-1 pb-2`} style={{ color: clanTheme.muted }}>
        Seasons
      </p>

      <button
        type="button"
        onClick={onSelectAllTime}
        className={ROW}
        style={{
          color: allTimeActive ? clanTheme.text : clanTheme.muted,
          background: allTimeActive ? ACTIVE_BG : "transparent",
          border: allTimeActive ? ACTIVE_BORDER : IDLE_BORDER,
        }}
      >
        <Clock3 className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate">All time</span>
      </button>

      <div className="mt-1 space-y-0.5">
        {seasons.map((season) => {
          const seasonActive = activeSeasonId === season.id;
          const seasonTournaments = tournaments.filter((t) => t.seasonId === season.id);
          const expanded = openSeasonId === season.id;

          return (
            <div key={season.id}>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelectSeason(season.id)}
                  className={ROW}
                  style={{
                    color: seasonActive ? clanTheme.text : clanTheme.muted,
                    background: seasonActive ? ACTIVE_BG : "transparent",
                    border: seasonActive ? ACTIVE_BORDER : IDLE_BORDER,
                  }}
                >
                  <span className="flex-1 truncate">{season.name}</span>
                  {season.isCurrent && (
                    <span
                      className="shrink-0 rounded px-1.5 py-px text-[8px] font-black uppercase tracking-wider"
                      style={{ color: clanTheme.accent, background: "rgba(34,211,238,0.16)" }}
                    >
                      Current
                    </span>
                  )}
                </button>

                {seasonTournaments.length > 0 && (
                  <button
                    type="button"
                    aria-label={expanded ? "Collapse tournaments" : "Expand tournaments"}
                    aria-expanded={expanded}
                    onClick={() => setOpenSeasonId(expanded ? null : season.id)}
                    className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md"
                    style={{ color: clanTheme.muted }}
                  >
                    <ChevronRight
                      className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
                    />
                  </button>
                )}
              </div>

              {expanded && seasonTournaments.length > 0 && (
                <div
                  className="ml-3 mt-0.5 space-y-0.5 border-l pl-2"
                  style={{ borderColor: clanTheme.border }}
                >
                  {seasonTournaments.map((t) => {
                    const tActive = activeTournamentId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onSelectTournament(season.id, t.id)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold transition-colors"
                        style={{
                          color: tActive ? clanTheme.text : clanTheme.muted,
                          background: tActive ? ACTIVE_BG : "transparent",
                        }}
                      >
                        <span className="flex-1 truncate">{t.name}</span>
                        <span
                          className="shrink-0 text-[9px] font-bold uppercase tracking-wide"
                          style={{ color: clanTheme.muted }}
                        >
                          {t.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {seasons.length === 0 && (
        <p className="px-1 py-3 text-[11px]" style={{ color: clanTheme.muted }}>
          {isLoading ? "Loading seasons…" : "No seasons have been created yet."}
        </p>
      )}
    </aside>
  );
}

export default SeasonSidebar;
