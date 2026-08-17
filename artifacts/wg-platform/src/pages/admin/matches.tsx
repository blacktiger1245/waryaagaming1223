import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, ArrowLeft, Plus, Pencil, Trash2, Loader2, Swords, Sparkles, Users, RefreshCw, CheckSquare, Square, X, Star, AlertTriangle, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiUrl, storageUrl } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Tournament {
  id: number;
  name: string;
  status: string;
  logoUrl?: string | null;
  currentParticipants: number;
  maxParticipants: number;
  prizePool: string;
  hostedBy?: string | null;
  tournamentType?: string | null;
  format?: string | null;
}

interface Match {
  id: number;
  tournamentId: number;
  round: number;
  roundName?: string | null;
  status: "scheduled" | "live" | "completed" | "cancelled";
  participant1Id?: number | null;
  participant1Name?: string | null;
  participant1Score?: number | null;
  participant2Id?: number | null;
  participant2Name?: string | null;
  participant2Score?: number | null;
  winnerId?: number | null;
  winnerName?: string | null;
  scheduledAt?: string | null;
  streamUrl?: string | null;
  manOfTheMatchId?: number | null;
  manOfTheMatchName?: string | null;
  participant1YellowCards?: number | null;
  participant1RedCards?: number | null;
  participant2YellowCards?: number | null;
  participant2RedCards?: number | null;
}

