import { Gamepad2, Trophy, Target, Award, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { storageUrl } from "@/lib/api";

export interface HofPlayer {
  name: string;
  avatar: string | null;
  games: number;
  trophies: number;
  goals: number;
  motm: number;
  classOf: number;
}

const GOLD = "linear-gradient(170deg,#f7e48b 0%,#d4af37 42%,#8a6d1f 78%,#c8a13a 100%)";

// Decorative gold laurel branch (pure SVG, one side; the other is mirrored)
const LEAVES = [
  { x: 62, y: 210, r: -38 },
  { x: 40, y: 176, r: -26 },
  { x: 34, y: 140, r: -22 },
  { x: 42, y: 104, r: -34 },
  { x: 52, y: 70, r: -58 },
  { x: 40, y: 36, r: -16 },
];

function LaurelBranch({ flip }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 90 260"
      aria-hidden
      className="h-[78%] max-h-[250px] w-auto"
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
      fill="none"
    >
      <path d="M48,250 C66,212 22,160 44,104 C56,70 44,48 48,14" stroke="#8a6d1f" strokeWidth="3" strokeLinecap="round" />
      {LEAVES.map((l, i) => {
        const ox = i % 2 === 0 ? 10 : -6;
        return <ellipse key={i} cx={l.x + ox} cy={l.y} rx="8" ry="15" fill="#d4af37" fillOpacity="0.95" transform={`rotate(${l.r} ${l.x + ox} ${l.y})`} />;
      })}
    </svg>
  );
}

function StatItem({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-300/30 bg-black/40 px-3 py-2 shadow-[inset_0_0_14px_rgba(212,175,55,0.12)] transition-transform hover:-translate-y-0.5 hover:shadow-[inset_0_0_18px_rgba(212,175,55,0.2)] md:px-3.5 md:py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300/40 bg-gradient-to-br from-amber-300/20 to-transparent md:h-10 md:w-10" style={{ color }}>
        <Icon className="h-4 w-4 md:h-5 md:w-5" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-amber-200/70 md:text-[9px]">{label}</div>
        <strong className="text-lg font-black leading-none text-white md:text-xl" style={{ textShadow: "0 0 12px rgba(212,175,55,0.4)" }}>{value}</strong>
      </div>
    </div>
  );
}

function GoldEmblem({ size = "lg" }: { size: "sm" | "lg" }) {
  const d = size === "lg" ? "h-14 w-14" : "h-10 w-10";
  return (
    <div className={`${d} flex items-center justify-center rounded-full border border-black/30 shadow-[0_0_22px_rgba(212,175,55,0.55)]`} style={{ background: GOLD }}>
      <span className="font-black text-black" style={{ fontSize: size === "lg" ? "1rem" : "0.7rem" }}>WG</span>
    </div>
  );
}

