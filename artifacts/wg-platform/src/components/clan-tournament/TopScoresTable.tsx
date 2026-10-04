/**
 * TopScoresTable — the Clan Tournament Top Scores.
 *
 * Lists every player who has played in the selected scope (single tournament →
 * season → all time) ordered by their tournament performance rating, with the
 * full statistic set tracked for clan tournaments: goals, assists, matches
 * played, wins, draws, losses, goals per match and rating.
 *
 * The numbers come from the very same aggregation as the Team of the Week
 * (GET /api/clan-tournament/top-players), so the table and the pitch can never
 * disagree.
 */
import { BarChart3 } from "lucide-react";
import { clanCard, clanGradient, clanTheme, podiumFor } from "./theme";
import type { TopScorePlayer } from "./types";

interface TopScoresTableProps {
  players: TopScorePlayer[];
  title: string;
  isLoading: boolean;
}

const TH = "whitespace-nowrap px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em]";
const TD = "px-2 py-2.5 align-middle";

function Rating({ value }: { value: number }) {
  // Green for a strong week, amber for average, red for a poor one.
  const color = value >= 7.5 ? "#22c55e" : value >= 6 ? "#fbbf24" : "#f43f5e";
  return (
    <span
      className="inline-block min-w-[38px] rounded-md px-1.5 py-0.5 text-[11px] font-black tabular-nums"
      style={{ color, background: "rgba(148,163,255,0.10)", border: "1px solid rgba(148,163,255,0.22)" }}
    >
      {value.toFixed(1)}
    </span>
  );
}

function PlayerAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        loading="lazy"
        className="h-7 w-7 shrink-0 rounded-full object-cover"
        style={{ border: `1px solid ${clanTheme.borderStrong}` }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black"
      style={{
        color: "#c7d2fe",
        background: "linear-gradient(135deg, rgba(34,211,238,0.22), rgba(168,85,247,0.30))",
        border: "1px solid rgba(148,163,255,0.35)",
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function TopScoresTable({ players, title, isLoading }: TopScoresTableProps) {
  return (
    <section className={clanCard} data-testid="clan-top-scores">
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
            <BarChart3 className="h-4 w-4 text-white" />
          </span>
          <h2 className="truncate text-sm font-bold uppercase tracking-[0.12em] text-white">{title}</h2>
        </div>
        <span className="clan-chip shrink-0 px-2.5 py-1 text-[10px]" style={{ color: clanTheme.muted }}>
          {players.length} {players.length === 1 ? "player" : "players"}
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-[13px] tabular-nums">
          <thead>
            <tr
              style={{
                background: "linear-gradient(180deg, rgba(148,163,255,0.11), rgba(148,163,255,0.03))",
              }}
            >
              <th className={`${TH} w-[46px] text-center`} style={{ color: clanTheme.muted }}>#</th>
              <th className={`${TH} text-left`} style={{ color: clanTheme.muted }}>Player</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>MP</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>W</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>D</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>L</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>G</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>A</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>G/M</th>
              <th className={`${TH} text-center`} style={{ color: clanTheme.muted }}>Rating</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const podium = podiumFor(player.rank);
              return (
                <tr
                  key={player.playerId}
                  className={`clan-row border-t ${podium ? podium.row : ""}`}
                  style={{ borderColor: clanTheme.border }}
                  title={podium?.label}
                  data-testid={`top-score-row-${player.playerId}`}
                >
                  <td className={`${TD} text-center`}>
                    {podium ? (
                      <span className={`clan-medal ${podium.medal} mx-auto h-6 w-6 text-[11px]`}>
                        {player.rank}
                      </span>
                    ) : (
                      <span className="font-bold" style={{ color: clanTheme.muted }}>
                        {player.rank}
                      </span>
                    )}
                  </td>

                  <td className={`${TD} text-left`}>
                    <div className="flex items-center gap-2.5">
                      <PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white" title={player.name}>
                          {player.name}
                        </p>
                        {player.teamName ? (
                          <p className="truncate text-[10px]" style={{ color: clanTheme.muted }}>
                            {player.teamTag ? `${player.teamTag} · ` : ""}
                            {player.teamName}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  <td className={`${TD} text-center`} style={{ color: clanTheme.muted }}>{player.matchesPlayed}</td>
                  <td className={`${TD} text-center text-white`}>{player.wins}</td>
                  <td className={`${TD} text-center text-white`}>{player.draws}</td>
                  <td className={`${TD} text-center text-white`}>{player.losses}</td>
                  <td className={`${TD} text-center font-black`} style={{ color: podium?.color ?? clanTheme.accent }}>
                    {player.goals}
                  </td>
                  <td className={`${TD} text-center font-semibold text-white`}>{player.assists}</td>
                  <td className={`${TD} text-center`} style={{ color: clanTheme.muted }}>
                    {player.goalsPerMatch.toFixed(2)}
                  </td>
                  <td className={`${TD} text-center`}>
                    <Rating value={player.performance} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {players.length === 0 && (
        <p className="px-4 py-8 text-center text-xs" style={{ color: clanTheme.muted }}>
          {isLoading
            ? "Loading tournament statistics…"
            : "No tournament statistics recorded for this selection yet. Approved clan fixture results appear here automatically."}
        </p>
      )}
    </section>
  );
}

export default TopScoresTable;

