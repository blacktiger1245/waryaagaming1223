import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Search, Shield, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useListTeams } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { storageUrl } from "@/lib/api";

export default function TeamsPage() {
  const [search, setSearch] = useState("");
  const { data: teams, isLoading } = useListTeams(search ? { search } : {});
  const { user, isLoggedIn } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [leaveError, setLeaveError] = useState<string | null>(null);
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
  const myRole = (myTeam as any)?.selfRole ?? null;

  async function leaveTeam() {
    if (!myTeam) return;
    const ok = window.confirm("Are you sure you want to leave this team?");
    if (!ok) return;
    setLeaveError(null);
    try {
      const res = await fetch(`/api/teams/${myTeam.id}/leave`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setLeaveError(data.error ?? "Could not leave the team.");
        return;
      }
      // Update state immediately without a full reload.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["my-team"] }),
        qc.invalidateQueries({ queryKey: ["teams"] }),
      ]);
    } catch {
      setLeaveError("Could not leave the team right now. Please try again.");
    }
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-10 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-primary text-xs font-bold uppercase tracking-widest mb-2">Squads</p>
            <h1 className="text-5xl font-black uppercase tracking-tight">Teams</h1>
          </div>
          {isLoggedIn && !myTeamLoading && (
            <div className="flex flex-col items-end gap-2">
              <Button
                onClick={hasTeam ? leaveTeam : () => navigate("/register-team")}
                className={`flex items-center gap-2 font-bold uppercase tracking-wide ${hasTeam ? "bg-transparent border border-destructive/50 text-destructive hover:bg-destructive/10" : ""}`}
              >
                {hasTeam ? "Leave Your Team" : "Register Your Team"}
              </Button>
              {hasTeam && (
                <button
                  onClick={() => navigate(myRole === "player" ? `/teams/${myTeam.id}` : `/teams/${myTeam.id}/manage`)}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Manage / View team →
                </button>
              )}
            </div>
          )}
          {leaveError && (
            <div className="basis-full text-right text-sm text-red-400">⚠ {leaveError}</div>
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
                        {storageUrl(team.logoUrl)
                          ? <img src={storageUrl(team.logoUrl)} alt={team.name} className="w-full h-full object-cover" />
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
