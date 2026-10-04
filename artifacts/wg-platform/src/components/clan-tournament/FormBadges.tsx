/**
 * FormBadges — the W/D/L result boxes shown in the standings "Form" column.
 *
 * Green = win, grey = draw, red = loss, each a small gradient chip with a white
 * letter and a soft coloured glow. Missing results render as empty neutral slots
 * so the column keeps a fixed width.
 */
import type { FormResult } from "./types";

const FORM_STYLE: Record<FormResult, { background: string; title: string; glow: string }> = {
  W: { background: "linear-gradient(135deg, #4ade80, #16a34a)", title: "Win", glow: "rgba(34, 197, 94, 0.65)" },
  D: { background: "linear-gradient(135deg, #94a3b8, #64748b)", title: "Draw", glow: "rgba(148, 163, 184, 0.45)" },
  L: { background: "linear-gradient(135deg, #fb7185, #e11d48)", title: "Loss", glow: "rgba(244, 63, 94, 0.65)" },
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
      className="inline-flex items-center justify-center rounded-[5px] font-black text-white"
      style={{
        width: size,
        height: size,
        background: style.background,
        boxShadow: `0 2px 10px -3px ${style.glow}`,
        fontSize: size * 0.5,
      }}
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
          className="inline-block rounded-[5px]"
          style={{
            width: size,
            height: size,
            background: "rgba(148,163,255,0.07)",
            border: "1px solid rgba(148,163,255,0.16)",
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
