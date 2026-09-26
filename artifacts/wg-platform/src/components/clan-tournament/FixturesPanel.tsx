/**
 * FixturesPanel — the Fixtures tab.
 *
 * Lists every clan fixture for the selected scope, grouped into Live, Finished
 * and Scheduled sections. Data comes from GET /api/tournaments/:id/matches (the
 * same endpoint the public fixtures page uses); for team-format tournaments
 * `participant1Name`/`participant2Name` hold the clan names.
 */
import { CalendarDays, Radio } from "lucide-react";
import { ClanBadge } from "./ClanBadge";
import { clanCard, clanTheme } from "./theme";

export interface FixtureMatch {
  id: number;
  tournamentName: string;
  round: number;
  roundName: string | null;
  /** "live" | "completed" | "scheduled" | … (free-form from the API). */
  status: string;
  homeName: string;
  homeScore: number | null;
  awayName: string;
  awayScore: number | null;
  /** Free-text column in the DB, so it may be a date string or plain text. */
  scheduledAt: string | null;
  streamUrl: string | null;
}

/** Clan tag/crest indexed by clan name, used to render the fixture badges. */
export interface ClanLookupEntry {
  tag: string;
  logoUrl: string | null;
}

interface FixturesPanelProps {
  matches: FixtureMatch[];
  clanIndex: Record<string, ClanLookupEntry>;
  isLoading: boolean;
  title: string;
}

type Bucket = "live" | "finished" | "scheduled";

const SECTIONS: { bucket: Bucket; label: string; color: string }[] = [
  { bucket: "live", label: "Live", color: clanTheme.loss },
  { bucket: "finished", label: "Finished", color: clanTheme.muted },
  { bucket: "scheduled", label: "Scheduled", color: clanTheme.accentAlt },
];

/** Collapse the API's free-form status strings into the three display buckets. */
function bucketOf(status: string): Bucket {
  const value = status.toLowerCase();
  if (value === "live") return "live";
  if (value === "completed" || value === "finished") return "finished";
  return "scheduled";
}

function formatWhen(value: string | null): string {
  if (!value) return "TBC";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FixtureRow({
  match,
  clanIndex,
}: {
  match: FixtureMatch;
  clanIndex: Record<string, ClanLookupEntry>;
}) {
  const bucket = bucketOf(match.status);
  const home = clanIndex[match.homeName] ?? { tag: "", logoUrl: null };
  const away = clanIndex[match.awayName] ?? { tag: "", logoUrl: null };
  const played = bucket !== "scheduled";

  const statusColor =
    bucket === "live"
      ? clanTheme.loss
      : bucket === "scheduled"
        ? clanTheme.accentAlt
        : clanTheme.muted;

  return (
    <div
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
      style={{ borderColor: clanTheme.border }}
      data-testid={`fixture-row-${match.id}`}
    >
      <div className="flex min-w-0 items-center justify-end gap-2 text-right">
        <span className="truncate text-[13px] font-semibold text-white" title={match.homeName}>
          {match.homeName}
        </span>
        <ClanBadge name={match.homeName} tag={home.tag} logoUrl={home.logoUrl} size={24} />
      </div>

      <div className="flex min-w-[92px] flex-col items-center">
        <span className="text-[13px] font-black tabular-nums text-white">
          {played ? `${match.homeScore ?? 0} : ${match.awayScore ?? 0}` : "vs"}
        </span>
        <span
          className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[9px] font-bold uppercase tracking-wide"
          style={{ color: statusColor }}
        >
          {bucket === "live" && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          )}
          {bucket === "live" ? "Live" : formatWhen(match.scheduledAt)}
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <ClanBadge name={match.awayName} tag={away.tag} logoUrl={away.logoUrl} size={24} />
        <span className="truncate text-[13px] font-semibold text-white" title={match.awayName}>
          {match.awayName}
        </span>
      </div>
    </div>
  );
}

export function FixturesPanel({ matches, clanIndex, isLoading, title }: FixturesPanelProps) {
  const grouped: Record<Bucket, FixtureMatch[]> = { live: [], finished: [], scheduled: [] };
  for (const match of matches) grouped[bucketOf(match.status)].push(match);

  return (
    <section
      className={clanCard}
      style={{ background: clanTheme.card, borderColor: clanTheme.border }}
    >
      <header
        className="flex items-center gap-2 border-b px-4 py-3"
        style={{ borderColor: clanTheme.border }}
      >
        <CalendarDays className="h-4 w-4" style={{ color: clanTheme.accent }} />
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{title}</h2>
        <span className="ml-auto text-[11px] tabular-nums" style={{ color: clanTheme.muted }}>
          {matches.length} {matches.length === 1 ? "match" : "matches"}
        </span>
      </header>

      {SECTIONS.map(({ bucket, label, color }) => {
        const rows = grouped[bucket];
        if (rows.length === 0) return null;

        return (
          <div key={bucket}>
            <div
              className="flex items-center gap-2 px-4 py-2"
              style={{ background: clanTheme.surfaceAlt }}
            >
              {bucket === "live" ? (
                <Radio className="h-3.5 w-3.5 animate-pulse" style={{ color }} />
              ) : (
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              )}
              <span
                className="text-[10px] font-black uppercase tracking-[0.14em]"
                style={{ color }}
              >
                {label}
              </span>
              <span className="text-[10px] tabular-nums" style={{ color: clanTheme.muted }}>
                {rows.length}
              </span>
            </div>

            {rows.map((match) => (
              <FixtureRow key={match.id} match={match} clanIndex={clanIndex} />
            ))}
          </div>
        );
      })}

      {matches.length === 0 && (
        <p className="px-4 py-10 text-center text-xs" style={{ color: clanTheme.muted }}>
          {isLoading
            ? "Loading fixtures…"
            : "No live, finished or scheduled clan fixtures for this selection."}
        </p>
      )}
    </section>
  );
}

export default FixturesPanel;
