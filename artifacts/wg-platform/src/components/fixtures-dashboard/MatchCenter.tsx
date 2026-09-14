/**
 * MatchCenter — the center stage: featured matchup + upcoming fixtures feed.
 */
import { Zap } from "lucide-react";
import { FeaturedMatchCard } from "./FeaturedMatchCard";
import { FixturesList } from "./FixturesList";
import { glaze } from "./glaze";
import { palette } from "./theme";
import type { MatchFixture } from "./types";
import type { TopFilter } from "./TopNav";

interface MatchCenterProps {
  featured: MatchFixture;
  fixtures: MatchFixture[];
  activeFilter: TopFilter;
  onGoLive?: (id: string) => void;
  onViewDetails?: (id: string) => void;
}

export function MatchCenter({ featured, fixtures, activeFilter, onGoLive, onViewDetails }: MatchCenterProps) {
  return (
    <div className="space-y-5">
      <FeaturedMatchCard match={featured} onGoLive={() => onGoLive?.(featured.id)} />

      {/* Tournament context strip */}
      <div className="flex items-center justify-between rounded-xl border px-4 py-2.5"
        style={{ borderColor: glaze(palette.muted, 0.16), background: "rgba(17,23,40,0.6)" }}
      >
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-zinc-400">
          <Zap className="h-3.5 w-3.5" style={{ color: palette.gold }} />
          TOURNAMENT CONTEXT
        </div>
        <div className="flex items-center gap-2">
          {["Regional Finals", "Grand Slam", "Masters"].map((t, i) => (
            <span
              key={t}
              className={`rounded px-2 py-1 text-[9px] font-black tracking-wider ${i === 0 ? "text-white" : "text-zinc-500"}`}
              style={i === 0 ? { background: glaze(palette.cyan, 0.16), color: palette.cyan } : undefined}
            >
              {t.toUpperCase()}
            </span>
          ))}
        </div>
      </div>

      <FixturesList fixtures={fixtures} activeFilter={activeFilter} onGoLive={onGoLive} onViewDetails={onViewDetails} />
    </div>
  );
}