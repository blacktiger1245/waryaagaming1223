import { useState } from "react";
import { motion } from "framer-motion";
import { Braces, Flame, RefreshCw, Swords, Trophy } from "lucide-react";
import { MatchResultMOTM, SAMPLE_MATCH_RESULTS } from "@/components/match-result";

/**
 * /match-result — live preview of the dynamic Match Result + MOTM component.
 *
 * The fixtures below are plain `MatchResultData` objects, which is exactly what
 * the component takes as props. Real data replaces them 1:1:
 *
 *   const data = buildMatchResultData({ fixture, playerGames, teamLogoMap, playerAvatarMap });
 *   <MatchResultMOTM data={data} />
 *
 * Switching the fixture here re-renders both views (result → MOTM) with no
 * component changes, proving nothing is hard-coded.
 */
export default function MatchResultPreviewPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showJson, setShowJson] = useState(false);

  const data = SAMPLE_MATCH_RESULTS[activeIndex] ?? SAMPLE_MATCH_RESULTS[0];

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        {/* ── Page header ── */}
        <div className="mb-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#FF9900]/35 bg-[#FF9900]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#FFB800]">
            <Trophy className="h-3.5 w-3.5" /> Match Center Preview
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight">Match Result &amp; MVP Award</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Tap the <span className="font-bold text-[#FFB800]">MVP Award</span> card on the result to open the Man of
            the Match view, then use <span className="font-bold text-[#FFB800]">Back to Match Result</span> to return.
            Everything on screen is driven by props — switch the fixture below to see both views update.
          </p>
        </div>

        {/* ── Dynamic fixture switcher ── */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {SAMPLE_MATCH_RESULTS.map((fixture, i) => (
            <button
              key={`${fixture.tournamentName}-${i}`}
              onClick={() => setActiveIndex(i)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-black uppercase tracking-wide transition-colors ${
                i === activeIndex
                  ? "border-[#FF9900]/60 bg-[#FF9900]/15 text-[#FFB800]"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <Swords className="h-3.5 w-3.5" />
              {fixture.teamA.name} vs {fixture.teamB.name}
            </button>
          ))}
          <button
            onClick={() => setActiveIndex((i) => (i + 1) % SAMPLE_MATCH_RESULTS.length)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-black uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Next Fixture
          </button>
          <button
            onClick={() => setShowJson((open) => !open)}
            className="ml-auto inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-black uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            <Braces className="h-3.5 w-3.5" /> {showJson ? "Hide" : "Show"} Data
          </button>
        </div>

        {/* ── The component under test ── */}
        <MatchResultMOTM data={data} />

        {/* ── Raw props driving the UI above ── */}
        {showJson && (
          <motion.pre
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 max-h-96 overflow-auto rounded-2xl border border-border bg-card p-4 text-[11px] leading-relaxed text-muted-foreground"
          >
            {JSON.stringify(data, null, 2)}
          </motion.pre>
        )}

        {/* ── Integration hint ── */}
        <p className="mt-5 inline-flex items-start gap-2 text-[11px] text-muted-foreground">
          <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FFB800]" />
          Wire a real fixture with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">buildMatchResultData()</code> from
          <code className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">@/components/match-result</code>.
        </p>
      </motion.div>
    </div>
  );
}
