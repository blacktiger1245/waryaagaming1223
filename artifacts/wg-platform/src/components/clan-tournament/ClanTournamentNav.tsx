/**
 * ClanTournamentNav — the horizontal FotMob-style sub-navigation bar.
 *
 * Renders the eight section tabs in a fixed order with a neon-green underline
 * indicator beneath the active tab. The bar is horizontally scrollable on small
 * screens so all tabs stay reachable without wrapping.
 */
import type { ReactNode } from "react";
import { clanTheme } from "./theme";
import type { ClanTournamentTabId } from "./types";

export interface ClanTournamentTab {
  id: ClanTournamentTabId;
  label: string;
}

/** The eight section tabs, in the exact order the design specifies. */
export const CLAN_TOURNAMENT_TABS: ClanTournamentTab[] = [
  { id: "overview", label: "Overview" },
  { id: "table", label: "Table" },
  { id: "fixtures", label: "Fixtures" },
  { id: "player-stats", label: "Player stats" },
  { id: "team-stats", label: "Team stats" },
  { id: "transfers", label: "Transfers" },
  { id: "seasons", label: "Seasons" },
  { id: "news", label: "News" },
];

interface ClanTournamentNavProps {
  activeTab: ClanTournamentTabId;
  onTabChange: (tab: ClanTournamentTabId) => void;
  /** Optional right-aligned slot (e.g. a season selector). */
  trailing?: ReactNode;
}

export function ClanTournamentNav({ activeTab, onTabChange, trailing }: ClanTournamentNavProps) {
  return (
    <nav
      aria-label="Clan Tournament sections"
      className="sticky top-0 z-20 w-full border-b"
      style={{ background: clanTheme.surface, borderColor: clanTheme.border }}
    >
      <div className="mx-auto flex max-w-[1500px] items-stretch px-2 lg:px-4">
        <div
          role="tablist"
          className="flex flex-1 items-stretch gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {CLAN_TOURNAMENT_TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(tab.id)}
                data-testid={`tab-clan-${tab.id}`}
                className={
                  "relative shrink-0 whitespace-nowrap px-3 py-3.5 text-[13px] transition-colors lg:px-4 " +
                  (active ? "font-bold" : "font-semibold")
                }
                style={{ color: active ? clanTheme.text : clanTheme.muted }}
              >
                {tab.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-1.5 bottom-0 h-[3px] rounded-t-full"
                    style={{
                      background: clanTheme.accent,
                      boxShadow: `0 0 12px ${clanTheme.accent}`,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {trailing ? (
          <div className="hidden shrink-0 items-center pl-3 lg:flex">{trailing}</div>
        ) : null}
      </div>
    </nav>
  );
}

export default ClanTournamentNav;
