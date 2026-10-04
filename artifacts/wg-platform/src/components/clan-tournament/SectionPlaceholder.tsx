/**
 * SectionPlaceholder — the panel rendered for Clan Tournament tabs whose data
 * feed is not wired up yet. Keeps the section navigable and visually complete
 * instead of rendering a blank page.
 */
import type { LucideIcon } from "lucide-react";
import { clanCard, clanGradient, clanTheme } from "./theme";

interface SectionPlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function SectionPlaceholder({ title, description, icon: Icon }: SectionPlaceholderProps) {
  return (
    <section className={clanCard}>
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: clanGradient.brand, boxShadow: "0 0 26px -6px rgba(168,85,247,0.9)" }}
        >
          <Icon className="h-5 w-5 text-white" />
        </span>
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{title}</h2>
        <p className="max-w-md text-xs leading-relaxed" style={{ color: clanTheme.muted }}>
          {description}
        </p>
      </div>
    </section>
  );
}

export default SectionPlaceholder;
