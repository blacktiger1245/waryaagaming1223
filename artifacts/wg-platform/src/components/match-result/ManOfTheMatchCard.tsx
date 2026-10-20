import { ArrowLeft, Crown, Flame, Shield, Swords, Target, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { cardShadow, goldCta, goldHairline, heroGradient, mvPortraitRing, panelGradient } from "./theme";
import type { MatchResultData } from "./types";
import { formatRating, goalShare, initialsOf } from "./utils";

export interface ManOfTheMatchCardProps {
  /** Same fixture object the match-result view uses — the `motm` block drives it. */
  data: MatchResultData;
  /** Returns to View #1 (the match result). */
  onBack?: () => void;
  className?: string;
}

/** Big circular portrait wrapped in the metallic gold MVP ring. */
function MvpPortrait({ name, avatarUrl, size = 150 }: { name: string; avatarUrl: string | null; size?: number }) {
  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt={name}
      style={{ width: size, height: size, boxShadow: mvPortraitRing }}
      className="rounded-full border border-[#FF9900]/40 object-cover"
    />
  ) : (
    <span
      style={{ width: size, height: size, boxShadow: mvPortraitRing, fontSize: Math.round(size * 0.33) }}
      className="flex items-center justify-center rounded-full border border-[#FF9900]/40 bg-[#171717] font-black tracking-wide text-[#FFB800]"
    >
      {initialsOf(name)}
    </span>
  );
}

/** Avatar used by the two duel-comparison columns (gold ring for the MVP). */
function DuelAvatar({
  name,
  avatarUrl,
  size = 52,
  gold = false,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
  gold?: boolean;
}) {
  const ring = gold ? "0 0 0 2px #FFB800, 0 0 0 6px rgba(255,153,0,0.14)" : "0 0 0 2px rgba(255,255,255,0.16)";
  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt={name}
      style={{ width: size, height: size, boxShadow: ring }}
      className="shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      style={{ width: size, height: size, boxShadow: ring, fontSize: Math.round(size * 0.34) }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-black",
        gold ? "bg-[#20180A] text-[#FFB800]" : "bg-[#1B1B1B] text-zinc-300",
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** One “floating” stat pill used across the hero. */
function StatPill({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-2 text-center backdrop-blur",
        accent ? "border-[#FF9900]/40 bg-[#FF9900]/10" : "border-white/10 bg-black/45",
      )}
    >
      <div className={cn("text-[8px] font-black uppercase tracking-[0.18em]", accent ? "text-[#FFB800]" : "text-zinc-500")}>
        {label}
      </div>
      <div className={cn("mt-0.5 font-mono text-sm font-black leading-tight tabular-nums", accent ? "text-[#FFB800]" : "text-white")}>
        {value}
      </div>
    </div>
  );
}

/**
 * ManOfTheMatchCard — View #2: the MVP spotlight.
 *
 * Banner header (“MAN OF THE MATCH” + back control) → hero with the large gold
 * ringed portrait, the team crest behind it and the floating team / rating / MVP
 * badges → dynamic stat pills → the head-to-head duel comparison with a progress
 * bar whose widths are derived from the duel goals.
 */
