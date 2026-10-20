import { BadgeCheck, ChevronRight, Crown, Medal, Star, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { cardShadow, goldCta, goldHairline, heroGradient, mr, panelGradient } from "./theme";
import type { MatchResultData, MatchResultDuel, MatchResultTeam } from "./types";
import { formatRating, initialsOf } from "./utils";

export interface MatchResultCardProps {
  /** The active fixture — every string/number below comes from here. */
  data: MatchResultData;
  /** Fired by the MOTM banner / “MVP AWARD” card to open the MOTM view. */
  onOpenMotm?: () => void;
  /**
   * Shape of the two side crests. Clan fixtures use squared crests; a solo
   * player-vs-player fixture renders circular avatars via `"circle"`.
   */
  crestShape?: "square" | "circle";
  className?: string;
}

/** Portrait with a ring (green for a duel winner) and an initials fallback. */
function PlayerAvatar({
  name,
  avatarUrl,
  size = 40,
  winner = false,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
  winner?: boolean;
}) {
  const ring = winner ? `0 0 0 2px ${mr.green}` : "0 0 0 2px rgba(255,153,0,0.35)";
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
      className="flex shrink-0 items-center justify-center rounded-full bg-[#1D1D1D] font-black text-zinc-300"
    >
      {initialsOf(name)}
    </span>
  );
}

/** Clan crest — or a solo player avatar — with a monogram fallback. */
function TeamCrest({
  name,
  logoUrl,
  size = 56,
  shape = "square",
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
  shape?: "square" | "circle";
}) {
  const radius = shape === "circle" ? "rounded-full" : "rounded-2xl";
  return logoUrl ? (
    <img
      src={logoUrl}
      alt={name}
      style={{ width: size, height: size, boxShadow: "0 0 26px -8px rgba(255,153,0,0.6)" }}
      className={cn("shrink-0 border border-[#FF9900]/25 object-cover", radius)}
    />
  ) : (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), boxShadow: "0 0 26px -10px rgba(255,153,0,0.5)" }}
      className={cn("flex shrink-0 items-center justify-center border border-[#FF9900]/25 bg-[#1A1A1A] font-black text-[#FFB800]", radius)}
    >
      {initialsOf(name)}
    </span>
  );
}

/** One side of the scoreline: crest/avatar + name + aggregated goals. */
function TeamSide({
  team,
  align,
  winner,
  shape,
}: {
  team: MatchResultTeam;
  align: "left" | "right";
  winner: boolean;
  shape: "square" | "circle";
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", align === "right" && "flex-row-reverse text-right")}>
      <TeamCrest name={team.name} logoUrl={team.logoUrl} size={56} shape={shape} />
      <div className="min-w-0">
        <div className={cn("truncate text-sm font-black uppercase tracking-wide sm:text-base", winner ? "text-[#FFB800]" : "text-zinc-200")}>
          {team.name}
        </div>
        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
          {team.totalGoals} {team.totalGoals === 1 ? "Goal" : "Goals"}
        </div>
      </div>
    </div>
  );
}

/** [Avatar + name]  [A – B]  [name + Avatar] with green winners. */
function DuelRow({ duel }: { duel: MatchResultDuel }) {
  const { playerA: a, playerB: b } = duel;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-[#151515]/80 px-3 py-2.5 sm:gap-3 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className={cn("truncate text-right text-sm font-black", a.isWinner ? "text-emerald-400" : "text-zinc-300")}>
          {a.name}
        </span>
        <PlayerAvatar name={a.name} avatarUrl={a.avatarUrl} size={34} winner={a.isWinner} />
      </div>

      <span
        className={cn(
          "shrink-0 rounded-lg border px-2.5 py-1 font-mono text-sm font-black tabular-nums",
          a.isWinner || b.isWinner ? "border-[#FF9900]/30 bg-[#FF9900]/10" : "border-white/10 bg-white/5",
        )}
      >
        <span className={a.isWinner ? "text-emerald-400" : "text-zinc-400"}>{a.goals}</span>
        <span className="mx-1.5 text-zinc-600">–</span>
        <span className={b.isWinner ? "text-emerald-400" : "text-zinc-400"}>{b.goals}</span>
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <PlayerAvatar name={b.name} avatarUrl={b.avatarUrl} size={34} winner={b.isWinner} />
        <span className={cn("truncate text-sm font-black", b.isWinner ? "text-emerald-400" : "text-zinc-300")}>
          {b.name}
        </span>
      </div>
    </div>
  );
}

/**
 * MatchResultCard — View #1: the fixture result overview.
 *
 * Top bar (tournament · round · match number · VERIFIED RESULT) → scoreboard with
 * both clan crests, the fixture score and aggregated goals → the individual duel
 * list → the MOTM banner whose “MVP AWARD” card opens View #2.
 */
