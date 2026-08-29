import { useState, useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Trophy, Star, TrendingUp, TrendingDown, ArrowUpDown, ChevronsUpDown, Search, Shield, X, Minus, CalendarRange, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { storageUrl } from "@/lib/api";
import { marketValueLabel } from "@/lib/player-stats";

interface Season {
  id: number;
  name: string;
  isCurrent: boolean;
  topScorerPlayer?: { id: number; username: string; avatarUrl?: string | null } | null;
  ballonDorPlayer?: { id: number; username: string; avatarUrl?: string | null } | null;
}

// ── SeasonAwardCard ────────────────────────────────────────────────────────────
function SeasonAwardCard({
  title, subtitle, seasonName, winner, icon,
}: {
  title: string;
  subtitle: string;
  seasonName: string;
  winner: { id: number; username: string; avatarUrl?: string | null } | null;
  icon: React.ReactNode;
}) {
  if (!winner) {
    return (
      <div className="max-w-md mx-auto rounded-2xl border border-border bg-card p-10 text-center mt-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-muted/40 flex items-center justify-center mb-4">
          {icon}
        </div>
        <p className="font-black text-lg">No winner yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          The {title} for {seasonName || "this season"} has not been awarded. Check back soon.
        </p>
      </div>
    );
  }
  return (
    <Link href={`/players/${winner.id}`}>
      <motion.div
        whileHover={{ y: -4, scale: 1.01 }}
        className="relative max-w-md mx-auto mt-4 cursor-pointer rounded-3xl overflow-hidden border border-amber-400/40 bg-gradient-to-b from-[#1a1206] via-[#12100a] to-[#0a0a0a] shadow-[0_0_60px_-15px_rgba(251,191,36,0.5)]"
      >
        {/* glow orb */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-amber-400/20 blur-[80px] pointer-events-none" />
        <div className="relative px-8 pt-10 pb-8 flex flex-col items-center text-center">
          {/* Icon */}
          <div className="mb-5 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]">{icon}</div>

          {/* Title */}
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-amber-300/90">{subtitle}</p>
          <h2 className="text-3xl font-black mt-1 bg-gradient-to-br from-amber-100 via-amber-300 to-yellow-600 bg-clip-text text-transparent">
            {title}
          </h2>
          <p className="text-xs font-bold text-muted-foreground mt-1 flex items-center gap-1.5">
            <CalendarRange className="w-3.5 h-3.5 text-amber-400" /> {seasonName || "Season"}
          </p>

          {/* Avatar */}
          <div className="relative mt-6">
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-yellow-600 blur-[2px] opacity-80" />
            <div className="relative w-32 h-32 rounded-full overflow-hidden ring-4 ring-amber-300/60 bg-zinc-900 flex items-center justify-center">
              {winner.avatarUrl ? (
                <img src={winner.avatarUrl} alt={winner.username} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-black text-amber-300">{winner.username?.charAt(0)?.toUpperCase() ?? "?"}</span>
              )}
            </div>
            <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-yellow-600 flex items-center justify-center shadow-lg ring-2 ring-black/40">
              <Trophy className="w-5 h-5 text-black fill-black" />
            </div>
          </div>

          {/* Player name */}
          <p className="text-2xl font-black text-white mt-6 group-hover:text-amber-200 transition-colors">
            {winner.username}
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-black bg-gradient-to-r from-amber-300 to-yellow-500 rounded-full px-4 py-1.5">
            <Star className="w-3.5 h-3.5 fill-black" /> View Profile
          </span>
        </div>
      </motion.div>
    </Link>
  );
}

// ── TeamRankingsPanel ──────────────────────────────────────────────────────────
type TeamPeriod = "overall" | "seasonal" | "weekly" | "monthly" | "comparison";

function FormBadge({ result }: { result: string }) {
  const cfg =
    result === "W" ? "bg-green-500 text-white" :
    result === "L" ? "bg-red-500 text-white" :
                     "bg-zinc-600 text-white";
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black ${cfg}`}>
      {result}
    </span>
  );
}

// ── Top-3 medal styling (gold / silver / bronze) ──────────────────────────────
const MEDAL: Record<number, { badge: string; name: string; star: string }> = {
  1: {
    badge: "w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-black text-black bg-gradient-to-br from-amber-200 via-amber-400 to-yellow-600 shadow-[0_0_12px_rgba(251,191,36,.65)] ring-1 ring-amber-200/60",
    name: "text-amber-300",
    star: "text-amber-300 fill-amber-300 drop-shadow-[0_0_4px_rgba(251,191,36,.8)]",
  },
  2: {
    badge: "w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-black text-slate-900 bg-gradient-to-br from-slate-100 via-slate-300 to-slate-500 shadow-[0_0_12px_rgba(203,213,225,.55)] ring-1 ring-slate-200/60",
    name: "text-slate-200",
    star: "text-slate-200 fill-slate-200 drop-shadow-[0_0_4px_rgba(203,213,225,.7)]",
  },
  3: {
    badge: "w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-black text-white bg-gradient-to-br from-orange-400 via-amber-700 to-amber-900 shadow-[0_0_12px_rgba(180,83,9,.6)] ring-1 ring-orange-300/50",
    name: "text-orange-400",
    star: "text-orange-400 fill-orange-400 drop-shadow-[0_0_4px_rgba(234,88,12,.7)]",
  },
};
const medalOf = (rank: number) => (rank >= 1 && rank <= 3 ? MEDAL[rank] : null);


function TeamStars({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 transition-transform hover:scale-125 ${i < rating
          ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,.8)]"
          : "text-zinc-800 fill-zinc-800/60"}`} />
      ))}
    </div>
  );
}

