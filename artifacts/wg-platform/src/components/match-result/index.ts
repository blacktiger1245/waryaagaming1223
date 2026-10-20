/**
 * Public entrypoint for the dynamic Esports Match Result + Man of the Match UI.
 *
 * Usage:
 *   import { MatchResultMOTM, buildMatchResultData } from "@/components/match-result";
 *   <MatchResultMOTM data={matchResultData} />
 */
export { MatchResultCard } from "./MatchResultCard";
export type { MatchResultCardProps } from "./MatchResultCard";
export { ManOfTheMatchCard } from "./ManOfTheMatchCard";
export type { ManOfTheMatchCardProps } from "./ManOfTheMatchCard";
export { MatchResultMOTM } from "./MatchResultMOTM";
export type { MatchResultMOTMProps, MatchResultView } from "./MatchResultMOTM";
export { buildMatchResultData } from "./from-api";
export type { BuildMatchResultOptions, MatchResultApiFixture, MatchResultApiPlayerGame } from "./from-api";
export { buildSoloMatchResultData } from "./from-solo";
export type { BuildSoloMatchResultOptions, SoloMatchResultInput } from "./from-solo";
export { SAMPLE_MATCH_RESULTS } from "./sample-data";
export { formatRating, goalShare, initialsOf } from "./utils";
export {
  cardShadow,
  goldBorder,
  goldCta,
  goldHairline,
  heroGradient,
  mr,
  mvPortraitRing,
  panelGradient,
} from "./theme";
export * from "./types";
