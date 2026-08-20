import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import HallOfFameCard, { type HofPlayer } from "@/components/hall-of-fame-card";

interface HofEntry {
  id: number;
  playerName: string;
  avatarUrl: string | null;
  seasonName: string | null;
  games: number;
  trophies: number;
  goals: number;
  motmAwards: number;
}

export default function HomeHallOfFame() {
  const { data: entries = [], isLoading } = useQuery<HofEntry[]>({
    queryKey: ["hall-of-fame"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/hall-of-fame`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  return (
    <section className="relative overflow-hidden bg-black py-20 md:py-28">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.12),transparent_60%)]" />
      <div className="container relative mx-auto px-4">
        <div className="mb-12 text-center md:mb-16">
          <h2 className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-rose-500 to-cyan-400 text-4xl font-black uppercase tracking-[0.12em] md:text-5xl">Hall of Fame</h2>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.35em] text-gold/70">Waryaa Gaming Legends</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>
        ) : entries.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-amber-300/25 bg-black/40 px-6 py-14 text-center">
            <h3 className="text-2xl font-black uppercase tracking-wide text-gold">Hall of Fame</h3>
            <p className="mt-2 text-sm text-white/60">No Hall of Fame players have been selected yet.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-14">
            {entries.map((e) => {
              const player: HofPlayer = {
                name: e.playerName,
                avatar: e.avatarUrl,
                games: e.games,
                trophies: e.trophies,
                goals: e.goals,
                motm: e.motmAwards,
                classOf: e.seasonName ? Number(e.seasonName.replace(/\D/g, "")) || 0 : 0,
              };
              return <HallOfFameCard key={e.id} player={player} />;
            })}
          </div>
        )}
      </div>
    </section>
  );
}