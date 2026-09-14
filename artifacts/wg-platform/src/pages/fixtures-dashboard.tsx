/**
 * FixturesDashboardPage — full 3-column tournament & fixtures dashboard.
 * Left: TournamentHubNav (20%) · Center: MatchCenter (50%) · Right: MediaAndStatsSidebar (30%).
 */
import { useMemo, useState } from "react";
import {
  MatchCenter,
  MediaAndStatsSidebar,
  TopNav,
  TournamentHubNav,
  demo,
} from "@/components/fixtures-dashboard";
import type { TopFilter } from "@/components/fixtures-dashboard/TopNav";
import type { Team } from "@/components/fixtures-dashboard/types";

export default function FixturesDashboardPage() {
  const [activeFilter, setActiveFilter] = useState<TopFilter>("ALL");
  const [activeCategory, setActiveCategory] = useState("regional");
  const [toast, setToast] = useState<string | null>(null);

  const fixtures = useMemo(() => demo.fixtures, []);
  const featured = useMemo(
    () => fixtures.find((f) => f.status === "LIVE") ?? fixtures[0],
    [fixtures],
  );

  const bracketFinals = useMemo<{ label: string; teams: Team[] }>(() => {
    const base = featured ? [featured.homeTeam, featured.awayTeam] : [];
    const extra: Team[] = demo.fixtures
      .flatMap((f) => [f.homeTeam, f.awayTeam])
      .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
      .filter((t) => !base.some((b) => b.id === t.id));
    return { label: "Regional Finals", teams: [...base, ...extra].slice(0, 4) };
  }, [featured]);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="min-h-screen w-full p-3 lg:p-4" style={{ background: "#0B0E14", color: "#E7ECF5" }}>
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3.5">
        <TopNav activeFilter={activeFilter} onFilterChange={setActiveFilter} />

        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[20%_50%_30%]">
          <TournamentHubNav
            categories={demo.categories}
            activeCategoryId={activeCategory}
            onSelectCategory={setActiveCategory}
          />

          <div className="flex flex-col gap-5">
            <MatchCenter
              featured={featured}
              fixtures={fixtures}
              activeFilter={activeFilter}
              onGoLive={() => notify("Broadcast studio launching…")}
              onViewDetails={(id) => notify(`Opening fixture ${id}`)}
            />
          </div>

          <MediaAndStatsSidebar
            finals={bracketFinals}
            streams={demo.liveStreams}
            players={demo.topPlayers}
          />
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#00F0FF]/50 px-4 py-2 text-xs font-bold text-[#00F0FF] shadow-[0_0_18px_rgba(0,240,255,0.25)]"
          style={{ background: "#0D1220" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}