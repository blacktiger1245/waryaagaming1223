import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Users, Search, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useListPlayers, useGetPlayer } from "@workspace/api-client-react";

type PlayerSummary = { id: number; username: string; displayName: string | null; avatarUrl: string | null };

function PlayerSelector({
  selected,
  onSelect,
  onClear,
  players,
  search,
  onSearch,
}: {
  selected: PlayerSummary | null;
  onSelect: (p: PlayerSummary) => void;
  onClear: () => void;
  players: PlayerSummary[];
  search: string;
  onSearch: (v: string) => void;
}) {
  const filtered = useMemo(
    () =>
      players.filter((p) =>
        (p.displayName ?? p.username).toLowerCase().includes(search.toLowerCase())
      ),
    [players, search]
  );

  return (
    <div className="flex-1 rounded-xl border border-border bg-card p-6 flex flex-col gap-4 min-h-[220px]">
      {selected ? (
        <div className="flex flex-col items-center gap-3 flex-1 justify-center">
          {selected.avatarUrl ? (
            <img src={selected.avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover ring-2 ring-primary/40" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-black text-primary">
              {(selected.displayName ?? selected.username).charAt(0).toUpperCase()}
            </div>
          )}
          <p className="font-black text-lg">{selected.displayName ?? selected.username}</p>
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-3 h-3" /> Change player
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 flex-1 justify-center">
          <Users className="w-12 h-12 text-muted-foreground/30" strokeWidth={1.5} />
          <p className="text-sm font-bold text-muted-foreground">Select a player</p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search players..."
          className="w-full pl-8 pr-3 py-2 text-sm rounded-md bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
        />
      </div>

      {search && (
        <div className="rounded-md border border-border overflow-hidden max-h-40 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No players found</p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p); onSearch(""); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/40 transition-colors text-left"
              >
                {p.avatarUrl ? (
                  <img src={p.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary shrink-0">
                    {(p.displayName ?? p.username).charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="font-medium">{p.displayName ?? p.username}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type StatRow = { label: string; a: number; b: number; higherIsBetter?: boolean; format?: (v: number) => string };

function StatBar({ label, a, b, higherIsBetter = true, format = (v) => String(v) }: StatRow) {
  const max = Math.max(a, b, 1);
  const aWins = higherIsBetter ? a > b : a < b;
  const bWins = higherIsBetter ? b > a : b < a;
  const tied = a === b;

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      {/* Left value */}
      <div className="flex items-center justify-end gap-2">
        <span className={`text-sm font-black ${aWins ? "text-primary" : "text-foreground"}`}>{format(a)}</span>
        {!tied && aWins && <TrendingUp className="w-3 h-3 text-primary shrink-0" />}
        {!tied && !aWins && <TrendingDown className="w-3 h-3 text-destructive shrink-0" />}
        {tied && <Minus className="w-3 h-3 text-muted-foreground shrink-0" />}
      </div>

      {/* Label + bar */}
      <div className="flex flex-col items-center gap-1 min-w-[120px]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className="relative w-full h-1.5 rounded-full bg-muted overflow-hidden flex">
          {/* A bar (left side) */}
          <div
            className={`h-full rounded-full transition-all duration-500 ${aWins ? "bg-primary" : tied ? "bg-muted-foreground/40" : "bg-muted-foreground/30"}`}
            style={{ width: `${(a / max) * 50}%`, marginLeft: `${50 - (a / max) * 50}%` }}
          />
          {/* B bar (right side) */}
          <div
            className={`h-full rounded-full transition-all duration-500 ${bWins ? "bg-primary" : tied ? "bg-muted-foreground/40" : "bg-muted-foreground/30"}`}
            style={{ width: `${(b / max) * 50}%` }}
          />
        </div>
      </div>

      {/* Right value */}
      <div className="flex items-center gap-2">
        {!tied && bWins && <TrendingUp className="w-3 h-3 text-primary shrink-0" />}
        {!tied && !bWins && <TrendingDown className="w-3 h-3 text-destructive shrink-0" />}
        {tied && <Minus className="w-3 h-3 text-muted-foreground shrink-0" />}
        <span className={`text-sm font-black ${bWins ? "text-primary" : "text-foreground"}`}>{format(b)}</span>
      </div>
    </div>
  );
}

export default function ComparePage() {
  const [playerA, setPlayerA] = useState<PlayerSummary | null>(null);
  const [playerB, setPlayerB] = useState<PlayerSummary | null>(null);
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");

  const { data: allPlayers = [] } = useListPlayers();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: detailA } = useGetPlayer(playerA?.id ?? 0, { query: { enabled: !!playerA } } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: detailB } = useGetPlayer(playerB?.id ?? 0, { query: { enabled: !!playerB } } as any);

  const players: PlayerSummary[] = allPlayers.map((p) => ({
    id: p.id,
    username: p.username,
    displayName: p.displayName ?? null,
    avatarUrl: p.avatarUrl ?? null,
  }));

  const da = detailA as any;
  const db2 = detailB as any;

  const stats: StatRow[] = detailA && detailB
    ? [
        { label: "Points",           a: detailA.points ?? 0,       b: detailB.points ?? 0 },
        { label: "Matches Won",      a: detailA.matchesWon ?? 0,   b: detailB.matchesWon ?? 0 },
        { label: "Matches Played",   a: detailA.matchesPlayed ?? 0,b: detailB.matchesPlayed ?? 0 },
        { label: "Matches Lost",     a: (detailA as any).matchesLost ?? 0,  b: (detailB as any).matchesLost ?? 0,  higherIsBetter: false },
        { label: "Draws",            a: da.draws ?? 0,             b: db2.draws ?? 0,            higherIsBetter: false },
        { label: "Goals Scored",     a: da.goalsScored ?? 0,       b: db2.goalsScored ?? 0 },
        { label: "Goals Conceded",   a: da.goalsConceded ?? 0,     b: db2.goalsConceded ?? 0,    higherIsBetter: false },
        { label: "Clean Sheets",     a: da.cleanSheets ?? 0,       b: db2.cleanSheets ?? 0 },
        { label: "Win Rate",         a: detailA.winRate ?? 0,      b: detailB.winRate ?? 0,      format: (v) => `${(v * 100).toFixed(0)}%` },
        { label: "Man of the Match", a: da.manOfTheMatch ?? 0,     b: db2.manOfTheMatch ?? 0 },
        { label: "Yellow Cards",     a: da.yellowCards ?? 0,       b: db2.yellowCards ?? 0,      higherIsBetter: false },
        { label: "Red Cards",        a: da.redCards ?? 0,          b: db2.redCards ?? 0,         higherIsBetter: false },
        { label: "Total Cards",      a: (da.yellowCards ?? 0) + (da.redCards ?? 0), b: (db2.yellowCards ?? 0) + (db2.redCards ?? 0), higherIsBetter: false },
        { label: "Tournament Wins",  a: detailA.tournamentWins ?? 0, b: detailB.tournamentWins ?? 0 },
        { label: "Rank",             a: detailA.rank ?? 9999,      b: detailB.rank ?? 9999,      higherIsBetter: false, format: (v) => v >= 9999 ? "—" : `#${v}` },
      ]
    : [];

  const bothSelected = !!playerA && !!playerB;

  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-10">
          <p className="text-primary text-xs font-bold uppercase tracking-widest mb-2">Head to Head</p>
          <h1 className="text-5xl font-black uppercase tracking-tight">Compare Players</h1>
        </div>

        {/* Selectors */}
        <div className="flex gap-4 mb-4">
          <PlayerSelector
            selected={playerA}
            onSelect={setPlayerA}
            onClear={() => setPlayerA(null)}
            players={players.filter((p) => p.id !== playerB?.id)}
            search={searchA}
            onSearch={setSearchA}
          />

          <div className="flex items-center justify-center w-8 shrink-0">
            <span className="text-xl font-black text-muted-foreground/30">VS</span>
          </div>

          <PlayerSelector
            selected={playerB}
            onSelect={setPlayerB}
            onClear={() => setPlayerB(null)}
            players={players.filter((p) => p.id !== playerA?.id)}
            search={searchB}
            onSearch={setSearchB}
          />
        </div>

        {/* Comparison panel */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {!bothSelected ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Users className="w-12 h-12 text-muted-foreground/20" strokeWidth={1.5} />
              <p className="font-black text-lg">Start Comparing Players</p>
              <p className="text-sm text-muted-foreground">Select 2 players to see their stats comparison</p>
            </div>
          ) : (
            <div className="p-6">
              {/* Header names */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-8">
                <p className="text-right font-black text-lg text-primary">{playerA?.displayName ?? playerA?.username}</p>
                <span className="text-xs font-black text-muted-foreground/40 min-w-[120px] text-center">STATS</span>
                <p className="text-left font-black text-lg text-primary">{playerB?.displayName ?? playerB?.username}</p>
              </div>

              {/* Stat rows */}
              <div className="flex flex-col gap-5">
                {detailA && detailB
                  ? stats.map((s) => <StatBar key={s.label} {...s} />)
                  : Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-8 rounded-md bg-muted/30 animate-pulse" />
                    ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
