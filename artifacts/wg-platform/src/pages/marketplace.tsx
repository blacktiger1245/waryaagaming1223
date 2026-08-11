import { useState } from "react";
import { motion } from "framer-motion";
import { Store, UserPlus, Palette, ClipboardList, Users2, Search, MapPin, Gamepad2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5 } }),
};

const categories = [
  {
    icon: Users2,
    title: "Team Recruitment",
    description: "Teams post open roster spots, players post availability. Find your next squad or your next star player.",
  },
  {
    icon: UserPlus,
    title: "Coach Recruitment",
    description: "Connect teams with coaches who can review tactics, run scrims, and prepare rosters for tournaments.",
  },
  {
    icon: Palette,
    title: "Graphic Designer Recruitment",
    description: "Find designers for team logos, tournament graphics, banners, and social media content.",
  },
  {
    icon: ClipboardList,
    title: "Tournament Staff Applications",
    description: "Apply to help run WG tournaments as a bracket admin, referee, or match reporter.",
  },
];

export default function MarketplacePage() {
  const [search, setSearch] = useState("");
  const { data: freeAgents = [], isLoading } = useQuery<any[]>({
    queryKey: ["marketplace", "free-agents"],
    queryFn: async () => {
      const res = await fetch("/api/players/marketplace");
      if (!res.ok) throw new Error("Failed to load free agents");
      return res.json();
    },
  });

  const filteredAgents = freeAgents.filter((player) => {
    const query = search.toLowerCase();
    return !query || [player.displayName, player.username, player.country, player.gamingDevice]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  return (
    <div className="container mx-auto px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-14 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-6">
            <Store className="w-3.5 h-3.5" />
            Marketplace
          </div>
          <h1 className="text-5xl font-black uppercase tracking-tight mb-4">Community Marketplace</h1>
          <p className="text-muted-foreground text-lg">
            Find opted-in free agents, coaches, designers, and tournament staff across the WG community.
          </p>
        </div>

        <section className="mb-14">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
            <div>
              <Badge className="mb-3 bg-primary/20 text-primary border-primary/30 uppercase tracking-wider text-xs">
                Player Market
              </Badge>
              <h2 className="text-2xl font-black uppercase tracking-tight">Available Free Agents</h2>
              <p className="text-sm text-muted-foreground mt-1">Players who chose to be visible to teams during onboarding.</p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players…" className="pl-9" />
            </div>
          </div>
          {isLoading ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">Loading free agents…</div>
          ) : filteredAgents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
              <Users2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-bold">{search ? "No matching free agents" : "No free agents are listed yet"}</p>
              <p className="text-sm text-muted-foreground mt-1">Players can opt in from their Discord onboarding profile.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAgents.map((player) => (
                <Link key={player.id} href={`/players/${player.id}`}>
                  <motion.div whileHover={{ y: -3 }} className="h-full rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3 mb-4">
                      {player.avatarUrl ? (
                        <img src={player.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover border border-primary/30" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center text-lg font-black text-primary">
                          {(player.displayName ?? player.username).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-black truncate">{player.displayName ?? player.username}</h3>
                        <p className="text-xs text-muted-foreground truncate">@{player.username}</p>
                      </div>
                      <Badge className="ml-auto shrink-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">FREE</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-muted/40 px-3 py-2"><span className="text-muted-foreground block">Rating</span><strong>{player.rating ?? 0}</strong></div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2"><span className="text-muted-foreground block">Points</span><strong>{player.points ?? 0}</strong></div>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-4 text-xs text-muted-foreground">
                      {player.country && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{player.country}</span>}
                      {player.gamingDevice && <span className="flex items-center gap-1"><Gamepad2 className="w-3.5 h-3.5" />{player.gamingDevice}</span>}
                    </div>
                  </motion.div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="grid md:grid-cols-2 gap-6">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="rounded-xl border border-border bg-card p-8 hover:border-primary/40 transition-colors relative overflow-hidden"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center mb-5">
                <cat.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight mb-2">{cat.title}</h3>
              <p className="text-muted-foreground text-sm">{cat.description}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-14 rounded-xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h3 className="text-xl font-black uppercase tracking-tight mb-2">Want early access?</h3>
          <p className="text-muted-foreground text-sm">
            Join the Discord and get notified the moment the marketplace opens for listings.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
