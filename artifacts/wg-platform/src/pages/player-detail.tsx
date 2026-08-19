import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { countryNameToFlag } from "@/lib/countries";
import { motion } from "framer-motion";
import {
  ArrowLeft, Star, ScrollText, Fingerprint, Activity, Building2, Swords, BookOpen,
  CalendarDays, MapPin, Droplets, Gamepad2, Shield, Trophy, Share2,
  TrendingUp, Zap, Target, ShieldCheck, Award, Coins, Handshake, XCircle, Square, User, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useGetPlayer, useGetPlayerMatchHistory } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { marketValueLabel, pointsToMarketValue } from "@/lib/player-stats";

// Fetch individual player games inside team-tournament matches
function usePlayerGames(playerId: number) {
  return useQuery({
    queryKey: ["player-games", playerId],
    queryFn: async () => {
      const res = await fetch(`/api/players/${playerId}/player-games`);
      if (!res.ok) throw new Error("Failed to fetch player games");
      return res.json() as Promise<Array<{
        id: number;
        matchId: number;
        homePlayerId: number | null;
        homePlayerName: string | null;
        awayPlayerId: number | null;
        awayPlayerName: string | null;
        homeScore: number | null;
        awayScore: number | null;
        status: string;
        round: number | null;
        roundName: string | null;
        matchStatus: string | null;
        manOfTheMatchId: number | null;
        tournamentId: number | null;
        tournamentName: string | null;
      }>>;
    },
    enabled: playerId > 0,
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────
function starCount(points: number) {
  if (points >= 100) return 5;
  if (points >= 50) return 4;
  if (points >= 20) return 3;
  if (points >= 5) return 2;
  if (points > 0) return 1;
  return 0;
}

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

const TABS = [
  { id: "contract", label: "Contract", icon: ScrollText },
  { id: "info",     label: "Info",     icon: Fingerprint },
  { id: "overall",  label: "Overall",  icon: Activity },
  { id: "club",     label: "Club",     icon: Building2 },
  { id: "solo",     label: "Solo",     icon: Swords },
  { id: "history",  label: "History",  icon: BookOpen },
] as const;

type TabId = (typeof TABS)[number]["id"];

const matchStatusColors: Record<string, string> = {
  scheduled: "text-muted-foreground",
  live:       "text-red-400",
  completed:  "text-primary",
  cancelled:  "text-destructive",
};

// ── page ──────────────────────────────────────────────────────────────────────
export default function PlayerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [activeTab, setActiveTab] = useState<TabId>("contract");

  const { data: player, isLoading } = useGetPlayer(id);
  const { data: history } = useGetPlayerMatchHistory(id);      // solo-tournament matches
  const { data: playerGames } = usePlayerGames(id);            // team-tournament individual games

  // ── Live computed stats (solo matches only) ───────────────────────────────
  const liveStats = useMemo(() => {
    const completed = (history ?? []).filter((m) => m.status === "completed");
    let wins = 0, draws = 0, losses = 0, goals = 0, conceded = 0, cleanSheets = 0, motm = 0, deciderWins = 0;
    for (const m of completed) {
      const isP1 = m.participant1Id === id;
      const my  = (isP1 ? m.participant1Score : m.participant2Score) ?? 0;
      const opp = (isP1 ? m.participant2Score : m.participant1Score) ?? 0;
      goals    += my;
      conceded += opp;
      if (opp === 0) cleanSheets++;
      if ((m as any).manOfTheMatchId === id) motm++;
      if (my > opp) { wins++; if (my - opp === 1) deciderWins++; }
      else if (my === opp) draws++;
      else losses++;
    }
    return { played: completed.length, wins, draws, losses, goals, conceded, cleanSheets, motm, deciderWins };
  }, [history, id]);

  // ── Live computed stats from team-tournament player games ─────────────────
  const teamGameStats = useMemo(() => {
    const completed = (playerGames ?? []).filter((g) => g.matchStatus === "completed");
    let wins = 0, draws = 0, losses = 0, goals = 0, conceded = 0, cleanSheets = 0, motm = 0, deciderWins = 0;
    for (const g of completed) {
      const isHome = g.homePlayerId === id;
      const my  = (isHome ? g.homeScore : g.awayScore) ?? 0;
      const opp = (isHome ? g.awayScore : g.homeScore) ?? 0;
      goals    += my;
      conceded += opp;
      if (opp === 0) cleanSheets++;
      if (g.manOfTheMatchId === id) motm++;
      if (my > opp) { wins++; if (my - opp === 1) deciderWins++; }
      else if (my === opp) draws++;
      else losses++;
    }
    return { played: completed.length, wins, draws, losses, goals, conceded, cleanSheets, motm, deciderWins };
  }, [playerGames, id]);

  // ── Combined overall (solo + team games) ─────────────────────────────────
  const overall = useMemo(() => ({
    played:      liveStats.played      + teamGameStats.played,
    wins:        liveStats.wins        + teamGameStats.wins,
    draws:       liveStats.draws       + teamGameStats.draws,
    losses:      liveStats.losses      + teamGameStats.losses,
    goals:       liveStats.goals       + teamGameStats.goals,
    conceded:    liveStats.conceded    + teamGameStats.conceded,
    cleanSheets: liveStats.cleanSheets + teamGameStats.cleanSheets,
    motm:        liveStats.motm        + teamGameStats.motm,
    deciderWins: liveStats.deciderWins  + teamGameStats.deciderWins,
  }), [liveStats, teamGameStats]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 space-y-4">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Player not found</p>
        <Button variant="ghost" className="mt-4" asChild>
          <Link href="/players"><ArrowLeft className="w-4 h-4 mr-1" /> Players</Link>
        </Button>
      </div>
    );
  }

  const stars = starCount(player.points ?? 0);
  const displayName = player.displayName ?? player.username;

  // ── tab panels ──────────────────────────────────────────────────────────────
  function ContractTab() {
    if (!player) return null;
    return (
      <div className="space-y-4">
        {/* Current Club */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Current Club</h3>

          {player.teamName ? (
            <>
              <div className="flex items-center gap-4">
                {(player as any).teamLogoUrl ? (
                  <img
                    src={(player as any).teamLogoUrl}
                    alt={player.teamName}
                    className="w-14 h-14 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-primary/10 border border-border flex items-center justify-center flex-shrink-0">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                )}
                <div>
                  <div className="font-bold text-lg leading-tight">
                    {player.teamName}
                    {(player as any).teamTag && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        ({(player as any).teamTag})
                      </span>
                    )}
                  </div>
                  {player.country && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                      <span className="text-base leading-none">{countryNameToFlag(player.country)}</span>
                      {player.country}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-2 border-t border-border">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider">
                    <CalendarDays className="w-3.5 h-3.5" />
                    Contract Status
                  </div>
                  <div className="text-primary font-bold text-lg">Active</div>
                  <div className="text-xs text-muted-foreground">Member since joining</div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider">
                    <MapPin className="w-3.5 h-3.5" />
                    Country
                  </div>
                  <div className="font-bold text-lg flex items-center gap-2">
                    {player.country
                      ? <><span className="text-2xl leading-none">{countryNameToFlag(player.country)}</span>{player.country}</>
                      : "—"}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm py-4 text-center">
              This player is not currently in a club.
            </p>
          )}
        </div>
      </div>
    );
  }

  function InfoTab() {
    if (!player) return null;
    const p = player as any;
    const deviceType = p.gamingDevice === "pc" ? "PC" : p.gamingDevice === "mobile" ? "Mobile" : null;

    return (
      <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
        <h3 className="font-bold text-lg">Personal Information</h3>

        {/* Row 1: Gaming Device + Konami ID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Gamepad2 className="w-3.5 h-3.5" />
              Gaming Device
            </div>
            <div className="font-bold text-base">{p.deviceName ?? "—"}</div>
            {deviceType && <div className="text-sm text-muted-foreground">{deviceType}</div>}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-bold text-xs">#</span>
              KONAMI ID
            </div>
            <div className="font-bold text-base tracking-widest">{p.konamiId ?? "—"}</div>
          </div>
        </div>

        {/* Row 2: Nationality + Blood Group */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-border/50">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              Nationality
            </div>
            <div className="font-bold text-base flex items-center gap-2">
              {player.country
                ? <><span className="text-xl leading-none">{countryNameToFlag(player.country)}</span>{player.country}</>
                : "—"}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Droplets className="w-3.5 h-3.5" />
              Blood Group
            </div>
            <div className="font-bold text-base">{p.bloodGroup ?? "—"}</div>
          </div>
        </div>

        {/* Row 3: Legacy cup records (tournament wins) */}
        <div className="pt-2 border-t border-border/50 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Trophy className="w-3.5 h-3.5" />
            Legacy cup records
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-sm">
              Player CSV cups:{" "}
              <span className="font-bold">{player.tournamentWins ?? 0}</span>
            </div>
            <div className="text-sm">
              Club-attributed (all clubs):{" "}
              <span className="font-bold">{player.tournamentWins ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Bio + badges */}
        {player.bio && (
          <div className="pt-2 border-t border-border/50 space-y-1">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Bio</div>
            <p className="text-sm">{player.bio}</p>
          </div>
        )}
        {player.badges && player.badges.length > 0 && (
          <div className="pt-2 border-t border-border/50 space-y-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Badges</div>
            <div className="flex flex-wrap gap-2">
              {player.badges.map((badge) => (
                <Badge key={badge} variant="secondary" className="gap-1">
                  <Star className="w-3 h-3 text-primary" />
                  {badge}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function OverallTab() {
    if (!player) return null;

    const { played, wins: won, draws: drawn, losses: lost, goals: goalsScored } = overall;
    const winPct = played > 0 ? Math.round((won / played) * 100) : 0;

    // Market Value is derived from the player's TOTAL POINTS (persisted value,
    // with a live fallback computed from points).
    const marketValue = marketValueLabel((player as any).marketValue ?? pointsToMarketValue(player.points ?? 0));

    const stats = [
      { icon: <TrendingUp className="w-6 h-6 text-violet-400" />,  value: Math.round(player.points ?? 0), label: "Points" },
      { icon: <User        className="w-6 h-6 text-violet-400" />,  value: played,                          label: "Appearances" },
      { icon: <Trophy      className="w-6 h-6 text-amber-400"  />,  value: won,                             label: "Win" },
      { icon: <Handshake   className="w-6 h-6 text-amber-300"  />,  value: drawn,                           label: "Draw" },
      { icon: <Zap         className="w-6 h-6 text-yellow-400" />,  value: overall.deciderWins,             label: "Decider Win" },
      { icon: <Target      className="w-6 h-6 text-blue-400"   />,  value: goalsScored,                     label: "Goal" },
      { icon: <ShieldCheck className="w-6 h-6 text-violet-400" />,  value: overall.cleanSheets,             label: "Clean Sheets" },
      { icon: <BarChart2   className="w-6 h-6 text-primary"    />,  value: `${winPct}%`,                    label: "Win Rate" },
      { icon: <Star        className="w-6 h-6 text-amber-400"  />,  value: overall.motm,                    label: "MOTM" },
      { icon: <Square      className="w-6 h-6 text-orange-400" />,  value: 0,                               label: "Card" },
      { icon: <Award       className="w-6 h-6 text-amber-400"  />,  value: player.tournamentWins ?? 0,      label: "Tournament Win" },
      { icon: <Coins       className="w-6 h-6 text-amber-400"  />,  value: marketValue,                     label: "Market Value" },
    ];

    return (
      <div className="space-y-4">
        {/* header */}
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Career statistics</h3>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
            Career (overall)
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
          </div>
        </div>

        {/* 2-row × 6-col grid */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {stats.map(({ icon, value, label }) => (
            <div
              key={label}
              className="rounded-2xl border border-border bg-card p-4 flex flex-col items-start gap-2"
            >
              <div className="leading-none">{icon}</div>
              <div className="font-black text-xl leading-none">{value}</div>
              <div className="text-xs text-muted-foreground leading-tight">{label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function HistoryTab() {
    // Build a unified list of rows from both sources
    type HistoryRow = {
      key: string;
      tournament: string | null;
      roundLabel: string;
      opponent: string | null;
      myScore: number | null;
      oppScore: number | null;
      status: string;
      kind: "solo" | "team-game";
    };

    const soloRows: HistoryRow[] = (history ?? []).map((m) => {
      const isP1 = m.participant1Id === id;
      return {
        key: `solo-${m.id}`,
        tournament: (m as any).tournamentName ?? null,
        roundLabel: (m as any).roundName ?? `Round ${m.round}`,
        opponent: isP1 ? (m.participant2Name ?? null) : (m.participant1Name ?? null),
        myScore:  isP1 ? (m.participant1Score ?? null) : (m.participant2Score ?? null),
        oppScore: isP1 ? (m.participant2Score ?? null) : (m.participant1Score ?? null),
        status: m.status,
        kind: "solo",
      };
    });

    const teamRows: HistoryRow[] = (playerGames ?? []).map((g) => {
      const isHome = g.homePlayerId === id;
      return {
        key: `team-game-${g.id}`,
        tournament: g.tournamentName ?? null,
        roundLabel: g.roundName ?? (g.round != null ? `Round ${g.round}` : "—"),
        opponent: isHome ? g.awayPlayerName : g.homePlayerName,
        myScore:  isHome ? g.homeScore : g.awayScore,
        oppScore: isHome ? g.awayScore : g.homeScore,
        status: g.matchStatus ?? "scheduled",
        kind: "team-game",
      };
    });

    const allRows = [...soloRows, ...teamRows];

    if (allRows.length === 0) {
      return (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground text-sm">
          No match history yet.
        </div>
      );
    }

    function getRowResult(row: HistoryRow): "win" | "loss" | "draw" | null {
      if (row.status !== "completed") return null;
      if (row.myScore === null || row.oppScore === null) return null;
      if (row.myScore > row.oppScore) return "win";
      if (row.myScore === row.oppScore) return "draw";
      return "loss";
    }

    const completedRows = allRows.filter((r) => r.status === "completed");

    return (
      <div className="space-y-4">
        {/* Share link */}
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href={`/players/${id}/history`}>
              <Share2 className="w-4 h-4" />
              Share History
            </Link>
          </Button>
        </div>

        {/* Summary cards — live from computed stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Played",       value: overall.played,   color: "" },
            { label: "Won",          value: overall.wins,     color: "text-primary" },
            { label: "Draw",         value: overall.draws,    color: "text-amber-400" },
            { label: "Lost",         value: overall.losses,   color: "text-destructive" },
            { label: "Goals Scored", value: overall.goals,    color: "text-teal-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-5 text-center">
              <div className={`text-3xl font-black ${color}`}>{value}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Solo matches */}
        {soloRows.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground px-1">
              Solo Tournament Matches
            </h4>
            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {["Tournament", "Round", "Opponent", "Score", "Result"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {soloRows.map((row, i) => {
                    const result = getRowResult(row);
                    const badge = result === "win"  ? <span className="px-2 py-0.5 rounded text-xs font-black bg-primary/15 text-primary">W</span>
                                : result === "draw" ? <span className="px-2 py-0.5 rounded text-xs font-black bg-amber-400/15 text-amber-400">D</span>
                                : result === "loss" ? <span className="px-2 py-0.5 rounded text-xs font-black bg-destructive/15 text-destructive">L</span>
                                : <span className={`text-xs font-bold uppercase ${matchStatusColors[row.status] ?? "text-muted-foreground"}`}>{row.status}</span>;
                    return (
                      <tr key={row.key} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-card" : ""}`}>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{row.tournament ?? "—"}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{row.roundLabel}</td>
                        <td className="px-4 py-3 font-bold">{row.opponent ?? "TBD"}</td>
                        <td className="px-4 py-3 font-mono font-bold text-lg">
                          {row.myScore !== null && row.oppScore !== null
                            ? <span>{row.myScore} <span className="text-muted-foreground font-normal text-sm">–</span> {row.oppScore}</span>
                            : <span className="text-muted-foreground">vs</span>}
                        </td>
                        <td className="px-4 py-3">{badge}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Team-tournament individual games */}
        {teamRows.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground px-1">
              Team Tournament — Individual Games
            </h4>
            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {["Tournament", "Round", "Opponent", "Score", "Result"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teamRows.map((row, i) => {
                    const result = getRowResult(row);
                    const badge = result === "win"  ? <span className="px-2 py-0.5 rounded text-xs font-black bg-primary/15 text-primary">W</span>
                                : result === "draw" ? <span className="px-2 py-0.5 rounded text-xs font-black bg-amber-400/15 text-amber-400">D</span>
                                : result === "loss" ? <span className="px-2 py-0.5 rounded text-xs font-black bg-destructive/15 text-destructive">L</span>
                                : <span className={`text-xs font-bold uppercase ${matchStatusColors[row.status] ?? "text-muted-foreground"}`}>{row.status}</span>;
                    return (
                      <tr key={row.key} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-card" : ""}`}>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{row.tournament ?? "—"}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{row.roundLabel}</td>
                        <td className="px-4 py-3 font-bold">{row.opponent ?? "TBD"}</td>
                        <td className="px-4 py-3 font-mono font-bold text-lg">
                          {row.myScore !== null && row.oppScore !== null
                            ? <span>{row.myScore} <span className="text-muted-foreground font-normal text-sm">–</span> {row.oppScore}</span>
                            : <span className="text-muted-foreground">vs</span>}
                        </td>
                        <td className="px-4 py-3">{badge}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground px-1">
              Individual games played within team matches. Scores are your personal game result, not the team total.
            </p>
          </div>
        )}

        {completedRows.length < allRows.length && (
          <p className="text-xs text-muted-foreground px-1">
            * Scheduled and live entries are shown but not counted in the summary.
          </p>
        )}
      </div>
    );
  }

  function ClubTab() {
    if (!player) return null;
    const p = player as any;

    const clubWinRate = teamGameStats.played > 0
      ? Math.round((teamGameStats.wins / teamGameStats.played) * 100)
      : 0;

    const marketValue = marketValueLabel((player as any).marketValue ?? pointsToMarketValue(player.points ?? 0));

    const stats = [
      { icon: <User        className="w-6 h-6 text-violet-400" />,  value: teamGameStats.played,       label: "Appearances" },
      { icon: <Trophy      className="w-6 h-6 text-amber-400"  />,  value: teamGameStats.wins,         label: "Win" },
      { icon: <XCircle     className="w-6 h-6 text-rose-400"   />,  value: teamGameStats.losses,       label: "Losses" },
      { icon: <Handshake   className="w-6 h-6 text-amber-300"  />,  value: teamGameStats.draws,        label: "Draw" },
      { icon: <Zap         className="w-6 h-6 text-yellow-400" />,  value: teamGameStats.deciderWins,  label: "Decider Win" },
      { icon: <Target      className="w-6 h-6 text-blue-400"   />,  value: teamGameStats.goals,        label: "Goal" },
      { icon: <ShieldCheck className="w-6 h-6 text-violet-400" />,  value: teamGameStats.cleanSheets,  label: "Clean Sheets" },
      { icon: <BarChart2   className="w-6 h-6 text-primary"    />,  value: `${clubWinRate}%`,          label: "Win Rate" },
      { icon: <Star        className="w-6 h-6 text-amber-400"  />,  value: teamGameStats.motm,         label: "MOTM" },
      { icon: <Square      className="w-6 h-6 text-orange-400" />,  value: 0,                          label: "Card" },
      { icon: <Award       className="w-6 h-6 text-amber-400"  />,  value: player.tournamentWins ?? 0, label: "Tournament Win" },
      { icon: <Coins       className="w-6 h-6 text-amber-400"  />,  value: marketValue,                label: "Market Value" },
    ];

    return (
      <div className="space-y-4">
        {/* Club identity header */}
        {player.teamName && (
          <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4">
            {p.teamLogoUrl ? (
              <img src={p.teamLogoUrl} alt={player.teamName} className="w-12 h-12 rounded-full object-cover border border-border flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-border flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-primary" />
              </div>
            )}
            <div>
              <div className="font-bold text-base leading-tight">
                {player.teamName}
                {p.teamTag && <span className="ml-2 text-xs text-muted-foreground font-normal">({p.teamTag})</span>}
              </div>
              <div className="text-xs text-primary font-semibold mt-0.5">Active</div>
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="space-y-2">
          <h3 className="font-bold text-lg px-1">Club Tournament Statistics</h3>
          {teamGameStats.played === 0 && (
            <p className="text-muted-foreground text-sm px-1 pb-2">
              No team tournament games recorded yet.
            </p>
          )}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {stats.map(({ icon, value, label }) => (
              <div
                key={label}
                className="rounded-2xl border border-border bg-card p-4 flex flex-col items-start gap-2"
              >
                <div className="leading-none">{icon}</div>
                <div className="font-black text-xl leading-none">{value}</div>
                <div className="text-xs text-muted-foreground leading-tight">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {!player.teamName && (
          <p className="text-muted-foreground text-sm py-8 text-center">
            This player is not currently in a club.
          </p>
        )}
      </div>
    );
  }

  function SoloTab() {
    if (!player) return null;
    const { played, wins: won, losses: lost, draws: drawn, goals, cleanSheets, motm, deciderWins } = liveStats;
    const winRate = played > 0 ? Math.round((won / played) * 100) : 0;

    const marketValue = marketValueLabel((player as any).marketValue ?? pointsToMarketValue(player.points ?? 0));

    const stats = [
      { icon: <User        className="w-6 h-6 text-violet-400" />, value: played,                      label: "Appearances" },
      { icon: <Trophy      className="w-6 h-6 text-amber-400"  />, value: won,                         label: "Win" },
      { icon: <XCircle     className="w-6 h-6 text-rose-400"   />, value: lost,                        label: "Losses" },
      { icon: <Handshake   className="w-6 h-6 text-amber-300"  />, value: drawn,                       label: "Draw" },
      { icon: <Zap         className="w-6 h-6 text-yellow-400" />, value: deciderWins,                 label: "Decider Win" },
      { icon: <Target      className="w-6 h-6 text-blue-400"   />, value: goals,                       label: "Goal" },
      { icon: <ShieldCheck className="w-6 h-6 text-violet-400" />, value: cleanSheets,                 label: "Clean Sheets" },
      { icon: <BarChart2   className="w-6 h-6 text-primary"    />, value: `${winRate}%`,               label: "Win Rate" },
      { icon: <Star        className="w-6 h-6 text-amber-400"  />, value: motm,                        label: "MOTM" },
      { icon: <Square      className="w-6 h-6 text-orange-400" />, value: 0,                           label: "Card" },
      { icon: <Award       className="w-6 h-6 text-amber-400"  />, value: player.tournamentWins ?? 0,  label: "Tournament Win" },
      { icon: <Coins       className="w-6 h-6 text-amber-400"  />, value: marketValue,                 label: "Market Value" },
    ];

    return (
      <div className="space-y-4">
        <h3 className="font-bold text-lg px-1">Solo Tournament Statistics</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {stats.map(({ icon, value, label }) => (
            <div
              key={label}
              className="rounded-2xl border border-border bg-card p-4 flex flex-col items-start gap-2"
            >
              <div className="leading-none">{icon}</div>
              <div className="font-black text-xl leading-none">{value}</div>
              <div className="text-xs text-muted-foreground leading-tight">{label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

        {/* ── Hero banner ── */}
        <div className="relative h-48 md:h-56 overflow-hidden">
          <img
            src="/profile-banner.png"
            alt="Waryaa Gaming Stadium"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          {/* dark gradient at the bottom so the avatar/name stays readable */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/90" />
        </div>

        <div className="container mx-auto px-4">
          {/* back button */}
          <Button variant="ghost" size="sm" className="-mt-2 mb-0 gap-2 text-muted-foreground relative z-10" asChild>
            <Link href="/players"><ArrowLeft className="w-4 h-4" /> Players</Link>
          </Button>

          {/* ── Profile header ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 -mt-16 mb-6 relative z-10">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-24 h-24 rounded-full ring-4 ring-cyan-400 ring-offset-4 ring-offset-background overflow-hidden shadow-[0_0_20px_rgba(34,211,238,0.4)]">
                {player.avatarUrl ? (
                  <img src={player.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                    <span className="text-4xl font-black text-primary">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Name / club / stars */}
            <div className="flex-1 pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-black leading-none flex items-center gap-2">
                        {displayName}
                        {(player as any).verified && (
                          <img
                          src={`${import.meta.env.BASE_URL}verified.png`}
                          alt=""
                          draggable={false}
                          className="h-5 w-5 shrink-0 object-contain"
                        />
                        )}
                      </h1>
                {player.country && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span className="text-lg leading-none">{countryNameToFlag(player.country)}</span>
                    {player.country}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {player.teamName && player.teamId ? (
                  <Link
                    href={`/teams/${player.teamId}`}
                    className="flex items-center gap-1.5 group"
                  >
                    {(player as any).teamLogoUrl ? (
                      <img
                        src={(player as any).teamLogoUrl}
                        alt={player.teamName}
                        className="w-5 h-5 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <Shield className="w-4 h-4 text-cyan-400" />
                    )}
                    <span className="text-cyan-400 font-semibold text-sm group-hover:underline">
                      {player.teamName}
                    </span>
                  </Link>
                ) : (
                  <span className="text-muted-foreground text-sm">No team</span>
                )}
                {(player as any).teamCaptainId === player.id && (
                  <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold text-xs px-1.5 py-0 h-5 gap-1">
                    <Star className="w-3 h-3 fill-amber-400" />
                    Captain
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <Stars n={stars} />
                <Badge className="bg-emerald-600/80 text-white border-0 font-bold text-xs px-2 py-0.5">
                  {(player.points ?? 0).toFixed(1)} pts
                </Badge>
                <span className="text-xs text-muted-foreground">Rank #{player.rank}</span>
              </div>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="border-b border-border mb-6">
            <div className="flex gap-1 overflow-x-auto pb-px scrollbar-none">
              {TABS.map(({ id: tid, label, icon: Icon }) => (
                <button
                  key={tid}
                  onClick={() => setActiveTab(tid)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors focus:outline-none ${
                    activeTab === tid
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tab content ── */}
          <div className="pb-16">
            {activeTab === "contract" && <ContractTab />}
            {activeTab === "info"     && <InfoTab />}
            {activeTab === "overall"  && <OverallTab />}
            {activeTab === "club"     && <ClubTab />}
            {activeTab === "solo"     && <SoloTab />}
            {activeTab === "history"  && <HistoryTab />}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
