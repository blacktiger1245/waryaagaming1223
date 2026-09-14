/**
 * TournamentHubNav — left sidebar: primary navigation + expandable
 * tournament category accordion.
 */
import { useState } from "react";
import {
  ChevronDown,
  Clapperboard,
  LayoutDashboard,
  Shield,
  Swords,
  User,
} from "lucide-react";
import { WaryaaEmblem } from "./TopNav";
import { glaze } from "./glaze";
import { glassPanel, palette } from "./theme";
import type { TourneyCategory } from "./types";

interface TournamentHubNavProps {
  categories: TourneyCategory[];
  activeCategoryId: string;
  onSelectCategory: (id: string) => void;
}

const PRIMARY_NAV: { label: string; icon: typeof LayoutDashboard; active?: boolean }[] = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Fixtures", icon: Swords, active: true },
  { label: "Clans", icon: Shield },
  { label: "Media", icon: Clapperboard },
];

export function SidebarAccordion({
  categories,
  activeCategoryId,
  onSelectCategory,
}: {
  categories: TourneyCategory[];
  activeCategoryId: string;
  onSelectCategory?: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-1 pb-1 text-[10px] font-black tracking-[0.2em] text-zinc-500"
      >
        TOURNAMENTS
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-1">
          {categories.map((c) => {
            const active = c.id === activeCategoryId;
            return (
              <button
                key={c.id}
                onClick={() => onSelectCategory?.(c.id)}
                className="group flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[12px] font-semibold transition-colors"
                style={{
                  color: active ? palette.text : palette.muted,
                  borderColor: active ? glaze(palette.cyan, 0.5) : "transparent",
                  background: active ? glaze(palette.cyan, 0.12) : "transparent",
                  boxShadow: active ? `0 0 14px ${glaze(palette.cyan, 0.18)}` : "none",
                }}
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                  style={{
                    color: active ? palette.cyan : palette.muted,
                    background: glaze(active ? palette.cyan : palette.muted, 0.12),
                  }}
                >
                  {c.archived
                    ? <User className="h-3 w-3" />
                    : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <span className="flex-1 truncate">{c.label}</span>
                {c.tag && (
                  <span
                    className="shrink-0 rounded px-1.5 py-px text-[8px] font-black tracking-wider"
                    style={{
                      color: active ? palette.cyan : palette.gold,
                      background: glaze(active ? palette.cyan : palette.gold, 0.14),
                    }}
                  >
                    {c.tag}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TournamentHubNav({
  categories,
  activeCategoryId,
  onSelectCategory,
}: TournamentHubNavProps) {
  return (
    <aside
      className={glassPanel + " flex flex-col gap-6 p-3.5"}
      style={{
        background: `linear-gradient(180deg, ${glaze("#111724", 0.92)}, ${glaze("#0C111D", 0.92)})`,
        borderColor: glaze(palette.muted, 0.18),
      }}
    >
      {/* Brand row */}
      <div className="flex items-center gap-2.5 px-1">
        <WaryaaEmblem size={24} />
        <div className="leading-none">
          <p className="text-[10px] font-black tracking-[0.24em] text-white">WARYAA</p>
          <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-500">TOURNAMENT HUB</p>
        </div>
      </div>

      {/* Primary commands */}
      <div className="space-y-1">
        <p className="px-1 pb-1 text-[10px] font-black tracking-[0.2em] text-zinc-500">COMMANDS</p>
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[12px] font-bold"
              style={{
                color: item.active ? palette.cyan : palette.muted,
                background: item.active ? glaze(palette.cyan, 0.12) : "transparent",
                border: `1px solid ${item.active ? glaze(palette.cyan, 0.4) : "transparent"}`,
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
              {item.active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#FF2A5F] shadow-[0_0_8px_#FF2A5F]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Category accordion */}
      <SidebarAccordion
        categories={categories}
        activeCategoryId={activeCategoryId}
        onSelectCategory={onSelectCategory}
      />
    </aside>
  );
}