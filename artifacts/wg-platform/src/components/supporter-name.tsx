/**
 * SupporterName — a player's name with the "supporter" treatment: a yellow name
 * plus a green verified tick, shown for everyone who has donated to Waryaa
 * Gaming (`players.donor`). Colours are set inline so they always win over the
 * surrounding row's text colour.
 */
import { BadgeCheck } from "lucide-react";

export function SupporterName({
  name,
  donor,
  className,
  tickClassName = "h-3.5 w-3.5",
}: {
  name: string;
  donor?: boolean | null;
  /** Classes for the wrapping span (layout/truncation only — colour is forced). */
  className?: string;
  tickClassName?: string;
}) {
  if (!donor) return <span className={className}>{name}</span>;

  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className ?? ""}`}>
      <span className="truncate font-bold" style={{ color: "#facc15" }}>
        {name}
      </span>
      <BadgeCheck
        className={`${tickClassName} shrink-0`}
        style={{ color: "#34d399" }}
        aria-label="Waryaa Gaming supporter"
      />
    </span>
  );
}

export default SupporterName;
