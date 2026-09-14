/**
 * TopNav — brand + navigation filter tabs + user profile widget.
 */
import { useState } from "react";
import { Coins, Trophy } from "lucide-react";
import { glaze } from "./glaze";
import { glassPanel, palette } from "./theme";

export type TopFilter =
  | "ALL"
  | "LIVE"
  | "UPCOMING"
  | "COMPLETED";

export const TOP_FILTERS: { key: TopFilter; label: string }[] = [
  { key: "ALL", label: "ALL CATEGORIES" },
  { key: "LIVE", label: "LIVE" },
  { key: "UPCOMING", label: "UPCOMING" },
  { key: "COMPLETED", label: "COMPLETED" },
];

export interface NavUser {
  name: string;
  badge: string;
  rank: number;
  coins: number;
  avatarUrl?: string;
}

export interface TopNavProps {
  user?: NavUser;
  activeFilter: TopFilter;
  onFilterChange: (f: TopFilter) => void;
}

export function WaryaaEmblem({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <linearGradient id="wg-emblem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={palette.cyan} />
          <stop offset="1" stopColor={palette.crimson} />
        </linearGradient>
      </defs>
      <path
        d="M32 4 L54 15 V35 C54 47 44 56 32 60 C20 56 10 47 10 35 V15 Z"
        fill="none"
        stroke="url(#wg-emblem)"
        strokeWidth="3"
      />
      <path d="M20 46 L28 30 L38 36 L44 20" fill="none" stroke="url(#wg-emblem)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="40" r="3" fill={palette.gold} />
    </svg>
  );
}

export function TopNav({ user, activeFilter, onFilterChange }: TopNavProps) {
  const [coinsOpen, setCoinsOpen] = useState(false);
  const u = user ?? {
    name: "Warrior X7",
    badge: "WG",
    rank: 2450,
    coins: 92380,
  };

  return (
    <header
      className={glassPanel + " flex items-center gap-4 px-4 py-3"}
      style={{
        background: `linear-gradient(180deg, ${glaze(palette.panel, 0.9)}, ${glaze("#0D1220", 0.9)})`,
        borderColor: glaze(palette.cyan, 0.22),
        boxShadow: `0 0 18px ${glaze(palette.cyan, 0.12)}`,
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 min-w-max">
        <WaryaaEmblem />
        <div className="leading-none">
          <p className="text-[11px] font-black tracking-[0.3em] text-zinc-400">
            WARYAA
          </p>
          <p className="text-[13px] font-black tracking-[0.22em] text-white">
            GAMING
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <nav className="hidden lg:flex items-center gap-1.5 mx-auto">
        {TOP_FILTERS.map((tab) => {
          const active = tab.key === activeFilter;
          return (
            <button
              key={tab.key}
              onClick={() => onFilterChange(tab.key)}
              className="rounded-md px-3 py-1.5 text-[10px] font-bold tracking-widest transition-colors"
              style={{
                color: active ? palette.cyan : palette.muted,
                background: active ? glaze(palette.cyan, 0.14) : "transparent",
                border: `1px solid ${active ? glaze(palette.cyan, 0.5) : "transparent"}`,
                boxShadow: active ? `0 0 12px ${glaze(palette.cyan, 0.25)}` : "none",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* User profile widget */}
      <div className="flex items-center gap-3 ml-auto lg:ml-0 shrink-0">
        <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5"
          style={{ borderColor: palette.line }}
        >
          {u.avatarUrl ? (
            <img src={u.avatarUrl} alt="" className="h-6 w-6 rounded-md object-cover" />
          ) : (
            <div
              className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-black"
              style={{ color: palette.gold, background: glaze(palette.gold, 0.15) }}
            >
              {u.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="leading-none">
            <p className="text-xs font-bold text-white">{u.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[9px] text-zinc-400">
              <span
                className="rounded px-1 py-px text-[8px] font-black"
                style={{ color: palette.cyan, border: `1px solid ${glaze(palette.cyan, 0.5)}` }}
              >
                {u.badge}
              </span>
              <Trophy className="h-2.5 w-2.5 text-zinc-500" />
              {u.rank.toLocaleString()} <span className="text-zinc-600">•</span>{" "}
              <Coins className="h-2.5 w-2.5 text-[#FFB800]" />
              <span className="text-[#FFB800]">{u.coins.toLocaleString()}</span>
            </p>
          </div>
        </div>

        <button
          onClick={() => setCoinsOpen((v) => !v)}
          aria-label="Coin wallet"
          className="relative rounded-full p-2 transition-transform hover:-translate-y-0.5"
          style={{
            color: palette.gold,
            background: glaze(palette.gold, 0.1),
            border: `1px solid ${glaze(palette.gold, 0.4)}`,
            boxShadow: `0 0 12px ${glaze(palette.gold, 0.2)}`,
          }}
        >
          <Coins className="h-4 w-4" />
          {coinsOpen && (
            <span
              className="absolute right-0 top-full mt-1 rounded-md border px-2 py-1 text-[10px] font-bold text-white"
              style={{ borderColor: glaze(palette.gold, 0.5), background: "#0D1220" }}
            >
              {u.coins.toLocaleString()} coins
            </span>
          )}
        </button>
      </div>
    </header>
  );
}