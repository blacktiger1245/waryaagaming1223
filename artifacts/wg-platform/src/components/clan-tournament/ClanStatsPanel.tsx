/**
 * ClanStatsPanel — the Player stats and Team stats tabs.
 *
 * Renders the ranked leaderboards produced by GET /api/clan-tournament/stats as
 * a responsive grid of FotMob-style cards. The same component serves both tabs:
 * `variant` only changes how each row's leading badge is drawn (player avatar vs
 * clan crest) and whether the follow-up line shows the player's clan.
 *
 * Every number comes from statistics an administrator confirmed against the
 * result screenshot, so a metric with no recorded data shows an empty state
 * rather than a fabricated value.
 */
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowLeftRight,
  Award,
  BarChart3,
  Crosshair,
  Flame,
  Goal,
  Hand,
  PieChart,
  Repeat,
  Shield,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { ClanBadge } from "./ClanBadge";
import { clanCard, clanGradient, clanTheme, podiumFor } from "./theme";

export type StatUnit = "count" | "games" | "percent" | "average";

export interface ClanStatEntry {
  id: number;
  name: string;
  /** Player avatar (player tabs) or clan crest (team tabs). */
  avatarUrl: string | null;
  teamName: string | null;
  teamTag: string | null;
  value: number;
}

export interface ClanStatLeaderboard {
  key: string;
  title: string;
  unit: StatUnit;
  /** Optional caveat shown as the card tooltip, e.g. the passes note. */
  note: string | null;
  entries: ClanStatEntry[];
}

export interface ClanStatsScope {
  seasonId: number | null;
  tournamentId: number | null;
  tournamentCount: number;
  matchCount: number;
  playerGameCount: number;
}

/** One icon per metric key; unknown keys fall back to a bar-chart glyph. */
const STAT_ICONS: Record<string, LucideIcon> = {
  "longest-unbeaten-run": Shield,
  "longest-winning-streak": Flame,
  "most-motm": Award,
  "most-wins": Trophy,
  "most-goals": Goal,
  "avg-goals": TrendingUp,
  "most-clean-sheets": Hand,
  "avg-possession": PieChart,
  "most-shots": Target,
  "most-shots-on-target": Crosshair,
  "avg-shots": Activity,
  "most-passes": ArrowLeftRight,
  "avg-passes": Repeat,
};

function formatValue(value: number, unit: StatUnit): string {
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "average") return value.toFixed(2);
  return String(Math.round(value));
}

function PlayerAvatar({
  name,
  avatarUrl,
  size = 22,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        loading="lazy"
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size, border: `1px solid ${clanTheme.borderStrong}` }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-black"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        color: clanTheme.muted,
        background: clanTheme.surfaceAlt,
        border: `1px solid ${clanTheme.borderStrong}`,
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function LeaderboardCard({
  board,
  variant,
}: {
  board: ClanStatLeaderboard;
  variant: "player" | "team";
}) {
  const Icon = STAT_ICONS[board.key] ?? BarChart3;

  return (
    <article className={clanCard} data-testid={`clan-stat-${board.key}`}>
      <header
        className="flex items-center gap-2.5 border-b px-3 py-2.5"
        style={{ borderColor: clanTheme.border }}
        title={board.note ?? undefined}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{ background: clanGradient.brand, boxShadow: "0 0 14px -3px rgba(168,85,247,0.85)" }}
        >
          <Icon className="h-3.5 w-3.5 text-white" />
        </span>
        <h3 className="min-w-0 text-[10.5px] font-black uppercase leading-tight tracking-[0.08em] text-white">
          {board.title}
        </h3>
      </header>

      {board.entries.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px]" style={{ color: clanTheme.muted }}>
          No data recorded yet
        </p>
      ) : (
        <ol>
          {board.entries.map((entry, index) => {
            const podium = podiumFor(index + 1);
            return (
              <li
                key={entry.id}
                className={`clan-row flex items-center gap-2.5 border-t px-3 py-2 first:border-t-0 ${podium ? podium.row : ""}`}
                style={{ borderColor: clanTheme.border }}
                title={podium?.label}
              >
                {podium ? (
                  <span className={`clan-medal ${podium.medal} h-5 w-5 shrink-0 text-[10px]`}>
                    {index + 1}
                  </span>
                ) : (
                  <span
                    className="w-5 shrink-0 text-center text-[10px] font-black tabular-nums"
                    style={{ color: clanTheme.muted }}
                  >
                    {index + 1}
                  </span>
                )}

              {variant === "player" ? (
                <PlayerAvatar name={entry.name} avatarUrl={entry.avatarUrl} />
              ) : (
                <ClanBadge
                  name={entry.name}
                  tag={entry.teamTag ?? ""}
                  logoUrl={entry.avatarUrl}
                  size={22}
                />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-white" title={entry.name}>
                  {entry.name}
                </p>
                {variant === "player" && entry.teamName ? (
                  <p className="truncate text-[10px]" style={{ color: clanTheme.muted }}>
                    {entry.teamTag ? `${entry.teamTag} · ` : ""}
                    {entry.teamName}
                  </p>
                ) : null}
              </div>

                <span
                  className="shrink-0 text-[12px] font-black tabular-nums text-white"
                  style={{ color: podium?.color }}
                >
                  {formatValue(entry.value, board.unit)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}

interface ClanStatsPanelProps {
  title: string;
  subtitle?: string;
  headerIcon: LucideIcon;
  leaderboards: ClanStatLeaderboard[];
  variant: "player" | "team";
  isLoading: boolean;
}

export function ClanStatsPanel({
  title,
  subtitle,
  headerIcon: HeaderIcon,
  leaderboards,
  variant,
  isLoading,
}: ClanStatsPanelProps) {
  const hasAny = leaderboards.some((board) => board.entries.length > 0);

  return (
    <section className="space-y-3" data-testid={`clan-stats-${variant}`}>
      <header className="flex flex-wrap items-center gap-2">
        <HeaderIcon className="h-4 w-4" style={{ color: clanTheme.accent }} />
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{title}</h2>
        {subtitle ? (
          <span className="text-[11px]" style={{ color: clanTheme.muted }}>
            {subtitle}
          </span>
        ) : null}
      </header>

      {isLoading && !hasAny ? (
        <div className={`${clanCard} px-6 py-14 text-center text-xs`} style={{ color: clanTheme.muted }}>
          Loading statistics…
        </div>
      ) : !hasAny ? (
        <div className={`${clanCard} px-6 py-14 text-center text-xs`} style={{ color: clanTheme.muted }}>
          No player statistics recorded for this selection yet. Leaderboards appear once an
          administrator approves a clan fixture result with its match statistics.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {leaderboards.map((board) => (
            <LeaderboardCard key={board.key} board={board} variant={variant} />
          ))}
        </div>
      )}
    </section>
  );
}

export default ClanStatsPanel;