export function MatchResultCard({ data, onOpenMotm, crestShape, className }: MatchResultCardProps) {
  const { teamA, teamB, individualScores, motm } = data;
  const verified = data.verified ?? true;
  const aWins = teamA.score > teamB.score;
  const bWins = teamB.score > teamA.score;
  // A solo fixture (a single duel) shows both players as circular avatars unless
  // the caller explicitly asks for squared clan crests.
  const shape = crestShape ?? (individualScores.length <= 1 ? "circle" : "square");

  return (
    <section
      className={cn("w-full overflow-hidden rounded-3xl border border-[#FF9900]/25", className)}
      style={{ background: panelGradient, boxShadow: cardShadow }}
    >
      <div className="h-[3px] w-full" style={{ background: goldHairline }} />

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 sm:px-7">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-black uppercase tracking-[0.2em] text-[#FFB800]">
            {data.tournamentName}
          </h3>
          <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            {data.round} · Match {data.matchNumber}
          </p>
        </div>
        {verified && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-400">
            <BadgeCheck className="h-3.5 w-3.5" /> Verified Result
          </span>
        )}
      </div>

      {/* ── Scoreboard ──────────────────────────────────────────────────────── */}
      <div className="mt-4 px-5 sm:px-7">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-white/5 bg-[#141414]/80 px-3 py-5 sm:gap-6 sm:px-6">
          <TeamSide team={teamA} align="left" winner={aWins} shape={shape} />
          <div className="text-center">
            <div className="font-mono text-3xl font-black leading-none text-white tabular-nums sm:text-5xl">
              {teamA.score}
              <span className="mx-1.5 text-[#FF9900] sm:mx-3">–</span>
              {teamB.score}
            </div>
            <div className="mt-2 text-[9px] font-black uppercase tracking-[0.22em] text-zinc-500">Final Score</div>
          </div>
          <TeamSide team={teamB} align="right" winner={bWins} shape={shape} />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-[#FF9900]/25 bg-[#FF9900]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em]">
          <Swords className="h-3.5 w-3.5 text-[#FF9900]" />
          <span className="text-zinc-400">Total Goals</span>
          <span className="font-mono text-sm text-white tabular-nums">{teamA.totalGoals}</span>
          <span className="text-[#FF9900]">–</span>
          <span className="font-mono text-sm text-white tabular-nums">{teamB.totalGoals}</span>
        </div>
      </div>

      {/* ── Individual scores (auto-hidden for a solo fixture, where the
             scoreboard above already *is* the single duel) ─────────────────── */}
      {individualScores.length > 1 && (
        <div className="mt-6 px-5 sm:px-7">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#FFB800]">
              <Medal className="h-3.5 w-3.5" /> Individual Scores
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
              {individualScores.length} Duels
            </span>
          </div>

          <div className="space-y-2">
            {individualScores.map((duel, i) => (
              <DuelRow key={`${duel.playerA.name}-${duel.playerB.name}-${i}`} duel={duel} />
            ))}
          </div>
        </div>
      )}

      {/* ── MOTM banner → View #2 ───────────────────────────────────────────── */}
      <div className="mt-6 px-5 pb-6 sm:px-7">
        <button
          type="button"
          onClick={onOpenMotm}
          disabled={!onOpenMotm}
          aria-label={`Open Man of the Match details for ${motm.name}`}
          data-testid="button-open-motm"
          className={cn(
            "block w-full rounded-2xl border border-[#FF9900]/30 text-left transition-all",
            onOpenMotm ? "cursor-pointer hover:border-[#FF9900]/60" : "cursor-default",
          )}
          style={{ background: heroGradient }}
        >
          <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex min-w-0 items-center gap-3.5">
              <PlayerAvatar name={motm.name} avatarUrl={motm.avatarUrl} size={56} winner />
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-[#FFB800]">
                  <Crown className="h-3.5 w-3.5" /> Man of the Match
                </span>
                <div className="mt-0.5 truncate text-base font-black uppercase tracking-wide text-white">{motm.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  {motm.teamName && (
                    <>
                      {motm.teamLogoUrl && <img src={motm.teamLogoUrl} alt="" className="h-4 w-4 rounded-sm object-cover" />}
                      <span className="truncate text-[11px] font-black uppercase tracking-[0.14em] text-[#FF9900]">
                        {motm.teamName}
                      </span>
                    </>
                  )}
                  <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400">
                    MVP
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:shrink-0">
              <span className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-center">
                <span className="block text-[8px] font-black uppercase tracking-[0.18em] text-zinc-500">Rating</span>
                <span className="block font-mono text-sm font-black leading-tight text-white tabular-nums">
                  {formatRating(motm.rating)}
                </span>
              </span>
              <span
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-black"
                style={{ background: goldCta, boxShadow: "0 14px 28px -14px rgba(255,153,0,0.85)" }}
              >
                <Star className="h-4 w-4" /> MVP Award
                {onOpenMotm && <ChevronRight className="h-3.5 w-3.5" />}
              </span>
            </div>
          </div>
        </button>
      </div>
    </section>
  );
}

export default MatchResultCard;



