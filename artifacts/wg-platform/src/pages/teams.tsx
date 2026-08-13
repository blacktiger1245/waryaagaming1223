import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Search, Shield, Users, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useListTeams } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

export default function TeamsPage() {
  const [search, setSearch] = useState("");
  const { data: teams, isLoading } = useListTeams(search ? { search } : {});
  const { user, isLoggedIn } = useAuth();
  const [, navigate] = useLocation();
  const { data: myTeam, isLoading: myTeamLoading } = useQuery<any | null>({
    queryKey: ["my-team"],
    queryFn: async () => {
      const res = await fetch("/api/teams/mine", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isLoggedIn,
  });

  // Show "Register Your Team" only if the user is logged in and not already on a team
  const hasTeam = isLoggedIn && !!myTeam;

  return (
    <div className="container mx-auto px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-10 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-primary text-xs font-bold uppercase tracking-widest mb-2">Squads</p>
            <h1 className="text-5xl font-black uppercase tracking-tight">Teams</h1>
          </div>
          {isLoggedIn && !myTeamLoading && (
            <Button
              onClick={() => navigate(
                hasTeam
                  ? (myTeam.coachId === user?.id ? `/teams/${myTeam.id}/manage` : `/teams/${myTeam.id}`)
                  : "/register-team"
              )}
              className="flex items-center gap-2 font-bold uppercase tracking-wide"
            >
              <Plus className="w-4 h-4" />
              {hasTeam ? "Manage Your Team" : "Register Your Team"}
            </Button>
          )}
        </div>

        <div className="relative mb-8 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search teams..."
            className="pl-10 bg-card border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)
            : teams?.length === 0
            ? (
              <div className="col-span-4 text-center py-20 text-muted-foreground border border-border rounded-xl">
                <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="font-bold">No teams found</p>
              </div>
            )
            : teams?.map((team, i) => (
                <motion.div key={team.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Link href={`/teams/${team.id}`}>
                    <div className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-all duration-300 cursor-pointer group h-full flex flex-col gap-3">
                      <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
                        {team.logoUrl
                          ? <img src={team.logoUrl} alt={team.name} className="w-full h-full object-cover" />
                          : <Shield className="w-7 h-7 text-primary" />}
                      </div>

                      <div>
                        <div className="font-black text-lg group-hover:text-primary transition-colors">{team.name}</div>
                        {team.tag && (
                          <div className="text-xs font-mono text-primary mt-0.5">[{team.tag}]</div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">Captain: {team.captainName}</div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center mt-auto">
                        <div>
                          <div className="text-sm font-black text-primary">{team.wins}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Wins</div>
                        </div>
                        <div>
                          <div className="text-sm font-black">{team.losses}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Losses</div>
                        </div>
                        <div>
                          <div className="flex items-center justify-center gap-0.5 text-sm font-black">
                            <Users className="w-3 h-3" />
                            {team.memberCount}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Members</div>
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
