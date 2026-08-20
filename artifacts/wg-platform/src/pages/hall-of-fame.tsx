import HomeHallOfFame from "@/components/home-hall-of-fame";

/**
 * Dedicated Hall of Fame page (linked from the sidebar).
 * Reuses the same CSS ``HallOfFameCard`` component (pure CSS/SVG, no image) as the
 * homepage section — active players turned ON by admins appear here.
 */
export default function HallOfFamePage() {
  return <HomeHallOfFame />;
}