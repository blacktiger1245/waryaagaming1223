import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Users, Shield, Radio, ArrowRight, Zap, Star, X, ExternalLink, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  useGetStatsSummary,
  useListTournaments,
  useGetPlayerRankings,
  useListNews,
} from "@workspace/api-client-react";

interface Announcement {
  id: number;
  message: string;
  type: "info" | "warning" | "success" | "danger";
  link: string | null;
  linkText: string | null;
}

const TYPE_STYLES: Record<string, { bar: string; icon: string; text: string; link: string; close: string }> = {
  info:    { bar: "bg-blue-950/80 border-blue-500/40",    icon: "text-blue-400",   text: "text-blue-100",   link: "text-blue-300 hover:text-blue-100",   close: "text-blue-400 hover:text-blue-100" },
  warning: { bar: "bg-yellow-950/80 border-yellow-500/40", icon: "text-yellow-400", text: "text-yellow-100", link: "text-yellow-300 hover:text-yellow-100", close: "text-yellow-400 hover:text-yellow-100" },
  success: { bar: "bg-green-950/80 border-green-500/40",  icon: "text-green-400",  text: "text-green-100",  link: "text-green-300 hover:text-green-100",   close: "text-green-400 hover:text-green-100" },
  danger:  { bar: "bg-red-950/80 border-red-500/40",      icon: "text-red-400",    text: "text-red-100",    link: "text-red-300 hover:text-red-100",       close: "text-red-400 hover:text-red-100" },
};

