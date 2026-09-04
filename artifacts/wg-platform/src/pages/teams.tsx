import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Search, Shield, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TeamDeviceModal from "@/components/team-device-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useListTeams } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { storageUrl } from "@/lib/api";
import { accentForId, accentCardBackground } from "@/lib/accent-colors";

function ClanCard({ team, index }: { team: any; index: number }) {
  const acc = accentForId(team.id);
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
      <Link href={`/teams/${team.id}`}>
        <div
          className="wg-card wg-lift wg-sheen rounded-xl border border-border bg-card cursor-pointer group h-full flex flex-col overflow-hidden"
          style={{ background: accentCardBackground(acc), borderColor: acc.tint }}
        >
          <div className="flex items-center justify-center pt-6 pb-2">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden ring-2"
              style={{ borderColor: acc.tint, boxShadow: `0 0 26px ${acc.glow}` }}
            >
              {storageUrl(team.logoUrl)
                ? <img src={storageUrl(team.logoUrl)} alt={team.name} className="w-full h-full object-cover" />
                : <Shield className="w-10 h-10" style={{ color: acc.hex }} />}
            </div>
          </div>

          <div className="px-4 py-3 text-center">
            <div className="font-black text-lg leading-tight group-hover:text-white transition-colors">{team.name}</div>
            {team.tag && (
              <div className="mt-1.5 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide"
                style={{ color: acc.hex, borderColor: acc.tint, background: acc.soft }}>
                [{team.tag}]
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">Captain: {team.captainName}</div>
          </div>

          <div className="flex items-center justify-between gap-1 border-t border-border px-4 py-3">
            <div className="flex-1 text-center">
              <div className="text-base font-black" style={{ color: acc.hex }}>{team.wins}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Wins</div>
            </div>
            <div className="flex-1 text-center">
              <div className="text-base font-black" style={{ color: acc.hex }}>{team.losses}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Losses</div>
            </div>
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-0.5 text-base font-black" style={{ color: acc.hex }}>
                <Users className="w-3 h-3" />
                {team.memberCount}
              </div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Squad</div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export default function TeamsPage() {
  const [search, setSearch] = useState("");
  const { data: teams, isLoading } = useListTeams(search ? { search } : {});
  const { user, isLoggedIn } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
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

  // Clan registration windows (Serie A / Serie B).
  const { data: clanSettings } = useQuery<{ serieARegistrationOpen: boolean; serieBRegistrationOpen: boolean }>({
    queryKey: ["clan-settings"],
    queryFn: async () => {
      const res = await fetch("/api/teams/clan-settings");
      if (!res.ok) return { serieARegistrationOpen: true, serieBRegistrationOpen: false };
      return res.json();
    },
  });
  const registrationOpen = clanSettings?.serieARegistrationOpen || clanSettings?.serieBRegistrationOpen;

  const serieA = (teams ?? []).filter((t) => (t as any).division !== "serie_b");
  const serieB = (teams ?? []).filter((t) => (t as any).division === "serie_b");

  async function leaveTeam() {
    if (!myTeam) return;
    const ok = window.confirm("Are you sure you want to leave this clan?");
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
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="wg-hero px-6 py-9 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <span className="wg-eyebrow inline-flex items-center gap-2"><Shield className="h-4 w-4" /> Squads</span>
              <h1 className="wg-hero-title text-4xl mt-4">Clans</h1>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mt-3 max-w-xl">
                Every Waryaa clan is a brotherhood with its own crest and story — from the first captain to the latest signing.
              </p>
            </div>
            {isLoggedIn && !myTeamLoading && (
              <div className="flex flex-col items-stretch gap-2 sm:items-center">
                {hasTeam ? (
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                    <Button onClick={() => setDeviceModalOpen(true)} className="wg-btn-pill gap-2 font-bold uppercase tracking-wide">
                      Add Your Details
                    </Button>
                    <Button
                      onClick={leaveTeam}
                      className="flex items-center justify-center gap-2 bg-transparent border border-destructive/50 text-destructive font-bold uppercase tracking-wide hover:bg-destructive/10"
                    >
                      Leave Your Clan
                    </Button>
                  </div>
                ) : registrationOpen ? (
                  <Button onClick={() => navigate("/register-team")} className="wg-btn-pill gap-2 font-bold uppercase tracking-wide">
                    Register Your Clan
                  </Button>
                ) : (
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Clan registration is closed
                  </span>
                )}
                {hasTeam && (
                  <button
                    onClick={() => navigate(myRole === "player" ? `/teams/${myTeam.id}` : `/teams/${myTeam.id}/manage`)}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    Manage / View clan →
                  </button>
                )}
              </div>
            )}
          </div>
          {leaveError && (
            <div className="text-sm text-red-400 mt-3">⚠ {leaveError}</div>
          )}
        </div>

        <div className="relative mb-8 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search clans..."
            className="pl-10 bg-card border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : (teams?.length ?? 0) === 0 ? (
          <div className="text-center py-20 text-muted-foreground border border-border rounded-xl">
            <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-bold">No clans found</p>
          </div>
        ) : (
          <>
            <div className="mb-10">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-black uppercase tracking-wide">
                Serie A
                <span className="text-xs font-bold normal-case text-muted-foreground">({serieA.length} clans)</span>
              </h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {serieA.map((team, i) => <ClanCard key={team.id} team={team} index={i} />)}
              </div>
            </div>
            <div className="mb-10">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-black uppercase tracking-wide">
                Serie B
                <span className="text-xs font-bold normal-case text-muted-foreground">({serieB.length} clans)</span>
              </h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {serieB.map((team, i) => <ClanCard key={team.id} team={team} index={i} />)}
              </div>
            </div>
          </>
        )}
      </motion.div>

      {isLoggedIn && myTeam && (
        <TeamDeviceModal
          open={deviceModalOpen}
          onClose={() => setDeviceModalOpen(false)}
          teamId={myTeam.id}
          teamName={myTeam.name}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["my-team"] });
            qc.invalidateQueries({ queryKey: ["teams"] });
          }}
        />
      )}
    </div>
  );
}
