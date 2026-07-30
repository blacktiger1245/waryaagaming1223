import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, History, Share2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetPlayer, useGetPlayerMatchHistory } from "@workspace/api-client-react";

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

const matchStatusColors: Record<string, string> = {
  scheduled: "text-muted-foreground",
  live: "text-red-400",
  completed: "text-primary",
  cancelled: "text-destructive",
};

// ── page ──────────────────────────────────────────────────────────────────────
export default function PlayerHistoryPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const { data: player, isLoading: playerLoading } = useGetPlayer(id);
  const { data: history, isLoading: historyLoading } = useGetPlayerMatchHistory(id);

  const isLoading = playerLoading || historyLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 space-y-4">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Player not found</p>
        <Button variant="ghost" className="mt-4" asChild>
          <Link href="/players">
            <ArrowLeft className="w-4 h-4 mr-1" /> Players
          </Link>
        </Button>
      </div>
    );
  }

  const stars = starCount(player.points ?? 0);
  const displayName = player.displayName ?? player.username;

  // ── history helpers ──────────────────────────────────────────────────────
  function getResult(match: NonNullable<typeof history>[0]): "win" | "loss" | "draw" | null {
    if (match.status !== "completed") return null;
    const isP1 = match.participant1Id === id;
    const my = isP1 ? match.participant1Score : match.participant2Score;
    const opp = isP1 ? match.participant2Score : match.participant1Score;
    if (my === null || opp === null) return null;
    if (my > opp) return "win";
    if (my === opp) return "draw";
    return "loss";
  }

  const completed = (history ?? []).filter((m) => m.status === "completed");
  const totalWon = completed.filter((m) => getResult(m) === "win").length;
  const totalDrawn = completed.filter((m) => getResult(m) === "draw").length;
  const totalLost = completed.filter((m) => getResult(m) === "loss").length;
  const totalGoals = completed.reduce((sum, m) => {
    const isP1 = m.participant1Id === id;
    return sum + ((isP1 ? m.participant1Score : m.participant2Score) ?? 0);
  }, 0);

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: `${displayName} – Match History`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
  }

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
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/90" />
        </div>

        <div className="container mx-auto px-4">
          {/* back buttons */}
          <div className="flex items-center gap-2 -mt-2 mb-0 relative z-10">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" asChild>
              <Link href="/players">
                <ArrowLeft className="w-4 h-4" /> Players
              </Link>
            </Button>
            <span className="text-muted-foreground/40 text-sm">/</span>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" asChild>
              <Link href={`/players/${id}`}>{displayName}</Link>
            </Button>
          </div>

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
                <h1 className="text-2xl md:text-3xl font-black leading-none">{displayName}</h1>
                {player.country && (
                  <span className="text-sm text-muted-foreground">{player.country}</span>
                )}
              </div>

              {player.teamName && (
                <div className="text-cyan-400 font-semibold text-sm mt-0.5">{player.teamName}</div>
              )}

              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <Stars n={stars} />
                <Badge className="bg-emerald-600/80 text-white border-0 font-bold text-xs px-2 py-0.5">
                  {(player.points ?? 0).toFixed(1)} pts
                </Badge>
                <span className="text-xs text-muted-foreground">Rank #{player.rank}</span>
              </div>
            </div>

            {/* Share button */}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 self-start sm:self-end mb-1"
              onClick={handleShare}
            >
              <Share2 className="w-4 h-4" />
              Share
            </Button>
          </div>

          {/* ── Page heading ── */}
          <div className="flex items-center gap-2 mb-6 border-b border-border pb-4">
            <History className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">Match History</h2>
          </div>

          {/* ── History content ── */}
          <div className="pb-16 space-y-4">
            {!history || history.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground text-sm">
                No match history yet.
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: "Played",       value: completed.length, color: "" },
                    { label: "Won",          value: totalWon,         color: "text-primary" },
                    { label: "Draw",         value: totalDrawn,       color: "text-amber-400" },
                    { label: "Lost",         value: totalLost,        color: "text-destructive" },
                    { label: "Goals Scored", value: totalGoals,       color: "text-teal-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-2xl border border-border bg-card p-5 text-center">
                      <div className={`text-3xl font-black ${color}`}>{value}</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Match list */}
                <div className="rounded-2xl border border-border overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {["Round", "Opponent", "Score", "Goals Conceded", "Result"].map((h) => (
                          <th
                            key={h}
                            className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((match, i) => {
                        const isP1 = match.participant1Id === id;
                        const opponent = isP1 ? match.participant2Name : match.participant1Name;
                        const myScore = isP1 ? match.participant1Score : match.participant2Score;
                        const oppScore = isP1 ? match.participant2Score : match.participant1Score;
                        const result = getResult(match);

                        const resultBadge =
                          result === "win" ? (
                            <span className="px-2 py-0.5 rounded text-xs font-black bg-primary/15 text-primary">W</span>
                          ) : result === "draw" ? (
                            <span className="px-2 py-0.5 rounded text-xs font-black bg-amber-400/15 text-amber-400">D</span>
                          ) : result === "loss" ? (
                            <span className="px-2 py-0.5 rounded text-xs font-black bg-destructive/15 text-destructive">L</span>
                          ) : (
                            <span className={`text-xs font-bold uppercase tracking-wider ${matchStatusColors[match.status]}`}>
                              {match.status}
                            </span>
                          );

                        return (
                          <tr
                            key={match.id}
                            className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-card" : ""}`}
                          >
                            <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                              {match.roundName ?? `Round ${match.round}`}
                            </td>
                            <td className="px-4 py-3 font-bold">{opponent ?? "TBD"}</td>
                            <td className="px-4 py-3 font-mono font-bold text-lg">
                              {myScore !== null && myScore !== undefined && oppScore !== null && oppScore !== undefined ? (
                                <span>
                                  {myScore}{" "}
                                  <span className="text-muted-foreground font-normal text-sm">–</span>{" "}
                                  {oppScore}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">vs</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-muted-foreground">
                              {oppScore !== null && oppScore !== undefined ? oppScore : "—"}
                            </td>
                            <td className="px-4 py-3">{resultBadge}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {history.some((m) => m.status !== "completed") && (
                  <p className="text-xs text-muted-foreground px-1">
                    * Scheduled matches are shown but not counted in the summary.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