// ── API helpers ────────────────────────────────────────────────────────────────
async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(url), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(d?.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

interface MatchPlayerGame {
  id: number;
  matchId: number;
  homePlayerId?: number | null;
  homePlayerName?: string | null;
  awayPlayerId?: number | null;
  awayPlayerName?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  status: string;
}

// ── Status helpers ─────────────────────────────────────────────────────────────
const statusColors: Record<string, string> = {
  upcoming: "bg-primary/10 text-primary border-primary/30",
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

const matchStatusColors: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground border-border",
  live: "bg-red-500/10 text-red-400 border-red-500/30",
  completed: "bg-primary/10 text-primary border-primary/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

// ── Match Form Dialog ──────────────────────────────────────────────────────────
function MatchFormDialog({
  open,
  onClose,
  tournamentId,
  tournamentType,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  tournamentId: number;
  tournamentType?: string | null;
  existing?: Match;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!existing;
  const isTeam = tournamentType === "team";

  const [form, setForm] = useState<Partial<Match>>(
    existing ?? { tournamentId, round: 1, status: "scheduled" }
  );

  function set(k: keyof Match, v: unknown) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      isEdit
        ? apiFetch(`/api/admin/matches/${existing!.id}`, { method: "PATCH", body: JSON.stringify(form) })
        : apiFetch(`/api/admin/matches`, { method: "POST", body: JSON.stringify({ ...form, tournamentId }) }),
    onSuccess: () => {
      toast({ title: isEdit ? "Match updated" : "Match created" });
      qc.invalidateQueries({ queryKey: ["admin-tournament-matches", tournamentId] });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  // For team matches fetch the player pairings so we can offer individual players as MOTM
  const { data: playerGames = [] } = useQuery<MatchPlayerGame[]>({
    queryKey: ["admin-player-games", existing?.id],
    queryFn: () => apiFetch(`/api/admin/matches/${existing!.id}/player-games`),
    enabled: isTeam && isEdit && form.status === "completed",
  });

  // Build a deduplicated list of players from both sides
  const teamPlayers = useMemo(() => {
    const seen = new Set<number>();
    const list: { id: number; name: string; side: "home" | "away" }[] = [];
    for (const g of playerGames) {
      if (g.homePlayerId != null && !seen.has(g.homePlayerId)) {
        seen.add(g.homePlayerId);
        list.push({ id: g.homePlayerId, name: g.homePlayerName ?? `Player ${g.homePlayerId}`, side: "home" });
      }
      if (g.awayPlayerId != null && !seen.has(g.awayPlayerId)) {
        seen.add(g.awayPlayerId);
        list.push({ id: g.awayPlayerId, name: g.awayPlayerName ?? `Player ${g.awayPlayerId}`, side: "away" });
      }
    }
    return list;
  }, [playerGames]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary" />
            {isEdit ? "Edit Match" : "New Match"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Round */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Round #</label>
              <Input type="number" value={form.round ?? 1} min={1} onChange={(e) => set("round", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Round Name</label>
              <Input value={form.roundName ?? ""} placeholder="e.g. Quarter Final" onChange={(e) => set("roundName", e.target.value)} />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(["scheduled", "live", "completed", "cancelled"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("status", s)}
                  className={`py-2 rounded-lg text-xs font-bold capitalize transition-all border ${
                    form.status === s
                      ? matchStatusColors[s]
                      : "border-border text-muted-foreground hover:border-border/80"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Participants */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Participant 1</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Name</label>
                <Input value={form.participant1Name ?? ""} placeholder="Player / Team" onChange={(e) => set("participant1Name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Score</label>
                <Input type="number" value={form.participant1Score ?? ""} onChange={(e) => set("participant1Score", e.target.value === "" ? null : Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Participant 2</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Name</label>
                <Input value={form.participant2Name ?? ""} placeholder="Player / Team" onChange={(e) => set("participant2Name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Score</label>
                <Input type="number" value={form.participant2Score ?? ""} onChange={(e) => set("participant2Score", e.target.value === "" ? null : Number(e.target.value))} />
              </div>
            </div>
          </div>

          {/* Winner */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Winner Name</label>
            <Input value={form.winnerName ?? ""} placeholder="Leave blank if not decided" onChange={(e) => set("winnerName", e.target.value || null)} />
          </div>

          {/* MOTM + Cards — only when completed */}
          {form.status === "completed" && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
              <p className="text-xs font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5" /> Match Awards
              </p>

              {/* Man of the Match */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Man of the Match</label>

                {/* Team tournament: pick from individual players */}
                {isTeam ? (
                  <div className="space-y-2">
                    {/* None button */}
                    <button
                      type="button"
                      onClick={() => { set("manOfTheMatchId", null); set("manOfTheMatchName", null); }}
                      className={`w-full py-2 rounded-lg text-xs font-bold transition-all border ${
                        form.manOfTheMatchId == null
                          ? "bg-muted border-border text-foreground"
                          : "border-border text-muted-foreground hover:border-border/80"
                      }`}
                    >
                      None
                    </button>
                    {teamPlayers.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        Open "Player Games" first to generate pairings, then come back here.
                      </p>
                    )}
                    {teamPlayers.length > 0 && (
                      <>
                        {/* Home team players */}
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {form.participant1Name ?? "Home Team"}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {teamPlayers.filter((p) => p.side === "home").map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { set("manOfTheMatchId", p.id); set("manOfTheMatchName", p.name); }}
                              className={`py-2 rounded-lg text-xs font-bold transition-all border truncate px-2 ${
                                form.manOfTheMatchId === p.id
                                  ? "bg-primary/20 border-primary text-primary"
                                  : "border-border text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                        {/* Away team players */}
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {form.participant2Name ?? "Away Team"}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {teamPlayers.filter((p) => p.side === "away").map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { set("manOfTheMatchId", p.id); set("manOfTheMatchName", p.name); }}
                              className={`py-2 rounded-lg text-xs font-bold transition-all border truncate px-2 ${
                                form.manOfTheMatchId === p.id
                                  ? "bg-primary/20 border-primary text-primary"
                                  : "border-border text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  /* Solo tournament: pick between the two participants */
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => { set("manOfTheMatchId", null); set("manOfTheMatchName", null); }}
                      className={`py-2 rounded-lg text-xs font-bold transition-all border ${
                        form.manOfTheMatchId == null
                          ? "bg-muted border-border text-foreground"
                          : "border-border text-muted-foreground hover:border-border/80"
                      }`}
                    >
                      None
                    </button>
                    {form.participant1Name && (
                      <button
                        type="button"
                        onClick={() => { set("manOfTheMatchId", form.participant1Id ?? null); set("manOfTheMatchName", form.participant1Name ?? null); }}
                        className={`py-2 rounded-lg text-xs font-bold transition-all border truncate px-2 ${
                          form.manOfTheMatchId === form.participant1Id && form.participant1Id != null
                            ? "bg-primary/20 border-primary text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {form.participant1Name}
                      </button>
                    )}
                    {form.participant2Name && (
                      <button
                        type="button"
                        onClick={() => { set("manOfTheMatchId", form.participant2Id ?? null); set("manOfTheMatchName", form.participant2Name ?? null); }}
                        className={`py-2 rounded-lg text-xs font-bold transition-all border truncate px-2 ${
                          form.manOfTheMatchId === form.participant2Id && form.participant2Id != null
                            ? "bg-primary/20 border-primary text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {form.participant2Name}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Cards */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Cards
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Participant 1 cards */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                      {form.participant1Name ?? "Participant 1"}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="space-y-1">
                        <label className="text-[10px] text-yellow-500 font-bold uppercase tracking-wider">🟨 Yellow</label>
                        <Input
                          type="number"
                          min={0}
                          value={form.participant1YellowCards ?? 0}
                          onChange={(e) => set("participant1YellowCards", Math.max(0, Number(e.target.value)))}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-red-500 font-bold uppercase tracking-wider">🟥 Red</label>
                        <Input
                          type="number"
                          min={0}
                          value={form.participant1RedCards ?? 0}
                          onChange={(e) => set("participant1RedCards", Math.max(0, Number(e.target.value)))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Participant 2 cards */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                      {form.participant2Name ?? "Participant 2"}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="space-y-1">
                        <label className="text-[10px] text-yellow-500 font-bold uppercase tracking-wider">🟨 Yellow</label>
                        <Input
                          type="number"
                          min={0}
                          value={form.participant2YellowCards ?? 0}
                          onChange={(e) => set("participant2YellowCards", Math.max(0, Number(e.target.value)))}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-red-500 font-bold uppercase tracking-wider">🟥 Red</label>
                        <Input
                          type="number"
                          min={0}
                          value={form.participant2RedCards ?? 0}
                          onChange={(e) => set("participant2RedCards", Math.max(0, Number(e.target.value)))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stream URL + Scheduled At — hidden when completed */}
          {form.status !== "completed" && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stream URL</label>
                <Input value={form.streamUrl ?? ""} placeholder="https://…" onChange={(e) => set("streamUrl", e.target.value || null)} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Scheduled At</label>
                <Input type="datetime-local" value={form.scheduledAt?.slice(0, 16) ?? ""} onChange={(e) => set("scheduledAt", e.target.value || null)} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={() => mutate()} disabled={isPending} className="gap-2 min-w-[100px]">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
            {isEdit ? "Save" : "Create Match"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Generate Dialog (Group Stage only) ────────────────────────────────────────
interface Participant {
  id: number;
  playerId: number | null;
  teamId?: number | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  teamName?: string | null;
  teamLogoUrl?: string | null;
}

const GROUP_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function buildGroups(participants: Participant[], groupCount: number): Participant[][] {
  const groups: Participant[][] = Array.from({ length: groupCount }, () => []);
  participants.forEach((p, i) => groups[i % groupCount].push(p));
  return groups;
}

// ── Player Games Dialog ────────────────────────────────────────────────────────
function PlayerGamesDialog({
  open,
  onClose,
  match,
  teamLogoMap,
}: {
  open: boolean;
  onClose: () => void;
  match: Match;
  teamLogoMap: Record<string, string | null>;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [localScores, setLocalScores] = useState<Record<number, { home: string; away: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [addRow, setAddRow] = useState(false);
  const [newHome, setNewHome] = useState("");
  const [newAway, setNewAway] = useState("");

  const { data: rawGames, isLoading } = useQuery<MatchPlayerGame[]>({
    queryKey: ["admin-player-games", match.id],
    queryFn: () => apiFetch(`/api/admin/matches/${match.id}/player-games`),
    enabled: open,
  });
  // Stable reference — prevents the sync effect from looping on every render
  const games = useMemo(() => rawGames ?? [], [rawGames]);

  // ── Mutations — declared before effects that reference them ───────────────────
  const { mutate: generatePairings, isPending: generating } = useMutation({
    mutationFn: () => apiFetch(`/api/admin/matches/${match.id}/player-games/generate`, { method: "POST" }),
    onSuccess: () => {
      setLocalScores({});
      qc.invalidateQueries({ queryKey: ["admin-player-games", match.id] });
      qc.invalidateQueries({ queryKey: ["admin-tournament-matches", match.tournamentId] });
      toast({ title: "Pairings generated from team rosters" });
    },
    onError: (err: Error) => toast({ title: "Failed to generate", description: err.message, variant: "destructive" }),
  });

  // Sync server scores into local state (only rows not already being edited)
  useEffect(() => {
    if (games.length === 0) return;
    setLocalScores((prev) => {
      const next = { ...prev };
      let changed = false;
      games.forEach((g) => {
        if (!(g.id in next)) {
          next[g.id] = {
            home: g.homeScore != null ? String(g.homeScore) : "",
            away: g.awayScore != null ? String(g.awayScore) : "",
          };
          changed = true;
        }
      });
      return changed ? next : prev; // return same ref if nothing changed → no re-render
    });
  }, [games]);

  useEffect(() => {
    if (!open) { setLocalScores({}); setAddRow(false); setNewHome(""); setNewAway(""); }
  }, [open]);

  // Auto-generate pairings from rosters when dialog opens and none exist yet
  const autoGeneratedRef = useRef(false);
  useEffect(() => {
    if (!open) { autoGeneratedRef.current = false; return; }
    if (!isLoading && games.length === 0 && !autoGeneratedRef.current) {
      autoGeneratedRef.current = true;
      generatePairings();
    }
  // generatePairings is stable (React Query wraps mutate in useCallback internally)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading, games.length]);

  async function saveScore(gameId: number) {
    const local = localScores[gameId];
    if (!local) return;
    setSavingId(gameId);
    try {
      await apiFetch(`/api/admin/player-games/${gameId}`, {
        method: "PATCH",
        body: JSON.stringify({
          homeScore: local.home === "" ? null : Number(local.home),
          awayScore: local.away === "" ? null : Number(local.away),
        }),
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-player-games", match.id] }),
        qc.invalidateQueries({ queryKey: ["admin-tournament-matches", match.tournamentId] }),
      ]);
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }

  const { mutate: deleteGame } = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/player-games/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      setLocalScores((prev) => { const n = { ...prev }; delete n[id]; return n; });
      qc.invalidateQueries({ queryKey: ["admin-player-games", match.id] });
      qc.invalidateQueries({ queryKey: ["admin-tournament-matches", match.tournamentId] });
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const { mutate: addPairing, isPending: addPending } = useMutation({
    mutationFn: () => apiFetch(`/api/admin/matches/${match.id}/player-games`, {
      method: "POST",
      body: JSON.stringify({ homePlayerName: newHome.trim(), awayPlayerName: newAway.trim() }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-player-games", match.id] });
      setAddRow(false); setNewHome(""); setNewAway("");
      toast({ title: "Pairing added" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const logo1 = teamLogoMap[match.participant1Name ?? ""];
  const logo2 = teamLogoMap[match.participant2Name ?? ""];

  // Aggregate from local scores (for live feedback)
  const homeWins = games.filter((g) => {
    const local = localScores[g.id];
    const h = local?.home !== "" ? Number(local?.home ?? g.homeScore) : null;
    const a = local?.away !== "" ? Number(local?.away ?? g.awayScore) : null;
    return h != null && a != null && h > a;
  }).length;
  const awayWins = games.filter((g) => {
    const local = localScores[g.id];
    const h = local?.home !== "" ? Number(local?.home ?? g.homeScore) : null;
    const a = local?.away !== "" ? Number(local?.away ?? g.awayScore) : null;
    return h != null && a != null && a > h;
  }).length;
  const gamesWithResults = games.filter((g) => g.homeScore != null && g.awayScore != null).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Match header */}
        <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-4">
            {/* Home team */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {logo1 ? (
                <img src={logo1} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-border shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-muted border border-border shrink-0 flex items-center justify-center text-sm font-black">
                  {(match.participant1Name ?? "?").charAt(0)}
                </div>
              )}
              <span className="font-black text-base truncate">{match.participant1Name ?? "Team 1"}</span>
            </div>
            {/* Score */}
            <div className="text-center shrink-0 min-w-[80px]">
              <div className="text-3xl font-black tabular-nums">
                {gamesWithResults > 0 ? `${homeWins} – ${awayWins}` : "vs"}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                {gamesWithResults}/{games.length} played
              </div>
            </div>
            {/* Away team */}
            <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
              <span className="font-black text-base truncate text-right">{match.participant2Name ?? "Team 2"}</span>
              {logo2 ? (
                <img src={logo2} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-border shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-muted border border-border shrink-0 flex items-center justify-center text-sm font-black">
                  {(match.participant2Name ?? "?").charAt(0)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0 bg-muted/20">
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <ClipboardList className="w-3.5 h-3.5" /> Player Matchups
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs font-bold h-8"
              onClick={() => generatePairings()} disabled={generating}>
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Generate from Rosters
            </Button>
            <Button size="sm" className="gap-1.5 text-xs font-bold h-8" onClick={() => setAddRow(true)}>
              <Plus className="w-3 h-3" /> Add Pairing
            </Button>
          </div>
        </div>

        {/* Player games list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
            </div>
          ) : games.length === 0 && !addRow ? (
            <div className="text-center py-14 text-muted-foreground">
              <Swords className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="font-bold">No pairings yet</p>
              <p className="text-sm mt-1">Generate from rosters or add pairings manually.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Column headers */}
              {games.length > 0 && (
                <div className="grid grid-cols-[1fr_72px_16px_72px_1fr_28px] items-center gap-2 px-2 pb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right">{match.participant1Name}</span>
                  <span />
                  <span />
                  <span />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{match.participant2Name}</span>
                  <span />
                </div>
              )}

              {games.map((game, idx) => {
                const local = localScores[game.id] ?? { home: "", away: "" };
                const saving = savingId === game.id;
                const h = local.home !== "" ? Number(local.home) : null;
                const a = local.away !== "" ? Number(local.away) : null;
                const homeWin = h != null && a != null && h > a;
                const awayWin = h != null && a != null && a > h;
                return (
                  <motion.div
                    key={game.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className="grid grid-cols-[1fr_72px_16px_72px_1fr_28px] items-center gap-2 px-2 py-2 rounded-xl hover:bg-muted/10 transition-colors"
                  >
                    <div className="text-right">
                      <span className={`text-sm font-bold truncate block ${homeWin ? "text-emerald-400" : ""}`}>
                        {game.homePlayerName || "—"}
                      </span>
                    </div>
                    <Input
                      type="number" min={0}
                      value={local.home}
                      onChange={(e) => setLocalScores((p) => ({ ...p, [game.id]: { ...p[game.id] ?? { away: "" }, home: e.target.value } }))}
                      onBlur={() => saveScore(game.id)}
                      className={`text-center font-black text-base h-9 tabular-nums px-1 ${homeWin ? "border-emerald-500" : ""} ${saving ? "opacity-50" : ""}`}
                      placeholder="–"
                    />
                    <span className="text-muted-foreground font-bold text-center text-sm">–</span>
                    <Input
                      type="number" min={0}
                      value={local.away}
                      onChange={(e) => setLocalScores((p) => ({ ...p, [game.id]: { ...p[game.id] ?? { home: "" }, away: e.target.value } }))}
                      onBlur={() => saveScore(game.id)}
                      className={`text-center font-black text-base h-9 tabular-nums px-1 ${awayWin ? "border-emerald-500" : ""} ${saving ? "opacity-50" : ""}`}
                      placeholder="–"
                    />
                    <div>
                      <span className={`text-sm font-bold truncate block ${awayWin ? "text-emerald-400" : ""}`}>
                        {game.awayPlayerName || "—"}
                      </span>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => { if (confirm("Remove this pairing?")) deleteGame(game.id); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </motion.div>
                );
              })}

              {/* Add pairing inline row */}
              {addRow && (
                <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 px-2 py-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 mt-2">
                  <Input autoFocus placeholder={`${match.participant1Name ?? "Home"} player`}
                    value={newHome} onChange={(e) => setNewHome(e.target.value)} className="h-9 text-sm" />
                  <span className="text-muted-foreground font-bold px-1">vs</span>
                  <Input placeholder={`${match.participant2Name ?? "Away"} player`}
                    value={newAway} onChange={(e) => setNewAway(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && newHome.trim() && newAway.trim() && addPairing()}
                    className="h-9 text-sm" />
                  <div className="flex gap-1">
                    <Button size="icon" className="h-9 w-9"
                      onClick={() => addPairing()} disabled={!newHome.trim() || !newAway.trim() || addPending}>
                      {addPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9"
                      onClick={() => { setAddRow(false); setNewHome(""); setNewAway(""); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border shrink-0 flex items-center justify-between bg-muted/10">
          <span className="text-xs text-muted-foreground">
            {games.length === 0
              ? "No pairings"
              : gamesWithResults === games.length && games.length > 0
              ? homeWins > awayWins
                ? <span className="text-emerald-400 font-bold">✓ {match.participant1Name} wins {homeWins}–{awayWins}</span>
                : awayWins > homeWins
                ? <span className="text-emerald-400 font-bold">✓ {match.participant2Name} wins {awayWins}–{homeWins}</span>
                : <span className="font-bold">Draw {homeWins}–{awayWins}</span>
              : `${gamesWithResults}/${games.length} results · scores save on blur`}
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── League Schedule Dialog (team tournaments) ─────────────────────────────────
function LeagueGenerateDialog({
  open,
  onClose,
  tournament,
}: {
  open: boolean;
  onClose: () => void;
  tournament: Tournament;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: participants = [], isLoading: loadingP } = useQuery<Participant[]>({
    queryKey: ["admin-tournament-participants", tournament.id],
    queryFn: () => apiFetch(`/api/admin/tournaments/${tournament.id}/participants`),
    enabled: open,
  });

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/tournaments/${tournament.id}/generate-matches`, {
        method: "POST",
        body: JSON.stringify({ clearExisting: true }),
      }),
    onSuccess: (data: { generated: number }) => {
      toast({ title: `League schedule generated!`, description: `${data.generated} fixtures created across all matchdays.` });
      qc.invalidateQueries({ queryKey: ["admin-tournament-matches", tournament.id] });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const teamCount = participants.length;
  const fixtureCount = teamCount > 1 ? teamCount % 2 === 0
    ? (teamCount - 1) * (teamCount / 2)
    : teamCount * ((teamCount - 1) / 2)
    : 0;
  const matchdays = teamCount > 1 ? (teamCount % 2 === 0 ? teamCount - 1 : teamCount) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-400" />
            Generate League Schedule
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Summary strip */}
          {teamCount >= 2 && (
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Teams", value: teamCount },
                { label: "Matchdays", value: matchdays },
                { label: "Fixtures", value: fixtureCount },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-border bg-muted/20 py-3">
                  <div className="text-xl font-black text-foreground">{value}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Team list */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Users className="w-3.5 h-3.5" /> Enrolled Teams
            </label>

            {loadingP ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
              </div>
            ) : participants.length < 2 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No teams enrolled yet.
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                {participants.map((p, i) => {
                  const name = p.teamName ?? p.displayName ?? p.username ?? `Team ${p.teamId ?? p.id}`;
                  const logo = p.teamLogoUrl ?? p.avatarUrl;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0 ${i % 2 === 0 ? "bg-card" : ""}`}
                    >
                      <span className="text-xs text-muted-foreground font-mono w-5 text-right shrink-0">{i + 1}</span>
                      {logo ? (
                        <img src={logo} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-teal-500/20 border border-teal-500/30 shrink-0 flex items-center justify-center">
                          <span className="text-[8px] font-black text-teal-400">{name.charAt(0)}</span>
                        </div>
                      )}
                      <span className="text-sm font-bold truncate">{name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {teamCount >= 2 && (
            <p className="text-[10px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              Every team plays every other team once. Points: Win = 3 pts, Draw = 1 pt, Loss = 0 pts.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={() => mutate()}
            disabled={isPending || teamCount < 2}
            className="gap-2 min-w-[160px] bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 border-0"
          >
            {isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Sparkles className="w-4 h-4" /> Generate Schedule</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Group Stage Dialog (solo tournaments only) ────────────────────────────────
function SoloGenerateDialog({
  open,
  onClose,
  tournament,
}: {
  open: boolean;
  onClose: () => void;
  tournament: Tournament;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [groupCount, setGroupCount] = useState(4);

  const format = tournament.format ?? "group-stage";
  const isGroupStage = format === "group-stage";
  const isKnockout = format === "single-elimination";
  const isRRKnockout = format === "round-robin-knockout";

  // Fetch participants for the live preview
  const { data: participants = [], isLoading: loadingP } = useQuery<Participant[]>({
    queryKey: ["admin-tournament-participants", tournament.id],
    queryFn: () => apiFetch(`/api/admin/tournaments/${tournament.id}/participants`),
    enabled: open,
  });

  const groups = useMemo(
    () => buildGroups(participants, Math.min(groupCount, Math.max(1, Math.floor(participants.length / 2)))),
    [participants, groupCount]
  );

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/tournaments/${tournament.id}/generate-matches`, {
        method: "POST",
        body: JSON.stringify(
          isGroupStage
            ? { clearExisting: true, groupCount, formatOverride: "group-stage" }
            : { clearExisting: true },
        ),
      }),
    onSuccess: (data: { generated: number }) => {
      toast({ title: `Generated ${data.generated} ${isGroupStage ? "group stage" : isKnockout ? "knockout" : "round-robin"} matches!` });
      qc.invalidateQueries({ queryKey: ["admin-tournament-matches", tournament.id] });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {isGroupStage ? "Generate Group Stage" : isKnockout ? "Generate Knockout Bracket" : isRRKnockout ? "Generate Round Robin (Stage 1)" : "Generate Round Robin"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {isGroupStage ? (
          <>
          {/* Group count picker */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Number of Groups
            </label>
            <div className="flex gap-2">
              {[2, 4, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setGroupCount(n)}
                  disabled={n > Math.floor(participants.length / 2)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-black border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                    groupCount === n
                      ? "bg-primary/20 border-primary text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Live group preview */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Users className="w-3.5 h-3.5" /> Group Draw Preview
            </label>

            {loadingP ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: groupCount }).map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-xl" />
                ))}
              </div>
            ) : participants.length < 2 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No registered players yet — register players first.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {groups.map((group, gi) => (
                  <div key={gi} className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                    <div className="px-3 py-2 bg-primary/10 border-b border-border">
                      <span className="text-xs font-black uppercase tracking-widest text-primary">
                        Group {GROUP_LETTERS[gi]}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-2">{group.length} players</span>
                    </div>
                    <div className="divide-y divide-border">
                      {group.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                          {p.avatarUrl ? (
                            <img src={p.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-border shrink-0" />
                          )}
                          <span className="text-xs font-bold truncate">
                            {p.displayName ?? p.username ?? `Player ${p.id}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {participants.length >= 2 && (
            <p className="text-[10px] text-muted-foreground">
              Round-robin matches will be generated within each group. Each player plays every other player in their group once.
            </p>
          )}
          </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {isKnockout
                  ? "A single-elimination bracket will be generated. Participants are seeded and byes are added automatically if the count is not a power of 2."
                  : isRRKnockout
                  ? "Round Robin fixtures (Stage 1) will be generated. After all matches are complete, use Generate Knockout to build the seeded bracket from final standings."
                  : "Round Robin fixtures will be generated. Every participant plays every other participant once."}
              </p>
              {participants.length >= 2 && (
                <p className="text-[10px] text-muted-foreground">
                  {participants.length} participants registered.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={() => mutate()}
            disabled={isPending || participants.length < 2}
            className="gap-2 min-w-[150px] bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 border-0"
          >
            {isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Sparkles className="w-4 h-4" /> {isGroupStage ? "Generate Rounds" : isKnockout ? "Generate Bracket" : "Generate Fixtures"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Tournament Match Editor ────────────────────────────────────────────────────
function TournamentMatchEditor({ tournament, onBack }: { tournament: Tournament; onBack: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editing, setEditing] = useState<Match | undefined>();
  const [playerGamesMatch, setPlayerGamesMatch] = useState<Match | undefined>();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [view, setView] = useState<"groups" | "matches">("groups");

  const { data: matches = [], isLoading } = useQuery<Match[]>({
    queryKey: ["admin-tournament-matches", tournament.id],
    queryFn: () => apiFetch(`/api/admin/tournaments/${tournament.id}/matches`),
  });

  const { data: participants = [] } = useQuery<Participant[]>({
    queryKey: ["admin-tournament-participants", tournament.id],
    queryFn: () => apiFetch(`/api/admin/tournaments/${tournament.id}/participants`),
  });

  // name → avatarUrl lookup (displayName takes priority, fallback to username)
  const avatarMap = useMemo(() => {
    const m: Record<string, string | null> = {};
    participants.forEach((p) => {
      const name = p.displayName ?? p.username ?? "";
      if (name) m[name] = p.avatarUrl ?? null;
    });
    return m;
  }, [participants]);

  // teamName → teamLogoUrl lookup (team tournaments)
  const teamLogoMap = useMemo(() => {
    const m: Record<string, string | null> = {};
    participants.forEach((p) => {
      const name = p.teamName ?? "";
      if (name) m[name] = p.teamLogoUrl ?? null;
    });
    return m;
  }, [participants]);

  const allIds = useMemo(() => matches.map((m) => m.id), [matches]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  }
  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const { mutate: deleteMatch } = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/matches/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tournament-matches", tournament.id] });
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const isRRKnockout = tournament.format === "round-robin-knockout";

  const { mutate: generateKnockout, isPending: knockoutPending } = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/tournaments/${tournament.id}/generate-knockout`, {
        method: "POST",
        body: JSON.stringify({ clearExistingKnockout: true }),
      }),
    onSuccess: (data: { generated: number }) => {
      toast({ title: `Knockout bracket generated!`, description: `${data.generated} matches seeded from final standings.` });
      qc.invalidateQueries({ queryKey: ["admin-tournament-matches", tournament.id] });
    },
    onError: (err: Error) => toast({ title: "Knockout generation failed", description: err.message, variant: "destructive" }),
  });

  async function deleteSelected() {
    if (!confirm(`Delete ${selected.size} match${selected.size > 1 ? "es" : ""}?`)) return;
    setBulkDeleting(true);
    await Promise.all([...selected].map((id) => apiFetch(`/api/admin/matches/${id}`, { method: "DELETE" })));
    toast({ title: `Deleted ${selected.size} match${selected.size > 1 ? "es" : ""}` });
    setSelected(new Set());
    setBulkDeleting(false);
    qc.invalidateQueries({ queryKey: ["admin-tournament-matches", tournament.id] });
  }

  // ── Detect tournament type ────────────────────────────────────────────────
  const isTeamTournament = tournament.tournamentType === "team";

  // ── Detect group-stage mode ────────────────────────────────────────────────
  const isGroupStage = !isTeamTournament && matches.some((m) => m.roundName?.startsWith("Group "));

  // ── Group stage: bucket by roundName (= group label) ──────────────────────
  const groupBuckets = useMemo(() => {
    if (!isGroupStage) return {};
    const out: Record<string, Match[]> = {};
    matches.forEach((m) => {
      const key = m.roundName ?? "Group ?";
      (out[key] ??= []).push(m);
    });
    return out;
  }, [matches, isGroupStage]);
  const sortedGroups = Object.keys(groupBuckets).sort();

  // ── Standings computation ──────────────────────────────────────────────────
  function computeStandings(groupMatches: Match[]) {
    const table: Record<string, { mp: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {};
    const ensure = (name: string) => {
      if (!table[name]) table[name] = { mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    };
    groupMatches.forEach((m) => {
      const p1 = m.participant1Name ?? "TBD";
      const p2 = m.participant2Name ?? "TBD";
      ensure(p1); ensure(p2);
      if (m.status !== "completed") return;
      const s1 = m.participant1Score ?? 0;
      const s2 = m.participant2Score ?? 0;
      table[p1].mp++; table[p2].mp++;
      table[p1].gf += s1; table[p1].ga += s2;
      table[p2].gf += s2; table[p2].ga += s1;
      // Determine outcome: prefer winnerId, fall back to comparing scores
      const winner =
        m.winnerId
          ? (m.winnerId === m.participant1Id ? p1 : p2)
          : s1 !== s2
            ? (s1 > s2 ? p1 : p2)
            : null; // draw

      if (winner) {
        const loser = winner === p1 ? p2 : p1;
        table[winner].w++; table[winner].pts += 3;
        table[loser].l++;
      } else {
        // draw — 1 pt each
        table[p1].d++; table[p1].pts += 1;
        table[p2].d++; table[p2].pts += 1;
      }
    });
    return Object.entries(table)
      .map(([name, s]) => ({ name, ...s, gd: s.gf - s.ga }))
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
  }

  // ── Non-group: bucket by round number ─────────────────────────────────────
  const rounds = useMemo(() => {
    const out: Record<number, Match[]> = {};
    matches.forEach((m) => { (out[m.round] ??= []).push(m); });
    return out;
  }, [matches]);
  const sortedRounds = Object.keys(rounds).map(Number).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" /> Tournaments
        </Button>
        <div className="flex items-center gap-3 flex-1">
          {tournament.logoUrl ? (
            <img src={storageUrl(tournament.logoUrl)} alt="" className="w-10 h-10 rounded-lg object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-primary/60" />
            </div>
          )}
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">{tournament.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge className={`text-[9px] uppercase tracking-widest ${statusColors[tournament.status] ?? ""}`}>
                {tournament.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {isTeamTournament
                  ? `${tournament.currentParticipants} teams`
                  : `${tournament.currentParticipants}/${tournament.maxParticipants} players`}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2 font-bold" onClick={() => setGenerateOpen(true)}>
            <Sparkles className="w-4 h-4" /> Generate
          </Button>
          {isRRKnockout && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2 font-bold border-amber-500/40 text-amber-400 hover:border-amber-500 hover:text-amber-400"
              onClick={() => generateKnockout()}
              disabled={knockoutPending}
            >
              {knockoutPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
              Generate Knockout
            </Button>
          )}
          <Button size="sm" className="gap-2 font-bold" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> Add Match
          </Button>
        </div>
      </div>

      {/* View tabs — only shown when group stage matches exist */}
      {isGroupStage && matches.length > 0 && (
        <div className="flex gap-1 p-1 rounded-xl bg-muted/40 border border-border w-fit">
          <button
            onClick={() => setView("groups")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-black transition-all ${
              view === "groups"
                ? "bg-card shadow text-foreground border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Group Stage
          </button>
          <button
            onClick={() => setView("matches")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-black transition-all ${
              view === "matches"
                ? "bg-card shadow text-foreground border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Swords className="w-3.5 h-3.5" /> Matches
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      <AnimatePresence>
        {someSelected && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5"
          >
            <div className="flex items-center gap-3">
              <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold">
                {selected.size} match{selected.size > 1 ? "es" : ""} selected
              </span>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="gap-2 font-bold"
              onClick={deleteSelected}
              disabled={bulkDeleting}
            >
              {bulkDeleting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting…</>
                : <><Trash2 className="w-3.5 h-3.5" /> Delete {selected.size}</>}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TEAM TOURNAMENT: League table + matchday fixtures ── */}
      {isTeamTournament && !isLoading && (
        <div className="space-y-8">
          {/* League Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black uppercase tracking-widest text-foreground">League Table</h3>
              {matches.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {matches.filter((m) => m.status === "completed").length}/{matches.length} played
                </span>
              )}
            </div>

            {matches.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl text-muted-foreground">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="font-bold text-sm">No schedule yet</p>
                <p className="text-xs mt-1">Click Generate to create the full league schedule.</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border">
                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-8">#</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Club</th>
                        {["MP","W","D","L","GF","GA","GD"].map((h) => (
                          <th key={h} className="text-center px-2 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-9">{h}</th>
                        ))}
                        <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-primary w-12">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computeStandings(matches).map((row, i) => {
                        const total = computeStandings(matches).length;
                        const promotionEnd = Math.ceil(total * 0.25);
                        const europaEnd = Math.ceil(total * 0.40);
                        const relegStart = total - Math.floor(total * 0.15);
                        let stripe = "border-l-2 border-l-transparent";
                        if (i < promotionEnd) stripe = "border-l-2 border-l-emerald-500";
                        else if (i < europaEnd) stripe = "border-l-2 border-l-orange-500";
                        else if (i >= relegStart) stripe = "border-l-2 border-l-red-500";
                        return (
                          <tr key={row.name} className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "bg-card" : ""} ${stripe}`}>
                            <td className="px-4 py-3 text-xs text-muted-foreground font-mono text-right w-8">{i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                {teamLogoMap[row.name] ? (
                                  <img
                                    src={teamLogoMap[row.name]!}
                                    alt={row.name}
                                    className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-border"
                                  />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-muted border border-border shrink-0 flex items-center justify-center text-[9px] font-black text-muted-foreground">
                                    {row.name.charAt(0)}
                                  </div>
                                )}
                                <span className="font-bold truncate">{row.name}</span>
                              </div>
                            </td>
                            <td className="text-center px-2 py-3 text-xs text-muted-foreground">{row.mp}</td>
                            <td className="text-center px-2 py-3 text-xs font-bold text-emerald-400">{row.w}</td>
                            <td className="text-center px-2 py-3 text-xs text-muted-foreground">{row.d}</td>
                            <td className="text-center px-2 py-3 text-xs text-red-400">{row.l}</td>
                            <td className="text-center px-2 py-3 text-xs text-muted-foreground">{row.gf}</td>
                            <td className="text-center px-2 py-3 text-xs text-muted-foreground">{row.ga}</td>
                            <td className={`text-center px-2 py-3 text-xs font-bold ${row.gd > 0 ? "text-emerald-400" : row.gd < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                              {row.gd > 0 ? `+${row.gd}` : row.gd}
                            </td>
                            <td className="text-center px-3 py-3 font-black text-foreground text-base">{row.pts}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="flex flex-wrap gap-4 px-4 py-2.5 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Champions League</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" /> Europa League</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Relegation</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Matchday Fixtures */}
          {matches.length > 0 && (
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-foreground mb-3">Fixtures</h3>
              <div className="space-y-2">
                {sortedRounds.map((rNum) => {
                  const rMatches = rounds[rNum];
                  return (
                    <div key={rNum} className="rounded-xl border border-border overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
                        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                          {rMatches[0]?.roundName ?? `Matchday ${rNum}`}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {rMatches.filter((m) => m.status === "completed").length}/{rMatches.length} played
                        </span>
                      </div>
                      {rMatches.map((match) => {
                        const logo1 = teamLogoMap[match.participant1Name ?? ""];
                        const logo2 = teamLogoMap[match.participant2Name ?? ""];
                        const p1Win = match.status === "completed" && match.winnerId === match.participant1Id;
                        const p2Win = match.status === "completed" && match.winnerId === match.participant2Id;
                        return (
                          <div
                            key={match.id}
                            className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-primary/5 cursor-pointer transition-colors group"
                            onClick={() => setPlayerGamesMatch(match)}
                          >
                            {/* Team 1 */}
                            <div className="flex-1 flex items-center justify-end gap-2.5">
                              <span className={`text-sm font-bold truncate text-right ${p1Win ? "text-emerald-400" : ""}`}>
                                {match.participant1Name ?? "TBD"}
                              </span>
                              {logo1 ? (
                                <img src={logo1} alt="" className={`w-8 h-8 rounded-full object-cover shrink-0 ring-2 ${p1Win ? "ring-emerald-500" : "ring-border"}`} />
                              ) : (
                                <div className={`w-8 h-8 rounded-full bg-muted border shrink-0 flex items-center justify-center text-[10px] font-black text-muted-foreground ${p1Win ? "border-emerald-500" : "border-border"}`}>
                                  {(match.participant1Name ?? "?").charAt(0)}
                                </div>
                              )}
                            </div>

                            {/* Score / Status */}
                            <div className="text-center min-w-[64px] shrink-0">
                              {match.status === "completed" ? (
                                <span className="font-mono font-black text-sm tabular-nums">
                                  {match.participant1Score} – {match.participant2Score}
                                </span>
                              ) : match.status === "live" ? (
                                <span className="text-red-400 text-xs font-bold flex items-center gap-1 justify-center">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs font-bold">vs</span>
                              )}
                            </div>

                            {/* Team 2 */}
                            <div className="flex-1 flex items-center gap-2.5">
                              {logo2 ? (
                                <img src={logo2} alt="" className={`w-8 h-8 rounded-full object-cover shrink-0 ring-2 ${p2Win ? "ring-emerald-500" : "ring-border"}`} />
                              ) : (
                                <div className={`w-8 h-8 rounded-full bg-muted border shrink-0 flex items-center justify-center text-[10px] font-black text-muted-foreground ${p2Win ? "border-emerald-500" : "border-border"}`}>
                                  {(match.participant2Name ?? "?").charAt(0)}
                                </div>
                              )}
                              <span className={`text-sm font-bold truncate ${p2Win ? "text-emerald-400" : ""}`}>
                                {match.participant2Name ?? "TBD"}
                              </span>
                            </div>

                            {/* Actions — stopPropagation so row click doesn't trigger */}
                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(match)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => { if (confirm("Delete this match?")) deleteMatch(match.id); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SOLO TOURNAMENT: original group/bracket view ── */}
      {!isTeamTournament && (
        isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-xl text-muted-foreground">
            <Swords className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-bold">No matches yet</p>
            <p className="text-sm mt-1">Click Generate to create the group stage, or Add Match manually.</p>
          </div>
        ) : (
        <div className="space-y-2">

          {isGroupStage ? (
            <>
              {/* ── GROUP STAGE tab: standings only ── */}
              {view === "groups" && (
                <div className="space-y-8 pt-2">
                  {sortedGroups.map((groupName) => {
                    const groupMatches = groupBuckets[groupName];
                    const standings = computeStandings(groupMatches);
                    return (
                      <motion.div key={groupName} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                        <h3 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2 mb-3">
                          <span className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-black">
                            {groupName.replace("Group ", "")}
                          </span>
                          {groupName}
                        </h3>
                        <div className="rounded-xl border border-border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/40 border-b border-border">
                                <th className="text-left px-4 py-2.5 text-xs font-black uppercase tracking-wider text-muted-foreground w-8">#</th>
                                <th className="text-left px-3 py-2.5 text-xs font-black uppercase tracking-wider text-muted-foreground">Player</th>
                                {["MP","W","D","L","GF","GA","GD"].map((h) => (
                                  <th key={h} className="text-center px-2 py-2.5 text-xs font-black uppercase tracking-wider text-muted-foreground w-10">{h}</th>
                                ))}
                                <th className="text-center px-3 py-2.5 text-xs font-black uppercase tracking-wider text-primary w-12">PTS</th>
                              </tr>
                            </thead>
                            <tbody>
                              {standings.map((row, i) => (
                                <tr key={row.name} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-card" : "bg-muted/10"}`}>
                                  <td className="px-4 py-3 text-xs font-bold">
                                    {i < 2
                                      ? <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black">{i + 1}</span>
                                      : <span className="text-muted-foreground">{i + 1}</span>}
                                  </td>
                                  <td className="px-3 py-2.5 max-w-[160px]">
                                    <div className="flex items-center gap-2">
                                      {avatarMap[row.name] ? (
                                        <img src={avatarMap[row.name]!} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 ring-1 ring-border" />
                                      ) : (
                                        <div className="w-6 h-6 rounded-full bg-muted shrink-0 flex items-center justify-center text-[10px] font-black text-muted-foreground ring-1 ring-border">
                                          {row.name.charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                      <span className="font-black text-sm truncate">{row.name}</span>
                                    </div>
                                  </td>
                                  <td className="text-center px-2 py-3 text-xs text-muted-foreground">{row.mp}</td>
                                  <td className="text-center px-2 py-3 text-xs font-bold text-emerald-400">{row.w}</td>
                                  <td className="text-center px-2 py-3 text-xs text-muted-foreground">{row.d}</td>
                                  <td className="text-center px-2 py-3 text-xs text-red-400">{row.l}</td>
                                  <td className="text-center px-2 py-3 text-xs text-muted-foreground">{row.gf}</td>
                                  <td className="text-center px-2 py-3 text-xs text-muted-foreground">{row.ga}</td>
                                  <td className={`text-center px-2 py-3 text-xs font-bold ${row.gd > 0 ? "text-emerald-400" : row.gd < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                                    {row.gd > 0 ? `+${row.gd}` : row.gd}
                                  </td>
                                  <td className="text-center px-3 py-3 font-black text-primary">{row.pts}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-muted/20">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span className="text-[10px] text-muted-foreground">Qualify (top 2)</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* ── MATCHES tab: fixtures only, with select/delete ── */}
              {view === "matches" && (
                <div className="space-y-2 pt-1">
                  {/* Select-all toolbar */}
                  <div className="flex items-center gap-3 pb-3 border-b border-border">
                    <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
                      {allSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                      {allSelected ? "Deselect all" : "Select all"} ({matches.length})
                    </button>
                  </div>
                  {sortedGroups.map((groupName) => {
                    const groupMatches = groupBuckets[groupName];
                    const groupAllSelected = groupMatches.every((m) => selected.has(m.id));
                    const roundsInGroup: Record<number, Match[]> = {};
                    groupMatches.forEach((m) => { (roundsInGroup[m.round] ??= []).push(m); });
                    const groupRoundNums = Object.keys(roundsInGroup).map(Number).sort((a, b) => a - b);
                    return (
                      <motion.div key={groupName} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 mb-8">
                        {/* Group label + select */}
                        <div className="flex items-center gap-2 mt-4">
                          <button
                            onClick={() => {
                              const ids = groupMatches.map((m) => m.id);
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (groupAllSelected) ids.forEach((id) => next.delete(id));
                                else ids.forEach((id) => next.add(id));
                                return next;
                              });
                            }}
                            className="text-muted-foreground hover:text-primary transition-colors"
                          >
                            {groupAllSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                          </button>
                          <h3 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-black">
                              {groupName.replace("Group ", "")}
                            </span>
                            {groupName}
                          </h3>
                        </div>

                        {/* Matchdays */}
                        {groupRoundNums.map((rNum, rIdx) => {
                          const rMatches = roundsInGroup[rNum];
                          const rAllSel = rMatches.every((m) => selected.has(m.id));
                          return (
                            <div key={rNum}>
                              <div className="flex items-center gap-2 mb-2 ml-6">
                                <button
                                  onClick={() => {
                                    const ids = rMatches.map((m) => m.id);
                                    setSelected((prev) => {
                                      const next = new Set(prev);
                                      if (rAllSel) ids.forEach((id) => next.delete(id));
                                      else ids.forEach((id) => next.add(id));
                                      return next;
                                    });
                                  }}
                                  className="text-muted-foreground hover:text-primary transition-colors"
                                >
                                  {rAllSel ? <CheckSquare className="w-3 h-3 text-primary" /> : <Square className="w-3 h-3" />}
                                </button>
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Matchday {rIdx + 1}</span>
                              </div>
                              <div className="grid gap-2">
                                {rMatches.map((match) => {
                                  const isSel = selected.has(match.id);
                                  return (
                                    <div key={match.id} className={`rounded-xl border bg-card flex items-center gap-3 px-4 py-3 transition-colors ${isSel ? "border-destructive/50 bg-destructive/5" : "border-border"}`}>
                                      <button onClick={() => toggleOne(match.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                                        {isSel ? <CheckSquare className="w-3.5 h-3.5 text-destructive" /> : <Square className="w-3.5 h-3.5" />}
                                      </button>
                                      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                        {/* Player 1 */}
                                        <div className={`flex items-center justify-end gap-2 ${match.winnerId === match.participant1Id && match.winnerId ? "text-emerald-400" : ""}`}>
                                          <span className="text-sm font-black truncate">{match.participant1Name ?? "TBD"}</span>
                                          {avatarMap[match.participant1Name ?? ""] ? (
                                            <img src={avatarMap[match.participant1Name ?? ""]!} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-border" />
                                          ) : (
                                            <div className="w-7 h-7 rounded-full bg-muted shrink-0 flex items-center justify-center text-[10px] font-black text-muted-foreground ring-1 ring-border">
                                              {(match.participant1Name ?? "?").charAt(0).toUpperCase()}
                                            </div>
                                          )}
                                        </div>
                                        {/* Score */}
                                        <div className="text-center shrink-0 min-w-[60px]">
                                          {match.status === "completed" || (match.participant1Score !== null && match.participant1Score !== undefined) ? (
                                            <span className="font-mono font-black text-base bg-muted px-2 py-0.5 rounded">
                                              {match.participant1Score ?? 0} — {match.participant2Score ?? 0}
                                            </span>
                                          ) : (
                                            <span className="text-xs text-muted-foreground font-bold">vs</span>
                                          )}
                                        </div>
                                        {/* Player 2 */}
                                        <div className={`flex items-center gap-2 ${match.winnerId === match.participant2Id && match.winnerId ? "text-emerald-400" : ""}`}>
                                          {avatarMap[match.participant2Name ?? ""] ? (
                                            <img src={avatarMap[match.participant2Name ?? ""]!} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-border" />
                                          ) : (
                                            <div className="w-7 h-7 rounded-full bg-muted shrink-0 flex items-center justify-center text-[10px] font-black text-muted-foreground ring-1 ring-border">
                                              {(match.participant2Name ?? "?").charAt(0).toUpperCase()}
                                            </div>
                                          )}
                                          <span className="text-sm font-black truncate">{match.participant2Name ?? "TBD"}</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <Badge className={`text-[9px] uppercase tracking-widest ${matchStatusColors[match.status] ?? ""}`}>
                                          {match.status === "live" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1 animate-pulse" />}
                                          {match.status}
                                        </Badge>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(match)}>
                                          <Pencil className="w-3 h-3" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                                          onClick={() => { if (confirm("Delete?")) deleteMatch(match.id); }}>
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* ── Standard round view (non-group-stage) ── */
            <div className="space-y-8 pt-2">
              {sortedRounds.map((roundNum) => {
                const roundMatches = rounds[roundNum];
                const roundLabel = roundMatches[0]?.roundName ?? `Round ${roundNum}`;
                const roundAllSelected = roundMatches.every((m) => selected.has(m.id));
                return (
                  <div key={roundNum}>
                    <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                      <button onClick={() => {
                        const ids = roundMatches.map((m) => m.id);
                        setSelected((prev) => { const next = new Set(prev); if (roundAllSelected) ids.forEach((id) => next.delete(id)); else ids.forEach((id) => next.add(id)); return next; });
                      }} className="text-muted-foreground hover:text-primary transition-colors">
                        {roundAllSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5" />}
                      </button>
                      <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px]">{roundNum}</span>
                      {roundLabel}
                      <span className="text-muted-foreground font-normal normal-case tracking-normal">({roundMatches.length})</span>
                    </h3>
                    <div className="grid gap-3">
                      {roundMatches.map((match) => {
                        const isSelected = selected.has(match.id);
                        return (
                          <motion.div key={match.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            className={`rounded-xl border bg-card overflow-hidden transition-colors ${isSelected ? "border-destructive/50 bg-destructive/5" : "border-border"}`}>
                            <div className="flex items-center gap-3 p-4">
                              <button onClick={() => toggleOne(match.id)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                                {isSelected ? <CheckSquare className="w-4 h-4 text-destructive" /> : <Square className="w-4 h-4" />}
                              </button>
                              <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                {/* Player 1 */}
                                <div className={`flex items-center justify-end gap-2 ${match.winnerId === match.participant1Id && match.winnerId ? "text-primary" : ""}`}>
                                  <span className="font-black text-sm truncate">{match.participant1Name ?? "TBD"}</span>
                                  {avatarMap[match.participant1Name ?? ""] ? (
                                    <img src={avatarMap[match.participant1Name ?? ""]!} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-border" />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-muted shrink-0 flex items-center justify-center text-[10px] font-black text-muted-foreground ring-1 ring-border">
                                      {(match.participant1Name ?? "?").charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                                {/* Score */}
                                <div className="text-center shrink-0">
                                  {match.participant1Score !== null && match.participant1Score !== undefined
                                    ? <span className="font-mono font-black text-lg">{match.participant1Score} <span className="text-muted-foreground text-sm">—</span> {match.participant2Score ?? 0}</span>
                                    : <span className="text-muted-foreground text-sm font-bold">vs</span>}
                                </div>
                                {/* Player 2 */}
                                <div className={`flex items-center gap-2 ${match.winnerId === match.participant2Id && match.winnerId ? "text-primary" : ""}`}>
                                  {avatarMap[match.participant2Name ?? ""] ? (
                                    <img src={avatarMap[match.participant2Name ?? ""]!} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-border" />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-muted shrink-0 flex items-center justify-center text-[10px] font-black text-muted-foreground ring-1 ring-border">
                                      {(match.participant2Name ?? "?").charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <span className="font-black text-sm truncate">{match.participant2Name ?? "TBD"}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge className={`text-[9px] uppercase tracking-widest ${matchStatusColors[match.status] ?? ""}`}>
                                  {match.status === "live" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1 animate-pulse" />}
                                  {match.status}
                                </Badge>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(match)}><Pencil className="w-3.5 h-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => { if (confirm("Delete this match?")) deleteMatch(match.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )
      )}

      {/* Dialogs */}
      {isTeamTournament
        ? <LeagueGenerateDialog open={generateOpen} onClose={() => setGenerateOpen(false)} tournament={tournament} />
        : <SoloGenerateDialog open={generateOpen} onClose={() => setGenerateOpen(false)} tournament={tournament} />
      }
      {playerGamesMatch && (
        <PlayerGamesDialog
          open={!!playerGamesMatch}
          onClose={() => setPlayerGamesMatch(undefined)}
          match={playerGamesMatch}
          teamLogoMap={teamLogoMap}
        />
      )}
      <MatchFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        tournamentId={tournament.id}
        tournamentType={tournament.tournamentType}
      />
      {editing && (
        <MatchFormDialog
          open={!!editing}
          onClose={() => setEditing(undefined)}
          tournamentId={tournament.id}
          tournamentType={tournament.tournamentType}
          existing={editing}
        />
      )}
    </div>
  );
}

// ── Tournament Picker ──────────────────────────────────────────────────────────
function TournamentPicker({ onSelect }: { onSelect: (t: Tournament) => void }) {
  const { data: tournaments = [], isLoading } = useQuery<Tournament[]>({
    queryKey: ["admin", "tournaments"],
    queryFn: () => apiFetch("/api/admin/tournaments"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black uppercase tracking-wide">Pick a Tournament</h2>
        <p className="text-sm text-muted-foreground mt-1">Select a tournament to manage its matches and rounds.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)
          : tournaments.map((t, i) => (
            <motion.button
              key={t.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onSelect(t)}
              className="aspect-square rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10 transition-all duration-300 group relative flex flex-col text-left"
            >
              {/* Logo / banner */}
              <div className="flex-1 relative bg-black/40 flex items-center justify-center overflow-hidden">
                {t.logoUrl ? (
                  <img
                    src={storageUrl(t.logoUrl)}
                    alt={t.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <Trophy className="w-10 h-10 text-primary/20" />
                )}
                <div className="absolute top-2.5 left-2.5">
                  <Badge className={`text-[9px] uppercase tracking-widest font-bold ${statusColors[t.status] ?? ""}`}>
                    {t.status}
                  </Badge>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-card to-transparent" />
              </div>

              {/* Info */}
              <div className="px-3.5 pb-3.5 pt-2 shrink-0">
                <p className="font-black text-sm leading-tight group-hover:text-primary transition-colors line-clamp-1">
                  {t.name}
                </p>
                {t.hostedBy && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">by {t.hostedBy}</p>
                )}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                  <div>
                    <div className="text-xs font-black text-primary">{t.prizePool}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Prize</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-black">{t.currentParticipants}/{t.maxParticipants}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Players</div>
                  </div>
                </div>
              </div>
            </motion.button>
          ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function AdminMatchesPage() {
  const [selected, setSelected] = useState<Tournament | null>(null);

  return (
    <AnimatePresence mode="wait">
      {selected ? (
        <motion.div key="editor" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <TournamentMatchEditor tournament={selected} onBack={() => setSelected(null)} />
        </motion.div>
      ) : (
        <motion.div key="picker" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
          <TournamentPicker onSelect={setSelected} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
