import { Handshake, Wrench, type LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type ComingSoonPageProps = {
  section: "WG Academy" | "Partners";
};

export default function ComingSoonPage({ section }: ComingSoonPageProps) {
  const Icon: LucideIcon = section === "WG Academy" ? Wrench : Handshake;
  const { loginWithDiscord } = useAuth();

  return (
    <main
      aria-label={`${section} coming soon`}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#071827] px-6 py-12 text-white"
    >
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-violet-700/15 blur-[120px]" />

      <div className="relative flex w-full max-w-[430px] flex-1 flex-col items-center justify-center">
        <div className="mb-12 text-center">
          <p className="text-xl font-black uppercase tracking-tight text-slate-100 sm:text-2xl">
            Waryaa Gaming
          </p>
        </div>

        <section className="w-full rounded-[26px] border border-slate-700/80 bg-gradient-to-b from-[#0f2034] to-[#161532] px-7 py-10 text-center shadow-2xl shadow-black/25 sm:px-10 sm:py-12">
          <div className="mx-auto mb-9 flex h-24 w-24 items-center justify-center rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/20 to-violet-700/25 shadow-inner shadow-cyan-500/10">
            <Icon className="h-12 w-12 text-cyan-400" strokeWidth={1.8} />
          </div>

          <h1 className="mb-3 text-3xl font-black tracking-tight text-slate-100 sm:text-4xl">
            Under Construction
          </h1>
          <p className="mx-auto max-w-xs text-base leading-relaxed text-slate-400 sm:text-lg">
            Our admins are working hard to get everything ready.
            <br />
            Check back soon!
          </p>

          <div className="my-9 flex items-center justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2.5 w-2.5 rounded-full bg-cyan-400"
                style={{ animation: `coming-soon-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={loginWithDiscord}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#5865f2] py-3.5 text-base font-black text-white shadow-lg shadow-indigo-950/30 transition hover:bg-[#4752c4] active:scale-[0.98]"
            data-testid="button-admin-sign-in"
          >
            <DiscordIcon />
            Admin Sign In
          </button>
        </section>
      </div>

      <p className="relative mt-8 text-center text-[11px] text-slate-500/70">
        © {new Date().getFullYear()} Waryaa Gaming · All rights reserved
      </p>

      <style>{`
        @keyframes coming-soon-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.6; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </main>
  );
}

function DiscordIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.041.107 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
    </svg>
  );
}