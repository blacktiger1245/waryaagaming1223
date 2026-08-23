import { motion } from "framer-motion";
import {
  ArrowUpRight,
  ExternalLink,
  Gamepad2,
  Globe,
  Handshake,
  HeartHandshake,
  Medal,
  Swords,
  Trophy,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

// ── Assets ─────────────────────────────────────────────────────────────────────
// WG logo ships with the app. The SFF logo is the EXACT file the owner supplies.
const WG_LOGO = `${import.meta.env.BASE_URL}logo.jpg`;
const SFF_LOGO = `${import.meta.env.BASE_URL}sff-logo.jpg`;
const SFF_URL = "https://footballsomalia.so/";

// ── Motion helpers ─────────────────────────────────────────────────────────────
function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function SectionKicker({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "orange" }) {
  return (
    <p
      className={`mb-3 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.35em] ${
        tone === "orange" ? "text-amber-300" : "text-teal-300"
      }`}
    >
      <span className={`h-px w-8 ${tone === "orange" ? "bg-amber-300/60" : "bg-teal-300/60"}`} />
      {children}
      <span className={`h-px w-8 ${tone === "orange" ? "bg-amber-300/60" : "bg-teal-300/60"}`} />
    </p>
  );
}

// Glass medallion wrapper for a logo.
function LogoMedallion({
  src,
  alt,
  label,
  ring = "ring-sky-400/40",
  glow = "shadow-[0_0_60px_rgba(56,189,248,0.35)]",
  onErrorHide = false,
}: {
  src: string;
  alt: string;
  label: string;
  ring?: string;
  glow?: string;
  onErrorHide?: boolean;
}) {
  return (
    <div className="group flex flex-col items-center gap-4">
      <div
        className={`relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] ring-2 ${ring} ${glow} backdrop-blur-md transition-transform duration-300 group-hover:-translate-y-1 sm:h-40 sm:w-40`}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onError={
            onErrorHide
              ? (e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }
              : undefined
          }
          className="h-full w-full object-contain p-4"
        />
      </div>
      <span className="text-center text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-400">
        {label}
      </span>
    </div>
  );
}

// ── Benefits data ──────────────────────────────────────────────────────────────
const BENEFITS: { icon: React.ReactNode; title: string; text: string; accent: string }[] = [
  {
    icon: <Swords className="h-6 w-6" />,
    title: "Tournament Collaboration",
    text: "Co-hosted competitions that bring Somali football fans into the esports arena and elevate local tournaments to a new standard.",
    accent: "text-sky-400 bg-sky-400/10 border-sky-400/20",
  },
  {
    icon: <TrendingUp className="h-6 w-6" />,
    title: "Player Development",
    text: "Structured pathways, coaching and scouting that help players grow — on the pitch and on the virtual field.",
    accent: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  },
  {
    icon: <Users className="h-6 w-6" />,
    title: "Community Growth",
    text: "Shared platforms and events that bring together football clubs, esports teams and passionate fans across Somalia.",
    accent: "text-sky-400 bg-sky-400/10 border-sky-400/20",
  },
  {
    icon: <Medal className="h-6 w-6" />,
    title: "National Representation",
    text: "Proudly representing Somali football and Somali esports on the national stage, in clubs and in official competitions.",
    accent: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  },
  {
    icon: <Globe className="h-6 w-6" />,
    title: "International Opportunities",
    text: "Opening doors to international tournaments, partnerships and talent exposure beyond Somalia's borders.",
    accent: "text-sky-400 bg-sky-400/10 border-sky-400/20",
  },
];

const WG_POINTS = [
  "Somali gaming community",
  "eFootball tournaments",
  "Players and teams",
  "Community events",
  "Esports content and media",
];

const SFF_POINTS = [
  "Official Somali sport representation",
  "Sport development",
  "National teams and competitions",
  "Player opportunities",
  "National and international sport activities",
];
export default function PartnershipPage() {
  return (
    <div className="flex-1 bg-[#04060f] text-white">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-sky-500/10 blur-[120px]" />
          <div className="absolute left-1/4 top-1/2 h-72 w-72 rounded-full bg-blue-700/10 blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-orange-500/5 blur-[120px]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)",
              backgroundSize: "34px 34px",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 py-20 text-center sm:py-24">
          <FadeUp>
            <SectionKicker>Our Partnership</SectionKicker>
          </FadeUp>

          <FadeUp delay={0.08}>
            <h1 className="mx-auto max-w-4xl text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-6xl md:text-7xl">
              <span className="bg-gradient-to-r from-teal-300 via-white to-emerald-300 bg-clip-text text-transparent">
                Stronger
              </span>{" "}
              <span className="bg-gradient-to-r from-amber-300 via-white to-yellow-300 bg-clip-text text-transparent">
                Together
              </span>
            </h1>
          </FadeUp>

          <FadeUp delay={0.16}>
            <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
              Waryaa Gaming is proud to partner with the Esomali Sport Federation to support
              the growth, development, and representation of Somali football and esports.
            </p>
          </FadeUp>

          {/* Logos: WG | × | SFF */}
          <FadeUp delay={0.24} className="mt-12">
            <div className="flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-10">
              <LogoMedallion
                src={WG_LOGO}
                alt="Waryaa Gaming"
                label="Waryaa Gaming"
                ring="ring-teal-400/50"
                glow="shadow-[0_0_60px_rgba(45,212,191,0.45)]"
              />

              <div className="flex flex-col items-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-teal-300/40 bg-white/[0.04] text-4xl font-black text-teal-300 shadow-[0_0_40px_rgba(45,212,191,0.4)] backdrop-blur">
                  ×
                </span>
                <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                  Partnership
                </span>
              </div>

              <LogoMedallion
                src={SFF_LOGO}
                alt="Esomali Sport Federation"
                label="Esomali Sport Federation"
                ring="ring-amber-400/40"
                glow="shadow-[0_0_60px_rgba(212,175,55,0.35)]"
                onErrorHide
              />
            </div>
          </FadeUp>

          <FadeUp delay={0.34} className="mt-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2 text-xs font-semibold text-zinc-300">
              <HeartHandshake className="h-4 w-4 text-sky-400" />
              Football × Esports × Somalia
            </div>
          </FadeUp>
        </div>
      </section>
{/* ── PARTNERSHIP BENEFITS ─────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl px-6 py-20 sm:py-24">
        <FadeUp className="text-center">
          <SectionKicker>Why We Partner</SectionKicker>
          <h2 className="text-3xl font-black uppercase tracking-tight sm:text-5xl">
            Partnership Benefits
          </h2>
        </FadeUp>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b, i) => (
            <FadeUp key={b.title} delay={i * 0.07}>
              <div className="group h-full wg-card rounded-2xl border border-teal-400/15 bg-gradient-to-b from-teal-500/[0.05] to-transparent p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-teal-400/40 hover:shadow-[0_12px_44px_-14px_rgba(45,212,191,0.5)]">
                <span
                  className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl border ${b.accent} transition-transform duration-300 group-hover:scale-110`}
                >
                  {b.icon}
                </span>
                <h3 className="mt-5 text-lg font-black uppercase tracking-tight">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{b.text}</p>
              </div>
            </FadeUp>
          ))}

          <FadeUp delay={0.42}>
            <div className="flex h-full flex-col items-start justify-center rounded-2xl border border-amber-400/25 bg-gradient-to-br from-yellow-500/10 to-amber-600/10 p-6">
              <Zap className="h-8 w-8 text-amber-300" />
              <h3 className="mt-4 text-lg font-black uppercase tracking-tight text-amber-300">
                One Shared Vision
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                Football and esports, united to build the next generation of Somali
                talent — on every stage, at every level.
              </p>
            </div>
          </FadeUp>
        </div>
      </section>
{/* ── ABOUT THE PARTNERSHIP ────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-0 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-sky-500/10 blur-[120px]" />
          <div className="absolute right-0 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-orange-500/10 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 py-14 sm:py-20">
          <FadeUp className="text-center">
            <SectionKicker>Two Leaders, One Mission</SectionKicker>
            <h2 className="text-3xl font-black uppercase tracking-tight sm:text-5xl">
              About the Partnership
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
              Two proud organizations, side by side. Waryaa Gaming brings the esports
              energy; the Esomali Sport Federation brings the national sport. Together
              they connect Somali football and esports like never before.
            </p>
          </FadeUp>

          <div className="mt-14 grid items-stretch gap-6 md:grid-cols-[1fr_auto_1fr]">
            {/* WG column */}
            <FadeUp>
              <div className="h-full wg-card rounded-2xl border border-teal-400/20 bg-gradient-to-b from-teal-500/[0.08] to-transparent p-7 backdrop-blur">
                <div className="flex items-center gap-3">
                  <img src={WG_LOGO} alt="Waryaa Gaming" className="h-11 w-11 rounded-xl object-cover ring-2 ring-teal-400/40" />
                  <div>
                    <h3 className="text-base font-black uppercase tracking-tight text-teal-300">Waryaa Gaming</h3>
                    <p className="text-[11px] uppercase tracking-widest text-zinc-500">Esports Community</p>
                  </div>
                </div>
                <ul className="mt-6 space-y-3">
                  {WG_POINTS.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm text-zinc-300">
                      <Gamepad2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeUp>

            {/* Glowing handshake connector */}
            <FadeUp delay={0.15} className="flex items-center justify-center">
              <div className="relative flex h-20 w-20 items-center justify-center md:h-24 md:w-24">
                <span className="absolute inset-0 rounded-full bg-amber-400/20 blur-xl" />
                <span className="absolute inset-0 rounded-full border border-amber-300/40" />
                <Handshake className="relative h-9 w-9 text-white drop-shadow-[0_0_12px_rgba(212,175,55,0.9)]" />
              </div>
            </FadeUp>

            {/* SFF column */}
            <FadeUp delay={0.08}>
              <div className="h-full wg-card rounded-2xl border border-amber-400/20 bg-gradient-to-b from-amber-500/[0.08] to-transparent p-7 backdrop-blur">
                <div className="flex items-center gap-3">
                  <img
                    src={SFF_LOGO}
                    alt="Esomali Sport Federation"
                    className="h-11 w-11 rounded-xl bg-white object-contain p-1 ring-2 ring-amber-400/40"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                  <div>
                    <h3 className="text-base font-black uppercase tracking-tight text-amber-300">
                      Esomali Sport Federation
                    </h3>
                    <p className="text-[11px] uppercase tracking-widest text-zinc-500">National Sport</p>
                  </div>
                </div>
                <ul className="mt-6 space-y-3">
                  {SFF_POINTS.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm text-zinc-300">
                      <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>
{/* ── OFFICIAL FEDERATION ─────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <FadeUp className="text-center">
          <SectionKicker tone="orange">Official Federation</SectionKicker>
          <h2 className="text-3xl font-black uppercase tracking-tight sm:text-5xl">
            Meet the Esomali Sport Federation
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
            The Esomali Sport Federation is the official sport federation for Somalia,
            represented by the SFF emblem shown here. This partnership connects WG's esports
            community directly to the national home of Somali sport.
          </p>
        </FadeUp>

        <FadeUp delay={0.12} className="mt-12">
          {/* Teal / gold federation-themed card */}
          <div className="relative overflow-hidden rounded-3xl border border-teal-300/25 bg-gradient-to-br from-teal-800 via-emerald-900 to-amber-900 p-8 shadow-[0_0_80px_-20px_rgba(20,184,166,0.5)] sm:p-12">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-teal-300/20 blur-3xl" />
              <div className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl" />
            </div>

            <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
              <div className="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white p-3 shadow-2xl sm:h-44 sm:w-44">
                <img
                  src={SFF_LOGO}
                  alt="Esomali Sport Federation"
                  className="h-full w-full object-contain"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </div>

              <div className="text-center sm:text-left">
                <h3 className="text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
                  Esomali Sport Federation
                </h3>
                <p className="mt-1 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/20 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-amber-100">
                  <Medal className="h-3.5 w-3.5" /> Official Federation
                </p>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-teal-50/90">
                  As the governing body of sport in Somalia, the Esomali Sport
                  Federation leads national teams and competitions, develops sport at
                  every level, and represents Somali sport nationally and internationally.
                </p>
              </div>
            </div>
          </div>
        </FadeUp>

        {/* Visit button */}
        <FadeUp delay={0.2} className="mt-12 text-center">
          <a
            href={SFF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-500 px-8 py-4 text-sm font-black uppercase tracking-wider text-slate-900 shadow-[0_0_50px_-10px_rgba(45,212,191,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_60px_-8px_rgba(45,212,191,0.85)]"
          >
            <ExternalLink className="h-5 w-5 transition-transform group-hover:scale-110" />
            Visit Esomali Sport Federation
            <ArrowUpRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
            <Globe className="h-3.5 w-3.5 text-teal-300/70" />
            This opens footballsomalia.so — the official SFF website, outside WG.
          </p>
        </FadeUp>
      </section>
    </div>
  );
}