import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ManOfTheMatchCard } from "./ManOfTheMatchCard";
import { MatchResultCard } from "./MatchResultCard";
import type { MatchResultData } from "./types";

/** Which of the two surfaces is on screen. */
export type MatchResultView = "MATCH_RESULT" | "MOTM";

export interface MatchResultMOTMProps {
  /** The fixture to render — everything is read from here. */
  data: MatchResultData;
  /** Controlled view. Omit to let the component keep the state itself. */
  view?: MatchResultView;
  /** Fired on every switch (also when uncontrolled). */
  onViewChange?: (view: MatchResultView) => void;
  /** View shown on first paint (uncontrolled mode only). Default `"MATCH_RESULT"`. */
  initialView?: MatchResultView;
  className?: string;
}

const fadeSlide = {
  initial: { opacity: 0, y: 18, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -18, scale: 0.985 },
};

/**
 * MatchResultMOTM — the state toggle between the two views.
 *
 * View #1 (`MatchResultCard`) shows the fixture result; its MOTM banner / “MVP
 * AWARD” trigger switches to View #2 (`ManOfTheMatchCard`), which has its own
 * “Back to Match Result” control. Transitions are animated fade + slide.
 *
 * Works uncontrolled (internal state) or controlled via `view` + `onViewChange`.
 */
export function MatchResultMOTM({
  data,
  view,
  onViewChange,
  initialView = "MATCH_RESULT",
  className,
}: MatchResultMOTMProps) {
  const [internalView, setInternalView] = useState<MatchResultView>(initialView);
  const activeView = view ?? internalView;

  function goTo(next: MatchResultView) {
    setInternalView(next);
    onViewChange?.(next);
  }

  return (
    <div className={className}>
      <AnimatePresence mode="wait" initial={false}>
        {activeView === "MATCH_RESULT" ? (
          <motion.div
            key="MATCH_RESULT"
            initial={fadeSlide.initial}
            animate={fadeSlide.animate}
            exit={fadeSlide.exit}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <MatchResultCard data={data} onOpenMotm={() => goTo("MOTM")} />
          </motion.div>
        ) : (
          <motion.div
            key="MOTM"
            initial={fadeSlide.initial}
            animate={fadeSlide.animate}
            exit={fadeSlide.exit}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <ManOfTheMatchCard data={data} onBack={() => goTo("MATCH_RESULT")} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
