/**
 * ClanTournamentPage — the Clan Tournament section.
 *
 * Renders the FotMob-style section navigation bar, then a split 12-column
 * layout: clan standings table (8/12) on the left and the Team of the Week
 * pitch widget (4/12) on the right for the Overview and Table tabs.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  Layers,
  Newspaper,
  Repeat,
  Users,
} from "lucide-react";
import {
  ClanStandingsTable,
  ClanTournamentNav,
  PREVIEW_STANDINGS,
  PREVIEW_TEAM_OF_THE_WEEK,
  SeasonSidebar,
  SeasonSummary,
  SectionPlaceholder,
  TeamOfTheWeekPitch,
  clanTheme,
} from "@/components/clan-tournament";
import type {
  ClanStanding,
  ClanTournamentTabId,
  SeasonOption,
  TournamentOption,
} from "@/components/clan-tournament";
import { apiUrl } from "@/lib/api";

/** Fields we consume from GET /api/seasons. */
interface SeasonRow {
  id: number;
  name?: string | null;
  isCurrent?: boolean | null;
  topScorerPlayer?: SeasonPersonRow | null;
  ballonDorPlayer?: SeasonPersonRow | null;
}

interface SeasonPersonRow {
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/** Fields we consume from GET /api/tournaments. */
interface TournamentRow {
  id: number;
  name?: string | null;
  status?: string | null;
  seasonId?: number | null;
  tournamentType?: string | null;
  isClanTournament?: boolean | null;
}

function personLabel(p?: SeasonPersonRow | null): string {
  return p?.displayName?.trim() || p?.username?.trim() || "Unknown";
}

/**
 * Loose shape for GET /api/rankings/teams — the endpoint has returned both
 * `wins`/`losses` and `matchesWon`/`matchesLost` spellings across revisions, so
 * every field is optional and read defensively.
 */
interface TeamRankingRow {
  id: number;
  name?: string | null;
  tag?: string | null;
  logoUrl?: string | null;
  points?: number | null;
  wins?: number | null;
  losses?: number | null;
  draws?: number | null;
  matchesPlayed?: number | null;
  matchesWon?: number | null;
  matchesLost?: number | null;
}

function toStanding(row: TeamRankingRow, index: number): ClanStanding {
  const won = row.wins ?? row.matchesWon ?? 0;
  const lost = row.losses ?? row.matchesLost ?? 0;
  const drawn = row.draws ?? 0;
  const played = row.matchesPlayed ?? won + drawn + lost;

  return {
    id: row.id,
    rank: index + 1,
    name: row.name ?? "Unknown clan",
    tag: row.tag ?? "",
    logoUrl: row.logoUrl ?? null,
    played,
    won,
    drawn,
    lost,
    // The teams table does not aggregate goals, so these stay at 0 until a
    // goal-scoring aggregate exists. The columns remain aligned and honest.
    plusMinus: 0,
    goalDifference: 0,
    points: row.points ?? won * 3 + drawn,
    form: [],
    nextOpponent: null,
  };
}

/** Copy for the tabs whose data feed is not wired up yet. */
const PLACEHOLDERS: Record<
  Exclude<ClanTournamentTabId, "overview" | "table">,
  { title: string; description: string; icon: typeof Users }
> = {
  fixtures: {
    title: "Fixtures",
    description: "The full clan fixture list and results for the current round.",
    icon: CalendarDays,
  },
  "player-stats": {
    title: "Player stats",
    description: "Goals, assists and appearance rankings for every registered clan player.",
    icon: Users,
  },
  "team-stats": {
    title: "Team stats",
    description: "Possession, scoring and defensive breakdowns per clan.",
    icon: BarChart3,
  },
  transfers: {
    title: "Transfers",
    description: "Confirmed clan-to-clan player movements for the current season.",
    icon: Repeat,
  },
  seasons: {
    title: "Seasons",
    description: "Historical clan tournament seasons and final standings.",
    icon: Layers,
  },
  news: {
    title: "News",
    description: "Announcements and match reports from the clan tournament desk.",
    icon: Newspaper,
  },
};

function PreviewChip() {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
      style={{
        color: clanTheme.accent,
        background: "rgba(34, 197, 94, 0.12)",
        border: `1px solid rgba(34, 197, 94, 0.35)`,
      }}
      title="No live clan standings were returned, so the layout is shown with sample data."
    >
      Preview data
    </span>
  );
}

