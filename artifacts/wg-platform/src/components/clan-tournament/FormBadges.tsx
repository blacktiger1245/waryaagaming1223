/**
 * FormBadges — the W/D/L result boxes shown in the standings "Form" column.
 *
 * Green = win, grey = draw, red = loss, each with a white letter. Missing
 * results render as empty neutral slots so the column keeps a fixed width.
 */
import { clanTheme } from "./theme";
import type { FormResult } from "./types";

const FORM_STYLE: Record<FormResult, { background: string; title: string }> = {
  W: { background: clanTheme.win, title: "Win" },
  D: { background: clanTheme.draw, title: "Draw" },
  L: { background: clanTheme.loss, title: "Loss" },
};

interface SingleFormBadgeProps {
  result: FormResult;
  size?: number;
}

export function SingleFormBadge({ result, size = 20 }: SingleFormBadgeProps) {
  const style = FORM_STYLE[result];
  return (
    <span
      title={style.title}
      aria-label={style.title}
      className="inline-flex items-center justify-center rounded-[4px] font-black text-white"
      style={{ width: size, height: size, background: style.background, fontSize: size * 0.5 }}
    >
      {result}
    </span>
  );
}

interface FormBadgesProps {
  /** Most recent results, oldest → newest. */
  form: FormResult[];
  /** Fixed number of slots to render. Short form is padded with placeholders. */
  length?: number;
  size?: number;
}

export function FormBadges({ form, length = 5, size = 20 }: FormBadgesProps) {
  const recent = form.slice(-length);
  const padding = Math.max(0, length - recent.length);

  return (
    <div
      className="flex items-center gap-1"
      aria-label={recent.length > 0 ? `Recent form: ${recent.join(" ")}` : "No recent form"}
    >
      {Array.from({ length: padding }, (_, i) => (
        <span
          key={`empty-${i}`}
          aria-hidden
          className="inline-block rounded-[4px]"
          style={{
            width: size,
            height: size,
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${clanTheme.border}`,
          }}
        />
      ))}
      {recent.map((result, i) => (
        <SingleFormBadge key={`${result}-${i}`} result={result} size={size} />
      ))}
    </div>
  );
}

export default FormBadges;
