/**
 * SeasonSummary — the detail strip shown above the standings once a season (or
 * a single clan tournament) is selected. Surfaces the award winners that
 * GET /api/seasons already returns for the active season.
 */
import { Award, Goal, Trophy } from "lucide-react";
import { clanCard, clanTheme } from "./theme";

export interface SeasonPerson {
  name: string;
  avatarUrl: string | null;
}

interface SeasonSummaryProps {
  /** Resolved label for the current scope, e.g. a season or tournament name. */
  scopeLabel: string;
  /** Set when a single tournament is selected rather than the whole season. */
  seasonLabel: string | null;
  topScorer: SeasonPerson | null;
  ballonDor: SeasonPerson | null;
  clanCount: number;
}

function Person({ person }: { person: SeasonPerson }) {
  return (
    <span className="flex items-center gap-1.5">
      {person.avatarUrl ? (
        <img
          src={person.avatarUrl}
          alt={person.name}
          loading="lazy"
          className="h-5 w-5 rounded-full object-cover"
          style={{ border: `1px solid ${clanTheme.borderStrong}` }}
        />
      ) : (
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black"
          style={{ background: clanTheme.surfaceAlt, color: clanTheme.muted }}
        >
          {person.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="max-w-[140px] truncate font-semibold text-white">{person.name}</span>
    </span>
  );
}

function Metric({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof Award;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p
        className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em]"
        style={{ color: clanTheme.muted }}
      >
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <div className="mt-1 text-[12px]">{children}</div>
    </div>
  );
}

export function SeasonSummary({
  scopeLabel,
  seasonLabel,
  topScorer,
  ballonDor,
  clanCount,
}: SeasonSummaryProps) {
  return (
    <section
      className={`${clanCard} px-4 py-3`}
      style={{ background: clanTheme.card, borderColor: clanTheme.border }}
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="min-w-0">
          <p
            className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em]"
            style={{ color: clanTheme.muted }}
          >
            <Trophy className="h-3 w-3" />
            {seasonLabel ? "Tournament" : "Season"}
          </p>
          <p className="mt-1 truncate text-[13px] font-bold text-white" title={scopeLabel}>
            {scopeLabel}
          </p>
          {seasonLabel && (
            <p className="text-[10px]" style={{ color: clanTheme.muted }}>
              in {seasonLabel}
            </p>
          )}
        </div>

        <Metric label="Clans" icon={Trophy}>
          <span className="font-bold tabular-nums text-white">{clanCount}</span>
        </Metric>

        <Metric label="Top scorer" icon={Goal}>
          {topScorer ? (
            <Person person={topScorer} />
          ) : (
            <span style={{ color: clanTheme.muted }}>Not awarded</span>
          )}
        </Metric>

        <Metric label="Ballon d'Or" icon={Award}>
          {ballonDor ? (
            <Person person={ballonDor} />
          ) : (
            <span style={{ color: clanTheme.muted }}>Not awarded</span>
          )}
        </Metric>
      </div>
    </section>
  );
}

export default SeasonSummary;
