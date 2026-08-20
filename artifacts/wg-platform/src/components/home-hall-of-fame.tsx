import { useQuery } from "@tanstack/react-query";
import { Loader2, Star, Trophy, Swords, Target, Award, Crown } from "lucide-react";
import { storageUrl } from "@/lib/api";

interface HofEntry {
  id: number;
  playerId: number;
  playerName: string;
  username: string;
  avatarUrl: string | null;
  seasonId: number | null;
  seasonName: string | null;
  games: number;
  trophies: number;
  goals: number;
  motmAwards: number;
}

const StatCell = ({ icon: Icon, value, label }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; value: number; label: string }) => (
  <div className="flex min-w-0 flex-col items-center gap-1 text-gold">
    <Icon className="mb-1 h-5 w-5" strokeWidth={1.6} />
    <span className="text-2xl font-black leading-none text-white md:text-3xl">{value}</span>
    <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-gold/80 md:text-[10px]">{label}</span>
  </div>
);

export default function HomeHallOfFame() {
  const { data: entries = [], isLoading } = useQuery<HofEntry[]>({
    queryKey: ["hall-of-fame"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/hall-of-fame`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const frameSrc = `${import.meta.env.BASE_URL}hallofframe.png`;
  const logoSrc = `${import.meta.env.BASE_URL}logo.jpg`;

  return (
    <section className="relative overflow-hidden bg-black py-20 md:py-28">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.12),transparent_60%)]" />
      <div className="container relative mx-auto px-4">
        <div className="mb-12 text-center md:mb-16">
          <img src={logoSrc} alt="Waryaa Gaming" className="mx-auto mb-4 h-12 w-12 rounded-lg object-cover glow-gold" />
          <h2 className="text-gold-gradient text-4xl font-black uppercase tracking-[0.12em] md:text-5xl">Hall of Fame</h2>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.35em] text-gold/70">Waryaa Gaming Legends</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>
        ) : entries.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-gold/25 bg-black/40 px-6 py-14 text-center">
            <Star className="mx-auto mb-4 h-10 w-10 text-gold/60" />
            <h3 className="text-2xl font-black uppercase tracking-wide text-gold">Hall of Fame</h3>
            <p className="mt-2 text-sm text-white/60">No Hall of Fame players have been selected yet.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-10 md:gap-14">
            {entries.map((e) => (
              <div key={e.id} className="flex justify-center">
                <div className="relative w-full max-w-xl overflow-hidden rounded-[28px] border border-gold/50 bg-black shadow-[0_0_60px_rgba(212,175,55,0.35)]">
                  {/* Gold metallic frame */}
                  <div aria-hidden className="pointer-events-none absolute inset-0 m-1.5 rounded-[26px] border-2 border-gold/30" />
                  <div aria-hidden className="pointer-events-none absolute inset-1.5 rounded-[26px] bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.18),transparent_55%)]" />
                  {/* Reference frame template as backdrop */}
                  <img src={frameSrc} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-60" />

                  <div className="relative z-10 flex flex-col items-center px-6 pb-8 pt-10 text-center md:pb-10 md:pt-12">
                    <Crown className="mb-2 h-7 w-7 text-gold" />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-gold/80">Waryaa Gaming</span>

                    {/* Circular portrait */}
                    <div className="mb-6 mt-5">
                      <div className="rounded-full border-4 border-gold/70 p-1.5 shadow-[0_0_30px_rgba(212,175,55,0.5)]">
                        <div className="h-28 w-28 overflow-hidden rounded-full border border-gold/40 bg-[#1a1205] md:h-32 md:w-32">
                          {e.avatarUrl ? (
                            <img src={storageUrl(e.avatarUrl)} alt={e.playerName} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-4xl font-black text-gold/70">{e.playerName.charAt(0).toUpperCase()}</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <h3 className="text-2xl font-black uppercase tracking-wide text-white md:text-3xl">{e.playerName}</h3>
                    <p className="mt-1.5 text-sm font-bold uppercase tracking-[0.25em] text-gold">{e.seasonName ? `Class of ${e.seasonName.replace(/\D/g, "")}` : "Class of …"}</p>

                    <div className="mt-6 grid w-full grid-cols-4 gap-2 border-t border-gold/25 pt-5">
                      <StatCell icon={Swords} value={e.games} label="Games" />
                      <StatCell icon={Trophy} value={e.trophies} label="Trophies" />
                      <StatCell icon={Target} value={e.goals} label="Goals" />
                      <StatCell icon={Award} value={e.motmAwards} label="MOTM" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}