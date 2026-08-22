import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Search, Users2, Star, ShieldCheck, Trophy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchReferees, type Referee } from "@/lib/api";

function Stars({ rating }: { rating: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(rating / 200)));
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < filled ? "fill-yellow-400 text-yellow-400" : "text-zinc-600"}`} />
      ))}
    </span>
  );
}

export default function RefereesPage() {
  const [search, setSearch] = useState("");
  const { data: referees, isLoading } = useQuery({ queryKey: ["referees"], queryFn: fetchReferees });

  const filtered = (referees ?? []).filter((r) =>
    [r.displayName, r.username, r.country].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="wg-hero px-6 py-8 mb-8">
          <span className="wg-eyebrow inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Officials</span>
          <h1 className="wg-hero-title text-4xl mt-3">Referees</h1>
          <p className="text-muted-foreground text-sm mt-2">The whistles and eyes of every Waryaa fixture.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-primary mb-1"><Users2 className="h-5 w-5" /></div>
            <div className="text-3xl font-black text-primary">{(referees ?? []).length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Referee Members</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-primary mb-1"><Trophy className="h-5 w-5" /></div>
            <div className="text-3xl font-black">{isLoading ? "—" : (referees ?? []).reduce((s, r) => s + r.matchesPlayed, 0)}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Matches</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-yellow-400 mb-1"><Star className="h-5 w-5" /></div>
            <div className="text-3xl font-black">{isLoading ? "—" : ((referees ?? []).reduce((s, r) => s + r.rating, 0) / Math.max(1, (referees ?? []).length) / 200).toFixed(1)}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Rating</div>
          </div>
        </div>

        <div className="space-y-3">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
            : filtered.length === 0
            ? (
              <div className="text-center py-20 text-muted-foreground border border-border rounded-xl">
                <Users2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="font-bold">No referees yet</p>
                <p className="text-sm">Assign the Referee role to a user and they will appear here automatically.</p>
              </div>
            )
            : (
              <div className="overflow-hidden rounded-xl border border-border">
                {filtered.map((r) => (
                  <div key={r.id} className="flex items-center gap-4 border-b border-border bg-card px-5 py-4 transition-colors last:border-b-0 hover:bg-primary/5">
                    {r.avatarUrl ? (
                      <img
                        src={r.avatarUrl}
                        alt={r.displayName ?? r.username}
                        className="w-14 h-14 rounded-xl object-cover border border-primary/20"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <span className="text-xl font-black text-primary">{(r.displayName ?? r.username).charAt(0).toUpperCase()}</span>
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="font-black text-lg flex items-center gap-1.5">
                        <span className="truncate">{r.displayName ?? r.username}</span>
                        {r.verified && (
                          <img
                            src={`${import.meta.env.BASE_URL}verified.png`}
                            alt=""
                            draggable={false}
                            className="h-4 w-4 shrink-0 object-contain"
                          />
                        )}
                      </div>
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        <ShieldCheck className="h-3 w-3" /> Referee
                      </span>
                    </div>

                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-center">
                        <div className="text-lg font-black text-primary">{r.matchesPlayed}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Matches</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-black">{r.rating}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Rating</div>
                      </div>
                      <Stars rating={r.rating} />
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </motion.div>
    </div>
  );
}