export default function ClanTournamentPage() {
  const [activeTab, setActiveTab] = useState<ClanTournamentTabId>("overview");
  const [round, setRound] = useState(5);
  /** `null` = All time. */
  const [activeSeasonId, setActiveSeasonId] = useState<number | null>(null);
  /** `null` = the whole season is selected rather than one tournament. */
  const [activeTournamentId, setActiveTournamentId] = useState<number | null>(null);

  const seasonsQuery = useQuery({
    queryKey: ["clan-tournament-seasons"],
    queryFn: async (): Promise<SeasonRow[]> => {
      const res = await fetch(apiUrl("/api/seasons"), { credentials: "include" });
      if (!res.ok) return [];
      const data = (await res.json().catch(() => [])) as unknown;
      return Array.isArray(data) ? (data as SeasonRow[]) : [];
    },
  });

  const tournamentsQuery = useQuery({
    queryKey: ["clan-tournament-tournaments"],
    queryFn: async (): Promise<TournamentRow[]> => {
      const res = await fetch(apiUrl("/api/tournaments"), { credentials: "include" });
      if (!res.ok) return [];
      const data = (await res.json().catch(() => [])) as unknown;
      return Array.isArray(data) ? (data as TournamentRow[]) : [];
    },
  });

  const standingsQuery = useQuery({
    queryKey: ["clan-tournament-standings", activeSeasonId],
    queryFn: async (): Promise<TeamRankingRow[]> => {
      const seasonParam = activeSeasonId == null ? "" : `?seasonId=${activeSeasonId}`;
      const res = await fetch(apiUrl(`/api/rankings/teams${seasonParam}`), {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = (await res.json().catch(() => [])) as unknown;
      return Array.isArray(data) ? (data as TeamRankingRow[]) : [];
    },
  });

  /**
   * On first load — and therefore after every page refresh — default the
   * selection to the CURRENT season the admin created. A deliberate selection
   * made afterwards is never overridden, and nothing is persisted, so a refresh
   * always returns to the current season.
   */
  const seasonDefaultedRef = useRef(false);
  useEffect(() => {
    if (seasonDefaultedRef.current) return;
    const list = seasonsQuery.data ?? [];
    if (list.length === 0) return;
    const current = list.find((s) => s.isCurrent) ?? list[0];
    seasonDefaultedRef.current = true;
    setActiveSeasonId(current.id);
  }, [seasonsQuery.data]);

  const liveStandings = useMemo<ClanStanding[]>(
    () => (standingsQuery.data ?? []).map((row, index) => toStanding(row, index)),
    [standingsQuery.data],
  );

  const seasons = useMemo<SeasonOption[]>(
    () =>
      (seasonsQuery.data ?? []).map((s) => ({
        id: s.id,
        name: s.name ?? `Season ${s.id}`,
        isCurrent: Boolean(s.isCurrent),
      })),
    [seasonsQuery.data],
  );

  /** Only clan/team-format tournaments belong in this section. */
  const clanTournaments = useMemo<TournamentOption[]>(
    () =>
      (tournamentsQuery.data ?? [])
        .filter((t) => t.isClanTournament === true || t.tournamentType === "team")
        .map((t) => ({
          id: t.id,
          name: t.name ?? `Tournament ${t.id}`,
          seasonId: t.seasonId ?? null,
          status: t.status ?? "upcoming",
        })),
    [tournamentsQuery.data],
  );

  const activeSeason = seasons.find((s) => s.id === activeSeasonId) ?? null;
  const activeTournament = clanTournaments.find((t) => t.id === activeTournamentId) ?? null;
  const activeSeasonRow =
    activeSeasonId == null
      ? null
      : (seasonsQuery.data ?? []).find((s) => s.id === activeSeasonId) ?? null;

  const toPerson = (p?: SeasonPersonRow | null) =>
    p ? { name: personLabel(p), avatarUrl: p.avatarUrl ?? null } : null;

  const scopeLabel = activeTournament?.name ?? activeSeason?.name ?? "All time";
  const tournamentSeasonLabel = activeTournament ? activeSeason?.name ?? null : null;
  const isCurrentSeason = Boolean(activeSeason?.isCurrent);
  const seasonTournamentCount =
    activeSeasonId == null
      ? clanTournaments.length
      : clanTournaments.filter((t) => t.seasonId === activeSeasonId).length;

  // Only fall back to sample data for the unfiltered "All time" view — a
  // specific season must never be shown sample rows in its table.
  const usingPreview = liveStandings.length === 0 && activeSeasonId == null;
  const standings = usingPreview ? PREVIEW_STANDINGS : liveStandings;
  const teamOfTheWeek = usingPreview ? PREVIEW_TEAM_OF_THE_WEEK : [];

  const placeholderSpec =
    activeTab === "overview" || activeTab === "table" ? null : PLACEHOLDERS[activeTab];

  const selectAllTime = () => {
    setActiveSeasonId(null);
    setActiveTournamentId(null);
  };

  const selectSeason = (seasonId: number) => {
    setActiveSeasonId(seasonId);
    setActiveTournamentId(null);
  };

  const selectTournament = (seasonId: number, tournamentId: number) => {
    setActiveSeasonId(seasonId);
    setActiveTournamentId(tournamentId);
  };

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: clanTheme.bg, color: clanTheme.text }}
    >
      <ClanTournamentNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        trailing={
          <span
            className="whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{
              color: clanTheme.accent,
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.35)",
            }}
            title="Active season"
          >
            {isCurrentSeason ? `${scopeLabel} · current` : scopeLabel}
          </span>
        }
      />

      <div className="mx-auto w-full max-w-[1500px] px-3 py-5 lg:px-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black uppercase tracking-[0.14em] text-white">
              Clan Tournament
            </h1>
            <p className="mt-1 truncate text-xs" style={{ color: clanTheme.muted }}>
              {scopeLabel} · season standings, fixtures and player ratings
            </p>
          </div>
          {usingPreview ? <PreviewChip /> : null}
        </div>

        {/* Selector on the left; everything on the right follows that selection. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <SeasonSidebar
            seasons={seasons}
            tournaments={clanTournaments}
            activeSeasonId={activeSeasonId}
            activeTournamentId={activeTournamentId}
            isLoading={seasonsQuery.isLoading}
            onSelectAllTime={selectAllTime}
            onSelectSeason={selectSeason}
            onSelectTournament={selectTournament}
          />

          <div className="min-w-0 space-y-4">
            <SeasonSummary
              scopeLabel={scopeLabel}
              seasonLabel={tournamentSeasonLabel}
              topScorer={toPerson(activeSeasonRow?.topScorerPlayer)}
              ballonDor={toPerson(activeSeasonRow?.ballonDorPlayer)}
              clanCount={standings.length}
              tournamentCount={seasonTournamentCount}
              isCurrentSeason={isCurrentSeason}
            />

            {/* Overview / Table — split 8/12 + 4/12 within the content column */}
            {placeholderSpec ? (
              <SectionPlaceholder
                title={placeholderSpec.title}
                description={placeholderSpec.description}
                icon={placeholderSpec.icon}
              />
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="lg:col-span-8">
                  <ClanStandingsTable
                    standings={standings}
                    title={`Standings — ${scopeLabel}`}
                  />
                </div>

                <div className="lg:col-span-4">
                  <TeamOfTheWeekPitch
                    players={teamOfTheWeek}
                    round={round}
                    minRound={1}
                    maxRound={38}
                    onRoundChange={setRound}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
