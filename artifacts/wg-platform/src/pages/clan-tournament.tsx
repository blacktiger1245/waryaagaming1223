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
  Swords,
  Users,
} from "lucide-react";
import {
  ClanStandingsTable,
  ClanStatsPanel,
  ClanTournamentNav,
  FixturesPanel,
  PREVIEW_STANDINGS,
  PREVIEW_TEAM_OF_THE_WEEK,
  SeasonSidebar,
  SeasonSummary,
  SectionPlaceholder,
  TeamOfTheWeekPitch,
  clanGradient,
  clanTheme,
} from "@/components/clan-tournament";
import type {
  ClanLookupEntry,
  ClanStanding,
  ClanStatLeaderboard,
  ClanStatsScope,
  ClanTournamentTabId,
  FixtureMatch,
  SeasonOption,
  TournamentOption,
} from "@/components/clan-tournament";
import { apiUrl } from "@/lib/api";

/** Fields we consume from GET /api/tournaments/:id/matches. */
interface TournamentMatchRow {
  id: number;
  tournamentName?: string | null;
  round?: number | null;
  roundName?: string | null;
  status?: string | null;
  participant1Name?: string | null;
  participant1Score?: number | null;
  participant2Name?: string | null;
  participant2Score?: number | null;
  scheduledAt?: string | null;
  streamUrl?: string | null;
}

/**
 * Normalise a tournament-match row into a fixture. For team-format tournaments
 * participant1/participant2 are clan IDs and their names are the clan names.
 */
function toFixture(row: TournamentMatchRow, fallbackTournamentName: string): FixtureMatch {
  return {
    id: row.id,
    tournamentName: row.tournamentName ?? fallbackTournamentName,
    round: row.round ?? 1,
    roundName: row.roundName ?? null,
    status: row.status ?? "scheduled",
    homeName: row.participant1Name?.trim() || "TBD",
    homeScore: row.participant1Score ?? null,
    awayName: row.participant2Name?.trim() || "TBD",
    awayScore: row.participant2Score ?? null,
    scheduledAt: row.scheduledAt ?? null,
    streamUrl: row.streamUrl ?? null,
  };
}

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

/** Response shape of GET /api/clan-tournament/stats. */
interface ClanStatsResponse {
  scope: ClanStatsScope;
  players: ClanStatLeaderboard[];
  teams: ClanStatLeaderboard[];
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
  Exclude<ClanTournamentTabId, "overview" | "table" | "fixtures">,
  { title: string; description: string; icon: typeof Users }
> = {
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
      className="clan-chip px-2.5 py-1 text-[10px]"
      style={{ color: clanTheme.accentWarm }}
      title="No live clan standings were returned, so the layout is shown with sample data."
    >
      Preview data
    </span>
  );
}

