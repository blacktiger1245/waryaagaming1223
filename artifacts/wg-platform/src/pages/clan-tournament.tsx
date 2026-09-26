/**
 * ClanTournamentPage — the Clan Tournament section.
 *
 * Renders the FotMob-style section navigation bar, then a split 12-column
 * layout: clan standings table (8/12) on the left and the Team of the Week
 * pitch widget (4/12) on the right for the Overview and Table tabs.
 */
import { useMemo, useState } from "react";
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
  SectionPlaceholder,
  TeamOfTheWeekPitch,
  clanTheme,
} from "@/components/clan-tournament";
import type { ClanStanding, ClanTournamentTabId } from "@/components/clan-tournament";
import { apiUrl } from "@/lib/api";

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

  const standingsQuery = useQuery({
    queryKey: ["clan-tournament-standings"],
    queryFn: async (): Promise<TeamRankingRow[]> => {
      const res = await fetch(apiUrl("/api/rankings/teams"), { credentials: "include" });
      if (!res.ok) return [];
      const data = (await res.json().catch(() => [])) as unknown;
      return Array.isArray(data) ? (data as TeamRankingRow[]) : [];
    },
  });

  const liveStandings = useMemo<ClanStanding[]>(
    () => (standingsQuery.data ?? []).map((row, index) => toStanding(row, index)),
    [standingsQuery.data],
  );

  // Fall back to the preview dataset so the layout is always reviewable.
  const usingPreview = liveStandings.length === 0;
  const standings = usingPreview ? PREVIEW_STANDINGS : liveStandings;
  const teamOfTheWeek = usingPreview ? PREVIEW_TEAM_OF_THE_WEEK : [];

  const placeholderSpec =
    activeTab === "overview" || activeTab === "table" ? null : PLACEHOLDERS[activeTab];

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: clanTheme.bg, color: clanTheme.text }}
    >
      <ClanTournamentNav activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="mx-auto w-full max-w-[1500px] px-3 py-5 lg:px-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-black uppercase tracking-[0.14em] text-white">
              Clan Tournament
            </h1>
            <p className="mt-1 text-xs" style={{ color: clanTheme.muted }}>
              Season standings, fixtures and player ratings
            </p>
          </div>
          {usingPreview ? <PreviewChip /> : null}
        </div>

        {placeholderSpec ? (
          <SectionPlaceholder
            title={placeholderSpec.title}
            description={placeholderSpec.description}
            icon={placeholderSpec.icon}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left — 8/12: clan standings */}
            <div className="lg:col-span-8">
              <ClanStandingsTable standings={standings} title="Standings" />
            </div>

            {/* Right — 4/12: Team of the Week */}
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
  );
}
