import type { CSSProperties } from "react";

// ── Shared gold gradient defs ──────────────────────────────────────────────────
function GoldDefs({ id }: { id: string }) {
  return (
    <defs>
      {/* Main metallic gold body */}
      <linearGradient id={`${id}-gold`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF3C4" />
        <stop offset="22%" stopColor="#F8D976" />
        <stop offset="45%" stopColor="#E8B62E" />
        <stop offset="62%" stopColor="#C68A12" />
        <stop offset="80%" stopColor="#E9BC3F" />
        <stop offset="100%" stopColor="#8F5E07" />
      </linearGradient>
      {/* Brighter gold for accents */}
      <linearGradient id={`${id}-gold-bright`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFF8DC" />
        <stop offset="55%" stopColor="#F2C744" />
        <stop offset="100%" stopColor="#B57F10" />
      </linearGradient>
      {/* Dark gold for the base */}
      <linearGradient id={`${id}-gold-dark`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#E3B33C" />
        <stop offset="100%" stopColor="#7A5206" />
      </linearGradient>
      {/* Specular highlight */}
      <radialGradient id={`${id}-shine`} cx="32%" cy="26%" r="55%">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
        <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

interface AwardIconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

// ── BallonDorIcon ──────────────────────────────────────────────────────────────
// A golden football resting on a trophy pedestal base.
export function BallonDorIcon({ size = 48, className, style }: AwardIconProps) {
  const id = "bdor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role="img"
      aria-label="Ballon d'Or"
    >
      <GoldDefs id={id} />
      <g stroke="#6B4A05" strokeWidth="1.1" strokeLinejoin="round">
        {/* Pedestal base */}
        <path d="M18 56 L46 56 L44 50 L20 50 Z" fill={`url(#${id}-gold-dark)`} />
        {/* Stem */}
        <path d="M25 50 L39 50 L36 44 L28 44 Z" fill={`url(#${id}-gold)`} />
        {/* Collar under the ball */}
        <path d="M24 44 L40 44 L37.5 40 L26.5 40 Z" fill={`url(#${id}-gold-bright)`} />
      </g>

      {/* Football */}
      <g>
        <circle cx="32" cy="22" r="17" fill={`url(#${id}-gold)`} stroke="#6B4A05" strokeWidth="1.2" />
        {/* Center pentagon */}
        <path
          d="M32 14.5 L38.4 19.2 L35.9 26.8 L28.1 26.8 L25.6 19.2 Z"
          fill="#5C3F04"
          stroke="#3E2B02"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        {/* Surrounding pentagons (partially clipped by the ball) */}
        <clipPath id="bdor-clip">
          <circle cx="32" cy="22" r="16.5" />
        </clipPath>
        <g fill="#5C3F04" stroke="#3E2B02" strokeWidth="0.7" strokeLinejoin="round" clipPath="url(#bdor-clip)">
          <path d="M32 5.4 L37 8 L36 14 L28 14 L27 8 Z" />
          <path d="M45 20 L51 22.5 L49.5 28.5 L42.5 28 L41 22 Z" />
          <path d="M19 20 L13 22.5 L14.5 28.5 L21.5 28 L23 22 Z" />
          <path d="M38 33 L44 34.5 L43.5 40.5 L36.5 40 L36 35 Z" />
          <path d="M26 33 L20 34.5 L20.5 40.5 L27.5 40 L28 35 Z" />
        </g>
        {/* Seam lines from center pentagon */}
        <g stroke="#3E2B02" strokeWidth="0.8" clipPath="url(#bdor-clip)">
          <line x1="38.4" y1="19.2" x2="41" y2="22" />
          <line x1="35.9" y1="26.8" x2="36" y2="35" />
          <line x1="28.1" y1="26.8" x2="28" y2="35" />
          <line x1="25.6" y1="19.2" x2="23" y2="22" />
        </g>
        {/* Specular shine */}
        <ellipse cx="25.5" cy="14" rx="9" ry="6.5" fill={`url(#${id}-shine)`} transform="rotate(-28 25.5 14)" />
        {/* Rim light on the lower right */}
        <path
          d="M43 34 A17 17 0 0 0 46 22"
          stroke="#FFEFAF"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.7"
          fill="none"
        />
      </g>
    </svg>
  );
}

// ── TopScorerIcon ──────────────────────────────────────────────────────────────
// A golden football boot (Golden Boot award).
export function TopScorerIcon({ size = 48, className, style }: AwardIconProps) {
  const id = "tscore";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role="img"
      aria-label="Top Scorer"
    >
      <GoldDefs id={id} />
      <defs>
        <clipPath id="tscore-boot">
          <path d="M12 16 L26 14 C28 14 29.5 15.5 30 17.5 L31.5 24 C32.5 28 35 31.5 39 34.5 C43.5 38 49 40.5 53 44.5 C54.5 46 55 48 54.5 50 L53.5 53 L11 53 C9.5 53 8.5 52 8.5 50.5 L8.5 22 C8.5 18.5 9.5 16.5 12 16 Z" />
        </clipPath>
      </defs>

      {/* Boot body */}
      <g stroke="#6B4A05" strokeWidth="1.2" strokeLinejoin="round">
        <path
          d="M12 16 L26 14 C28 14 29.5 15.5 30 17.5 L31.5 24 C32.5 28 35 31.5 39 34.5 C43.5 38 49 40.5 53 44.5 C54.5 46 55 48 54.5 50 L53.5 53 L11 53 C9.5 53 8.5 52 8.5 50.5 L8.5 22 C8.5 18.5 9.5 16.5 12 16 Z"
          fill={`url(#${id}-gold)`}
        />
        {/* Ankle collar detail */}
        <path
          d="M12 16 L26 14 C28 14 29.5 15.5 30 17.5 L28.8 21 L11.5 22.5 C10.2 22.6 9.5 21.8 9.6 20.4 C9.7 18.4 10.4 16.7 12 16 Z"
          fill={`url(#${id}-gold-bright)`}
        />
      </g>

      {/* Laces */}
      <g stroke="#5C3F04" strokeWidth="1.4" strokeLinecap="round">
        <line x1="17.5" y1="24.5" x2="24" y2="22.5" />
        <line x1="19" y1="28.5" x2="26" y2="26.5" />
        <line x1="20.5" y1="32.5" x2="27.5" y2="30.5" />
      </g>

      {/* Side stripe accent */}
      <path
        d="M30.5 23 C33 29 36.5 33.5 41.5 37.5 C45 40.2 48.5 42.3 51.5 45 L49.5 47 C45.5 44 41.5 41.6 37.5 38.2 C32.5 34 29 28.6 27.5 23.5 Z"
        fill={`url(#${id}-gold-bright)`}
        stroke="#8F5E07"
        strokeWidth="0.7"
        opacity="0.9"
      />

      {/* Heel accent */}
      <path d="M9.5 44 L15 44 L15 53 L10 53 C9.2 53 8.6 52.4 8.6 51.5 L8.6 45 C8.6 44.4 9 44 9.5 44 Z" fill="#5C3F04" opacity="0.55" />

      {/* Sole */}
      <path
        d="M10 53 L53.5 53 L54.2 50 L9 50 C8.7 50 8.5 50.3 8.5 50.6 C8.5 51.9 9 53 10 53 Z"
        fill={`url(#${id}-gold-dark)`}
        stroke="#6B4A05"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Studs */}
      <g fill={`url(#${id}-gold-dark)`} stroke="#5C3F04" strokeWidth="0.8">
        <rect x="13" y="53.5" width="5" height="3.5" rx="1.2" />
        <rect x="24" y="53.5" width="5" height="3.5" rx="1.2" />
        <rect x="36" y="53.5" width="5" height="3.5" rx="1.2" />
        <rect x="46.5" y="53.5" width="5" height="3.5" rx="1.2" />
      </g>

      {/* Specular shine */}
      <g clipPath="url(#tscore-boot)">
        <ellipse cx="42" cy="42" rx="10" ry="5.5" fill={`url(#${id}-shine)`} transform="rotate(-32 42 42)" />
        <ellipse cx="18" cy="24" rx="6" ry="3.5" fill={`url(#${id}-shine)`} transform="rotate(-18 18 24)" />
      </g>
      {/* Rim light along the toe */}
      <path
        d="M48 40.5 C51 43 53.5 45.5 54.3 48.5"
        stroke="#FFEFAF"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.75"
        fill="none"
      />
    </svg>
  );
}