export default function HallOfFameCard({ player }: { player: HofPlayer }) {
  return (
    <div className="hall-of-fame-card select-none" style={{ fontFamily: "'Orbitron','Rajdhani',sans-serif" }}>
      <div className="relative h-full w-full rounded-[28px] p-[2px]" style={{ background: GOLD, boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 45px rgba(212,175,55,0.28)" }}>
        <div className="h-full w-full rounded-[26px] bg-[#060606] p-[8px]">
          <div
            className="relative flex h-full w-full flex-col items-center justify-between overflow-hidden rounded-[20px] border border-amber-300/25 px-5 py-6 text-center sm:px-10 sm:py-8"
            style={{
              background: "radial-gradient(circle at 50% 12%, rgba(255,190,60,0.10), transparent 42%), linear-gradient(165deg,#080808 0%,#151515 45%,#050505 100%)",
            }}
          >
            {/* decorative gold corners + particles */}
            <Corner className="left-0 top-0 border-l-2 border-t-2" />
            <Corner className="right-0 top-0 border-r-2 border-t-2" />
            <Corner className="bottom-0 left-0 border-b-2 border-l-2" />
            <Corner className="bottom-0 right-0 border-b-2 border-r-2" />
            <Dot className="left-[12%] top-[24%]" d="4" />
            <Dot className="right-[14%] top-[30%]" d="3" />
            <Dot className="left-[16%] bottom-[28%]" d="3" />
            <Dot className="right-[10%] bottom-[22%]" d="4" />

            {/* Header */}
            <div className="relative z-10 flex flex-col items-center">
              <GoldEmblem size="lg" />
              <h1 className="gold-metallic-text mt-2 text-xl font-black uppercase tracking-[0.28em] md:text-2xl">Waryaa Gaming</h1>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.5em] text-amber-200/70 md:text-xs">Hall of Fame</div>
              <div className="mt-1 text-sm font-black uppercase tracking-[0.3em] text-amber-300 md:text-base" style={{ textShadow: "0 0 14px rgba(212,175,55,0.6)" }}>Class of {player.classOf}</div>
              <div className="mt-3 flex items-center gap-2">
                <span className="h-px w-14" style={{ background: GOLD }} />
                <Star className="h-3 w-3 text-amber-400" />
                <span className="h-px w-14" style={{ background: GOLD }} />
              </div>
            </div>

            {/* Avatar + laurel */}
            <div className="relative z-10 flex w-full items-center justify-center py-2">
              <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2"><LaurelBranch /></div>
              <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2"><LaurelBranch flip /></div>
              <div className="relative rounded-full border-[3px] border-amber-900/60 p-[6px]" style={{ boxShadow: "0 0 0 2px #000, 0 0 34px rgba(212,175,55,0.5)" }}>
                <div className="rounded-full p-[3px]" style={{ background: GOLD }}>
                  <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-full bg-[#0a0a0a] md:h-48 md:w-48 lg:h-56 lg:w-56">
                    {player.avatar ? (
                      <img src={storageUrl(player.avatar)} alt={player.name} className="h-full w-full object-cover object-center" />
                    ) : (
                      <span className="text-4xl font-black text-amber-400/70 md:text-5xl">{player.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Name plaque */}
            <div className="relative z-10 flex max-w-full items-center justify-center gap-2.5 rounded-xl border border-amber-300/40 bg-black/60 px-5 py-2 text-center shadow-[0_0_18px_rgba(212,175,55,0.25),inset_0_0_12px_rgba(212,175,55,0.15)]">
              <Star className="h-3 w-3 shrink-0 text-amber-400" />
              <p className="gold-metallic-text max-w-[60vw] truncate text-base font-black uppercase tracking-[0.18em] md:text-xl">{player.name}</p>
              <Star className="h-3 w-3 shrink-0 text-amber-400" />
            </div>

            {/* Statistics 2 x 2 */}
            <div className="relative z-10 grid w-full grid-cols-2 gap-2.5 md:gap-3">
              <StatItem icon={Gamepad2} label="Games" value={player.games} color="#22d3ee" />
              <StatItem icon={Trophy} label="Trophies" value={player.trophies} color="#fbbf24" />
              <StatItem icon={Target} label="Goals" value={player.goals} color="#4ade80" />
              <StatItem icon={Award} label="MOTM" value={player.motm} color="#c084fc" />
            </div>

            {/* Footer emblem */}
            <div className="relative z-10 mt-1 flex flex-col items-center gap-1">
              <GoldEmblem size="sm" />
              <span className="text-[9px] font-bold uppercase tracking-[0.35em] text-amber-200/50">Est. 2020</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return <span aria-hidden className={`pointer-events-none absolute z-0 h-8 w-8 border-amber-400/60 ${className}`} />;
}
function Dot({ className, d }: { className: string; d: string }) {
  return <span aria-hidden className={`pointer-events-none absolute z-0 rounded-full bg-amber-300/70 ${className}`} style={{ width: `${d}px`, height: `${d}px` }} />;
}