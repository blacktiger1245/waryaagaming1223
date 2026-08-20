import { useQuery } from "@tanstack/react-query";
import { Loader2, Star } from "lucide-react";
import { storageUrl } from "@/lib/api";

interface HofEntry {
  id: number;
  playerId: number;
  playerName: string;
  username: string;
  avatarUrl: string | null;
  seasonName: string | null;
  games: number;
  trophies: number;
  goals: number;
  motmAwards: number;
}

/**
 * The certificate template at /hallofframe.png is the visual BASE LAYER. Player
 * data is overlaid into the image's empty areas. All positions are PERCENTAGES
 * of a container locked to the image's aspect ratio (124 x 90) so everything
 * scales together. Tune the percentages to match the printed guides.
 */
const CERT = { w: 124, h: 90, brandTop: 6, classTop: 22, portraitTop: 30, portraitWidth: 27, nameTop: 65, statsTop: 82 };

function Stats({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-gold/90 md:text-[10px]" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>{label}</span>
      <span className="text-2xl font-black text-white md:text-3xl" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.9)" }}>{value}</span>
    </div>
  );
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
          <div className="mx-auto grid gap-8 md:max-w-4xl md:grid-cols-2 xl:max-w-none xl:grid-cols-3">
            {entries.map((e) => <Certificate key={e.id} entry={e} frameSrc={frameSrc} />)}
          </div>
        )}
      </div>
    </section>
  );
}

function Certificate({ entry: e, frameSrc }: { entry: HofEntry; frameSrc: string }) {
  const seasonDigits = e.seasonName ? e.seasonName.replace(/\D/g, "") : "";
  return (
    <figure className="relative w-full select-none overflow-hidden rounded-md shadow-[0_0_50px_rgba(212,175,55,0.25)]" style={{ aspectRatio: `${CERT.w} / ${CERT.h}`, background: "#0a0a08" }}>
      {/* The certificate template image is the base layer */}
      <img src={frameSrc} alt="Waryaa Gaming Hall of Fame certificate" draggable={false} className="absolute inset-0 h-full w-full object-fill" />

      {/* Branding */}
      <div className="absolute inset-x-0 text-center font-black uppercase tracking-[0.3em] text-gold" style={{ top: `${CERT.brandTop}%`, fontSize: "clamp(9px, 1.6vw, 15px)", textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>Waryaa Gaming · Hall of Fame</div>

      {/* Season */}
      <div className="absolute inset-x-0 text-center font-black uppercase tracking-[0.28em] text-gold" style={{ top: `${CERT.classTop}%`, fontSize: "clamp(11px, 2.2vw, 20px)", textShadow: "0 2px 4px rgba(0,0,0,0.9)" }}>{seasonDigits ? `Class of ${seasonDigits}` : "Class of"}</div>

      {/* Circular player photo — sits inside the certificate's portrait ring */}
      <div className="absolute -translate-x-1/2" style={{ left: "50%", top: `${CERT.portraitTop}%`, width: `${CERT.portraitWidth}%` }}>
        <div className="relative w-full overflow-hidden rounded-full" style={{ aspectRatio: "1 / 1", border: "2px solid rgb(212 175 55 / 0.8)" }}>
          {e.avatarUrl ? (
            <img src={storageUrl(e.avatarUrl)} alt={e.playerName} className="h-full w-full object-cover object-center" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#1a1205] text-[32%] font-black text-gold/70">{e.playerName.charAt(0).toUpperCase()}</div>
          )}
        </div>
      </div>

      {/* Player name */}
      <div className="absolute inset-x-0 px-6 text-center font-black uppercase tracking-[0.18em] text-white" style={{ top: `${CERT.nameTop}%`, fontSize: "clamp(12px, 2.4vw, 22px)", textShadow: "0 2px 5px rgba(0,0,0,0.9)" }}>{e.playerName}</div>

      {/* Statistics — 2 x 2, matching the certificate layout */}
      <div className="absolute inset-x-0 grid grid-cols-2 gap-y-2 px-6" style={{ top: `${CERT.statsTop}%` }}>
        <Stats label="Games" value={e.games} />
        <Stats label="Trophies" value={e.trophies} />
        <Stats label="Goals" value={e.goals} />
        <Stats label="MOTM Awards" value={e.motmAwards} />
      </div>
    </figure>
  );
}