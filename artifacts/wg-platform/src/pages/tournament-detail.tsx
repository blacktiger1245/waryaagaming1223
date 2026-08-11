import { useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { Trophy, Users, Calendar, ExternalLink, ArrowLeft, CheckCircle2, Loader2, LogIn, ShieldOff, Shield, ChevronRight, UserPlus, UserMinus, Search, X } from "lucide-react";
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

// ─── League Table ─────────────────────────────────────────────────────────────

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

  const promotionCutoff = Math.ceil(totalTeams * 0.25); // top 25% → Champions League green
  const europaEnd = Math.ceil(totalTeams * 0.40);       // next 15% → Europa orange
  const relegationStart = totalTeams - Math.floor(totalTeams * 0.15); // bottom 15% → relegation red

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

// ─── Match Detail Dialog (public, read-only player matchups) ──────────────────

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
                  {match.participant1Score} – {match.participant2Score}
                </div>
              ) : live ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="flex items-center gap-1 text-red-400 font-bold text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                  </span>
                  {played > 0 && <span className="text-xl font-black tabular-nums">{homeWins} – {awayWins}</span>}
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
                        {game.homePlayerName || "—"}
                      </span>
                    </div>
                    <div className="text-center min-w-[64px]">
                      {gDone ? (
                        <span className={`font-mono font-black text-base tabular-nums ${hWin || aWin ? "" : "text-muted-foreground"}`}>
                          {game.homeScore} – {game.awayScore}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs font-bold">vs</span>
                      )}
                    </div>
                    <div>
                      <span className={`text-sm font-bold ${aWin ? "text-emerald-400" : ""}`}>
                        {game.awayPlayerName || "—"}
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
              <span className="font-black text-emerald-400">{match.participant1Name} leads {homeWins}–{awayWins}</span>
            ) : awayWins > homeWins ? (
              <span className="font-black text-emerald-400">{match.participant2Name} leads {awayWins}–{homeWins}</span>
            ) : (
              <span className="font-bold text-muted-foreground">Tied {homeWins}–{awayWins}</span>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Register Button ──────────────────────────────────────────────────────────

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
      toast({ title: "You're registered! 🎮", description: `Welcome, ${data.displayName ?? data.playerName}` });
      qc.invalidateQueries({ queryKey: ["tournament-registration", tournamentId] });
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (err: Error) => {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    },
  });

  const canRegister = status === "upcoming" || status === "active";

  if (authLoading || regLoading) {
    return <Button disabled className="gap-2 h-12 px-6 text-base"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</Button>;
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
      {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Registering…</> : <><Trophy className="w-4 h-4" /> Register Now</>}
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
              <option value="">Select a Discord member…</option>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

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

  // The API returns tournamentType but the generated type is stale — cast through unknown
  const isTeamTournament = (tournament as unknown as { tournamentType?: string }).tournamentType === "team";
  const createdBy = (tournament as unknown as { createdBy?: number | null }).createdBy;

  return (
    <div className="container mx-auto px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground" asChild>
          <Link href="/tournaments"><ArrowLeft className="w-4 h-4" /> Tournaments</Link>
        </Button>

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <Badge className={`text-[10px] uppercase tracking-widest ${statusColors[tournament.status] ?? ""}`}>
              {tournament.status}
            </Badge>
            <span className="text-xs text-muted-foreground">{tournament.game}</span>
            {isTeamTournament && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="flex items-center gap-1 text-xs text-teal-400 font-bold">
                  <Shield className="w-3 h-3" /> Team League
                </span>
              </>
            )}
            {!isTeamTournament && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground capitalize">{tournament.format.replace(/-/g, " ")}</span>
              </>
            )}
          </div>
          <div className="flex flex-col md:flex-row md:items-end gap-6">
            <div className="flex-1">
              <h1 className="text-5xl font-black uppercase tracking-tight mb-4">{tournament.name}</h1>
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
                : `${tournament.currentParticipants}/${tournament.maxParticipants}`,
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
            <div key={label} className="rounded-xl border border-border bg-card p-5">
              <Icon className="w-5 h-5 text-primary mb-3" />
              <div className="text-xl font-black">{value}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{label}</div>
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

        {/* ── TEAM TOURNAMENT: League Table + Fixtures ── */}
        {isTeamTournament && (
          <>
            <div className="mb-12">
              <h2 className="text-2xl font-black uppercase tracking-tight mb-2">League Table</h2>
              <p className="text-sm text-muted-foreground mb-6">
                {matches && matches.filter((m) => m.status === "completed").length} of{" "}
                {matches?.length ?? 0} matches played
              </p>
              <LeagueTable
                matches={matches ?? []}
                totalTeams={tournament.currentParticipants}
                logoMap={teamLogoMap}
              />
            </div>

            {matches && matches.length > 0 && (
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight mb-6">Fixtures & Results</h2>
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
                              {/* Home team */}
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
                              {/* Score / status */}
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
                              {/* Away team */}
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
                              {/* Detail cue */}
                              <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Match detail dialog */}
        {selectedMatch && (
          <MatchDetailDialog
            match={selectedMatch}
            onClose={() => setSelectedMatch(null)}
            logoMap={teamLogoMap}
          />
        )}

        {/* ── SOLO TOURNAMENT: Bracket + Schedule ── */}
        {!isTeamTournament && bracket && bracket.rounds.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-black uppercase tracking-tight mb-6">Tournament Bracket</h2>
            <div className="overflow-x-auto">
              <div className="flex gap-6 min-w-max pb-4">
                {bracket.rounds.map((round) => (
                  <div key={round.roundNumber} className="flex flex-col gap-4">
                    <div className="text-xs font-bold uppercase tracking-widest text-primary text-center mb-2">
                      {round.name}
                    </div>
                    <div className="flex flex-col justify-around gap-4" style={{ minHeight: `${round.matches.length * 80}px` }}>
                      {round.matches.map((match) => (
                        <div key={match.id} className="w-48 rounded-lg border border-border bg-card p-3">
                          <div className={`flex justify-between items-center py-1 ${match.winnerId === match.participant1Id ? "text-primary font-black" : "text-foreground"}`}>
                            <span className="text-sm truncate">{match.participant1Name ?? "TBD"}</span>
                            <span className="text-sm font-mono ml-2">{match.participant1Score ?? "-"}</span>
                          </div>
                          <div className="border-t border-border my-1" />
                          <div className={`flex justify-between items-center py-1 ${match.winnerId === match.participant2Id ? "text-primary font-black" : "text-foreground"}`}>
                            <span className="text-sm truncate">{match.participant2Name ?? "TBD"}</span>
                            <span className="text-sm font-mono ml-2">{match.participant2Score ?? "-"}</span>
                          </div>
                          <div className={`text-[10px] uppercase tracking-wider mt-1 ${matchStatusColors[match.status]}`}>
                            {match.status === "live" && <span className="live-pulse inline-block mr-1 w-1.5 h-1.5 rounded-full bg-red-500" />}
                            {match.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!isTeamTournament && matches && matches.length > 0 && (
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight mb-6">Match Schedule</h2>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Round</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Match</th>
                    <th className="text-center px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Score</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((match, i) => (
                    <tr key={match.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-card" : ""}`}>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{match.roundName ?? `R${match.round}`}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold">{match.participant1Name ?? "TBD"}</span>
                        <span className="text-muted-foreground mx-2">vs</span>
                        <span className="font-bold">{match.participant2Name ?? "TBD"}</span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-bold">
                        {match.participant1Score !== null && match.participant2Score !== null
                          ? `${match.participant1Score} - ${match.participant2Score}`
                          : "— vs —"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold uppercase tracking-wider ${matchStatusColors[match.status]}`}>
                          {match.status === "live" && <span className="inline-block mr-1 w-1.5 h-1.5 rounded-full bg-red-500 live-pulse" />}
                          {match.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