/** Compact numeric tile used in the arena hero banner. */
function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-xl border px-3.5 py-2 text-center"
      style={{ borderColor: clanTheme.border, background: "rgba(148,163,255,0.06)" }}
    >
      <div className="text-lg font-black leading-tight tabular-nums text-white">{value}</div>
      <div className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: clanTheme.muted }}>
        {label}
      </div>
    </div>
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

  /**
   * Fixtures cover a single tournament when one is selected, otherwise every
   * clan tournament in the active season (or all of them for "All time").
   */
  const fixturesScope = useMemo<TournamentOption[]>(() => {
    if (activeTournamentId != null) {
      return clanTournaments.filter((t) => t.id === activeTournamentId);
    }
    if (activeSeasonId == null) return clanTournaments;
    return clanTournaments.filter((t) => t.seasonId === activeSeasonId);
  }, [clanTournaments, activeSeasonId, activeTournamentId]);

  const fixturesScopeKey = fixturesScope.map((t) => t.id).join(",");

  const matchesQuery = useQuery({
    queryKey: ["clan-tournament-matches", fixturesScopeKey],
    enabled: fixturesScope.length > 0,
    queryFn: async (): Promise<FixtureMatch[]> => {
      const perTournament = await Promise.all(
        fixturesScope.map(async (tournament) => {
          const res = await fetch(apiUrl(`/api/tournaments/${tournament.id}/matches`), {
            credentials: "include",
          });
          if (!res.ok) return [] as FixtureMatch[];
          const data = (await res.json().catch(() => [])) as unknown;
          const rows = Array.isArray(data) ? (data as TournamentMatchRow[]) : [];
          return rows.map((row) => toFixture(row, tournament.name));
        }),
      );
      return perTournament.flat();
    },
  });

  // ── Player / team statistics leaderboards (Player stats & Team stats tabs).
  //     Scope mirrors the sidebar selection (single tournament → season → all
  //     time) and is fetched lazily once either tab is opened. ──
  const statsQuery = useQuery({
    queryKey: ["clan-tournament-stats", activeSeasonId, activeTournamentId],
    enabled: activeTab === "player-stats" || activeTab === "team-stats",
    queryFn: async (): Promise<ClanStatsResponse> => {
      const params = new URLSearchParams();
      if (activeTournamentId != null) params.set("tournamentId", String(activeTournamentId));
      else if (activeSeasonId != null) params.set("seasonId", String(activeSeasonId));
      const query = params.toString();

      const res = await fetch(apiUrl(`/api/clan-tournament/stats${query ? `?${query}` : ""}`), {
        credentials: "include",
      });
      if (!res.ok) {
        return {
          scope: {
            seasonId: activeSeasonId,
            tournamentId: activeTournamentId,
            tournamentCount: 0,
            matchCount: 0,
            playerGameCount: 0,
          },
          players: [],
          teams: [],
        };
      }
      return (await res.json()) as ClanStatsResponse;
    },
  });

  /** Clan tag/crest by name so fixture rows reuse the same badges as the table. */
  const clanIndex = useMemo<Record<string, ClanLookupEntry>>(() => {
    const index: Record<string, ClanLookupEntry> = {};
    for (const clan of standings) {
      index[clan.name] = { tag: clan.tag, logoUrl: clan.logoUrl };
    }
    return index;
  }, [standings]);

  // Tabs whose data feed is still a placeholder. `player-stats` and `team-stats`
  // are backed by GET /api/clan-tournament/stats and rendered below instead.
  const placeholderSpec =
    activeTab === "overview" ||
    activeTab === "table" ||
    activeTab === "fixtures" ||
    activeTab === "player-stats" ||
    activeTab === "team-stats"
      ? null
      : PLACEHOLDERS[activeTab];

  /** Subtitle for the stats tabs: the scope plus how much data backs it. */
  const statsScopeLabel = statsQuery.data
    ? `${scopeLabel} · ${statsQuery.data.scope.matchCount} fixtures · ${statsQuery.data.scope.playerGameCount} matchups`
    : scopeLabel;

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
    <div className="clan-page min-h-screen w-full" style={{ color: clanTheme.text }}>
      <ClanTournamentNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        trailing={
          <span
            className="clan-chip whitespace-nowrap px-3 py-1.5 text-[10px]"
            style={{ color: clanTheme.accent }}
            title="Active season"
          >
            {isCurrentSeason ? `${scopeLabel} · current` : scopeLabel}
          </span>
        }
      />

      <div className="mx-auto w-full max-w-[1500px] px-3 py-5 lg:px-4">
        {/* ── Arena hero banner ── */}
        <div className="clan-hero mb-5 px-5 py-5 sm:px-6">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
            <div className="flex min-w-0 items-center gap-4">
              <span
                aria-hidden
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: clanGradient.brand, boxShadow: "0 0 36px -8px rgba(168,85,247,0.95)" }}
              >
                <Swords className="h-7 w-7 text-white" />
              </span>
              <div className="min-w-0">
                <span
                  className="clan-chip inline-flex px-2.5 py-1 text-[9px]"
                  style={{ color: clanTheme.accent }}
                >
                  {isCurrentSeason ? "Live season" : "Clan arena"}
                </span>
                <h1 className="mt-2 truncate text-2xl font-black uppercase tracking-[0.14em] text-white sm:text-3xl">
                  Clan Tournament
                </h1>
                <p className="mt-1 truncate text-xs" style={{ color: clanTheme.muted }}>
                  {scopeLabel} · standings, fixtures, player ratings and awards
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <HeroStat label="Clans" value={standings.length} />
              <HeroStat label="Tournaments" value={seasonTournamentCount} />
              {usingPreview ? <PreviewChip /> : null}
            </div>
          </div>
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

            {/* Fixtures — live, finished and scheduled matches for the scope */}
            {activeTab === "fixtures" ? (
              <FixturesPanel
                matches={matchesQuery.data ?? []}
                clanIndex={clanIndex}
                isLoading={matchesQuery.isLoading}
                title={`Fixtures — ${scopeLabel}`}
              />
            ) : activeTab === "player-stats" ? (
              <ClanStatsPanel
                title="Player stats"
                subtitle={statsScopeLabel}
                headerIcon={Users}
                variant="player"
                leaderboards={statsQuery.data?.players ?? []}
                isLoading={statsQuery.isLoading}
              />
            ) : activeTab === "team-stats" ? (
              <ClanStatsPanel
                title="Team stats"
                subtitle={statsScopeLabel}
                headerIcon={BarChart3}
                variant="team"
                leaderboards={statsQuery.data?.teams ?? []}
                isLoading={statsQuery.isLoading}
              />
            ) : placeholderSpec ? (
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