type TeamRankRow = {
  rank: number; teamId: number; name: string; tag?: string | null;
  logoUrl?: string | null; points: number; wins: number; losses: number;
  draws: number; matchesPlayed: number; starRating: number;
  memberCount: number; recentForm: string[];
};

// ── TeamSelector ──────────────────────────────────────────────────────────────
function TeamSelector({
  selected, onSelect, onClear, teams, search, onSearch,
}: {
  selected: TeamRankRow | null;
  onSelect: (t: TeamRankRow) => void;
  onClear: () => void;
  teams: TeamRankRow[];
  search: string;
  onSearch: (v: string) => void;
}) {
  const filtered = useMemo(
    () => teams.filter(t => t.name.toLowerCase().includes(search.toLowerCase())),
    [teams, search]
  );
  return (
    <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col gap-4 min-h-[200px]">
      {selected ? (
        <div className="flex flex-col items-center gap-2 flex-1 justify-center">
          <div className="w-16 h-16 rounded-full bg-zinc-800 border-2 border-teal-400/40 flex items-center justify-center overflow-hidden">
            {storageUrl(selected.logoUrl)
              ? <img src={storageUrl(selected.logoUrl)} alt={selected.name} className="w-full h-full object-cover" />
              : <Shield className="w-7 h-7 text-zinc-500" />}
          </div>
          <p className="font-black text-base text-white text-center leading-tight">
            {selected.name}{selected.tag ? <span className="text-zinc-400 font-semibold"> ({selected.tag})</span> : null}
          </p>
          <p className="text-xs text-teal-400 font-bold">Rank #{selected.rank}</p>
          <button onClick={onClear} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 transition-colors mt-1">
            <X className="w-3 h-3" /> Change team
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 flex-1 justify-center">
          <Shield className="w-10 h-10 text-zinc-700" strokeWidth={1.5} />
          <p className="text-sm font-bold text-zinc-500">Select a team</p>
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search teams..."
          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-teal-500 placeholder:text-zinc-600 text-white transition-colors"
        />
      </div>
      {search && (
        <div className="rounded-lg border border-zinc-800 overflow-hidden max-h-44 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-4">No teams found</p>
          ) : filtered.map(t => (
            <button
              key={t.teamId}
              onClick={() => { onSelect(t); onSearch(""); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-800 transition-colors text-left"
            >
              <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                {storageUrl(t.logoUrl)
                  ? <img src={storageUrl(t.logoUrl)} alt={t.name} className="w-full h-full object-cover" />
                  : <Shield className="w-3.5 h-3.5 text-zinc-500" />}
              </div>
              <span className="font-bold text-zinc-200">{t.name}</span>
              <span className="text-xs text-zinc-500 ml-auto">#{t.rank}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TeamStatBar ───────────────────────────────────────────────────────────────
function TeamStatBar({ label, a, b, higherIsBetter = true, format = (v: number) => String(v) }: {
  label: string; a: number; b: number; higherIsBetter?: boolean; format?: (v: number) => string;
}) {
  const max = Math.max(a, b, 1);
  const aWins = higherIsBetter ? a > b : a < b;
  const bWins = higherIsBetter ? b > a : b < a;
  const tied = a === b;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div className="flex items-center justify-end gap-2">
        <span className={`text-sm font-black ${aWins ? "text-teal-400" : "text-white"}`}>{format(a)}</span>
        {!tied && aWins && <TrendingUp className="w-3 h-3 text-teal-400 shrink-0" />}
        {!tied && !aWins && <TrendingDown className="w-3 h-3 text-red-400 shrink-0" />}
        {tied && <Minus className="w-3 h-3 text-zinc-500 shrink-0" />}
      </div>
      <div className="flex flex-col items-center gap-1 min-w-[110px]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
        <div className="relative w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden flex">
          <div
            className={`h-full rounded-full transition-all duration-500 ${aWins ? "bg-teal-400" : tied ? "bg-zinc-600" : "bg-zinc-600"}`}
            style={{ width: `${(a / max) * 50}%`, marginLeft: `${50 - (a / max) * 50}%` }}
          />
          <div
            className={`h-full rounded-full transition-all duration-500 ${bWins ? "bg-teal-400" : tied ? "bg-zinc-600" : "bg-zinc-600"}`}
            style={{ width: `${(b / max) * 50}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!tied && bWins && <TrendingUp className="w-3 h-3 text-teal-400 shrink-0" />}
        {!tied && !bWins && <TrendingDown className="w-3 h-3 text-red-400 shrink-0" />}
        {tied && <Minus className="w-3 h-3 text-zinc-500 shrink-0" />}
        <span className={`text-sm font-black ${bWins ? "text-teal-400" : "text-white"}`}>{format(b)}</span>
      </div>
    </div>
  );
}

// ── TeamComparison ────────────────────────────────────────────────────────────
function TeamComparison({ teams }: { teams: TeamRankRow[] }) {
  const [teamA, setTeamA] = useState<TeamRankRow | null>(null);
  const [teamB, setTeamB] = useState<TeamRankRow | null>(null);
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");

  const bothSelected = !!teamA && !!teamB;

  const winRateA = teamA ? (teamA.matchesPlayed > 0 ? teamA.wins / teamA.matchesPlayed : 0) : 0;
  const winRateB = teamB ? (teamB.matchesPlayed > 0 ? teamB.wins / teamB.matchesPlayed : 0) : 0;

  const stats = bothSelected ? [
    { label: "Rank",          a: teamA.rank,         b: teamB.rank,         higherIsBetter: false, format: (v: number) => `#${v}` },
    { label: "Points",        a: teamA.points,       b: teamB.points },
    { label: "Rating",        a: teamA.starRating,   b: teamB.starRating,   format: (v: number) => "★".repeat(v) || "0" },
    { label: "Matches",       a: teamA.matchesPlayed,b: teamB.matchesPlayed },
    { label: "Wins",          a: teamA.wins,         b: teamB.wins },
    { label: "Draws",         a: teamA.draws,        b: teamB.draws,        higherIsBetter: false },
    { label: "Losses",        a: teamA.losses,       b: teamB.losses,       higherIsBetter: false },
    { label: "Win Rate",      a: winRateA,           b: winRateB,           format: (v: number) => `${(v * 100).toFixed(0)}%` },
    { label: "Squad Size",    a: teamA.memberCount,  b: teamB.memberCount },
  ] : [];

  // determine overall winner
  let aEdge = 0, bEdge = 0;
  if (bothSelected) {
    stats.forEach(s => {
      const aWins = s.higherIsBetter === false ? s.a < s.b : s.a > s.b;
      const bWins = s.higherIsBetter === false ? s.b < s.a : s.b > s.a;
      if (aWins) aEdge++;
      else if (bWins) bEdge++;
    });
  }

  return (
    <div className="space-y-5">
      {/* Selectors */}
      <div className="flex gap-4">
        <TeamSelector
          selected={teamA} onSelect={setTeamA} onClear={() => setTeamA(null)}
          teams={teams.filter(t => t.teamId !== teamB?.teamId)}
          search={searchA} onSearch={setSearchA}
        />
        <div className="flex items-center justify-center w-10 shrink-0">
          <span className="text-2xl font-black text-zinc-700">VS</span>
        </div>
        <TeamSelector
          selected={teamB} onSelect={setTeamB} onClear={() => setTeamB(null)}
          teams={teams.filter(t => t.teamId !== teamA?.teamId)}
          search={searchB} onSearch={setSearchB}
        />
      </div>

      {/* Comparison panel */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
        {!bothSelected ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Shield className="w-12 h-12 text-zinc-700" strokeWidth={1.5} />
            <p className="font-black text-lg text-white">Compare Two Teams</p>
            <p className="text-sm text-zinc-500">Select 2 teams to see their head-to-head stats</p>
          </div>
        ) : (
          <div className="p-6">
            {/* Winner banner */}
            {aEdge !== bEdge && (
              <div className="flex items-center justify-center mb-6">
                <div className="bg-teal-400/10 border border-teal-400/30 rounded-xl px-5 py-2.5 text-center">
                  <p className="text-xs text-teal-400 font-bold uppercase tracking-widest mb-0.5">Advantage</p>
                  <p className="text-lg font-black text-white">
                    {aEdge > bEdge ? teamA.name : teamB.name}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Wins {Math.max(aEdge, bEdge)} of {stats.length} categories
                  </p>
                </div>
              </div>
            )}

            {/* Header names */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-6">
              <Link href={`/teams/${teamA.teamId}`}>
                <p className="text-right font-black text-base text-teal-400 hover:underline cursor-pointer truncate">
                  {teamA.name}
                </p>
              </Link>
              <span className="text-[10px] font-black text-zinc-600 min-w-[110px] text-center uppercase tracking-widest">Stats</span>
              <Link href={`/teams/${teamB.teamId}`}>
                <p className="text-left font-black text-base text-teal-400 hover:underline cursor-pointer truncate">
                  {teamB.name}
                </p>
              </Link>
            </div>

            {/* Recent form */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-6 pb-6 border-b border-zinc-800">
              <div className="flex justify-end gap-1 flex-wrap">
                {teamA.recentForm.length > 0
                  ? teamA.recentForm.map((r, i) => (
                      <span key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white ${r === "W" ? "bg-green-500" : r === "L" ? "bg-red-500" : "bg-zinc-600"}`}>{r}</span>
                    ))
                  : <span className="text-zinc-600 text-xs">—</span>}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 min-w-[110px] text-center">Recent Form</span>
              <div className="flex justify-start gap-1 flex-wrap">
                {teamB.recentForm.length > 0
                  ? teamB.recentForm.map((r, i) => (
                      <span key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white ${r === "W" ? "bg-green-500" : r === "L" ? "bg-red-500" : "bg-zinc-600"}`}>{r}</span>
                    ))
                  : <span className="text-zinc-600 text-xs">—</span>}
              </div>
            </div>

            {/* Stat rows */}
            <div className="flex flex-col gap-5">
              {stats.map(s => <TeamStatBar key={s.label} {...s} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type TeamSortKey = "rank" | "wins" | "losses" | "draws" | "matchesPlayed" | "points";

function TeamRankingsPanel({ teams, loading, seasons = [] }: { teams: TeamRankRow[]; loading: boolean; seasons?: Season[] }) {
  const [period, setPeriod] = useState<TeamPeriod>("overall");
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<TeamSortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const periods: { id: TeamPeriod; label: string }[] = [
    { id: "overall", label: "Overall" },
    { id: "seasonal", label: "Seasonal" },
    { id: "weekly", label: "Weekly" },
    { id: "monthly", label: "Monthly" },
    { id: "comparison", label: "Comparison" },
  ];

  const currentTeamSeason = seasons.find(s => s.isCurrent) ?? seasons[0] ?? null;
  const activeTeamSeason = selectedSeasonId != null
    ? seasons.find(s => s.id === selectedSeasonId) ?? currentTeamSeason
    : currentTeamSeason;

  // Seasonal / Weekly / Monthly need per-period data from the backend.
  const needsFetch = period === "seasonal" || period === "weekly" || period === "monthly";
  const { data: periodTeams, isLoading: periodLoading, error: periodTeamsError } = useQuery<TeamRankRow[]>({
    queryKey: ["team-rankings", period, activeTeamSeason?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (period === "seasonal") params.set("seasonId", String(activeTeamSeason?.id ?? ""));
      else if (period === "weekly" || period === "monthly") params.set("period", period);
      const qs = params.toString();
      const res = await fetch(`${import.meta.env.BASE_URL}api/rankings/teams${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.text().catch(() => "Team rankings request failed");
        throw new Error(err);
      }
      return res.json() as Promise<TeamRankRow[]>;
    },
    enabled: needsFetch,
  });

  const displayTeams: TeamRankRow[] = needsFetch ? (periodTeams ?? []) : (teams as TeamRankRow[]);
  const tableLoading = needsFetch ? periodLoading : loading;
  const tableError = periodTeamsError;

  function handleSort(k: TeamSortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  const filtered = useMemo(() => {
    let rows = [...displayTeams];
    if (search.trim()) rows = rows.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
    rows.sort((a, b) => {
      const av = (a as any)[sortKey] ?? 0;
      const bv = (b as any)[sortKey] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return rows;
  }, [displayTeams, search, sortKey, sortDir]);

  function SortTh({ label, k, className = "", right = false }: { label: string; k: TeamSortKey; className?: string; right?: boolean }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => handleSort(k)}
        className={`px-3 py-3 text-xs font-bold uppercase tracking-wider text-zinc-400 cursor-pointer select-none hover:text-white transition-colors ${right ? "text-right" : "text-center"} ${className}`}
      >
        <div className={`flex items-center gap-1 ${right ? "justify-end" : "justify-center"}`}>
          <span>{label}</span>
          <ChevronsUpDown className={`w-3 h-3 shrink-0 ${active ? "text-teal-400" : "opacity-40"}`} />
        </div>
      </th>
    );
  }

  return (
    <div>
      {/* Sub-header */}
      <div className="mb-6">
        <h2 className="text-3xl font-black">
          Club <span className="text-green-400">Rankings</span>
        </h2>
        <p className="text-zinc-400 text-sm mt-1">Top clubs and teams in competitive Waryaa Gaming play</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clubs..."
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-teal-500 transition-colors"
        />
      </div>

      {/* Period tabs */}
      <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-6 gap-1">
        {periods.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all duration-200 ${
              period === p.id
                ? "bg-teal-400 text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Season selector — Seasonal tab */}
      {period === "seasonal" && (
        <div className="flex items-center gap-3 mb-6">
          <span className="text-sm font-bold text-zinc-400 flex items-center gap-1.5">
            <CalendarRange className="w-4 h-4" /> Season
          </span>
          {seasons.length === 0 ? (
            <span className="text-sm text-amber-400 font-semibold">No seasons created yet</span>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSeasonOpen(v => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-teal-500/50 bg-zinc-900 text-sm font-bold text-white hover:border-teal-400 transition-colors min-w-[160px]"
              >
                <span className="flex-1 text-left">{activeTeamSeason ? `${activeTeamSeason.name}${activeTeamSeason.isCurrent ? " (Current)" : ""}` : "Select season"}</span>
                <ChevronDown className="w-4 h-4 text-teal-400 shrink-0" />
              </button>
              {seasonOpen && (
                <div className="absolute top-full mt-1 left-0 z-50 min-w-[200px] rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
                  {seasons.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSelectedSeasonId(s.id); setSeasonOpen(false); }}
                      className={`w-full px-3 py-2 text-sm text-left flex items-center justify-between hover:bg-zinc-800 transition-colors ${activeTeamSeason?.id === s.id ? "text-teal-400 font-bold" : "text-zinc-200"}`}
                    >
                      <span>{s.name}</span>
                      {s.isCurrent && <span className="text-[10px] font-bold text-teal-400 bg-teal-400/10 px-1.5 py-0.5 rounded">Current</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Comparison view */}
      {period === "comparison" && <TeamComparison teams={teams} />}

      {/* Table */}
      {period !== "comparison" && (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-x-auto">
        <table className="w-full min-w-[780px]">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-zinc-400 w-14 cursor-pointer select-none" onClick={() => handleSort("rank")}>
                <div className="flex items-center justify-center gap-1">
                  <span>#</span>
                  <ChevronsUpDown className={`w-3 h-3 ${sortKey === "rank" ? "text-teal-400" : "opacity-40"}`} />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-400">
                <div className="flex items-center gap-1">
                  Club <ChevronsUpDown className="w-3 h-3 opacity-40" />
                </div>
              </th>
              <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-zinc-400">
                Rating <ChevronsUpDown className="inline w-3 h-3 opacity-40 ml-0.5" />
              </th>
              <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-zinc-400">
                <div className="flex flex-col items-center leading-tight">
                  <span>Market</span>
                  <span>Value</span>
                </div>
              </th>
              <SortTh label="Match" k="matchesPlayed" />
              <SortTh label="Win"   k="wins" />
              <SortTh label="Draw"  k="draws" />
              <SortTh label="Points" k="points" />
              <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-zinc-400">Recent Form</th>
            </tr>
          </thead>
          <tbody>
            {tableError ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-red-400">
                  <Shield className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-bold">Failed to load team rankings</p>
                  <p className="text-xs mt-1 text-zinc-500">
                    {tableError instanceof Error ? tableError.message : "Unknown error"}
                  </p>
                </td>
              </tr>
            ) : tableLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-zinc-800">
                    <td colSpan={9} className="px-4 py-4"><Skeleton className="h-5 w-full bg-zinc-800" /></td>
                  </tr>
                ))
              : filtered.length === 0
              ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-zinc-500">
                    <Shield className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="font-bold">No clubs found</p>
                  </td>
                </tr>
              )
              : filtered.map((t) => (
                  <tr key={t.teamId} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900/60 transition-colors">
                    {/* Rank */}
                    <td className="px-4 py-4 text-center">
                      {(() => {
                        const m = medalOf(t.rank);
                        return m
                          ? <span className={m.badge}>{t.rank}</span>
                          : <span className="text-sm font-black text-zinc-500">{t.rank}</span>;
                      })()}
                    </td>

                    {/* Club */}
                    <td className="px-4 py-4">
                      <Link href={`/teams/${t.teamId}`}>
                        <div className="flex items-center gap-3 cursor-pointer group/club">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {storageUrl(t.logoUrl)
                              ? <img src={storageUrl(t.logoUrl)} alt={t.name} className="w-full h-full object-cover" />
                              : <Shield className="w-5 h-5 text-zinc-500" />}
                          </div>
                          <span className={`font-bold text-sm group-hover/club:text-teal-400 transition-colors ${t.rank <= 3 ? (medalOf(t.rank)?.name ?? "") : ""}`}>
                            {t.name}{t.tag ? ` (${t.tag})` : ""}
                          </span>
                        </div>
                      </Link>
                    </td>

                    {/* Rating stars */}
                    <td className="px-3 py-4 text-center">
                      <TeamStars rating={(t as any).starRating ?? 0} />
                    </td>

                    {/* Market Value */}
                    <td className="px-3 py-4 text-center">
                      <span className="text-[10px] italic text-red-400 font-semibold">Coming Soon</span>
                    </td>

                    {/* Match */}
                    <td className="px-3 py-4 text-center text-sm font-bold text-zinc-200">{t.matchesPlayed}</td>

                    {/* Win */}
                    <td className="px-3 py-4 text-center text-sm font-bold text-green-400">{t.wins}</td>

                    {/* Draw */}
                    <td className="px-3 py-4 text-center text-sm font-bold text-zinc-400">{t.draws}</td>

                    {/* Points */}
                    <td className="px-3 py-4 text-center">
                      <span className="text-sm font-black text-white">{t.points.toFixed ? t.points.toFixed(2) : t.points}</span>
                    </td>

                    {/* Recent Form */}
                    <td className="px-3 py-4">
                      <div className="flex items-center justify-center gap-1">
                        {t.recentForm && t.recentForm.length > 0
                          ? t.recentForm.map((r, i) => <FormBadge key={i} result={r} />)
                          : <span className="text-zinc-600 text-xs">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function StarRating({ wins, max = 5 }: { wins: number; max?: number }) {
  const filled = Math.min(max, wins);
  return (
    <div className="flex items-center justify-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 transition-transform hover:scale-125 ${
            i < filled
              ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,.8)]"
              : "text-muted-foreground/25 fill-transparent"
          }`}
        />
      ))}
    </div>
  );
}
import { Skeleton } from "@/components/ui/skeleton";
import { getPlayerRankings, useGetTeamRankings } from "@workspace/api-client-react";

type Tab = "players" | "teams" | "ballondor" | "topscorer";
type Period = "all-time" | "monthly" | "weekly" | "seasonal";

export default function RankingsPage() {
  const [tab, setTab] = useState<Tab>("players");
  const [period, setPeriod] = useState<Period>("all-time");
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false);

  type SortKey = "rank" | "rating" | "marketValue" | "matchesPlayed" | "matchesWon" | "draws" | "points";
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Load seasons list for the dropdown
  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: ["seasons"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/seasons`, { credentials: "include" });
      return res.json();
    },
  });

  // Auto-select the current season when seasons load
  const currentSeason = seasons.find((s) => s.isCurrent) ?? seasons[0] ?? null;
  const activeSeason = selectedSeasonId != null
    ? seasons.find((s) => s.id === selectedSeasonId) ?? currentSeason
    : currentSeason;

  // Rankings fetch: all-time through generated hook; seasonal/weekly/monthly directly
  // so we can pass seasonId and handle errors without a black screen.
  const {
    data: playerRankings,
    isLoading: loadingPlayers,
    error: playerRankingsError,
  } = useQuery({
    queryKey: ["rankings", "players", period, activeSeason?.id],
    queryFn: async () => {
      if (period === "all-time") {
        return getPlayerRankings({ period: "all-time" });
      }
      const params = new URLSearchParams();
      if (period === "seasonal") {
        if (!activeSeason) return [];
        params.set("seasonId", String(activeSeason.id));
      } else if (period === "weekly" || period === "monthly") {
        params.set("period", period);
      }
      const qs = params.toString();
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/rankings/players${qs ? `?${qs}` : ""}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const err = await res.text().catch(() => "Rankings request failed");
        throw new Error(err);
      }
      return res.json();
    },
    enabled: period !== "seasonal" || !!activeSeason,
  });

  const { data: teamRankings, isLoading: loadingTeams } = useGetTeamRankings();

  const activePlayerData = Array.isArray(playerRankings) ? playerRankings : [];
  const activePlayerLoading = loadingPlayers;

  const sortedPlayers = useMemo(() => {
    if (!activePlayerData) return [];
    return [...activePlayerData].sort((a: any, b: any) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [activePlayerData, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortTh({ label, k, className = "" }: { label: string; k: SortKey; className?: string }) {
    const active = sortKey === k;
    return (
      <th
        className={`px-3 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
        onClick={() => handleSort(k)}
      >
        <div className="flex items-center justify-center gap-1">
          <span>{label}</span>
          <ChevronsUpDown className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "opacity-50"}`} />
        </div>
      </th>
    );
  }

  const tabs = [
    { id: "players" as Tab, label: "Top Players" },
    { id: "teams" as Tab, label: "Top Teams" },
    { id: "ballondor" as Tab, label: "Ballon d'Or" },
    { id: "topscorer" as Tab, label: "Top Scorer" },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="wg-hero px-6 py-9 mb-8">
          <span className="wg-eyebrow inline-flex items-center gap-2"><Trophy className="h-4 w-4" /> Champion Board</span>
          <h1 className="wg-hero-title text-4xl mt-4">Rankings</h1>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mt-3 max-w-xl">
            The official Waryaa pecking order — players, squads and legends ranked by form, points and glory.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Board · View</span>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`wg-chip transition-all duration-200 ${tab === t.id ? "wg-chip-solid" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Player Rankings */}
        {tab === "players" && (
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Period ·</span>
              {(["all-time", "seasonal", "monthly", "weekly"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`wg-chip transition-all duration-200 ${period === p ? "wg-chip-solid" : ""}`}
                >
                  {p === "all-time" ? "Overall" : p === "seasonal" ? "Seasonal" : p === "monthly" ? "Monthly" : "Weekly"}
                </button>
              ))}

              {/* Divider */}
              <span className="w-px h-4 bg-border mx-1" />

              {/* Comparison page link */}
              <Link href="/compare">
                <button className="wg-chip gap-1.5 border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all duration-200">
                  <ArrowUpDown className="w-3 h-3" />
                  Comparison
                </button>
              </Link>
            </div>

            {/* Season selector — only shown when Seasonal tab is active */}
            {period === "seasonal" && (
              <div className="flex items-center gap-3 mb-5">
                <span className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
                  <CalendarRange className="w-4 h-4" /> Season
                </span>
                {seasons.length === 0 ? (
                  <span className="text-sm text-amber-400 font-semibold">
                    No seasons created yet — ask an admin to create one.
                  </span>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => setSeasonDropdownOpen((v) => !v)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-card text-sm font-bold text-white hover:border-amber-400 transition-colors min-w-[160px]"
                    >
                      <span className="flex-1 text-left truncate">
                        {activeSeason ? `${activeSeason.name}${activeSeason.isCurrent ? " (Current)" : ""}` : "Select season"}
                      </span>
                      <ChevronDown className="w-4 h-4 text-amber-400 shrink-0" />
                    </button>
                    {seasonDropdownOpen && (
                      <div className="absolute top-full mt-1 left-0 z-50 min-w-[200px] rounded-lg border border-amber-700/40 bg-card shadow-xl backdrop-blur overflow-hidden">
                        {seasons.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => { setSelectedSeasonId(s.id); setSeasonDropdownOpen(false); }}
                            className={`w-full px-3 py-2 text-sm text-left flex items-center justify-between hover:bg-muted transition-colors ${activeSeason?.id === s.id ? "text-amber-400 font-bold" : "text-muted-foreground"}`}
                          >
                            <span>{s.name}</span>
                            {s.isCurrent && <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">Current</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl border border-border overflow-x-auto shadow-[0_10px_30px_-20px_rgba(251,146,60,0.35)]">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    {/* # */}
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground w-14 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("rank")}>
                      <div className="flex items-center justify-center gap-1">
                        <span>#</span>
                        <ChevronsUpDown className={`w-4 h-4 shrink-0 ${sortKey === "rank" ? "text-primary" : "opacity-50"}`} />
                      </div>
                    </th>
                    {/* Player */}
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <div className="flex items-center gap-1">Player <ChevronsUpDown className="w-4 h-4 opacity-50" /></div>
                    </th>
                    <SortTh label="Rating"       k="rating"        className="hidden md:table-cell" />
                    <SortTh label="Market Value" k="marketValue"   className="hidden lg:table-cell" />
                    {/* Club */}
                    <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground hidden md:table-cell">
                      <div className="flex items-center justify-center gap-1">Club <ChevronsUpDown className="w-4 h-4 opacity-50" /></div>
                    </th>
                    <SortTh label="Match" k="matchesPlayed" />
                    <SortTh label="Win"   k="matchesWon" />
                    <SortTh label="Draw"  k="draws" />
                    <SortTh label="Pts"   k="points" />
                  </tr>
                </thead>
                <tbody>
                  {playerRankingsError ? (
                    <tr className="border-b border-border last:border-0">
                      <td colSpan={9} className="px-4 py-8 text-center text-destructive">
                        <p className="font-bold">Failed to load rankings</p>
                        <p className="text-xs mt-1 text-muted-foreground">
                          {playerRankingsError instanceof Error ? playerRankingsError.message : "Unknown error"}
                        </p>
                      </td>
                    </tr>
                  ) : activePlayerLoading
                    ? Array.from({ length: 10 }).map((_, i) => (
                        <tr key={i} className="border-b border-border">
                          <td colSpan={9} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                        </tr>
                      ))
                    : sortedPlayers.length === 0 ? (
                        <tr className="border-b border-border last:border-0">
                          <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                            {period === "seasonal"
                              ? activeSeason
                                ? `No completed matches found for ${activeSeason.name}.`
                                : "Select a season to view seasonal rankings."
                              : period === "weekly"
                              ? "No completed matches this week."
                              : period === "monthly"
                              ? "No completed matches this month."
                              : "No players ranked yet."}
                          </td>
                        </tr>
                      )
                    : sortedPlayers.map((p, i) => {
                        const pp = p as any;
                        const displayRank = p.rank;
                        const isTop3 = displayRank <= 3;
                        return (
                          <tr key={p.playerId} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                            {/* # with change indicator */}
                            <td className="px-4 py-3 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                {(() => {
                                  const m = medalOf(displayRank);
                                  return m
                                    ? <span className={m.badge}>{displayRank}</span>
                                    : <span className="text-sm font-black text-muted-foreground">{displayRank}</span>;
                                })()}
                                {p.change == null || p.change === 0 ? (
                                  <span className="text-muted-foreground/30 text-[9px]">—</span>
                                ) : (p.change as number) > 0 ? (
                                  <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-400">
                                    <TrendingUp className="w-2 h-2" />+{p.change}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-0.5 text-[9px] font-bold text-destructive">
                                    <TrendingDown className="w-2 h-2" />{p.change}
                                  </span>
                                )}
                              </div>
                            </td>
                            {/* Player */}
                            <td className="px-4 py-3">
                              <Link href={`/players/${p.playerId}`}>
                                <div className="flex items-center gap-2.5">
                                  {p.avatarUrl ? (
                                    <img src={p.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-border" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-black text-primary shrink-0">
                                      {(p.displayName ?? p.username).charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className={`font-black text-sm hover:text-primary transition-colors cursor-pointer ${isTop3 ? (medalOf(displayRank)?.name ?? "") : ""}`}>{p.displayName ?? p.username}</span>
                                      {(p as any).verified && (
                                        <img src={`${import.meta.env.BASE_URL}verified.png`} alt="" className="h-3.5 w-3.5 object-contain" draggable={false} />
                                      )}
                                      {isTop3 && <Star className={`w-3.5 h-3.5 ${medalOf(displayRank)?.star ?? "text-primary fill-primary"}`} />}
                                    </div>
                                    {p.teamName && (
                                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        {p.teamLogoUrl
                                          ? <img src={p.teamLogoUrl} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                                          : <Shield className="h-3 w-3" />}
                                        {p.teamName}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </Link>
                            </td>
                            {/* Rating — stars based on wins */}
                            <td className="px-3 py-3 text-center hidden md:table-cell">
                              <StarRating wins={p.matchesWon ?? 0} />
                            </td>
                            {/* Market Value */}
                            <td className="px-3 py-3 text-center hidden lg:table-cell">
                              <span className="text-xs font-black text-emerald-400">
                                {marketValueLabel((p as any).marketValue ?? 0)}
                              </span>
                            </td>
                            {/* Club */}
                            <td className="px-3 py-3 text-center text-sm text-muted-foreground hidden md:table-cell">
                              {p.teamName ? (
                                <span className="inline-flex items-center gap-1.5">
                                  {p.teamLogoUrl
                                    ? <img src={p.teamLogoUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                                    : <Shield className="h-4 w-4" />}
                                  {p.teamName}
                                </span>
                              ) : "—"}
                            </td>
                            {/* Match */}
                            <td className="px-3 py-3 text-center text-sm font-bold">{p.matchesPlayed}</td>
                            {/* Win */}
                            <td className="px-3 py-3 text-center text-sm font-bold text-primary">{p.matchesWon}</td>
                            {/* Draw */}
                            <td className="px-3 py-3 text-center text-sm font-bold text-muted-foreground">{pp.draws ?? 0}</td>
                            {/* Points */}
                            <td className="px-3 py-3 text-center">
                              <span className="text-sm font-black text-primary">{Math.round(p.points)}</span>
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Season Awards — Ballon d'Or & Top Scorer */}
        {(tab === "ballondor" || tab === "topscorer") && (
          <div>
            {/* Season selector */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
                <CalendarRange className="w-4 h-4 text-amber-400" /> Season
              </span>
              <div className="relative">
                <button
                  onClick={() => setSeasonDropdownOpen((v) => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-card text-sm font-bold text-white hover:border-amber-400 transition-colors min-w-[160px]"
                >
                  <span className="flex-1 text-left truncate">
                    {activeSeason ? `${activeSeason.name}${activeSeason.isCurrent ? " (Current)" : ""}` : "Select season"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-amber-400 shrink-0" />
                </button>
                {seasonDropdownOpen && (
                  <div className="absolute top-full mt-1 left-0 z-50 min-w-[200px] rounded-lg border border-amber-700/40 bg-card shadow-xl backdrop-blur overflow-hidden">
                    {seasons.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setSelectedSeasonId(s.id); setSeasonDropdownOpen(false); }}
                        className={`w-full px-3 py-2 text-sm text-left flex items-center justify-between hover:bg-muted transition-colors ${activeSeason?.id === s.id ? "text-amber-400 font-bold" : "text-muted-foreground"}`}
                      >
                        <span>{s.name}</span>
                        {s.isCurrent && <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">Current</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {tab === "ballondor" && (
              <SeasonAwardCard
                title="Ballon d'Or"
                subtitle="Player of the Season"
                seasonName={activeSeason?.name ?? ""}
                winner={activeSeason?.ballonDorPlayer ?? null}
                icon={<Trophy className="w-12 h-12 text-amber-400 fill-amber-400/40" />}
              />
            )}
            {tab === "topscorer" && (
              <SeasonAwardCard
                title="Top Scorer"
                subtitle="Golden Boot"
                seasonName={activeSeason?.name ?? ""}
                winner={activeSeason?.topScorerPlayer ?? null}
                icon={<span className="text-5xl drop-shadow-[0_0_18px_rgba(251,191,36,0.8)]">⚽</span>}
              />
            )}
          </div>
        )}

        {/* Team Rankings */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {tab === "teams" && <TeamRankingsPanel teams={(teamRankings ?? []) as any} loading={loadingTeams} seasons={seasons} />}
      </motion.div>
    </div>
  );
}
