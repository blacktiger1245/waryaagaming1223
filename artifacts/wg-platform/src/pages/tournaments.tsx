import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Trophy, Calendar, Users, ArrowRight, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useListTournaments } from "@workspace/api-client-react";
import { storageUrl } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Status = "upcoming" | "active" | "completed" | undefined;

const statusColors: Record<string, string> = {
  upcoming: "bg-primary/10 text-primary border-primary/30",
  active: "bg-red-500/10 text-red-400 border-red-500/30",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

export default function TournamentsPage() {
  const [filter, setFilter] = useState<Status>(undefined);
  const { data: tournaments, isLoading } = useListTournaments(filter ? { status: filter } : {});
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("16");
  const [saving, setSaving] = useState(false);

  async function createTournament(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !startDate) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          format: "single-elimination",
          game: "eFootball",
          maxParticipants: Number(maxParticipants) || 16,
          prizePool: "$0",
          startDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create tournament");
      toast({ title: "Tournament created", description: "You are the owner and can now add tournament admins." });
      setCreateOpen(false);
      setName("");
      setStartDate("");
      setMaxParticipants("16");
      window.location.href = `/tournaments/${data.id}`;
    } catch (error) {
      toast({ title: "Could not create tournament", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const tabs: { label: string; value: Status }[] = [
    { label: "All", value: undefined },
    { label: "Upcoming", value: "upcoming" },
    { label: "Active", value: "active" },
    { label: "Completed", value: "completed" },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="wg-hero px-6 py-10 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <span className="wg-eyebrow inline-flex items-center gap-2"><Trophy className="h-4 w-4" /> Compete Snapshot</span>
              <h1 className="wg-hero-title text-5xl mt-4">Tournaments</h1>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mt-3 max-w-xl">
                Step into the Waryaa arena — every clash is a bracket story. Track live events, prize pools and the squads chasing the trophy.
              </p>
            </div>
            {isAdmin && (
              <Button className="wg-btn-pill gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" /> Create Tournament
              </Button>
            )}
          </div>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a tournament</DialogTitle>
            </DialogHeader>
            <form onSubmit={createTournament} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tournament name</label>
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. WG Weekend Cup" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Start date</label>
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Maximum participants</label>
                <Input type="number" min="2" max="256" value={maxParticipants} onChange={(event) => setMaxParticipants(event.target.value)} required />
              </div>
              <p className="text-xs text-muted-foreground rounded-lg bg-primary/5 border border-primary/20 p-3">
                You will become the tournament owner. After creation, add trusted Discord members as tournament admins from the tournament page.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create tournament</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Filter tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Arena · Filter</span>
          {tabs.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setFilter(tab.value)}
              className={`wg-chip transition-all duration-200 ${filter === tab.value ? "wg-chip-solid" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tournament grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-2xl" />
              ))
            : tournaments?.length === 0
            ? (
              <div className="col-span-full text-center py-20 text-muted-foreground border border-border rounded-xl">
                <Trophy className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="font-bold">No tournaments found</p>
              </div>
            )
            : tournaments?.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link href={`/tournaments/${t.id}`}>
                    <div className="wg-card wg-lift wg-sheen aspect-square rounded-xl border border-border bg-card overflow-hidden cursor-pointer group relative flex flex-col">
                      {/* Banner — top 60% */}
                      <div className="flex-1 relative bg-gradient-to-br from-black/40 via-black/25 to-black/50 flex items-center justify-center overflow-hidden">
                        {(t as any).logoUrl ? (
                          <img
                            src={storageUrl((t as any).logoUrl)}
                            alt={t.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <Trophy className="w-14 h-14 text-muted-foreground/40" strokeWidth={1.5} />
                        )}
                        {/* Status chip */}
                        <div className="absolute top-2.5 left-2.5">
                          <Badge className={`text-[9px] uppercase tracking-widest font-bold ${statusColors[t.status] ?? ""}`}>
                            {t.status}
                          </Badge>
                        </div>
                        {/* Live beam for active events */}
                        {t.status === "active" && (
                          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-500 live-pulse" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-red-400">Live</span>
                          </div>
                        )}
                        {/* Dark bottom fade */}
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-card to-transparent" />
                      </div>

                      {/* Info — bottom */}
                      <div className="px-3.5 pb-3.5 pt-2 shrink-0">
                        <h3 className="font-black text-sm leading-tight group-hover:text-white transition-colors line-clamp-1">
                          {t.name}
                        </h3>
                        {(t as any).hostedBy && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">hosted by {(t as any).hostedBy}</p>
                        )}
                        <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border">
                          <div>
                            <div className="text-xs font-black text-white">{t.prizePool}</div>
                            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Prize</div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-0.5 text-sm font-black justify-end">
                              <Users className="w-3 h-3 text-muted-foreground" />
                              {t.maxParticipants >= 9999 ? t.currentParticipants : `${t.currentParticipants}/${t.maxParticipants}`}
                            </div>
                            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Players</div>
                          </div>
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