function AnnouncementBanner() {
  const { data: items = [] } = useQuery<Announcement[]>({
    queryKey: ["announcements"],
    queryFn: async () => {
      const r = await fetch("/api/announcements", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const visible = items.filter((a) => !dismissed.has(a.id));

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      <AnimatePresence initial={false}>
        {visible.map((a) => {
          const s = TYPE_STYLES[a.type] ?? TYPE_STYLES.info;
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
              transition={{ duration: 0.3 }}
              className={`flex items-center gap-3 px-4 py-2.5 border-b ${s.bar} backdrop-blur-sm`}
            >
              <Megaphone className={`w-4 h-4 flex-shrink-0 ${s.icon}`} />
              <p className={`flex-1 text-sm font-semibold leading-snug ${s.text}`}>{a.message}</p>
              {a.link && (
                <a
                  href={a.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1 text-xs font-bold whitespace-nowrap transition-colors ${s.link}`}
                >
                  {a.linkText ?? "Learn more"}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                onClick={() => setDismissed((d) => new Set([...d, a.id]))}
                className={`flex-shrink-0 transition-colors ${s.close}`}
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
};

export default function HomePage() {
  const { data: stats } = useGetStatsSummary();
  const { data: tournaments } = useListTournaments({ status: "upcoming" });
  const { data: rankings } = useGetPlayerRankings({ period: "all-time" });
  const { data: news } = useListNews({ limit: 3 });

  const upcomingTournament = tournaments?.[0];
  const top3 = rankings?.slice(0, 3) ?? [];

  return (
    <div className="flex flex-col">
      {/* Announcement banners */}
      <AnnouncementBanner />

      {/* Hero — full-width cinematic: players image bg + text overlay left */}
      <section className="relative min-h-[90vh] flex overflow-hidden bg-black">

        {/* ── Full-width background: stadium image (image 1) ── */}
        <img
          src={`${import.meta.env.BASE_URL}hero-stadium.png`}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover object-center"
          style={{ filter: "brightness(0.55)" }}
        />

        {/* ── Players cutout — anchored bottom-right ── */}
        <motion.img
          src={`${import.meta.env.BASE_URL}hero-players.png`}
          alt="Neymar, Messi, Ronaldo"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          className="absolute z-[1]"
          style={{
            height: "100%",
            width: "65%",
            bottom: "14%",
            right: "-2%",
            objectFit: "contain",
            objectPosition: "bottom right",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 14%, black 85%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 14%, black 85%, transparent 100%)",
          }}
        />

        {/* Left gradient — gives the text panel a readable dark backing */}
        <div className="absolute inset-y-0 left-0 w-[55%] bg-gradient-to-r from-black/90 via-black/60 to-transparent z-[2] pointer-events-none" />
        {/* Top vignette */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent z-[2] pointer-events-none" />
        {/* Bottom vignette */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent z-[2] pointer-events-none" />

        {/* ── Text content — left side ── */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative z-[3] flex flex-col justify-center px-8 sm:px-12 md:px-16 py-20 w-full md:w-[50%] max-w-2xl"
        >
          {/* Soft ambient glow behind text block */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `
              radial-gradient(ellipse 65% 50% at 30% 50%, rgba(52,211,153,0.07) 0%, transparent 70%),
              radial-gradient(ellipse 50% 60% at 20% 45%, rgba(139,92,246,0.06) 0%, transparent 65%)
            `
          }} />

          <p className="text-xs font-black uppercase tracking-[0.35em] mb-5"
            style={{ color: "rgba(52,211,153,0.6)" }}>
            Home of Somali
          </p>

          <h1 className="font-black uppercase leading-none mb-4">
            <span
              className="block text-5xl md:text-6xl lg:text-7xl"
              style={{
                color: "#22d3ee",
                textShadow: `
                  0 0 20px rgba(6,182,212,0.70),
                  0 0 50px rgba(6,182,212,0.35),
                  0 0 90px rgba(6,182,212,0.12)
                `
              }}
            >
              WARYAA
            </span>
            <span
              className="block text-5xl md:text-6xl lg:text-7xl"
              style={{
                color: "#ffffff",
                textShadow: `
                  0 0 20px rgba(255,255,255,0.5),
                  0 0 50px rgba(139,92,246,0.3),
                  0 0 90px rgba(139,92,246,0.12)
                `
              }}
            >
              GAMING
            </span>
          </h1>

          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-8" style={{ background: "rgba(52,211,153,0.5)" }} />
            <p className="text-xs font-black uppercase tracking-[0.25em]"
              style={{ color: "rgba(52,211,153,0.75)" }}>
              eFootball &amp; Esports
            </p>
          </div>

          <p className="text-white/55 text-sm md:text-base leading-relaxed mb-10 max-w-sm">
            Uniting Somali gamers, building champions, and representing
            Somalia on the global stage.
          </p>

          <div className="flex flex-wrap gap-3">
            {/* Join Discord — purple-to-pink gradient pill */}
            <a
              href="https://discord.com/invite/PGC5KFpjkD"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full font-bold text-sm text-white transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)" }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.085.118 18.11.136 18.126a19.888 19.888 0 0 0 5.994 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.995a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
              </svg>
              Join Discord
            </a>

            {/* View Tournaments — dark pill with border */}
            <Link
              href="/tournaments"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full font-bold text-sm text-white transition-colors hover:bg-white/10"
              style={{ background: "rgba(30,30,46,0.75)", border: "1.5px solid rgba(255,255,255,0.18)" }}
            >
              <Shield className="w-4 h-4 text-white/70" />
              View Tournaments
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border bg-card/50 py-6">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { label: "Players", value: stats?.totalPlayers ?? 0, icon: Users },
              { label: "Teams", value: stats?.totalTeams ?? 0, icon: Shield },
              { label: "Tournaments", value: stats?.totalTournaments ?? 0, icon: Trophy },
              { label: "Live Matches", value: stats?.liveMatches ?? 0, icon: Radio },
            ].map(({ label, value, icon: Icon }) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-2"
              >
                <Icon className="w-5 h-5 text-primary" />
                <div className="text-3xl font-black text-foreground">{value}</div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Upcoming tournament */}
      {(upcomingTournament || !tournaments) && (
        <section className="py-20 container mx-auto px-4">
          <motion.div custom={0} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-primary text-xs font-bold uppercase tracking-widest mb-1">Next Event</p>
                <h2 className="text-3xl font-black uppercase tracking-tight">Featured Tournament</h2>
              </div>
              <Button variant="ghost" className="gap-1 text-primary" asChild>
                <Link href="/tournaments">All Tournaments <ArrowRight className="w-4 h-4" /></Link>
              </Button>
            </div>

            {!upcomingTournament && !tournaments ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : upcomingTournament ? (
              <Link href={`/tournaments/${upcomingTournament.id}`}>
                <div className="relative rounded-xl border border-primary/30 bg-card p-8 hover:border-primary/60 transition-all duration-300 group cursor-pointer glow-primary overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div>
                      <Badge className="mb-3 bg-primary/20 text-primary border-primary/30 uppercase tracking-wider text-xs">
                        {upcomingTournament.status}
                      </Badge>
                      <h3 className="text-2xl font-black text-foreground mb-2">{upcomingTournament.name}</h3>
                      <p className="text-muted-foreground">{upcomingTournament.game} — {upcomingTournament.format}</p>
                    </div>
                    <div className="flex gap-8">
                      <div className="text-center">
                        <div className="text-2xl font-black text-primary">{upcomingTournament.prizePool}</div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Prize Pool</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-black text-foreground">
                          {upcomingTournament.maxParticipants >= 9999 ? upcomingTournament.currentParticipants : `${upcomingTournament.currentParticipants}/${upcomingTournament.maxParticipants}`}
                        </div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Participants</div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="text-center py-12 text-muted-foreground border border-border rounded-xl">
                No upcoming tournaments scheduled
              </div>
            )}
          </motion.div>
        </section>
      )}

      {/* Top 3 Players */}
      <section className="py-20 bg-card/30">
        <div className="container mx-auto px-4">
          <motion.div custom={1} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-primary text-xs font-bold uppercase tracking-widest mb-1">Leaderboard</p>
                <h2 className="text-3xl font-black uppercase tracking-tight">Top Players</h2>
              </div>
              <Button variant="ghost" className="gap-1 text-primary" asChild>
                <Link href="/rankings">Full Rankings <ArrowRight className="w-4 h-4" /></Link>
              </Button>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {!rankings
                ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
                : top3.map((player, i) => (
                    <motion.div
                      key={player.playerId}
                      custom={i}
                      variants={fadeUp}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                    >
                      <Link href={`/players/${player.playerId}`}>
                        <div className={`relative rounded-xl border p-5 hover:border-primary/60 transition-all duration-300 cursor-pointer group overflow-hidden
                          ${i === 0 ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>

                          {/* Rank badge */}
                          <div className={`absolute top-4 right-4 text-xs font-black tabular-nums ${i === 0 ? "text-primary" : "text-muted-foreground/50"}`}>
                            #{i + 1}
                          </div>

                          {/* Avatar + name */}
                          <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                              {(player as any).avatarUrl ? (
                                <img
                                  src={(player as any).avatarUrl}
                                  alt={player.username}
                                  className={`w-14 h-14 rounded-full object-cover border-2 ${i === 0 ? "border-primary" : "border-border"}`}
                                />
                              ) : (
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center font-black text-xl border-2
                                  ${i === 0 ? "bg-primary/20 border-primary text-primary" : "bg-muted border-border text-muted-foreground"}`}>
                                  {(player.username ?? "?").charAt(0).toUpperCase()}
                                </div>
                              )}
                              {i === 0 && (
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
                                  <Star className="w-3 h-3 text-amber-900 fill-amber-900" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 pr-8">
                              <h3 className="flex items-center gap-1 font-black text-base truncate leading-tight">
                                <span className="truncate">{player.username}</span>
                                {(player as any).verified && (
                                  <img src={`${import.meta.env.BASE_URL}verified.png`} alt="" className="h-4 w-4 shrink-0 object-contain" draggable={false} />
                                )}
                              </h3>
                              {player.teamName && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{player.teamName}</p>
                              )}
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="mt-4 grid grid-cols-3 gap-2 text-center border-t border-border/50 pt-4">
                            <div>
                              <div className="text-sm font-black text-primary">{player.points}</div>
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Points</div>
                            </div>
                            <div>
                              <div className="text-sm font-black">{player.tournamentWins}</div>
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Wins</div>
                            </div>
                            <div>
                              <div className="text-sm font-black">{(player.winRate * 100).toFixed(0)}%</div>
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Rate</div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Latest News */}
      <section className="py-20 container mx-auto px-4">
        <motion.div custom={2} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-primary text-xs font-bold uppercase tracking-widest mb-1">Updates</p>
              <h2 className="text-3xl font-black uppercase tracking-tight">Latest News</h2>
            </div>
            <Button variant="ghost" className="gap-1 text-primary" asChild>
              <Link href="/news">All News <ArrowRight className="w-4 h-4" /></Link>
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {!news
              ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)
              : news.length === 0
              ? (
                <div className="col-span-3 text-center py-12 text-muted-foreground border border-border rounded-xl">
                  No news yet
                </div>
              )
              : news.map((article, i) => (
                  <motion.div key={article.id} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                    <Link href={`/news/${article.id}`}>
                      <div className="rounded-xl border border-border bg-card p-6 hover:border-primary/40 transition-all duration-300 cursor-pointer h-full flex flex-col gap-3 group">
                        <Badge variant="secondary" className="self-start text-[10px] uppercase tracking-widest">
                          {article.category}
                        </Badge>
                        <h3 className="font-black text-lg leading-tight group-hover:text-primary transition-colors">
                          {article.title}
                        </h3>
                        {article.excerpt && (
                          <p className="text-muted-foreground text-sm line-clamp-2 flex-1">{article.excerpt}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(article.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                    </Link>
                  </motion.div>
                ))}
          </div>
        </motion.div>
      </section>

      {/* Live Center CTA */}
      <section className="py-20 bg-card/30">
        <div className="container mx-auto px-4 text-center">
          <motion.div custom={3} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-red-500 live-pulse" />
              <span className="text-red-500 text-xs font-bold uppercase tracking-widest">Live Now</span>
            </div>
            <h2 className="text-4xl font-black uppercase tracking-tight mb-4">
              {stats?.liveMatches ?? 0} Active {stats?.liveMatches === 1 ? "Match" : "Matches"}
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Follow live scores, bracket updates, and stream links in real time.
            </p>
            <Button size="lg" variant="outline" className="gap-2 border-red-500/40 text-red-400 hover:border-red-500 hover:text-red-400" asChild>
              <Link href="/live">
                <Radio className="w-5 h-5" />
                Open Live Center
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