export function ManOfTheMatchCard({ data, onBack, className }: ManOfTheMatchCardProps) {
  const { motm } = data;
  const rival = motm.duelVsPlayer;
  const { motmPct, rivalPct } = goalShare(motm);

  return (
    <section
      className={cn("w-full overflow-hidden rounded-3xl border border-[#FF9900]/25", className)}
      style={{ background: panelGradient, boxShadow: cardShadow }}
    >
      <div className="h-[3px] w-full" style={{ background: goldHairline }} />

      {/* ── Banner header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 sm:px-7">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#FF9900]/40 bg-[#FF9900]/10 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[#FFB800]">
          <Crown className="h-4 w-4" /> Man of the Match
        </span>
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 sm:inline">
            {data.tournamentName} · {data.round}
          </span>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              data-testid="button-motm-back"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-300 transition-colors hover:border-[#FF9900]/50 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Match Result
            </button>
          )}
        </div>
      </div>

      {/* ── Hero spotlight ──────────────────────────────────────────────────── */}
      <div className="mt-4 px-5 sm:px-7">
        <div
          className="relative overflow-hidden rounded-3xl border border-[#FF9900]/20 px-4 py-8 sm:px-6 sm:py-10"
          style={{ background: heroGradient }}
        >
          {motm.teamLogoUrl && (
            <img
              src={motm.teamLogoUrl}
              alt=""
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.06]"
            />
          )}

          {/* Dynamic floating badges */}
          {motm.teamName && (
            <div className="absolute left-3 top-3 flex max-w-[58%] items-center gap-2 rounded-xl border border-white/10 bg-black/55 px-2.5 py-1.5 backdrop-blur">
              {motm.teamLogoUrl
                ? <img src={motm.teamLogoUrl} alt="" className="h-5 w-5 shrink-0 rounded-sm object-cover" />
                : <Shield className="h-4 w-4 shrink-0 text-[#FFB800]" />}
              <span className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-white">{motm.teamName}</span>
            </div>
          )}

          <div className="absolute right-3 top-3 rounded-xl border border-[#FF9900]/45 bg-black/60 px-3 py-1.5 text-center backdrop-blur">
            <div className="text-[8px] font-black uppercase tracking-[0.18em] text-[#FFB800]">Rating</div>
            <div className="font-mono text-base font-black leading-none text-white tabular-nums">{formatRating(motm.rating)}</div>
          </div>

          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-black shadow-[0_10px_24px_-10px_rgba(34,197,94,0.9)]">
            MVP
          </span>

          <div className="relative flex flex-col items-center gap-5">
            <MvpPortrait name={motm.name} avatarUrl={motm.avatarUrl} />
            <div className="text-center">
              <div className="text-2xl font-black uppercase leading-tight tracking-wide text-white sm:text-4xl">
                {motm.name}
              </div>
              {motm.teamName && (
                <div className="mt-1.5 inline-flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.2em] text-[#FF9900]">
                  {motm.teamLogoUrl && <img src={motm.teamLogoUrl} alt="" className="h-4 w-4 rounded-sm object-cover" />}
                  {motm.teamName}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Dynamic stat pills ──────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-2 px-5 sm:grid-cols-4 sm:px-7">
        <StatPill label="Rating" value={formatRating(motm.rating)} accent />
        <StatPill label="Goals" value={String(motm.goals)} />
        <StatPill label="Goal Share" value={`${motmPct}%`} />
        <StatPill label="Duel Goals" value={String(motm.totalDuelGoals)} />
      </div>

      {/* ── Head-to-head duel comparison ────────────────────────────────────── */}
      <div className="mt-5 px-5 pb-6 sm:px-7">
        <div className="rounded-2xl border border-white/5 bg-[#141414]/80 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#FFB800]">
            <Swords className="h-3.5 w-3.5" /> Head-to-Head Duel Comparison
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
              <DuelAvatar name={motm.name} avatarUrl={motm.avatarUrl} gold />
              <span className="w-full truncate text-xs font-black uppercase tracking-wide text-[#FFB800]">{motm.name}</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-400">
                <Flame className="h-3 w-3" /> {motm.goals} Goals
              </span>
            </div>

            <div className="shrink-0 text-center">
              <div className="font-mono text-2xl font-black leading-none text-white tabular-nums">
                {motm.goals}
                <span className="mx-1.5 text-[#FF9900]">–</span>
                {rival.goals}
              </div>
              <div className="mt-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Duel</div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
              <DuelAvatar name={rival.name} avatarUrl={rival.avatarUrl} />
              <span className="w-full truncate text-xs font-black uppercase tracking-wide text-zinc-200">{rival.name}</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">
                <Target className="h-3 w-3" /> {rival.goals} Goals
              </span>
            </div>
          </div>

          {/* Dynamic progress bar — widths are computed from the duel goals */}
          <div className="mt-5">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5">
              <span
                className="h-full transition-[width] duration-500 ease-out"
                style={{ width: `${motmPct}%`, background: goldCta }}
              />
              <span
                className="h-full bg-[#3F3F46] transition-[width] duration-500 ease-out"
                style={{ width: `${rivalPct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wider">
              <span className="text-[#FFB800] tabular-nums">{motm.goals} Goals ({motmPct}%)</span>
              <span className="text-zinc-400 tabular-nums">{rival.goals} Goals ({rivalPct}%)</span>
            </div>
            <div className="mt-1 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">
              <TrendingUp className="h-3 w-3" /> {motm.totalDuelGoals} total goals in this duel
            </div>
          </div>
        </div>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            data-testid="button-back-to-match-result"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#FF9900]/35 bg-[#FF9900]/10 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#FFB800] transition-colors hover:border-[#FF9900]/70 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Match Result
          </button>
        )}
      </div>
    </section>
  );
}

export default ManOfTheMatchCard;



