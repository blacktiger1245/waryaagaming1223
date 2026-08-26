import { useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy, Users, Calendar, ExternalLink, ArrowLeft, CheckCircle2, Loader2, LogIn, ShieldOff, Shield,
  ChevronRight, UserPlus, UserMinus, Search, X, BarChart3, LayoutGrid, Swords, Table2, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGetTournament, useGetTournamentBracket, useGetTournamentMatches } from "@workspace/api-client-react";
import type { Match } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TournamentBracket } from "@/components/tournament-bracket";
import { apiUrl } from "@/lib/api";

const statusColors: Record<string, string> = {
  upcoming: "bg-primary/10 text-primary border-primary/30",
  active: "bg-red-500/10 text-red-400 border-red-500/30",
  completed: "bg-muted text-muted-foreground border-border",
};

const matchStatusColors: Record<string, string> = {
  scheduled: "text-muted-foreground",
  live: "text-red-400",
  completed: "text-primary",
  cancelled: "text-destructive",
};

// â”€â”€â”€ League Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Standing {
  id: number;
  name: string;
  mp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

interface TournamentParticipant {
  id: number;
  teamId?: number | null;
  teamName?: string | null;
  teamLogoUrl?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

function buildStandings(matches: Match[]): Standing[] {
  const map = new Map<number, Standing>();

  function ensure(id: number, name: string) {
    if (!map.has(id)) {
      map.set(id, { id, name, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
    }
    return map.get(id)!;
  }

  for (const m of matches) {
    const p1id = m.participant1Id ?? 0;
    const p2id = m.participant2Id ?? 0;
    if (!p1id || !p2id) continue;

    // Always register both teams (even if no result yet)
    ensure(p1id, m.participant1Name ?? `Team ${p1id}`);
    ensure(p2id, m.participant2Name ?? `Team ${p2id}`);

    if (m.status !== "completed") continue;

    const p1 = ensure(p1id, m.participant1Name ?? `Team ${p1id}`);
    const p2 = ensure(p2id, m.participant2Name ?? `Team ${p2id}`);
    const g1 = m.participant1Score ?? 0;
    const g2 = m.participant2Score ?? 0;

    p1.mp++; p2.mp++;
    p1.gf += g1; p1.ga += g2;
    p2.gf += g2; p2.ga += g1;

    if (m.winnerId === p1id) {
      p1.w++; p1.pts += 3; p2.l++;
    } else if (m.winnerId === p2id) {
      p2.w++; p2.pts += 3; p1.l++;
    } else {
      // draw
      p1.d++; p1.pts += 1;
      p2.d++; p2.pts += 1;
    }
  }

  return Array.from(map.values())
    .map((s) => ({ ...s, gd: s.gf - s.ga }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
}

function LeagueTable({ matches, totalTeams, logoMap = {} }: { matches: Match[]; totalTeams: number; logoMap?: Record<string, string | null> }) {
  const standings = buildStandings(matches);

  if (standings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No matches generated yet. Click "Generate Matches" in the admin panel to build the league schedule.</p>
      </div>
    );
  }

  const promotionCutoff = Math.ceil(totalTeams * 0.25); // top 25% â†’ Champions League green
  const europaEnd = Math.ceil(totalTeams * 0.40);       // next 15% â†’ Europa orange
  const relegationStart = totalTeams - Math.floor(totalTeams * 0.15); // bottom 15% â†’ relegation red

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-8">#</th>
            <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Club</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">MP</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">W</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">D</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">L</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">GF</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">GA</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">GD</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-black text-foreground">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const pos = i + 1;
            let stripe = "";
            let indicator = "";
            if (pos <= promotionCutoff) {
              stripe = "border-l-2 border-l-emerald-500";
              indicator = "bg-emerald-500";
            } else if (pos <= europaEnd) {
              stripe = "border-l-2 border-l-orange-500";
              indicator = "bg-orange-500";
            } else if (pos >= relegationStart) {
              stripe = "border-l-2 border-l-red-500";
              indicator = "bg-red-500";
            } else {
              stripe = "border-l-2 border-l-transparent";
            }

            return (
              <tr
                key={s.id}
                className={`border-b border-border last:border-0 transition-colors hover:bg-muted/20 ${i % 2 === 0 ? "bg-card" : ""} ${stripe}`}
              >
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center gap-2">
                    {indicator && (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${indicator}`} />
                    )}
                    <span className="text-muted-foreground font-mono text-xs w-4 text-right">{pos}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    {logoMap[s.name] ? (
                      <img src={logoMap[s.name]!} alt={s.name} className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-border" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-muted border border-border shrink-0 flex items-center justify-center text-[9px] font-black text-muted-foreground">
                        {s.name.charAt(0)}
                      </div>
                    )}
                    <span className="font-bold text-foreground">{s.name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-center text-muted-foreground">{s.mp}</td>
                <td className="px-3 py-3 text-center text-emerald-400 font-bold">{s.w}</td>
                <td className="px-3 py-3 text-center text-muted-foreground">{s.d}</td>
                <td className="px-3 py-3 text-center text-red-400">{s.l}</td>
                <td className="px-3 py-3 text-center text-muted-foreground">{s.gf}</td>
                <td className="px-3 py-3 text-center text-muted-foreground">{s.ga}</td>
                <td className="px-3 py-3 text-center font-mono text-muted-foreground">
                  {s.gd > 0 ? `+${s.gd}` : s.gd}
                </td>
                <td className="px-3 py-3 text-center font-black text-foreground text-base">{s.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 px-4 py-3 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Champions League</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" /> Europa League</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Relegation Zone</span>
      </div>
    </div>
  );
}

// â”€â”€â”€ Match Detail Dialog (public, read-only player matchups) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface PublicPlayerGame {
  id: number;
  matchId: number;
  homePlayerName?: string | null;
  awayPlayerName?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  status: string;
}

function MatchDetailDialog({
  match,
  onClose,
  logoMap,
}: {
  match: Match;
  onClose: () => void;
  logoMap: Record<string, string | null>;
}) {
  const { data: games = [], isLoading } = useQuery<PublicPlayerGame[]>({
    queryKey: ["public-player-games", match.id],
    queryFn: async () => {
      const res = await fetch(`/api/matches/${match.id}/player-games`);
      return res.json();
    },
  });

  const logo1 = logoMap[match.participant1Name ?? ""];
  const logo2 = logoMap[match.participant2Name ?? ""];
  const done = match.status === "completed";
  const live = match.status === "live";

  const homeWins = games.filter((g) => g.homeScore != null && g.awayScore != null && g.homeScore > g.awayScore).length;
  const awayWins = games.filter((g) => g.homeScore != null && g.awayScore != null && g.awayScore > g.homeScore).length;
  const played = games.filter((g) => g.homeScore != null && g.awayScore != null).length;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {logo1 ? (
                <img src={logo1} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-border shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-muted border border-border shrink-0 flex items-center justify-center text-sm font-black">
                  {(match.participant1Name ?? "?").charAt(0)}
                </div>
              )}
              <span className="font-black text-base truncate">{match.participant1Name ?? "TBD"}</span>
            </div>
            <div className="text-center shrink-0 min-w-[72px]">
              {done ? (
                <div className="text-3xl font-black tabular-nums">
                  {match.participant1Score} â€“ {match.participant2Score}
                </div>
              ) : live ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="flex items-center gap-1 text-red-400 font-bold text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                  </span>
                  {played > 0 && <span className="text-xl font-black tabular-nums">{homeWins} â€“ {awayWins}</span>}
                </div>
              ) : (
                <span className="text-muted-foreground font-bold">vs</span>
              )}
              {games.length > 0 && (
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                  {played}/{games.length} played
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
              <span className="font-black text-base truncate text-right">{match.participant2Name ?? "TBD"}</span>
              {logo2 ? (
                <img src={logo2} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-border shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-muted border border-border shrink-0 flex items-center justify-center text-sm font-black">
                  {(match.participant2Name ?? "?").charAt(0)}
                </div>
              )}
            </div>
          </div>
          {match.roundName && (
            <p className="text-center text-xs text-muted-foreground mt-3 uppercase tracking-widest">{match.roundName}</p>
          )}
        </div>

        {/* Player matchups */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <DialogHeader className="mb-3">
            <DialogTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Player Matchups
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
            </div>
          ) : games.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No player matchups yet.</p>
          ) : (
            <div className="space-y-1">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-2 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right">{match.participant1Name}</span>
                <span className="w-16" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{match.participant2Name}</span>
              </div>
              {games.map((game, idx) => {
                const gDone = game.homeScore != null && game.awayScore != null;
                const hWin = gDone && game.homeScore! > game.awayScore!;
                const aWin = gDone && game.awayScore! > game.homeScore!;
                return (
                  <motion.div
                    key={game.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-muted/10 transition-colors"
                  >
                    <div className="text-right">
                      <span className={`text-sm font-bold ${hWin ? "text-emerald-400" : ""}`}>
                        {game.homePlayerName || "â€”"}
                      </span>
                    </div>
                    <div className="text-center min-w-[64px]">
                      {gDone ? (
                        <span className={`font-mono font-black text-base tabular-nums ${hWin || aWin ? "" : "text-muted-foreground"}`}>
                          {game.homeScore} â€“ {game.awayScore}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs font-bold">vs</span>
                      )}
                    </div>
                    <div>
                      <span className={`text-sm font-bold ${aWin ? "text-emerald-400" : ""}`}>
                        {game.awayPlayerName || "â€”"}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer summary */}
        {played > 0 && (
          <div className="px-6 py-3 border-t border-border shrink-0 bg-muted/10 text-center text-sm">
            {homeWins > awayWins ? (
              <span className="font-black text-emerald-400">{match.participant1Name} leads {homeWins}â€“{awayWins}</span>
            ) : awayWins > homeWins ? (
              <span className="font-black text-emerald-400">{match.participant2Name} leads {awayWins}â€“{homeWins}</span>
            ) : (
              <span className="font-bold text-muted-foreground">Tied {homeWins}â€“{awayWins}</span>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€â”€ Register Button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function RegisterButton({ tournamentId, status, isFull }: { tournamentId: number; status: string; isFull: boolean }) {
  const { user, isLoading: authLoading, loginWithDiscord } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: regData, isLoading: regLoading } = useQuery({
    queryKey: ["tournament-registration", tournamentId],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/my-registration`, { credentials: "include" });
      return res.json() as Promise<{ registered: boolean }>;
    },
    enabled: !!user,
  });

  const { mutate: register, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/register-me`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "Registration failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "You're registered! ðŸŽ®", description: `Welcome, ${data.displayName ?? data.playerName}` });
      qc.invalidateQueries({ queryKey: ["tournament-registration", tournamentId] });
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (err: Error) => {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    },
  });

  const canRegister = status === "upcoming" || status === "active";

  if (authLoading || regLoading) {
    return <Button disabled className="gap-2 h-12 px-6 text-base"><Loader2 className="w-4 h-4 animate-spin" /> Loadingâ€¦</Button>;
  }

  if (!user) {
    return (
      <Button onClick={loginWithDiscord} className="gap-2 h-12 px-6 text-base font-bold" variant="outline">
        <LogIn className="w-4 h-4" /> Login with Discord to Register
      </Button>
    );
  }

  if (regData?.registered) {
    return (
      <Button disabled className="gap-2 h-12 px-6 text-base font-bold bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/20 cursor-default">
        <CheckCircle2 className="w-4 h-4" /> You're Registered
      </Button>
    );
  }

  if (!canRegister) {
    return (
      <Button disabled className="gap-2 h-12 px-6 text-base font-bold" variant="outline">
        <ShieldOff className="w-4 h-4" /> Registration Closed
      </Button>
    );
  }

  if (isFull) {
    return (
      <Button disabled className="gap-2 h-12 px-6 text-base font-bold" variant="outline">
        <Users className="w-4 h-4" /> Tournament Full
      </Button>
    );
  }

  return (
    <Button
      onClick={() => register()}
      disabled={isPending}
      className="gap-2 h-12 px-8 text-base font-bold bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 border-0"
    >
      {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Registeringâ€¦</> : <><Trophy className="w-4 h-4" /> Register Now</>}
    </Button>
  );
}

function TournamentAdminPanel({ tournamentId, createdBy }: { tournamentId: number; createdBy?: number | null }) {
  const { user, isAdmin: isGlobalAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState("");

  const { data: admins = [] } = useQuery<any[]>({
    queryKey: ["tournament-admins", tournamentId],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/admins`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tournament admins");
      return res.json();
    },
  });
  const { data: players = [] } = useQuery<any[]>({
    queryKey: ["discord-players-for-tournament-admins"],
    queryFn: async () => {
      const res = await fetch("/api/players/discord-registered", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: open,
  });

  const canManage = !!user && (isGlobalAdmin || user.id === createdBy || admins.some((admin) => admin.playerId === user.id));
  if (!canManage) return null;

  async function updateAdmin(method: "POST" | "DELETE", targetId: number) {
    setError("");
    const url = method === "POST"
      ? `/api/tournaments/${tournamentId}/admins`
      : `/api/tournaments/${tournamentId}/admins/${targetId}`;
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify({ playerId: targetId }) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Could not update tournament admins"); return; }
    setPlayerId("");
    qc.invalidateQueries({ queryKey: ["tournament-admins", tournamentId] });
  }

  const availablePlayers = players.filter((player) => !admins.some((admin) => admin.playerId === player.id));
  return (
    <div className="mb-8 rounded-xl border border-primary/25 bg-primary/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Tournament staff</p>
          <h2 className="text-lg font-black">Manage tournament admins</h2>
          <p className="text-xs text-muted-foreground mt-1">Add trusted Discord members to help manage this tournament.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setOpen((value) => !value); setError(""); }}>
          <UserPlus className="w-4 h-4 mr-2" /> {open ? "Close" : "Manage admins"}
        </Button>
      </div>
      {open && (
        <div className="mt-4 space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={playerId} onChange={(event) => setPlayerId(event.target.value)} className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Select a Discord memberâ€¦</option>
              {availablePlayers.map((player) => <option key={player.id} value={player.id}>{player.displayName ?? player.username}</option>)}
            </select>
            <Button size="sm" disabled={!playerId} onClick={() => updateAdmin("POST", Number(playerId))}>Add admin</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {admins.map((admin) => (
              <div key={admin.id} className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs">
                <span className="font-bold">{admin.displayName ?? admin.username}</span>
                <span className="text-muted-foreground">{admin.role === "owner" ? "Owner" : "Admin"}</span>
                {admin.playerId !== createdBy && <button aria-label={`Remove ${admin.displayName ?? admin.username}`} onClick={() => updateAdmin("DELETE", admin.playerId)} className="text-muted-foreground hover:text-destructive"><UserMinus className="w-3.5 h-3.5" /></button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Format Config

type TournamentFormat = "single-elimination" | "double-elimination" | "round-robin" | "group-stage" | "group-stage-knockout" | "round-robin-knockout";

interface FormatConfig {
  label: string;
  hasTable: boolean;
  hasGroups: boolean;
  hasKnockout: boolean;
  competitionTabLabel: string;
  competitionTabIcon: typeof Table2;
}

const FORMAT_CONFIG: Record<TournamentFormat, FormatConfig> = {
  "round-robin": { label: "Table", hasTable: true, hasGroups: false, hasKnockout: false, competitionTabLabel: "Table", competitionTabIcon: Table2 },
  "group-stage": { label: "Groups", hasTable: false, hasGroups: true, hasKnockout: false, competitionTabLabel: "Groups", competitionTabIcon: LayoutGrid },
  "group-stage-knockout": { label: "Groups + Knockout", hasTable: false, hasGroups: true, hasKnockout: true, competitionTabLabel: "Groups", competitionTabIcon: LayoutGrid },
  "single-elimination": { label: "Knockout", hasTable: false, hasGroups: false, hasKnockout: true, competitionTabLabel: "Knockout", competitionTabIcon: Swords },
  "double-elimination": { label: "Knockout", hasTable: false, hasGroups: false, hasKnockout: true, competitionTabLabel: "Knockout", competitionTabIcon: Swords },
  "round-robin-knockout": { label: "Table + Knockout", hasTable: true, hasGroups: false, hasKnockout: true, competitionTabLabel: "Table", competitionTabIcon: Table2 },
};

function getFormatConfig(format: string | undefined): FormatConfig {
  return FORMAT_CONFIG[format as TournamentFormat] ?? FORMAT_CONFIG["single-elimination"];
}

// â”€â”€â”€ Tab Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface TabDef {
  key: string;
  label: string;
  icon: React.ElementType;
}

function TournamentTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-2 mb-8 border-b border-border">
      {tabs.map((t) => {
        const isActive = active === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`relative flex items-center gap-2 px-5 py-2.5 rounded-t-lg text-sm font-bold uppercase tracking-wider whitespace-nowrap transition-all
              ${isActive
                ? "text-[var(--acc)] bg-[var(--acc)]/5 border-b-2 border-[var(--acc)]"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30 border-b-2 border-transparent"
              }`}
          >
            <Icon className="w-4 h-4" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Group Standings

function buildGroupStandings(matches: Match[]) {
  const groups = new Map<string, Map<number, Standing>>();

  function ensure(group: string, id: number, name: string) {
    if (!groups.has(group)) groups.set(group, new Map());
    const map = groups.get(group)!;
    if (!map.has(id)) map.set(id, { id, name, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
    return map.get(id)!;
  }

  for (const m of matches) {
    const group = m.roundName ?? "Group";
    const p1id = m.participant1Id ?? 0;
    const p2id = m.participant2Id ?? 0;
    if (!p1id || !p2id) continue;

    ensure(group, p1id, m.participant1Name ?? `Team ${p1id}`);
    ensure(group, p2id, m.participant2Name ?? `Team ${p2id}`);

    if (m.status !== "completed") continue;

    const p1 = ensure(group, p1id, m.participant1Name ?? `Team ${p1id}`);
    const p2 = ensure(group, p2id, m.participant2Name ?? `Team ${p2id}`);
    const g1 = m.participant1Score ?? 0;
    const g2 = m.participant2Score ?? 0;

    p1.mp++; p2.mp++;
    p1.gf += g1; p1.ga += g2;
    p2.gf += g2; p2.ga += g1;

    if (m.winnerId === p1id) { p1.w++; p1.pts += 3; p2.l++; }
    else if (m.winnerId === p2id) { p2.w++; p2.pts += 3; p1.l++; }
    else { p1.d++; p1.pts += 1; p2.d++; p2.pts += 1; }
  }

  const result: Array<{ group: string; standings: Standing[] }> = [];
  for (const [group, map] of groups) {
    const standings = Array.from(map.values())
      .map((s) => ({ ...s, gd: s.gf - s.ga }))
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
    result.push({ group, standings });
  }
  return result.sort((a, b) => a.group.localeCompare(b.group));
}

function GroupStandings({ matches, logoMap = {} }: { matches: Match[]; logoMap?: Record<string, string | null> }) {
  const groups = useMemo(() => buildGroupStandings(matches), [matches]);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        <LayoutGrid className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No group matches generated yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(({ group, standings }) => (
        <div key={group} className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/40 px-4 py-3 border-b border-border">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{group}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-8">#</th>
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Team</th>
                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">MP</th>
                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">W</th>
                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">D</th>
                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">L</th>
                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">GD</th>
                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-black">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{i + 1}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {logoMap[s.name] ? (
                        <img src={logoMap[s.name]!} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 ring-1 ring-border" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-muted border border-border shrink-0 flex items-center justify-center text-[9px] font-black text-muted-foreground">
                          {s.name.charAt(0)}
                        </div>
                      )}
                      <span className="font-bold text-foreground">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{s.mp}</td>
                  <td className="px-3 py-2 text-center text-emerald-400 font-bold">{s.w}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{s.d}</td>
                  <td className="px-3 py-2 text-center text-red-400 font-bold">{s.l}</td>
                  <td className="px-3 py-2 text-center font-mono">{s.gd > 0 ? `+${s.gd}` : s.gd}</td>
                  <td className="px-3 py-2 text-center font-black text-foreground">{s.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Tournament Stats Component Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function TournamentStatsView({
  stats,
  logoMap = {},
}: {
  stats: Array<{ playerId: number; name: string; matches: number; wins: number; losses: number; draws: number; goalsFor: number; goalsAgainst: number; points: number }>;
  logoMap?: Record<string, string | null>;
}) {
  if (stats.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No stats available yet. Complete some matches to see tournament player rankings.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-12">#</th>
            <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Player</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">MP</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">W</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">D</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">L</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">GF</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">GA</th>
            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-black">Pts</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={s.playerId} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
              <td className="px-4 py-3">
                {i === 0 ? (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-black">1</span>
                ) : i === 1 ? (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-400/20 text-slate-300 text-xs font-black">2</span>
                ) : i === 2 ? (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-700/20 text-orange-400 text-xs font-black">3</span>
                ) : (
                  <span className="text-muted-foreground font-mono text-xs">{i + 1}</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {logoMap[s.name] ? (
                    <img src={logoMap[s.name]!} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-border" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-muted border border-border shrink-0 flex items-center justify-center text-[10px] font-black text-muted-foreground">
                      {s.name.charAt(0)}
                    </div>
                  )}
                  <span className="font-bold text-foreground">{s.name}</span>
                </div>
              </td>
              <td className="px-3 py-3 text-center text-muted-foreground">{s.matches}</td>
              <td className="px-3 py-3 text-center text-emerald-400 font-bold">{s.wins}</td>
              <td className="px-3 py-3 text-center text-muted-foreground">{s.draws}</td>
              <td className="px-3 py-3 text-center text-red-400 font-bold">{s.losses}</td>
              <td className="px-3 py-3 text-center font-mono">{s.goalsFor}</td>
              <td className="px-3 py-3 text-center font-mono">{s.goalsAgainst}</td>
              <td className="px-3 py-3 text-center font-black text-foreground">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


export default function TournamentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const { data: tournament, isLoading } = useGetTournament(id);
  const { data: bracket } = useGetTournamentBracket(id);
  const { data: matches } = useGetTournamentMatches(id);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const { data: participants = [] } = useQuery<TournamentParticipant[]>({
    queryKey: ["tournament-participants", id],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${id}/participants`);
      return res.json();
    },
    enabled: !!id,
  });

  const [activeTab, setActiveTab] = useState("overview");

  const { data: tournamentStats = [] } = useQuery<
    Array<{ playerId: number; name: string; matches: number; wins: number; losses: number; draws: number; goalsFor: number; goalsAgainst: number; points: number }>
  >({
    queryKey: ["tournament-stats", id],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${id}/stats`);
      if (!res.ok) throw new Error("Failed to load tournament stats");
      return res.json();
    },
    enabled: !!id,
  });

  const teamLogoMap = useMemo<Record<string, string | null>>(() => {
    const m: Record<string, string | null> = {};
    participants.forEach((p) => {
      const name = p.teamName ?? "";
      if (name) m[name] = p.teamLogoUrl ?? null;
    });
    return m;
  }, [participants]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16">
        <Skeleton className="h-12 w-64 mb-4" />
        <Skeleton className="h-6 w-96 mb-8" />
        <div className="grid md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Tournament not found</p>
        <Button variant="ghost" className="mt-4" asChild><Link href="/tournaments">Back</Link></Button>
      </div>
    );
  }

  // The API returns tournamentType but the generated type is stale â€” cast through unknown
  const isTeamTournament = (tournament as unknown as { tournamentType?: string }).tournamentType === "team";
  const createdBy = (tournament as unknown as { createdBy?: number | null }).createdBy;

  const fmt = getFormatConfig(tournament.format);

  const tabs: TabDef[] = [{ key: "overview", label: "Overview", icon: Info }];
  if (fmt.hasTable) tabs.push({ key: "table", label: "Table", icon: Table2 });
  if (fmt.hasGroups) tabs.push({ key: "groups", label: "Groups", icon: LayoutGrid });
  if (fmt.hasKnockout) tabs.push({ key: "knockout", label: "Knockout", icon: Swords });
  tabs.push({ key: "fixtures", label: "Fixtures", icon: Calendar });
  tabs.push({ key: "stats", label: "Stats", icon: BarChart3 });

  return (
    <div className="container mx-auto px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground" asChild>
          <Link href="/tournaments"><ArrowLeft className="w-4 h-4" /> Tournaments</Link>
        </Button>

        {/* Header */}
        <div className="wg-hero px-6 py-8 mb-8">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Badge className={`text-[10px] uppercase tracking-widest ${statusColors[tournament.status] ?? ""}`}>
              {tournament.status}
            </Badge>
            <span className="text-xs text-muted-foreground">{tournament.game}</span>
            {isTeamTournament && (
              <>
                <span className="text-xs text-muted-foreground">â€¢</span>
                <span className="wg-chip">Team League</span>
              </>
            )}
            {!isTeamTournament && (
              <>
                <span className="text-xs text-muted-foreground">â€¢</span>
                <span className="text-xs text-muted-foreground capitalize">{tournament.format.replace(/-/g, " ")}</span>
              </>
            )}
          </div>
          <div className="flex flex-col md:flex-row md:items-end gap-6">
            <div className="flex-1">
              <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">{tournament.name}</h1>
              {tournament.description && (
                <p className="text-muted-foreground text-lg max-w-2xl">{tournament.description}</p>
              )}
            </div>
            {!isTeamTournament && (
              <div className="shrink-0">
                <RegisterButton
                  tournamentId={tournament.id}
                  status={tournament.status}
                  isFull={tournament.maxParticipants < 9999 && tournament.currentParticipants >= tournament.maxParticipants}
                />
              </div>
            )}
          </div>
        </div>

        <TournamentAdminPanel tournamentId={tournament.id} createdBy={createdBy} />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { label: "Prize Pool", value: tournament.prizePool, icon: Trophy },
            {
              label: isTeamTournament ? "Teams" : "Participants",
              value: tournament.maxParticipants >= 9999
                ? String(tournament.currentParticipants)
                : `${tournament.maxParticipants}/${tournament.maxParticipants}`,
              icon: isTeamTournament ? Shield : Users,
            },
            {
              label: "Start Date",
              value: tournament.startDate
                ? new Date(tournament.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "TBD",
              icon: Calendar,
            },
            { label: "Winner", value: tournament.winnerName ?? "TBD", icon: Trophy },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="wg-stat flex flex-col gap-2">
              <Icon className="w-5 h-5 text-[var(--acc)]" />
              <div className="wg-val text-xl">{value}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>

        {/* Stream link */}
        {tournament.streamUrl && (
          <div className="mb-10">
            <Button className="gap-2" asChild>
              <a href={tournament.streamUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" /> Watch Stream
              </a>
            </Button>
          </div>
        )}

        <TournamentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {/* Overview: registered participants */}
              <div className="mb-8">
                <h2 className="wg-section-title text-xl font-black uppercase tracking-tight mb-4">Registered Participants</h2>
                {participants.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No participants registered yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {participants.map((p) => (
                      <div key={p.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-3">
                        {p.teamLogoUrl || p.avatarUrl ? (
                          <img src={p.teamLogoUrl || p.avatarUrl || ""} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-border" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-muted border border-border shrink-0 flex items-center justify-center text-[10px] font-black text-muted-foreground">
                            {(p.teamName || p.displayName || "?").charAt(0)}
                          </div>
                        )}
                        <span className="text-sm font-bold truncate">{p.teamName || p.displayName || "Unknown"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {tournament.rules && (
                <div className="mb-8">
                  <h2 className="wg-section-title text-xl font-black uppercase tracking-tight mb-4">Rules</h2>
                  <div className="rounded-xl border border-border bg-card p-5 whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                    {tournament.rules}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "table" && (
            <motion.div key="table" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="wg-section-title text-xl font-black uppercase tracking-tight">League Table</h2>
                <span className="text-xs text-muted-foreground">
                  {matches && matches.filter((m) => m.status === "completed").length} of {matches?.length ?? 0} matches played
                </span>
              </div>
              <LeagueTable matches={matches ?? []} totalTeams={tournament.currentParticipants} logoMap={teamLogoMap} />
            </motion.div>
          )}

          {activeTab === "groups" && (
            <motion.div key="groups" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="mb-4">
                <h2 className="wg-section-title text-xl font-black uppercase tracking-tight">Group Standings</h2>
              </div>
              <GroupStandings matches={matches ?? []} logoMap={teamLogoMap} />
            </motion.div>
          )}

          {activeTab === "knockout" && (
            <motion.div key="knockout" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {bracket && bracket.rounds.length > 0 ? (
                <TournamentBracket rounds={bracket.rounds} />
              ) : (
                <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
                  <Swords className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Knockout bracket not generated yet.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "fixtures" && (
            <motion.div key="fixtures" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {matches && matches.length > 0 ? (
                <div className="space-y-2">
                  {Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => (a ?? 0) - (b ?? 0)).map((round) => {
                    const roundMatches = matches.filter((m) => m.round === round);
                    return (
                      <div key={round} className="rounded-xl border border-border overflow-hidden">
                        <div className="bg-muted/30 px-4 py-2 border-b border-border">
                          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            {roundMatches[0]?.roundName ?? `Matchday ${round}`}
                          </span>
                        </div>
                        {roundMatches.map((match) => {
                          const done = match.status === "completed";
                          const live = match.status === "live";
                          const p1Win = done && match.winnerId === match.participant1Id;
                          const p2Win = done && match.winnerId === match.participant2Id;
                          const logo1 = teamLogoMap[match.participant1Name ?? ""];
                          const logo2 = teamLogoMap[match.participant2Name ?? ""];
                          return (
                            <div
                              key={match.id}
                              className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/10 transition-colors cursor-pointer group"
                              onClick={() => setSelectedMatch(match)}
                            >
                              <div className="flex-1 flex items-center justify-end gap-2.5">
                                <span className={`font-bold text-sm truncate text-right ${p1Win ? "text-emerald-400" : ""}`}>
                                  {match.participant1Name ?? "TBD"}
                                </span>
                                {logo1 ? (
                                  <img src={logo1} alt="" className={`w-9 h-9 rounded-full object-cover shrink-0 ring-2 ${p1Win ? "ring-emerald-500" : "ring-border"}`} />
                                ) : (
                                  <div className={`w-9 h-9 rounded-full bg-muted border shrink-0 flex items-center justify-center text-[10px] font-black text-muted-foreground ${p1Win ? "border-emerald-500" : "border-border"}`}>
                                    {(match.participant1Name ?? "?").charAt(0)}
                                  </div>
                                )}
                              </div>
                              <div className="text-center min-w-[72px] shrink-0">
                                {done ? (
                                  <span className="font-mono font-black text-base tabular-nums">
                                    {match.participant1Score} – {match.participant2Score}
                                  </span>
                                ) : live ? (
                                  <span className="flex items-center justify-center gap-1 text-red-400 font-bold text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs font-bold">vs</span>
                                )}
                              </div>
                              <div className="flex-1 flex items-center gap-2.5">
                                {logo2 ? (
                                  <img src={logo2} alt="" className={`w-9 h-9 rounded-full object-cover shrink-0 ring-2 ${p2Win ? "ring-emerald-500" : "ring-border"}`} />
                                ) : (
                                  <div className={`w-9 h-9 rounded-full bg-muted border shrink-0 flex items-center justify-center text-[10px] font-black text-muted-foreground ${p2Win ? "border-emerald-500" : "border-border"}`}>
                                    {(match.participant2Name ?? "?").charAt(0)}
                                  </div>
                                )}
                                <span className={`font-bold text-sm truncate ${p2Win ? "text-emerald-400" : ""}`}>
                                  {match.participant2Name ?? "TBD"}
                                </span>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
                  <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No fixtures scheduled yet.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "stats" && (
            <motion.div key="stats" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="mb-4">
                <h2 className="wg-section-title text-xl font-black uppercase tracking-tight">Tournament Player Rankings</h2>
                <p className="text-sm text-muted-foreground mt-1">Statistics calculated from completed matches in this tournament only.</p>
              </div>
              <TournamentStatsView stats={tournamentStats} logoMap={teamLogoMap} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Match detail dialog */}
        {selectedMatch && (
          <MatchDetailDialog match={selectedMatch} onClose={() => setSelectedMatch(null)} logoMap={teamLogoMap} />
        )}
      </motion.div>
    </div>
  );
}
