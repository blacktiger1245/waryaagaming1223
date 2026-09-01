import { useState, useRef, useMemo, useEffect } from "react";
import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Users, Trophy, ArrowLeft, UserCircle2,
  Star, Crown, TrendingUp, ChevronRight, Calendar, Clock, Swords,
  UserPlus, UserMinus, RefreshCw, Search, X, Check, AlertTriangle, ArrowLeftRight,
  MessageCircle, Lock, Send, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { marketValueLabel } from "@/lib/player-stats";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGetTeam } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueries, useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@workspace/object-storage-web";
import { storageUrl } from "@/lib/api";
import { social, type TeamChatMessage } from "@/lib/social";
import ClubCard from "@/components/club-card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

// ── types ──────────────────────────────────────────────────────────────────────
type TeamTab = "info" | "squad" | "fixtures" | "matches" | "stats" | "table" | "round" | "ranking" | "transfer" | "news" | "club-card" | "chat";

// ── StatCard ───────────────────────────────────────────────────────────────────
function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <p className="text-sm text-zinc-400 mb-2">{label}</p>
      <p className={`text-4xl font-black tracking-tight ${accent ?? "text-white"}`}>{value}</p>
    </div>
  );
}

// ── StarRating ─────────────────────────────────────────────────────────────────
function StarRating({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < value ? "text-yellow-400 fill-yellow-400" : "text-zinc-700 fill-zinc-700"}`}
        />
      ))}
    </div>
  );
}

// ── StatCell ───────────────────────────────────────────────────────────────────
function StatCell({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 px-5 py-3 border-r border-zinc-800 last:border-r-0">
      <span className={`text-xl font-black ${accent ?? "text-white"}`}>{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
    </div>
  );
}

// ── InfoRow ────────────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-zinc-800 last:border-b-0">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="text-sm font-bold text-right">{value}</span>
    </div>
  );
}

// ── DetailItem ─────────────────────────────────────────────────────────────────
function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-zinc-800 last:border-b-0">
      <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1">{label}</p>
      <div className="text-sm font-bold">{children}</div>
    </div>
  );
}

// ── LeaderCard ─────────────────────────────────────────────────────────────────
function LeaderCard({
  role, name, avatarUrl, icon,
}: { role: string; name: string; avatarUrl?: string | null; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-zinc-800 last:border-b-0">
      <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden flex-shrink-0">
        {avatarUrl
          ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
          : <UserCircle2 className="w-5 h-5 text-zinc-500" />}
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{role}</p>
        <p className="text-sm font-black flex items-center gap-1.5">
          {name}
          {icon}
        </p>
      </div>
    </div>
  );
}

// ── PlayerCard ─────────────────────────────────────────────────────────────────
function PlayerCard({ member, isCaptain }: { member: any; isCaptain: boolean }) {
  return (
    <Link href={`/players/${member.id}`}>
      <motion.div
        whileHover={{ y: -3 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col items-center gap-3 cursor-pointer hover:border-teal-500/40 transition-colors group"
      >
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 border-2 border-zinc-700 group-hover:border-teal-500/60 transition-colors overflow-hidden flex items-center justify-center">
            {member.avatarUrl
              ? <img src={member.avatarUrl} alt={member.username} className="w-full h-full object-cover" />
              : <UserCircle2 className="w-8 h-8 text-zinc-500" />}
          </div>
          {isCaptain && (
            <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
              <Crown className="w-3 h-3 text-black" />
            </div>
          )}
        </div>

        <div className="text-center w-full">
          <p className="text-sm font-black truncate group-hover:text-teal-400 transition-colors">
            {member.displayName ?? member.username}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">#{member.rank}</p>
        </div>

        <div className="w-full grid grid-cols-2 gap-1 text-center pt-1 border-t border-zinc-800">
          <div>
            <p className="text-xs font-black text-teal-400">{member.matchesWon}</p>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Wins</p>
          </div>
          <div>
            <p className="text-xs font-black text-white">
              {member.matchesPlayed > 0 ? `${(member.winRate * 100).toFixed(0)}%` : "—"}
            </p>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Rate</p>
          </div>
        </div>
        <div className="w-full grid grid-cols-2 gap-1 text-center pt-1 border-t border-zinc-800">
          <div>
            <p className="text-xs font-black text-amber-400">{Math.round(member.points ?? 0)}</p>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Points</p>
          </div>
          <div>
            <p className="text-xs font-black text-emerald-400">{marketValueLabel(member.marketValue ?? 0)}</p>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Value</p>
          </div>
        </div>

      </motion.div>
    </Link>
  );
}

type TransferEvent = {
  id: number;
  playerId: number;
  playerName: string | null;
  playerUsername: string;
  avatarUrl: string | null;
  fromTeamId: number | null;
  fromTeamName: string | null;
  toTeamId: number | null;
  toTeamName: string | null;
  transferredAt: string;
};

function TransferHistory({
  transfers,
  isLoading,
  teamId,
}: {
  transfers: TransferEvent[];
  isLoading: boolean;
  teamId: number;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900" />
        ))}
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-800 py-20 text-center">
        <ArrowLeftRight className="mx-auto mb-3 h-10 w-10 text-zinc-700" />
        <p className="font-bold text-zinc-400">No transfers yet</p>
        <p className="mt-1 text-xs text-zinc-600">Player movements for this team will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transfers.map((transfer) => {
        const incoming = transfer.toTeamId === teamId;
        const playerName = transfer.playerName ?? transfer.playerUsername;
        const from = transfer.fromTeamName ?? "Free agent";
        const to = transfer.toTeamName ?? "Free agent";

        return (
          <Link key={transfer.id} href={`/players/${transfer.playerId}`}>
            <motion.article
              whileHover={{ x: 3 }}
              className="group flex items-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-teal-500/40"
            >
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-400/10 text-teal-400">
                <ArrowLeftRight className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-cyan-400 px-3 py-1 text-[11px] font-black text-slate-950">
                    Transfer
                  </span>
                  <span className="text-xs text-zinc-500">
                    {new Date(transfer.transferredAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-zinc-700 bg-zinc-800">
                    {transfer.avatarUrl ? (
                      <img src={transfer.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <UserCircle2 className="m-2 h-6 w-6 text-zinc-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white group-hover:text-teal-400">
                      {playerName}
                    </p>
                    <p className="truncate text-sm text-zinc-400">
                      {incoming ? "from" : "from"}{" "}
                      <span className="font-semibold text-zinc-300">{from}</span>
                      {" "}to{" "}
                      <span className="font-semibold text-teal-400">{to}</span>
                    </p>
                  </div>
                </div>
              </div>
            </motion.article>
          </Link>
        );
      })}
    </div>
  );
}

// ── Match Player Games Dialog (read-only, shown from team match history) ───────
interface TeamMatchGame {
  id: number;
  homePlayerName?: string | null;
  awayPlayerName?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  status: string;
}

function MatchPlayerGamesDialog({
  match,
  teamId,
  onClose,
}: {
  match: any;
  teamId: number;
  onClose: () => void;
}) {
  const { data: games = [], isLoading } = useQuery<TeamMatchGame[]>({
    queryKey: ["team-match-player-games", match.id],
    queryFn: async () => {
      const r = await fetch(`/api/matches/${match.id}/player-games`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const isP1 = match.participant1Id === teamId;
  const teamScore   = isP1 ? match.participant1Score : match.participant2Score;
  const oppScore    = isP1 ? match.participant2Score : match.participant1Score;
  const teamName    = isP1 ? match.participant1Name  : match.participant2Name;
  const oppName     = isP1 ? match.participant2Name  : match.participant1Name;

  const played  = games.filter(g => g.homeScore != null && g.awayScore != null).length;
  const homeWins = games.filter(g => g.homeScore != null && g.awayScore != null && g.homeScore! > g.awayScore!).length;
  const awayWins = games.filter(g => g.homeScore != null && g.awayScore != null && g.awayScore! > g.homeScore!).length;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-800">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">
                {match.tournamentName ?? "Tournament"}{match.roundName ? ` · ${match.roundName}` : ""}
              </p>
              <div className="flex items-center gap-3">
                <span className="font-black text-lg truncate text-white">{match.participant1Name ?? "TBD"}</span>
                <span className="font-mono font-black text-xl tabular-nums shrink-0">
                  {match.status === "completed"
                    ? `${match.participant1Score ?? 0} – ${match.participant2Score ?? 0}`
                    : "vs"}
                </span>
                <span className="font-black text-lg truncate text-zinc-400">{match.participant2Name ?? "TBD"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Player games */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <Swords className="w-3.5 h-3.5" /> Player Matchups
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-xl" />
              ))}
            </div>
          ) : games.length === 0 ? (
            <div className="text-center py-10 text-zinc-500">
              <Swords className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm font-bold">No player matchups recorded</p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Col headers */}
              <div className="grid grid-cols-[1fr_auto_1fr] gap-3 px-2 pb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-right">{match.participant1Name}</span>
                <span className="w-16" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{match.participant2Name}</span>
              </div>
              {games.map((game, idx) => {
                const done = game.homeScore != null && game.awayScore != null;
                const hWin = done && game.homeScore! > game.awayScore!;
                const aWin = done && game.awayScore! > game.homeScore!;
                return (
                  <motion.div
                    key={game.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-zinc-800/40 transition-colors"
                  >
                    <span className={`text-sm font-bold text-right truncate ${hWin ? "text-green-400" : ""}`}>
                      {game.homePlayerName || "—"}
                    </span>
                    <div className="text-center min-w-[64px]">
                      {done ? (
                        <span className="font-mono font-black text-base tabular-nums">
                          {game.homeScore} – {game.awayScore}
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-xs font-bold">vs</span>
                      )}
                    </div>
                    <span className={`text-sm font-bold truncate ${aWin ? "text-green-400" : ""}`}>
                      {game.awayPlayerName || "—"}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {played > 0 && (
          <div className="px-6 py-3 border-t border-zinc-800 text-center text-sm bg-zinc-900/50">
            {homeWins > awayWins ? (
              <span className="font-black text-green-400">{match.participant1Name} leads {homeWins}–{awayWins}</span>
            ) : awayWins > homeWins ? (
              <span className="font-black text-green-400">{match.participant2Name} leads {awayWins}–{homeWins}</span>
            ) : (
              <span className="font-bold text-zinc-400">Tied {homeWins}–{awayWins}</span>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function TeamDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: team, isLoading } = useGetTeam(id);
  const [activeTab, setActiveTab] = useState<TeamTab>("info");
  const { user } = useAuth();
  const qc = useQueryClient();

  // Squad images
  const { data: squadImages = [], refetch: refetchSquad } = useQuery<any[]>({
    queryKey: ["team-squad-images", id],
    queryFn: async () => {
      const r = await fetch(`/api/teams/${id}/squad-images`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: activeTab === "squad",
  });

  const [squadCaption, setSquadCaption] = useState("");
  const [squadUploadError, setSquadUploadError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const squadFileRef = useRef<HTMLInputElement>(null);

  const { uploadFile, isUploading, progress: uploadProgress } = useUpload({
    basePath: "/api/storage",
    onError: (err) => setSquadUploadError(err.message),
  });

  async function handleSquadUpload(file: File) {
    setSquadUploadError("");
    // Step 1: request presigned URL from squad-image endpoint
    const metaRes = await fetch("/api/storage/uploads/squad-image", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    });
    if (!metaRes.ok) { setSquadUploadError("Could not get upload URL"); return; }
    const { uploadURL, objectPath } = await metaRes.json();

    // Step 2: PUT directly to GCS
    const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!putRes.ok) { setSquadUploadError("Upload to storage failed"); return; }

    // Step 3: save record
    const saveRes = await fetch(`/api/teams/${id}/squad-images`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectPath, caption: squadCaption }),
    });
    if (!saveRes.ok) { setSquadUploadError("Failed to save image"); return; }
    setSquadCaption("");
    if (squadFileRef.current) squadFileRef.current.value = "";
    refetchSquad();
  }

  async function deleteSquadImage(imageId: number) {
    setDeletingId(imageId);
    try {
      await fetch(`/api/teams/${id}/squad-images/${imageId}`, { method: "DELETE", credentials: "include" });
      refetchSquad();
    } finally { setDeletingId(null); }
  }

  // Team fixtures (upcoming scheduled matches)
  const { data: teamFixtures = [], isLoading: fixturesLoading } = useQuery<any[]>({
    queryKey: ["team-fixtures", id],
    queryFn: async () => {
      const r = await fetch(`/api/teams/${id}/fixtures`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: activeTab === "fixtures",
  });

  // Team match history — loaded eagerly so Info tab can use it too
  const { data: rawTeamMatches, isLoading: matchesLoading } = useQuery<any[]>({
    queryKey: ["team-matches", id],
    queryFn: async () => {
      const r = await fetch(`/api/teams/${id}/matches`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });
  const teamMatches = useMemo(() => rawTeamMatches ?? [], [rawTeamMatches]);

  // Selected match for player matchup dialog
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);

  // Derive live W/D/L from actual match history
  const liveStats = useMemo(() => {
    let wins = 0, draws = 0, losses = 0;
    for (const m of teamMatches) {
      if (m.winnerId === id) wins++;
      else if (m.winnerId && m.winnerId !== id) losses++;
      else if (m.participant1Score != null && m.participant2Score != null) {
        const ts = m.participant1Id === id ? m.participant1Score : m.participant2Score;
        const os = m.participant1Id === id ? m.participant2Score : m.participant1Score;
        if (ts > os) wins++;
        else if (ts < os) losses++;
        else draws++;
      }
    }
    const played = wins + draws + losses;
    const wr = played > 0 ? Math.round((wins / played) * 100) : 0;
    const recentForm = teamMatches.slice(0, 10).map(m => {
      if (m.winnerId === id) return "W";
      if (m.winnerId && m.winnerId !== id) return "L";
      const ts = m.participant1Id === id ? m.participant1Score : m.participant2Score;
      const os = m.participant1Id === id ? m.participant2Score : m.participant1Score;
      if (ts != null && os != null) return ts > os ? "W" : ts < os ? "L" : "D";
      return null;
    }).filter(Boolean) as string[];
    return { wins, draws, losses, played, wr, recentForm };
  }, [teamMatches, id]);

  // Derive unique tournament IDs from this team's match history
  const teamTournamentIds = useMemo(() => {
    const seen = new Map<number, string>();
    for (const m of teamMatches) {
      if (m.tournamentId && !seen.has(m.tournamentId)) {
        seen.set(m.tournamentId, m.tournamentName ?? `Tournament ${m.tournamentId}`);
      }
    }
    return Array.from(seen.entries()).map(([tid, name]) => ({ id: tid, name }));
  }, [teamMatches]);

  // Fetch all matches for each tournament so we can build full standings
  const tournamentMatchQueries = useQueries({
    queries: teamTournamentIds.map(({ id: tid }) => ({
      queryKey: ["tournament-matches", tid],
      queryFn: async () => {
        const r = await fetch(`/api/tournaments/${tid}/matches`);
        if (!r.ok) return [] as any[];
        return r.json() as Promise<any[]>;
      },
      enabled: activeTab === "table" && teamTournamentIds.length > 0,
    })),
  });

  const standingsLoading = tournamentMatchQueries.some((q) => q.isLoading);

  // Team news
  const { data: teamNews = [], refetch: refetchNews } = useQuery<any[]>({
    queryKey: ["team-news", id],
    queryFn: async () => {
      const r = await fetch(`/api/teams/${id}/news`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: activeTab === "news",
  });

  const { data: transferHistory = [], isLoading: transfersLoading } = useQuery<TransferEvent[]>({
    queryKey: ["team-transfers", id],
    queryFn: async () => {
      const r = await fetch(`/api/teams/${id}/transfers`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: activeTab === "transfer",
  });

  const [newsTitle, setNewsTitle] = useState("");
  const [newsContent, setNewsContent] = useState("");
  const [newsError, setNewsError] = useState("");
  const [newsPosting, setNewsPosting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function submitNews() {
    setNewsError("");
    if (!newsTitle.trim() || !newsContent.trim()) { setNewsError("Title and content are required."); return; }
    setNewsPosting(true);
    try {
      const r = await fetch(`/api/teams/${id}/news`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newsTitle, content: newsContent }),
      });
      const data = await r.json();
      if (!r.ok) { setNewsError(data.error ?? "Failed to post"); return; }
      setNewsTitle(""); setNewsContent(""); setShowForm(false);
      refetchNews();
    } finally { setNewsPosting(false); }
  }

  // ── Team management state ───────────────────────────────────────────────────
  const isPresident = !!user && user.id === (team as any)?.presidentId;
  const isCoach =
    !!user &&
    (isPresident || user.id === (team as any)?.coachId || user.username === "black_tiger" || user.role === "admin" || user.role === "owner");
  const isCaptain = !!user && user.id === team?.captainId;

  const [kickConfirmId,    setKickConfirmId]    = useState<number | null>(null);
  const [addPlayerOpen,    setAddPlayerOpen]    = useState(false);
  const [changeCaptainId,  setChangeCaptainId]  = useState<number | null>(null); // player to make captain
  const [transferCoachId,  setTransferCoachId]  = useState<number | null>(null); // player to transfer coach to
  const [mgmtLoading,      setMgmtLoading]      = useState(false);
  const [mgmtError,        setMgmtError]        = useState("");
  const [addSearch,        setAddSearch]        = useState("");

  // Free agents — players with no team (loaded only when add-player panel is open)
  const { data: freeAgents = [], isLoading: freeAgentsLoading } = useQuery<any[]>({
    queryKey: ["free-agents"],
    queryFn: async () => {
      const r = await fetch("/api/players/marketplace", { credentials: "include" });
      if (!r.ok) return [];
      const all: any[] = await r.json();
      return all.filter((p: any) => p.teamId == null);
    },
    enabled: addPlayerOpen,
  });

  const filteredFreeAgents = freeAgents.filter((p: any) =>
    !addSearch || (p.displayName ?? p.username ?? "").toLowerCase().includes(addSearch.toLowerCase())
  );

  async function kickPlayer(playerId: number) {
    setMgmtLoading(true); setMgmtError("");
    try {
      const r = await fetch(`/api/teams/${id}/members/${playerId}`, { method: "DELETE", credentials: "include" });
      const d = await r.json();
      if (!r.ok) { setMgmtError(d.error ?? "Failed to remove player"); return; }
      setKickConfirmId(null);
      qc.invalidateQueries({ queryKey: ["team", id] });
      qc.invalidateQueries({ queryKey: ["team-transfers", id] });
    } finally { setMgmtLoading(false); }
  }

  async function addPlayer(playerId: number) {
    setMgmtLoading(true); setMgmtError("");
    try {
      const r = await fetch(`/api/teams/${id}/members`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const d = await r.json();
      if (!r.ok) { setMgmtError(d.error ?? "Failed to add player"); return; }
      setAddPlayerOpen(false); setAddSearch("");
      qc.invalidateQueries({ queryKey: ["team", id] });
      qc.invalidateQueries({ queryKey: ["team-transfers", id] });
    } finally { setMgmtLoading(false); }
  }

  async function changeCaptain(playerId: number) {
    setMgmtLoading(true); setMgmtError("");
    try {
      const r = await fetch(`/api/teams/${id}/captain`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captainId: playerId }),
      });
      const d = await r.json();
      if (!r.ok) { setMgmtError(d.error ?? "Failed to change captain"); return; }
      setChangeCaptainId(null);
      qc.invalidateQueries({ queryKey: ["team", id] });
    } finally { setMgmtLoading(false); }
  }

  async function transferCoach(playerId: number) {
    setMgmtLoading(true); setMgmtError("");
    try {
      const r = await fetch(`/api/teams/${id}/coach`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId: playerId }),
      });
      const d = await r.json();
      if (!r.ok) { setMgmtError(d.error ?? "Failed to transfer coach role"); return; }
      setTransferCoachId(null);
      qc.invalidateQueries({ queryKey: ["team", id] });
    } finally { setMgmtLoading(false); }
  }

  const tabs: { id: TeamTab; label: string }[] = [
    { id: "info",     label: "Info" },
    { id: "squad",    label: "Squad" },
    { id: "fixtures", label: "Fixtures" },
    { id: "matches",  label: "Matches" },
    { id: "stats",    label: "Stats" },
    { id: "table",    label: "Table" },
    { id: "round",    label: "Round" },
    { id: "ranking",  label: "Ranking" },
    { id: "transfer", label: "Transfer" },
    { id: "news",     label: "News" },
    { id: "club-card", label: "Club Card" },
    { id: "chat",     label: "Team Chat" },
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Shield className="w-16 h-16 mx-auto opacity-20 mb-4" />
        <p className="text-zinc-400 font-bold">Team not found</p>
        <Button variant="ghost" className="mt-4 gap-2" asChild>
          <Link href="/teams"><ArrowLeft className="w-4 h-4" /> Back to Teams</Link>
        </Button>
      </div>
    );
  }

  const winRate = liveStats.wr;
  const starRating = liveStats.played > 0
    ? Math.min(5, Math.round((liveStats.wins / liveStats.played) * 5))
    : 0;

  const captain = team.members?.find((m: any) => m.id === team.captainId);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        {/* Back */}
        <Button variant="ghost" size="sm" className="mb-5 gap-1.5 text-zinc-400 hover:text-white" asChild>
          <Link href="/teams"><ArrowLeft className="w-4 h-4" /> Teams</Link>
        </Button>

        {/* ── Hero Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="wg-card rounded-2xl border border-emerald-400/25 bg-gradient-to-b from-emerald-500/[0.07] to-transparent overflow-hidden mb-4 shadow-[0_16px_50px_-30px_rgba(16,185,129,0.6)]"
        >
          {/* Top section: logo + identity */}
          <div className="px-6 pt-7 pb-6 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            {/* Circular logo */}
            <div className="flex-shrink-0">
              <div className="w-24 h-24 rounded-full bg-zinc-900 border-2 border-emerald-400/50 overflow-hidden flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.45)] ring-4 ring-emerald-400/10">
                {storageUrl(team.logoUrl)
                  ? <img src={storageUrl(team.logoUrl)} alt={team.name} className="w-full h-full object-cover" />
                  : <Shield className="w-11 h-11 text-emerald-400" />}
              </div>
            </div>

            {/* Name + tag + description + manager */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-2 mb-1">
                <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-none">{team.name}</h1>
                {team.tag && (
                  <span className="text-xl font-semibold text-emerald-300">({team.tag})</span>
                )}
              </div>
              {team.description && (
                <p className="text-sm text-zinc-400 italic mb-1.5">"{team.description}"</p>
              )}
              {(team as any).coach && (
                <p className="text-sm text-zinc-400">
                  Manager:&nbsp;<span className="font-bold text-white">{(team as any).coach.name}</span>
                </p>
              )}
              {!(team as any).coach && captain && (
                <p className="text-sm text-zinc-400">
                  Captain:&nbsp;<span className="font-bold text-white">{captain.displayName ?? captain.username}</span>
                </p>
              )}
            </div>
          </div>

          {/* Inline stats strip */}
          <div className="border-t border-emerald-400/15 px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-400">
            <span className="flex items-center gap-1.5">Total Players:&nbsp;<strong className="text-white">{team.memberCount ?? 0}</strong></span>
            <span className="flex items-center gap-1.5">Founded:&nbsp;<strong className="text-white">
              {team.createdAt ? new Date(team.createdAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" }) : "—"}
            </strong></span>
            <span className="flex items-center gap-1.5">Location:&nbsp;<strong className="text-white">—</strong></span>
            <span className="flex items-center gap-1.5">Market Value:&nbsp;<strong className="text-emerald-300">Coming Soon</strong></span>
            <span className="flex items-center gap-1.5">Rating:&nbsp;
              <span className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-4 h-4 ${i < starRating ? "text-yellow-400 fill-yellow-400" : "text-zinc-700 fill-zinc-700"}`} />
                ))}
              </span>
            </span>
          </div>
        </motion.div>

        {/* ── Tab bar ── */}
        <div className="bg-zinc-900/80 border border-zinc-800 border-t-0 rounded-b-2xl px-4 py-2.5 flex gap-1 overflow-x-auto mb-6">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all duration-150 ${
                activeTab === t.id
                  ? "bg-emerald-400 text-black shadow-[0_4px_16px_-6px_rgba(16,185,129,0.7)]"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >

            {/* ── INFO ── */}
            {activeTab === "info" && (
              <div className="grid md:grid-cols-2 gap-4">
                {/* Left */}
                <div className="space-y-4">
                  {/* Club Status — live from match history */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="text-sm font-black uppercase tracking-widest text-zinc-300 mb-1">Club Status</h3>
                    <p className="text-xs text-zinc-600 mb-4">Live from match history</p>
                    <InfoRow label="Total Members"  value={<span className="text-teal-400">{team.memberCount ?? 0}</span>} />
                    <InfoRow label="Matches Played" value={liveStats.played} />
                    <InfoRow label="Wins"           value={<span className="text-green-400 font-black">{liveStats.wins}</span>} />
                    <InfoRow label="Draws"          value={<span className="text-yellow-400 font-black">{liveStats.draws}</span>} />
                    <InfoRow label="Losses"         value={<span className="text-red-400 font-black">{liveStats.losses}</span>} />
                    <InfoRow label="Win Rate"       value={<span className="font-black">{liveStats.wr}%</span>} />
                  </div>

                  {/* Recent Form */}
                  {liveStats.recentForm.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                      <h3 className="text-sm font-black uppercase tracking-widest text-zinc-300 mb-3">Recent Form</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        {liveStats.recentForm.map((r, i) => (
                          <div key={i} className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white
                            ${r === "W" ? "bg-green-500" : r === "L" ? "bg-red-500" : "bg-yellow-500"}`}>
                            {r}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Matches */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                    <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                      <h3 className="text-sm font-black uppercase tracking-widest text-zinc-300">Recent Matches</h3>
                      {teamMatches.length > 5 && (
                        <button onClick={() => setActiveTab("matches")}
                          className="text-xs font-bold text-teal-400 hover:text-teal-300 transition-colors">
                          View all →
                        </button>
                      )}
                    </div>
                    {matchesLoading ? (
                      <div className="px-5 pb-5 space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
                      </div>
                    ) : teamMatches.length === 0 ? (
                      <div className="px-5 pb-5 text-center py-6 text-zinc-600 text-sm">No matches played yet</div>
                    ) : (
                      <div>
                        {teamMatches.slice(0, 5).map((match: any) => {
                          const isP1 = match.participant1Id === id;
                          const teamScore = isP1 ? match.participant1Score : match.participant2Score;
                          const oppScore  = isP1 ? match.participant2Score : match.participant1Score;
                          const oppName   = isP1 ? (match.participant2Name ?? "?") : (match.participant1Name ?? "?");
                          let outcome: "W"|"D"|"L"|null = null;
                          if (match.winnerId === id) outcome = "W";
                          else if (match.winnerId && match.winnerId !== id) outcome = "L";
                          else if (teamScore != null && oppScore != null)
                            outcome = teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : "D";
                          const outcomeColor = outcome === "W" ? "text-green-400" : outcome === "L" ? "text-red-400" : "text-yellow-400";
                          return (
                            <div key={match.id}
                              className="flex items-center gap-3 px-5 py-3 border-t border-zinc-800 cursor-pointer hover:bg-zinc-800/40 transition-colors group"
                              onClick={() => setSelectedMatch(match)}>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-zinc-500 truncate">{match.tournamentName ?? "Tournament"}</p>
                                <p className="text-sm font-bold truncate">
                                  vs <span className="text-white">{oppName}</span>
                                  {teamScore != null && oppScore != null && (
                                    <span className="ml-2 font-mono text-zinc-400">{teamScore}–{oppScore}</span>
                                  )}
                                </p>
                              </div>
                              {outcome && (
                                <span className={`text-sm font-black shrink-0 ${outcomeColor}`}>{outcome}</span>
                              )}
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-700 group-hover:text-teal-400 transition-colors shrink-0" />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Club Leadership */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="text-sm font-black uppercase tracking-widest text-zinc-300 mb-4">Club Leadership</h3>
                    {(team as any).president && (
                      <LeaderCard
                        role="President"
                        name={(team as any).president.name}
                        avatarUrl={(team as any).president.avatarUrl}
                        icon={<Crown className="w-3 h-3 text-yellow-400" />}
                      />
                    )}
                    {(team as any).coach && (
                      <LeaderCard
                        role="Coach"
                        name={(team as any).coach.name}
                        avatarUrl={(team as any).coach.avatarUrl}
                        icon={<Shield className="w-3 h-3 text-teal-400" />}
                      />
                    )}
                    {captain && (
                      <LeaderCard
                        role="Captain"
                        name={captain.displayName ?? captain.username}
                        avatarUrl={captain.avatarUrl}
                        icon={<Star className="w-3 h-3 text-blue-400" />}
                      />
                    )}
                    {!(team as any).president && !(team as any).coach && !captain && !team.members?.length && (
                      <p className="text-sm text-zinc-600 py-2">No leadership data yet</p>
                    )}
                  </div>
                </div>

                {/* Right */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 self-start">
                  <h3 className="text-sm font-black uppercase tracking-widest text-zinc-300 mb-4">Club Details</h3>

                  <DetailItem label="Current Ranking">
                    <span className="text-teal-400 text-lg">
                      #{Math.max(1, Math.round(100 - team.points)) || "—"}
                    </span>
                  </DetailItem>

                  <DetailItem label="Current Rating">
                    <StarRating value={starRating} />
                  </DetailItem>

                  <DetailItem label="Market Value">
                    <span className="text-green-400 italic text-xs font-semibold">Coming Soon</span>
                  </DetailItem>

                  {team.achievements && team.achievements.length > 0 && (
                    <DetailItem label="Achievements">
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {team.achievements.map((a: string) => (
                          <span key={a} className="flex items-center gap-1 text-[11px] bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 rounded-lg px-2 py-0.5">
                            <Trophy className="w-2.5 h-2.5" />{a}
                          </span>
                        ))}
                      </div>
                    </DetailItem>
                  )}

                  {team.description && (
                    <DetailItem label="Overview">
                      <span className="text-zinc-300 font-normal text-sm leading-relaxed">{team.description}</span>
                    </DetailItem>
                  )}

                  <DetailItem label="Founded">
                    <span className="text-zinc-300">
                      {team.createdAt ? new Date(team.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—"}
                    </span>
                  </DetailItem>
                </div>
              </div>
            )}

            {/* ── CLUB CARD ── */}
            {activeTab === "club-card" && (
              <ClubCard
                team={team}
                stats={{
                  members: team.memberCount ?? 0,
                  played: liveStats.played,
                  wins: liveStats.wins,
                  draws: liveStats.draws,
                  losses: liveStats.losses,
                }}
              />
            )}

            {/* ── TEAM CHAT (members only) ── */}
            {activeTab === "chat" && <TeamChat teamId={id} />}

            {/* ── SQUAD ── */}
            {activeTab === "squad" && (() => {
              const isCoachOrCaptain = !!user && (user.id === (team as any).coachId || user.id === team.captainId);
              return (
                <div className="space-y-4">
                  {/* Upload panel — coach & captain only */}
                  {isCoachOrCaptain && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                      <h3 className="text-sm font-black uppercase tracking-widest text-zinc-300 mb-4">Add Squad Photo</h3>
                      <div className="space-y-3">
                        <label className="block">
                          <div className="border-2 border-dashed border-zinc-700 hover:border-teal-500 rounded-xl p-6 text-center cursor-pointer transition-colors group">
                            <input
                              ref={squadFileRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={isUploading}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) await handleSquadUpload(file);
                              }}
                            />
                            {isUploading ? (
                              <div className="space-y-2">
                                <div className="w-full bg-zinc-700 rounded-full h-2">
                                  <div
                                    className="bg-teal-400 h-2 rounded-full transition-all"
                                    style={{ width: `${uploadProgress}%` }}
                                  />
                                </div>
                                <p className="text-xs text-zinc-400">Uploading…</p>
                              </div>
                            ) : (
                              <>
                                <Users className="w-8 h-8 mx-auto text-zinc-600 group-hover:text-teal-400 transition-colors mb-2" />
                                <p className="text-sm font-bold text-zinc-400 group-hover:text-white transition-colors">Click to choose an image</p>
                                <p className="text-xs text-zinc-600 mt-1">JPG, PNG, WEBP</p>
                              </>
                            )}
                          </div>
                        </label>
                        <input
                          value={squadCaption}
                          onChange={e => setSquadCaption(e.target.value)}
                          placeholder="Caption (optional)"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-teal-500 transition-colors"
                        />
                        {squadUploadError && (
                          <p className="text-red-400 text-xs font-bold">{squadUploadError}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Image gallery */}
                  {squadImages.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {squadImages.map((img: any) => (
                        <div key={img.id} className="relative group bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                          <img
                            src={`/api/storage${img.objectPath}`}
                            alt={img.caption ?? "Squad photo"}
                            className="w-full aspect-video object-cover"
                          />
                          {img.caption && (
                            <div className="px-4 py-3">
                              <p className="text-sm text-zinc-300">{img.caption}</p>
                            </div>
                          )}
                          {isCoachOrCaptain && (
                            <button
                              onClick={() => deleteSquadImage(img.id)}
                              disabled={deletingId === img.id}
                              className="absolute top-2 right-2 w-7 h-7 bg-black/70 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white text-xs font-black"
                              title="Delete"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* No photos yet — show the squad's players instead (clickable profiles) */
                    <div className="border border-zinc-800 rounded-2xl p-5">
                      <p className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-4">Squad Players</p>
                      {(team.members ?? []).length === 0 ? (
                        <div className="text-center py-12">
                          <Users className="w-12 h-12 mx-auto opacity-20 mb-3" />
                          <p className="font-bold text-zinc-500">No players yet</p>
                          <p className="text-xs text-zinc-600 mt-1">This team hasn't added any players yet</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(team.members as any[]).map((m: any) => (
                            <Link
                              key={m.id}
                              href={`/players/${m.id}`}
                              className="group flex flex-col items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-4 hover:border-teal-400/50 hover:bg-zinc-800/60 transition-colors focus:outline-none"
                            >
                              <div className="w-14 h-14 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center border border-zinc-700 group-hover:border-teal-400/60 transition-colors">
                                {m.avatarUrl
                                  ? <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                                  : <span className="text-lg font-black text-zinc-400">{(m.displayName ?? m.username ?? "?")[0].toUpperCase()}</span>}
                              </div>
                              <span className="text-xs font-bold text-zinc-300 group-hover:text-teal-400 transition-colors text-center truncate w-full">
                                {m.displayName ?? m.username}
                              </span>
                              {m.id === (team as any).presidentId && (
                                <span className="flex items-center gap-0.5 text-[9px] font-black text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-1.5 py-0.5 rounded-full">
                                  <Crown className="w-2 h-2" /> President
                                </span>
                              )}
                              {m.id === team.captainId && (
                                <span className="flex items-center gap-0.5 text-[9px] font-black text-blue-400 bg-blue-400/10 border border-blue-400/20 px-1.5 py-0.5 rounded-full">
                                  <Star className="w-2 h-2" /> Captain
                                </span>
                              )}
                            </Link>
                          ))}
                        </div>
                      )}
                      {isCoachOrCaptain && (
                        <p className="text-xs text-zinc-600 mt-4 text-center">Use the upload panel above to add squad photos</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── FIXTURES ── */}
            {activeTab === "fixtures" && (
              <div className="space-y-3">
                {fixturesLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 animate-pulse">
                      <div className="h-4 bg-zinc-800 rounded w-1/3 mb-3" />
                      <div className="h-6 bg-zinc-800 rounded w-2/3" />
                    </div>
                  ))
                ) : teamFixtures.length === 0 ? (
                  <div className="text-center py-24 border border-zinc-800 rounded-2xl">
                    <Calendar className="w-12 h-12 mx-auto opacity-20 mb-3" />
                    <p className="font-bold text-zinc-400">No upcoming fixtures</p>
                    <p className="text-xs text-zinc-600 mt-1">Scheduled matches will appear here once added to a tournament</p>
                  </div>
                ) : (
                  teamFixtures.map((fixture: any) => {
                    const isP1 = fixture.participant1Id === id;
                    const opponentName = isP1 ? (fixture.participant2Name ?? "TBD") : (fixture.participant1Name ?? "TBD");
                    const scheduledDate = fixture.scheduledAt ? new Date(fixture.scheduledAt) : null;
                    return (
                      <Link key={fixture.id} href={`/matches/${fixture.id}`}>
                        <motion.div
                          whileHover={{ x: 3 }}
                          className="bg-zinc-900 border border-zinc-800 hover:border-teal-500/40 rounded-2xl p-5 cursor-pointer transition-colors group"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              {/* Tournament + round label */}
                              <div className="flex items-center gap-2 mb-2">
                                <Trophy className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                <span className="text-xs font-bold text-zinc-500 truncate">
                                  {fixture.tournamentName ?? "Tournament"}{fixture.roundName ? ` · ${fixture.roundName}` : fixture.round ? ` · Round ${fixture.round}` : ""}
                                </span>
                              </div>
                              {/* Match-up */}
                              <div className="flex items-center gap-3">
                                <span className="text-base font-black text-white truncate">{team.name}</span>
                                <span className="text-xs font-black text-zinc-500 flex-shrink-0">vs</span>
                                <span className="text-base font-black text-teal-400 truncate">{opponentName}</span>
                              </div>
                              {/* Date/time */}
                              {scheduledDate && (
                                <div className="flex items-center gap-1.5 mt-2">
                                  <Clock className="w-3 h-3 text-zinc-600" />
                                  <span className="text-xs text-zinc-500">
                                    {scheduledDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                                    {" · "}
                                    {scheduledDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                  </span>
                                </div>
                              )}
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-teal-400 transition-colors flex-shrink-0" />
                          </div>
                        </motion.div>
                      </Link>
                    );
                  })
                )}
              </div>
            )}

            {/* ── MATCHES ── */}
            {activeTab === "matches" && (
              <div className="space-y-3">
                {matchesLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 animate-pulse">
                      <div className="h-4 bg-zinc-800 rounded w-1/3 mb-3" />
                      <div className="h-6 bg-zinc-800 rounded w-2/3" />
                    </div>
                  ))
                ) : teamMatches.length === 0 ? (
                  <div className="text-center py-24 border border-zinc-800 rounded-2xl">
                    <TrendingUp className="w-12 h-12 mx-auto opacity-20 mb-3" />
                    <p className="font-bold text-zinc-400">No match history yet</p>
                    <p className="text-xs text-zinc-600 mt-1">Completed results will appear here</p>
                  </div>
                ) : (
                  teamMatches.map((match: any) => {
                    const isP1 = match.participant1Id === id;
                    const teamScore    = isP1 ? match.participant1Score : match.participant2Score;
                    const oppScore     = isP1 ? match.participant2Score : match.participant1Score;
                    const opponentName = isP1 ? (match.participant2Name ?? "Unknown") : (match.participant1Name ?? "Unknown");

                    let outcome: "W" | "D" | "L" | null = null;
                    if (match.winnerId === id) outcome = "W";
                    else if (match.winnerId && match.winnerId !== id) outcome = "L";
                    else if (teamScore != null && oppScore != null)
                      outcome = teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : "D";

                    const outcomeBg = outcome === "W" ? "bg-green-500/20 text-green-400 border-green-500/30"
                                    : outcome === "L" ? "bg-red-500/20 text-red-400 border-red-500/30"
                                    : outcome === "D" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                                    : "bg-zinc-800 text-zinc-400 border-zinc-700";

                    const scheduledDate = match.scheduledAt ? new Date(match.scheduledAt) : null;

                    return (
                      <motion.div
                        key={match.id}
                        whileHover={{ x: 3 }}
                        className="bg-zinc-900 border border-zinc-800 hover:border-teal-500/40 rounded-2xl p-5 cursor-pointer transition-colors group"
                        onClick={() => setSelectedMatch(match)}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            {/* Tournament label */}
                            <div className="flex items-center gap-2 mb-2">
                              <Trophy className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                              <span className="text-xs font-bold text-zinc-500 truncate">
                                {match.tournamentName ?? "Tournament"}{match.roundName ? ` · ${match.roundName}` : match.round ? ` · Round ${match.round}` : ""}
                              </span>
                            </div>
                            {/* Match-up + score */}
                            <div className="flex items-center gap-3">
                              <span className="text-base font-black text-white truncate">{team.name}</span>
                              <span className="text-sm font-black text-zinc-300 flex-shrink-0 tabular-nums">
                                {teamScore ?? "—"} – {oppScore ?? "—"}
                              </span>
                              <span className="text-base font-black text-zinc-400 truncate">{opponentName}</span>
                            </div>
                            {/* Date */}
                            {scheduledDate && (
                              <div className="flex items-center gap-1.5 mt-2">
                                <Calendar className="w-3 h-3 text-zinc-600" />
                                <span className="text-xs text-zinc-500">
                                  {scheduledDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </span>
                              </div>
                            )}
                            {/* MOTM */}
                            {match.manOfTheMatchName && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <Star className="w-3 h-3 text-yellow-400" />
                                <span className="text-xs text-zinc-500">MOTM: <span className="text-yellow-400 font-bold">{match.manOfTheMatchName}</span></span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {outcome && (
                              <span className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-black ${outcomeBg}`}>
                                {outcome}
                              </span>
                            )}
                            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-teal-400 transition-colors" />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── STATS ── */}
            {activeTab === "stats" && (() => {
              const { wins, draws, losses, played: totalMatches, wr: wrNum } = liveStats;
              const wr = wrNum.toFixed(1);
              const members: any[] = team.members ?? [];
              const avgMatchesPerPlayer = members.length > 0
                ? (members.reduce((s: number, m: any) => s + (m.matchesPlayed ?? 0), 0) / members.length).toFixed(1)
                : "0.0";
              const iconicPlayers = members.filter((m: any) => (m.winRate ?? 0) > 0.5).length;

              const resultsData = [
                { name: "Wins",   value: wins,   color: "#22c55e" },
                { name: "Draws",  value: draws,  color: "#f59e0b" },
                { name: "Losses", value: losses, color: "#f87171" },
              ];
              const goalsData = [
                { name: "Goals For",     value: 0, color: "#60a5fa" },
                { name: "Goals Against", value: 0, color: "#f87171" },
              ];
              const chartTooltip = {
                contentStyle: { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, color: "#fff" },
                cursor: { fill: "rgba(255,255,255,0.04)" },
              };

              return (
                <div className="space-y-4">
                  {/* Stat cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="Total Matches"   value={totalMatches} />
                    <StatCard label="Win Rate"        value={`${wr}%`} />
                    <StatCard label="Goal Difference" value="—" />
                    <StatCard label="Team Rating"     value={team.points} accent="text-teal-400" />
                  </div>

                  {/* Match Results Breakdown */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="text-lg font-black mb-5">Match Results Breakdown</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={resultsData} barCategoryGap="35%">
                        <CartesianGrid stroke="#3f3f46" strokeDasharray="4 4" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={chartTooltip.contentStyle} cursor={chartTooltip.cursor} formatter={(v: number) => [v, "Value"]} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {resultsData.map((d) => <Cell key={d.name} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Goals Analysis */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="text-lg font-black mb-5">Goals Analysis</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={goalsData} barCategoryGap="35%">
                        <CartesianGrid stroke="#3f3f46" strokeDasharray="4 4" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={chartTooltip.contentStyle} cursor={chartTooltip.cursor} formatter={(v: number) => [v, "Goals"]} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {goalsData.map((d) => <Cell key={d.name} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-zinc-600 text-center mt-2">Goal tracking available once match results include scores</p>
                  </div>

                  {/* Detailed Statistics */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="text-lg font-black mb-4">Detailed Statistics</h3>
                    <div className="grid grid-cols-2 gap-x-12 gap-y-4">
                      {[
                        { label: "Total Wins",      value: wins },
                        { label: "Total Draws",     value: draws },
                        { label: "Total Losses",    value: losses },
                        { label: "Goals For",       value: "—" },
                        { label: "Goals Against",   value: "—" },
                        { label: "Goal Difference", value: "—" },
                      ].map(({ label, value }) => (
                        <div key={label} className="border-b border-zinc-800 pb-3">
                          <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
                          <p className="text-2xl font-black text-white">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Squad Overview */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="text-lg font-black mb-4">Squad Overview</h3>
                    {[
                      { label: "Total Players",         value: team.memberCount ?? 0 },
                      { label: "Iconic Players",         value: iconicPlayers },
                      { label: "Banned Players",         value: 0 },
                      { label: "Average Matches/Player", value: avgMatchesPerPlayer },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between py-3 border-b border-zinc-800 last:border-0">
                        <span className="text-sm text-zinc-400">{label}</span>
                        <span className="text-lg font-black text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── TABLE ── */}
            {activeTab === "table" && (() => {
              // buildStandings inline helper
              function buildStandings(matches: any[]) {
                const map = new Map<number, { id: number; name: string; mp: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number }>();
                function ensure(sid: number, sname: string) {
                  if (!map.has(sid)) map.set(sid, { id: sid, name: sname, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
                  return map.get(sid)!;
                }
                for (const m of matches) {
                  const p1id = m.participant1Id ?? 0;
                  const p2id = m.participant2Id ?? 0;
                  if (!p1id || !p2id) continue;
                  ensure(p1id, m.participant1Name ?? `#${p1id}`);
                  ensure(p2id, m.participant2Name ?? `#${p2id}`);
                  if (m.status !== "completed") continue;
                  const p1 = ensure(p1id, m.participant1Name ?? `#${p1id}`);
                  const p2 = ensure(p2id, m.participant2Name ?? `#${p2id}`);
                  const g1 = m.participant1Score ?? 0;
                  const g2 = m.participant2Score ?? 0;
                  p1.mp++; p2.mp++;
                  p1.gf += g1; p1.ga += g2;
                  p2.gf += g2; p2.ga += g1;
                  if (m.winnerId === p1id) { p1.w++; p1.pts += 3; p2.l++; }
                  else if (m.winnerId === p2id) { p2.w++; p2.pts += 3; p1.l++; }
                  else { p1.d++; p1.pts += 1; p2.d++; p2.pts += 1; }
                }
                return Array.from(map.values())
                  .map((s) => ({ ...s, gd: s.gf - s.ga }))
                  .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
              }

              if (standingsLoading) {
                return (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl h-48 animate-pulse" />
                    ))}
                  </div>
                );
              }

              if (teamTournamentIds.length === 0) {
                return (
                  <div className="text-center py-24 border border-zinc-800 rounded-2xl">
                    <Trophy className="w-12 h-12 mx-auto opacity-20 mb-3" />
                    <p className="font-bold text-zinc-400">No tournament standings yet</p>
                    <p className="text-xs text-zinc-600 mt-1">Standings will appear once the team plays in a tournament</p>
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  {teamTournamentIds.map(({ id: tid, name: tName }, qi) => {
                    const allMatches: any[] = tournamentMatchQueries[qi]?.data ?? [];
                    const standings = buildStandings(allMatches);
                    const myRank = standings.findIndex((s) => s.id === id);
                    const n = standings.length;
                    const promotionCutoff = Math.ceil(n * 0.25);
                    const europaEnd      = Math.ceil(n * 0.40);
                    const relegStart     = n > 1 ? n - Math.floor(n * 0.15) : Infinity;

                    return (
                      <div key={tid} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                        {/* Tournament header */}
                        <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-3">
                          <Trophy className="w-4 h-4 text-teal-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-black text-zinc-300 truncate">{tName}</h3>
                            {myRank >= 0 && (
                              <p className="text-xs text-zinc-500 mt-0.5">
                                {team.name} is <span className="text-teal-400 font-bold">#{myRank + 1}</span> of {n} teams
                              </p>
                            )}
                          </div>
                        </div>

                        {standings.length === 0 ? (
                          <p className="text-center text-sm text-zinc-500 py-8">No completed matches yet.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[520px]">
                              <thead>
                                <tr className="border-b border-zinc-800">
                                  {["#", "Club", "MP", "W", "D", "L", "GF", "GA", "GD", "Pts"].map((h) => (
                                    <th key={h} className={`px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 ${h === "#" || h === "Club" ? "text-left" : "text-center"}`}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {standings.map((s, i) => {
                                  const pos = i + 1;
                                  let borderColor = "border-l-transparent";
                                  if (pos <= promotionCutoff) borderColor = "border-l-emerald-500";
                                  else if (pos <= europaEnd)  borderColor = "border-l-orange-500";
                                  else if (pos >= relegStart) borderColor = "border-l-red-500";

                                  const isMe = s.id === id;
                                  return (
                                    <tr
                                      key={s.id}
                                      className={`border-b border-zinc-800/60 last:border-b-0 border-l-2 ${borderColor} transition-colors
                                        ${isMe ? "bg-teal-400/10" : "hover:bg-zinc-800/40"}`}
                                    >
                                      <td className="px-3 py-3 w-8">
                                        <span className={`text-xs font-black tabular-nums ${isMe ? "text-teal-400" : "text-zinc-500"}`}>{pos}</span>
                                      </td>
                                      <td className="px-3 py-3">
                                        <div className="flex items-center gap-2.5">
                                          <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 shrink-0 flex items-center justify-center text-[9px] font-black text-zinc-500">
                                            {s.name.charAt(0)}
                                          </div>
                                          <span className={`font-bold truncate max-w-[140px] ${isMe ? "text-teal-400" : "text-white"}`}>{s.name}</span>
                                          {isMe && <span className="text-[10px] font-black bg-teal-400 text-black px-1.5 py-0.5 rounded shrink-0">★</span>}
                                        </div>
                                      </td>
                                      <td className="px-3 py-3 text-center tabular-nums text-zinc-400">{s.mp}</td>
                                      <td className="px-3 py-3 text-center tabular-nums text-emerald-400 font-bold">{s.w}</td>
                                      <td className="px-3 py-3 text-center tabular-nums text-zinc-400">{s.d}</td>
                                      <td className="px-3 py-3 text-center tabular-nums text-red-400">{s.l}</td>
                                      <td className="px-3 py-3 text-center tabular-nums text-zinc-400">{s.gf}</td>
                                      <td className="px-3 py-3 text-center tabular-nums text-zinc-400">{s.ga}</td>
                                      <td className="px-3 py-3 text-center tabular-nums text-zinc-500 text-xs font-mono">
                                        {s.gd > 0 ? `+${s.gd}` : s.gd}
                                      </td>
                                      <td className="px-3 py-3 text-center">
                                        <span className={`tabular-nums font-black text-base ${isMe ? "text-teal-400" : "text-white"}`}>{s.pts}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Legend */}
                        <div className="flex flex-wrap gap-4 px-4 py-3 border-t border-zinc-800 bg-zinc-950/40 text-[10px] text-zinc-500">
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Promotion</span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" /> Europa</span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Relegation</span>
                          <span className="flex items-center gap-1.5"><span className="text-teal-400 font-bold">★</span> This team</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── ROUND ── */}
            {activeTab === "round" && (
              <div className="text-center py-24 border border-zinc-800 rounded-2xl">
                <Trophy className="w-12 h-12 mx-auto opacity-20 mb-3" />
                <p className="font-bold text-zinc-400">Round info coming soon</p>
                <p className="text-xs text-zinc-600 mt-1">Round-by-round results will appear here</p>
              </div>
            )}

            {/* ── RANKING ── */}
            {activeTab === "ranking" && (() => {
              const { wins, draws, losses, played: totalMatches, wr: wrNum, recentForm } = liveStats;
              const wr = wrNum.toFixed(1);
              const formColor = (r: string) =>
                r === "W" ? "bg-green-500" : r === "L" ? "bg-red-500" : "bg-yellow-500";
              const statsGrid = [
                { label: "Tournaments",   value: 0 },
                { label: "Matchdays",     value: totalMatches },
                { label: "Games (M)",     value: totalMatches },
                { label: "Wins",          value: wins },
                { label: "Draws",         value: draws },
                { label: "Losses",        value: losses },
                { label: "Goals For",     value: "—" },
                { label: "Goals Against", value: "—" },
                { label: "Goal Diff",     value: "—" },
                { label: "Win %",         value: `${wr}%` },
                { label: "Cup wins",      value: 0 },
              ];
              return (
                <div className="space-y-4">
                  {/* Recent Form */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="text-base font-black mb-4">Recent Form</h3>
                    {recentForm.length > 0 ? (
                      <div className="flex flex-wrap gap-3">
                        {recentForm.map((r, i) => (
                          <div key={i} className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black text-white ${formColor(r)}`}>
                            {r}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700" />
                        ))}
                        <p className="text-xs text-zinc-600 ml-2">No matches played yet</p>
                      </div>
                    )}
                  </div>

                  {/* Club Statistics */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="text-base font-black mb-4">Club Statistics</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {statsGrid.map(({ label, value }) => (
                        <div key={label} className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                          <span className="text-2xl font-black text-white">{value}</span>
                          <span className="text-xs text-zinc-500 mt-1">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Current Rank */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="text-base font-black mb-4">Current Rank</h3>
                    <p className="text-5xl font-black text-white mb-1">
                      #{team.points > 0 ? Math.max(1, Math.round(100 - team.points)) : "—"}
                    </p>
                    <p className="text-sm">
                      <span className="text-teal-400 font-bold">{typeof team.points === "number" ? team.points.toFixed(2) : team.points}</span>
                      <span className="text-zinc-500 ml-1">ranking pts</span>
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* ── TRANSFER / MANAGEMENT ── */}
            {activeTab === "transfer" && (() => {
              const members: any[] = team.members ?? [];
              const canManage = isCoach || isCaptain;

              if (!canManage) {
                return (
                  <div className="space-y-4">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-black">Transfer History</h3>
                        <p className="mt-1 text-xs text-zinc-500">Arrivals and departures recorded for {team.name}</p>
                      </div>
                      <ArrowLeftRight className="h-5 w-5 text-teal-400" />
                    </div>
                    <TransferHistory transfers={transferHistory} isLoading={transfersLoading} teamId={id} />
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-sm text-zinc-500">
                      Only the team coach or captain can manage player transfers.
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black">Transfer History</h3>
                      <p className="mt-1 text-xs text-zinc-500">Arrivals and departures recorded for {team.name}</p>
                    </div>
                    <ArrowLeftRight className="h-5 w-5 text-teal-400" />
                  </div>
                  <TransferHistory transfers={transferHistory} isLoading={transfersLoading} teamId={id} />
                  {mgmtError && (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {mgmtError}
                      <button onClick={() => setMgmtError("")} className="ml-auto"><X className="w-4 h-4" /></button>
                    </div>
                  )}

                  {/* ── Coach: Add Player ─────────────────────────────────── */}
                  {isCoach && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black uppercase tracking-widest text-zinc-300">Add Player</h3>
                        <button
                          onClick={() => { setAddPlayerOpen(o => !o); setMgmtError(""); setAddSearch(""); }}
                          className="flex items-center gap-1.5 text-xs font-black text-teal-400 bg-teal-400/10 border border-teal-400/20 px-3 py-1.5 rounded-lg hover:bg-teal-400/20 transition-colors"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> {addPlayerOpen ? "Close" : "Add Player"}
                        </button>
                      </div>

                      {addPlayerOpen && (
                        <div className="space-y-3">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                            <input
                              value={addSearch}
                              onChange={e => setAddSearch(e.target.value)}
                              placeholder="Search free agents…"
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-teal-500"
                            />
                          </div>
                          {freeAgentsLoading ? (
                            <p className="text-xs text-zinc-500 text-center py-4">Loading…</p>
                          ) : filteredFreeAgents.length === 0 ? (
                            <p className="text-xs text-zinc-600 text-center py-4">No free agents found</p>
                          ) : (
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                              {filteredFreeAgents.map((p: any) => (
                                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 bg-zinc-800/60 rounded-xl">
                                  <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center flex-shrink-0">
                                    {p.avatarUrl
                                      ? <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                                      : <span className="text-xs font-black text-zinc-400">{(p.displayName ?? p.username ?? "?")[0].toUpperCase()}</span>}
                                  </div>
                                  <span className="text-sm font-bold flex-1 truncate">{p.displayName ?? p.username}</span>
                                  <button
                                    onClick={() => addPlayer(p.id)}
                                    disabled={mgmtLoading}
                                    className="text-xs font-black text-teal-400 bg-teal-400/10 hover:bg-teal-400/20 border border-teal-400/20 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    Add
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Roster management (coach actions) ─────────────────── */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-zinc-800">
                      <h3 className="text-sm font-black uppercase tracking-widest text-zinc-300">Squad Roster</h3>
                    </div>
                    {members.length === 0 ? (
                      <p className="text-center text-sm text-zinc-600 py-10">No members yet</p>
                    ) : (
                      <div className="divide-y divide-zinc-800">
                        {members.map((m: any) => {
                          const isMemberPresident = m.id === (team as any).presidentId;
                          const isMemberCaptain = m.id === team.captainId;
                          const isMemberCoach   = m.id === (team as any).coachId;
                          const isKicking        = kickConfirmId === m.id;
                          const isNewCaptain     = changeCaptainId === m.id;
                          const isNewCoach       = transferCoachId === m.id;

                          return (
                            <div key={m.id} className="px-5 py-3.5">
                              {/* Player row — clicking the avatar/name opens the player's profile */}
                              <div className="flex items-center gap-3">
                                <Link href={`/players/${m.id}`} className="flex items-center gap-3 flex-1 min-w-0 group focus:outline-none">
                                  <div className="w-9 h-9 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center flex-shrink-0 border border-zinc-700 group-hover:border-teal-400/60 transition-colors">
                                    {m.avatarUrl
                                      ? <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                                      : <span className="text-xs font-black text-zinc-400">{(m.displayName ?? m.username ?? "?")[0].toUpperCase()}</span>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold truncate group-hover:text-teal-400 transition-colors">{m.displayName ?? m.username}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {isMemberPresident && (
                                      <span className="flex items-center gap-0.5 text-[10px] font-black text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-1.5 py-0.5 rounded-full">
                                        <Crown className="w-2.5 h-2.5" /> President
                                      </span>
                                    )}
                                    {isMemberCaptain && (
                                      <span className="flex items-center gap-0.5 text-[10px] font-black text-blue-400 bg-blue-400/10 border border-blue-400/20 px-1.5 py-0.5 rounded-full">
                                        <Star className="w-2.5 h-2.5" /> Captain
                                      </span>
                                    )}
                                    {isMemberCoach && (
                                      <span className="flex items-center gap-0.5 text-[10px] font-black text-teal-400 bg-teal-400/10 border border-teal-400/20 px-1.5 py-0.5 rounded-full">
                                        <Shield className="w-2.5 h-2.5" /> Coach
                                      </span>
                                    )}
                                  </div>
                                  </div>
                                </Link>

                                {/* Coach action buttons */}
                                {isCoach && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {/* Make Captain */}
                                    {!isMemberCaptain && (
                                      <button
                                        onClick={() => setChangeCaptainId(isNewCaptain ? null : m.id)}
                                        className={`text-[10px] font-black px-2 py-1 rounded-lg border transition-colors
                                          ${isNewCaptain ? "bg-yellow-400/20 border-yellow-400/40 text-yellow-400" : "text-zinc-500 border-zinc-700 hover:text-yellow-400 hover:border-yellow-400/30"}`}
                                      >
                                        <Crown className="w-3 h-3" />
                                      </button>
                                    )}
                                    {/* Transfer Coach — President only */}
                                    {isPresident && !isMemberCoach && (
                                      <button
                                        onClick={() => setTransferCoachId(isNewCoach ? null : m.id)}
                                        className={`text-[10px] font-black px-2 py-1 rounded-lg border transition-colors
                                          ${isNewCoach ? "bg-teal-400/20 border-teal-400/40 text-teal-400" : "text-zinc-500 border-zinc-700 hover:text-teal-400 hover:border-teal-400/30"}`}
                                      >
                                        <RefreshCw className="w-3 h-3" />
                                      </button>
                                    )}
                                    {/* Kick */}
                                    {!isMemberCaptain && !isMemberCoach && (
                                      <button
                                        onClick={() => setKickConfirmId(isKicking ? null : m.id)}
                                        className={`text-[10px] font-black px-2 py-1 rounded-lg border transition-colors
                                          ${isKicking ? "bg-red-500/20 border-red-500/40 text-red-400" : "text-zinc-500 border-zinc-700 hover:text-red-400 hover:border-red-400/30"}`}
                                      >
                                        <UserMinus className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Kick confirmation */}
                              {isKicking && (
                                <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                                  <p className="text-xs text-red-400 font-bold">Remove {m.displayName ?? m.username} from the team?</p>
                                  <div className="flex gap-2 shrink-0">
                                    <button onClick={() => setKickConfirmId(null)} className="text-xs font-black text-zinc-400 hover:text-white px-2 py-1 rounded-lg border border-zinc-700 transition-colors"><X className="w-3 h-3" /></button>
                                    <button onClick={() => kickPlayer(m.id)} disabled={mgmtLoading} className="text-xs font-black text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"><Check className="w-3 h-3" /></button>
                                  </div>
                                </div>
                              )}

                              {/* Make captain confirmation */}
                              {isNewCaptain && (
                                <div className="mt-3 bg-yellow-400/10 border border-yellow-400/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                                  <p className="text-xs text-yellow-400 font-bold">Make {m.displayName ?? m.username} the new captain?</p>
                                  <div className="flex gap-2 shrink-0">
                                    <button onClick={() => setChangeCaptainId(null)} className="text-xs font-black text-zinc-400 hover:text-white px-2 py-1 rounded-lg border border-zinc-700 transition-colors"><X className="w-3 h-3" /></button>
                                    <button onClick={() => changeCaptain(m.id)} disabled={mgmtLoading} className="text-xs font-black text-black bg-yellow-400 hover:bg-yellow-300 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"><Check className="w-3 h-3" /></button>
                                  </div>
                                </div>
                              )}

                              {/* Transfer coach confirmation */}
                              {isNewCoach && (
                                <div className="mt-3 bg-teal-400/10 border border-teal-400/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                                  <p className="text-xs text-teal-400 font-bold">Transfer coach role to {m.displayName ?? m.username}?</p>
                                  <div className="flex gap-2 shrink-0">
                                    <button onClick={() => setTransferCoachId(null)} className="text-xs font-black text-zinc-400 hover:text-white px-2 py-1 rounded-lg border border-zinc-700 transition-colors"><X className="w-3 h-3" /></button>
                                    <button onClick={() => transferCoach(m.id)} disabled={mgmtLoading} className="text-xs font-black text-black bg-teal-400 hover:bg-teal-300 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"><Check className="w-3 h-3" /></button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-4 px-1 text-[11px] text-zinc-600">
                    <span className="flex items-center gap-1"><Crown className="w-3 h-3 text-yellow-400" /> Make Captain</span>
                    <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3 text-teal-400" /> Transfer Coach</span>
                    <span className="flex items-center gap-1"><UserMinus className="w-3 h-3 text-red-400" /> Remove Player</span>
                  </div>
                </div>
              );
            })()}

            {/* ── NEWS ── */}
            {activeTab === "news" && (() => {
              const isCoachOrCaptain = !!user && (user.id === (team as any).coachId || user.id === team.captainId);
              return (
                <div className="space-y-4">
                  {/* Post button / form — coach & captain only */}
                  {isCoachOrCaptain && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                      {!showForm ? (
                        <button
                          onClick={() => setShowForm(true)}
                          className="w-full py-3 rounded-xl border-2 border-dashed border-zinc-700 text-zinc-400 hover:border-teal-500 hover:text-teal-400 transition-colors text-sm font-bold"
                        >
                          + Post Club News
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <h3 className="text-sm font-black uppercase tracking-widest text-zinc-300 mb-2">New Post</h3>
                          <input
                            value={newsTitle}
                            onChange={e => setNewsTitle(e.target.value)}
                            placeholder="Title"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-teal-500 transition-colors"
                          />
                          <textarea
                            value={newsContent}
                            onChange={e => setNewsContent(e.target.value)}
                            placeholder="Write your announcement..."
                            rows={5}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-teal-500 transition-colors resize-none"
                          />
                          {newsError && <p className="text-red-400 text-xs font-bold">{newsError}</p>}
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setShowForm(false); setNewsError(""); setNewsTitle(""); setNewsContent(""); }}
                              className="px-4 py-2 text-sm font-bold text-zinc-400 hover:text-white transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={submitNews}
                              disabled={newsPosting}
                              className="px-5 py-2 bg-teal-400 text-black text-sm font-black rounded-xl hover:bg-teal-300 disabled:opacity-50 transition-colors"
                            >
                              {newsPosting ? "Posting…" : "Post"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Articles list */}
                  {teamNews.length > 0 ? (
                    <div className="space-y-3">
                      {teamNews.map((article: any) => (
                        <div key={article.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <h3 className="text-base font-black leading-snug">{article.title}</h3>
                            <span className="text-xs text-zinc-500 whitespace-nowrap flex-shrink-0 mt-0.5">
                              {new Date(article.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </div>
                          {article.authorName && (
                            <p className="text-xs text-zinc-500 mb-2">By <span className="text-zinc-300 font-bold">{article.authorName}</span></p>
                          )}
                          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{article.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-20 border border-zinc-800 rounded-2xl">
                      <Shield className="w-10 h-10 mx-auto opacity-20 mb-3" />
                      <p className="font-bold text-zinc-500">No news yet</p>
                      {isCoachOrCaptain
                        ? <p className="text-xs text-zinc-600 mt-1">Use the button above to post your first club announcement</p>
                        : <p className="text-xs text-zinc-600 mt-1">Check back later for club announcements</p>}
                    </div>
                  )}
                </div>
              );
            })()}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* Player matchups dialog — opens when a team match row is clicked */}
      {selectedMatch && (
        <MatchPlayerGamesDialog
          match={selectedMatch}
          teamId={id}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </div>
  );
}

// ── Team chat: only team members can read/write ───────────────────────────────
function TeamChat({ teamId }: { teamId: number }) {
  const { isLoggedIn } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading, error } = useQuery<TeamChatMessage[]>({
    queryKey: ["team-chat", teamId],
    queryFn: () => social.teamChat(teamId),
    enabled: teamId > 0 && isLoggedIn,
    refetchInterval: 5000, // light polling to keep the chat live
    retry: false,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => social.sendTeamChat(teamId, content),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["team-chat", teamId] });
    },
    onError: (err: any) => {
      toast({ title: "Could not send", description: err?.message ?? "Only team members can write in the team chat.", variant: "destructive" });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const forbidden = error && /only team members/i.test((error as Error)?.message ?? "");

  if (!isLoggedIn) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <MessageCircle className="w-10 h-10 mx-auto text-zinc-600 mb-3" />
        <p className="text-sm text-zinc-400 font-bold">Log in to see the team chat.</p>
        <p className="text-xs text-zinc-600 mt-1">Only team members can read and write here.</p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <Lock className="w-10 h-10 mx-auto text-zinc-600 mb-3" />
        <p className="text-sm text-zinc-400 font-bold">Team members only</p>
        <p className="text-xs text-zinc-600 mt-1">You must be a member of this team to read or write in its chat.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-400/20 bg-zinc-900 overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-black uppercase tracking-widest text-white">Team Chat</span>
        <span className="text-xs text-zinc-500 ml-auto flex items-center gap-1">
          <Lock className="w-3 h-3" /> members only
        </span>
      </div>

      <div className="h-[420px] overflow-y-auto px-5 py-4 space-y-3">
        {isLoading && (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="text-center text-sm text-zinc-600 py-10">No messages yet — say something to your team!</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${m.mine ? "bg-emerald-500/20 border border-emerald-400/30 rounded-br-sm" : "bg-zinc-800 border border-zinc-700 rounded-bl-sm"}`}>
              {!m.mine && (
                <p className="text-xs font-black text-emerald-300 mb-0.5 flex items-center gap-1.5">
                  {m.sender?.avatarUrl
                    ? <img src={m.sender.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
                    : <UserCircle2 className="w-4 h-4 text-zinc-500" />}
                  {m.sender?.displayName ?? m.sender?.username ?? "Member"}
                </p>
              )}
              <p className="text-sm text-white break-words whitespace-pre-wrap">{m.content}</p>
              <p className={`text-[10px] mt-1 ${m.mine ? "text-emerald-300/60" : "text-zinc-500"}`}>
                {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-zinc-800 px-4 py-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const content = text.trim();
          if (content) sendMutation.mutate(content);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message your team…"
          maxLength={1000}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-400/50"
          data-testid="input-team-chat"
        />
        <Button type="submit" size="sm" className="gap-1.5" disabled={sendMutation.isPending || !text.trim()}>
          {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </Button>
      </form>
    </div>
  );
}
