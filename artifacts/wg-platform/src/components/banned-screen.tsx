import { AuthUser } from "@/hooks/use-auth";

interface BannedScreenProps {
  user: AuthUser;
}

const DURATION_LABEL: Record<string, string> = {
  "1d":  "1 Day",
  "5d":  "5 Days",
  "1w":  "1 Week",
  "1m":  "1 Month",
};

function formatBannedUntil(iso: string | null): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BannedScreen({ user }: BannedScreenProps) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      {/* Subtle scanline / vignette overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-lg text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-red-500/40 shadow-[0_0_40px_rgba(239,68,68,0.3)]">
            <img
              src="/logo.jpg"
              alt="Waryaa Gaming"
              className="w-full h-full object-cover opacity-80"
            />
          </div>
        </div>

        {/* Site name */}
        <p className="text-zinc-500 text-sm font-bold tracking-widest uppercase">
          Waryaa Gaming
        </p>

        {/* Ban icon + title */}
        <div className="space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-8 h-8 text-red-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </div>
          </div>

          <h1 className="text-3xl font-black text-white tracking-tight">
            You've Been Banned
          </h1>
          <p className="text-zinc-400 text-sm">
            Your account has been suspended from Waryaa Gaming.
          </p>
        </div>

        {/* Details card */}
        <div className="bg-zinc-900 border border-red-500/20 rounded-2xl overflow-hidden text-left">
          <div className="px-5 py-3 border-b border-zinc-800">
            <p className="text-xs font-black text-zinc-500 uppercase tracking-widest">
              Ban Details
            </p>
          </div>

          <div className="divide-y divide-zinc-800">
            <Row label="Account" value={user.displayName ?? user.username} />
            <Row
              label="Banned by"
              value={user.bannedBy ?? "Administrator"}
              valueClass="text-orange-400 font-bold"
            />
            <Row
              label="Reason"
              value={user.banReason ?? "No reason provided"}
              valueClass="text-red-300"
            />
            <Row
              label="Expires"
              value={formatBannedUntil(user.bannedUntil)}
              valueClass="text-zinc-300"
            />
          </div>
        </div>

        {/* Footer note */}
        <p className="text-zinc-600 text-xs leading-relaxed">
          If you believe this ban was issued in error, please contact an
          administrator through the official Waryaa Gaming Discord server.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass = "text-zinc-200",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="px-5 py-3.5 flex items-start gap-4">
      <span className="text-xs font-bold text-zinc-500 w-20 shrink-0 pt-0.5">
        {label}
      </span>
      <span className={`text-sm font-semibold break-words flex-1 ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
