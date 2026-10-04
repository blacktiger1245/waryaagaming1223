/**
 * ClanStandingsTable — the tournament standings table.
 *
 * Columns (exact order): #, Clan / Team, PL, W, D, L, +/-, GD, PTS, Form, Next.
 * Numeric columns use tabular figures so digits line up column-to-column.
 */
import type { ReactNode } from "react";
import { Trophy } from "lucide-react";
import { ClanBadge } from "./ClanBadge";
import { FormBadges } from "./FormBadges";
import { clanCard, clanGradient, clanTheme, podiumFor } from "./theme";
import type { ClanStanding } from "./types";

interface ClanStandingsTableProps {
  standings: ClanStanding[];
  title: string;
  /** Optional control rendered on the right of the card header. */
  action?: ReactNode;
}

const TH =
  "whitespace-nowrap px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em]";
const TD = "px-2 py-2.5 align-middle";

/** Render a signed integer, e.g. 12 → "+12", -3 → "-3", 0 → "0". */
function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function ClanStandingsTable({ standings, title, action }: ClanStandingsTableProps) {
  return (
    <section className={clanCard}>
      <header
        className="flex items-center justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: clanTheme.border }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: clanGradient.brand, boxShadow: "0 0 18px -4px rgba(168,85,247,0.85)" }}
          >
            <Trophy className="h-4 w-4 text-white" />
          </span>
          <h2 className="truncate text-sm font-bold uppercase tracking-[0.12em] text-white">{title}</h2>
        </div>
        {action}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px] tabular-nums">
          <thead>
            <tr
              style={{
                background: "linear-gradient(180deg, rgba(148,163,255,0.11), rgba(148,163,255,0.03))",
              }}
            >
              <th className={`${TH} w-[46px] text-center`} style={{ color: clanTheme.muted }}>#</th>
              <th className={`${TH} text-left`} style={{ color: clanTheme.muted }}>Clan / Team</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>PL</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>W</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>D</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>L</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>+/-</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>GD</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>PTS</th>
              <th className={`${TH} text-left`} style={{ color: clanTheme.muted }}>Form</th>
              <th className={`${TH} text-left`} style={{ color: clanTheme.muted }}>Next</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => {
              const podium = podiumFor(row.rank);
              return (
                <tr
                  key={row.id}
                  className={`clan-row border-t ${podium ? podium.row : ""}`}
                  style={{ borderColor: clanTheme.border }}
                  title={podium?.label}
                  data-testid={`standing-row-${row.id}`}
                >
                  <td className={`${TD} text-center`}>
                    {podium ? (
                      <span className={`clan-medal ${podium.medal} mx-auto h-6 w-6 text-[11px]`}>
                        {row.rank}
                      </span>
                    ) : (
                      <span className="font-bold" style={{ color: clanTheme.muted }}>
                        {row.rank}
                      </span>
                    )}
                  </td>

                  <td className={`${TD} text-left`}>
                    <div className="flex items-center gap-2.5">
                      <ClanBadge name={row.name} tag={row.tag} logoUrl={row.logoUrl} />
                      <span className="truncate font-semibold text-white">{row.name}</span>
                    </div>
                  </td>

                  <td className={`${TD} text-center`} style={{ color: clanTheme.muted }}>{row.played}</td>
                  <td className={`${TD} text-center text-white`}>{row.won}</td>
                  <td className={`${TD} text-center text-white`}>{row.drawn}</td>
                  <td className={`${TD} text-center text-white`}>{row.lost}</td>
                  <td className={`${TD} text-center`} style={{ color: clanTheme.muted }}>{signed(row.plusMinus)}</td>
                  <td className={`${TD} text-center`} style={{ color: clanTheme.muted }}>{signed(row.goalDifference)}</td>
                  <td className={`${TD} text-center text-[14px] font-black`} style={{ color: podium?.color ?? clanTheme.accent }}>{row.points}</td>

                  <td className={`${TD} text-left`}>
                    <FormBadges form={row.form} length={5} />
                  </td>

                  <td className={`${TD} text-left`}>
                    {row.nextOpponent ? (
                      <div className="flex items-center gap-2">
                        <ClanBadge
                          name={row.nextOpponent.name}
                          tag={row.nextOpponent.tag}
                          logoUrl={row.nextOpponent.logoUrl}
                          size={22}
                        />
                        <span
                          className="hidden max-w-[120px] truncate text-[12px] xl:inline"
                          style={{ color: clanTheme.muted }}
                        >
                          {row.nextOpponent.name}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: clanTheme.muted }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {standings.length === 0 && (
        <p className="px-4 py-8 text-center text-xs" style={{ color: clanTheme.muted }}>
          No clan standings yet.
        </p>
      )}
    </section>
  );
}

export default ClanStandingsTable;
