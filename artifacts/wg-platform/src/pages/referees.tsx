import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Search, Users2, Star, ShieldCheck } from "lucide-react";
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
    <div className="container mx-auto px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <p className="text-primary text-xs font-bold uppercase tracking-widest mb-2">Officials</p>
          <h1 className="text-5xl font-black uppercase tracking-tight">Referees</h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-3xl font-black text-primary">{(referees ?? []).length}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Active Referees</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-3xl font-black">{isLoading ? "—" : (referees ?? []).reduce((s, r) => s + r.matchesPlayed, 0)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Matches Officiated</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-3xl font-black">
              {isLoading ? "—" : ((referees ?? []).reduce((s, r) => s + r.rating, 0) / Math.max(1, (referees ?? []).length) / 200).toFixed(1)}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Avg. Rating</div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)
            : filtered.length === 0
            ? (
              <div className="col-span-4 text-center py-20 text-muted-foreground border border-border rounded-xl">
                <Users2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="font-bold">No referees yet</p>
                <p className="text-sm">Assign the Referee role to a user and they will appear here automatically.</p>
              </div>
            )
            : filtered.map((r, i) => (
                <motion.div key={r.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <div className="rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-primary/40 flex flex-col gap-3 h-full">
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

                    <div>
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

                    <div className="grid grid-cols-2 gap-2 text-center mt-auto">
                      <div className="rounded-lg bg-muted/40 p-2">
                        <div className="text-sm font-black text-primary">{r.matchesPlayed}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Matches</div>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2">
                        <div className="text-sm font-black">{r.rating}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Rating</div>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <Stars rating={r.rating} />
                    </div>
                  </div>
                </motion.div>
              ))}
        </div>
      </motion.div>
    </div>
  );
}