import { Link } from "wouter";
import { motion } from "framer-motion";
import { Radio, ExternalLink, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetLiveMatches } from "@workspace/api-client-react";

export default function LivePage() {
  const { data: liveMatches, isLoading, refetch } = useGetLiveMatches();

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="wg-hero px-6 py-8 mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-red-500 live-pulse" />
                <span className="text-red-400 text-xs font-black uppercase tracking-widest">Live</span>
              </div>
              <h1 className="wg-hero-title text-4xl">Match Center</h1>
              <p className="text-muted-foreground text-sm mt-2">Real-time scores, streams and drama — as it happens.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="wg-btn-pill gap-2">
              <Radio className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : !liveMatches || liveMatches.length === 0 ? (
          <div className="text-center py-24 border border-red-500/20 rounded-2xl bg-card/40">
            <Radio className="w-16 h-16 mx-auto mb-4 text-red-400/50" />
            <h2 className="text-2xl font-black text-white mb-2">No Live Matches</h2>
            <p className="text-muted-foreground text-sm">Check back during tournament rounds for live scores and streams.</p>
            <Button variant="ghost" className="mt-6 gap-2 text-[var(--acc)]" asChild>
              <Link href="/tournaments">
                <Trophy className="w-4 h-4" />
                View Upcoming Tournaments
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {liveMatches.map((match, i) => (
              <motion.div key={match.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <div className="wg-card wg-live-card rounded-xl border border-red-500/30 bg-card p-6 relative overflow-hidden">
                  {/* Live glow */}
                  <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 via-transparent to-red-500/5 pointer-events-none" />
                  {/* Live edge */}
                  <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-gradient-to-b from-red-500 to-rose-500 shadow-[0_0_12px_rgba(248,113,113,0.7)]" />

                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 live-pulse" />
                        <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px] uppercase tracking-widest">
                          Live
                        </Badge>
                        {match.tournamentName && (
                          <span className="text-xs text-muted-foreground">{match.tournamentName}</span>
                        )}
                        {match.roundName && (
                          <span className="text-xs text-muted-foreground">— {match.roundName}</span>
                        )}
                      </div>
                      {match.streamUrl && (
                        <Button size="sm" variant="outline" className="gap-1 border-red-500/30 text-red-400 hover:border-red-500" asChild>
                          <a href={match.streamUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3 h-3" />
                            Watch Stream
                          </a>
                        </Button>
                      )}
                    </div>

                    {/* Scoreboard */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 text-center">
                        <p className="text-2xl font-black mb-1">{match.participant1Name ?? "TBD"}</p>
                        <p className="text-5xl font-black text-[var(--acc)]">{match.participant1Score ?? 0}</p>
                      </div>

                      <div className="text-center px-6">
                        <div className="text-xs font-black text-red-400 uppercase tracking-widest mb-1">Live</div>
                        <div className="text-2xl font-black text-muted-foreground">VS</div>
                      </div>

                      <div className="flex-1 text-center">
                        <p className="text-2xl font-black mb-1">{match.participant2Name ?? "TBD"}</p>
                        <p className="text-5xl font-black text-[var(--acc)]">{match.participant2Score ?? 0}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
