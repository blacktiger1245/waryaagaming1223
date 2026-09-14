/**
 * FixturesList — chronological feed grouped by date, each section topped by a
 * color-coded status progress bar (LIVE / UPCOMING / COMPLETED).
 */
import { useMemo } from "react";
import { MatchRow } from "./MatchRow";
import { glaze } from "./glaze";
import { palette } from "./theme";
import type { MatchFixture, MatchStatus } from "./types";
import type { TopFilter } from "./TopNav";

interface FixturesListProps {
  fixtures: MatchFixture[];
  activeFilter: TopFilter;
  onGoLive?: (id: string) => void;
  onViewDetails?: (id: string) => void;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d: Date): string {
  const fmt = d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cmp = new Date(d); cmp.setHours(0, 0, 0, 0);
  const diff = Math.round((cmp.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return `TODAY — ${fmt}`;
  if (diff === 1) return `TOMORROW — ${fmt}`;
  return fmt;
}

const SEGMENT_ORDER: { status: MatchStatus; color: string; label: string }[] = [
  { status: "LIVE", color: palette.crimson, label: "LIVE" },
  { status: "UPCOMING", color: palette.cyan, label: "UPCOMING" },
  { status: "COMPLETED", color: palette.emerald, label: "COMPLETED" },
];

function StatusProgress({ fixtures }: { fixtures: MatchFixture[] }) {
  const counts = fixtures.reduce<Record<MatchStatus, number>>(
    (acc, m) => { acc[m.status] += 1; return acc; },
    { LIVE: 0, UPCOMING: 0, COMPLETED: 0 },
  );
  const total = Math.max(1, fixtures.length);
  return (
    <div className="flex h-1 w-full gap-1 overflow-hidden rounded-full">
      {SEGMENT_ORDER.map((seg) => (
        <div
          key={seg.status}
          className="h-full rounded-full transition-all"
          style={{
            width: `${(counts[seg.status] / total) * 100}%`,
            background: seg.color,
            boxShadow: counts[seg.status] > 0 ? `0 0 8px ${glaze(seg.color, 0.7)}` : "none",
          }}
        />
      ))}
    </div>
  );
}

export function FixturesList({ fixtures, activeFilter, onGoLive, onViewDetails }: FixturesListProps) {
  const groups = useMemo(() => {
    const filtered =
      activeFilter === "ALL"
        ? fixtures
        : fixtures.filter((f) => f.status === activeFilter);
    const map = new Map<string, MatchFixture[]>();
    for (const f of filtered) {
      const key = dayKey(f.scheduledTime);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [fixtures, activeFilter]);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-zinc-500"
        style={{ borderColor: glaze(palette.muted, 0.3) }}
      >
        No fixtures match this filter.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(([key, list]) => (
        <section key={key}>
          <div className="mb-1.5 flex items-end justify-between">
            <span className="text-[11px] font-black tracking-[0.14em]" style={{ color: palette.muted }}>
              UPCOMING FIXTURES
            </span>
            <span className="text-xs font-black text-white">{dayLabel(list[0].scheduledTime)}</span>
          </div>
          <StatusProgress fixtures={list} />
          <div className="mt-2.5 space-y-2">
            {list.map((m) => (
              <MatchRow key={m.id} match={m} onGoLive={onGoLive} onViewDetails={onViewDetails} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}