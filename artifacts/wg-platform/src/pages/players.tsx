import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Search, Users, Shield, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useListPlayers } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";

export default function PlayersPage() {
  const [search, setSearch] = useState("");
  const { data: players, isLoading } = useListPlayers(search ? { search } : {});
  const { isAdmin, isLoading: authLoading, loginWithDiscord } = useAuth();

  // Block access for everyone except admins/owners
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#162038] border border-[#2e3d60] flex items-center justify-center">
          <Lock className="w-7 h-7 text-zinc-500" />
        </div>
        <div>
          <p className="font-black text-lg text-white">Access Restricted</p>
          <p className="text-sm text-zinc-500 mt-1">This page is only accessible to admins.</p>
        </div>
        <button
          onClick={loginWithDiscord}
          className="px-5 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] text-white text-sm font-black transition-colors"
        >
          Sign in with Discord
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-10">
          <p className="text-primary text-xs font-bold uppercase tracking-widest mb-2">Community</p>
          <h1 className="text-5xl font-black uppercase tracking-tight">Players</h1>
        </div>

        {/* Search */}
        <div className="relative mb-8 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search players..."
            className="pl-10 bg-card border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Player grid */}
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)
            : players?.length === 0
            ? (
              <div className="col-span-4 text-center py-20 text-muted-foreground border border-border rounded-xl">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="font-bold">No players found</p>
              </div>
            )
            : players?.map((player, i) => (
                <motion.div key={player.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Link href={`/players/${player.id}`}>
                    <div className="wg-card wg-lift p-5 cursor-pointer group h-full flex flex-col gap-3">
                      {/* Discord avatar (falls back to initial when player has no avatarUrl) */}
                      {player.avatarUrl ? (
                        <img
                          src={player.avatarUrl}
                          alt={player.displayName ?? player.username}
                          className="w-14 h-14 rounded-xl object-cover wg-avatar-ring"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-primary/10 wg-avatar-ring flex items-center justify-center">
                          <span className="text-xl font-black text-primary">
                            {(player.displayName ?? player.username).charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}

                      <div>
                        <div className="font-black text-lg group-hover:text-primary transition-colors">
                          <span className="truncate">{player.displayName ?? player.username}</span>
                          { (player as any).verified && (
                            <img
                              src={`${import.meta.env.BASE_URL}verified.png`}
                              alt=""
                              draggable={false}
                              className="h-4 w-4 shrink-0 object-contain"
                            />
                          ) }
                        </div>
                        {player.teamName && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            {player.teamLogoUrl
                              ? <img src={player.teamLogoUrl} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                              : <Shield className="w-3 h-3" />}
                            {player.teamName}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center mt-auto">
                        <div>
                          <div className="text-sm font-black text-primary">#{player.rank}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Rank</div>
                        </div>
                        <div>
                          <div className="text-sm font-black">{(player as any).wins ?? player.matchesWon ?? player.tournamentWins ?? 0}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Wins</div>
                        </div>
                        <div>
                          <div className="text-sm font-black">{(player.winRate * 100).toFixed(0)}%</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">W/R</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
        </div>
      </motion.div>
    </div>
  );
}
