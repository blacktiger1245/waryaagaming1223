/**
 * TransfersPanel — the Transfers tab.
 *
 * Lists recent player movement between clans, newest first, from
 * GET /api/clan-tournament/transfers. A missing "from" clan means the player
 * joined straight from free agency.
 */
import { Repeat, ArrowRight } from "lucide-react";
import { ClanBadge } from "./ClanBadge";
import { clanCard, clanGradient, clanTheme } from "./theme";

export interface ClanTransfer {
  id: number;
  playerId: number;
  playerName: string | null;
  username: string | null;
  avatarUrl: string | null;
  fromTeamId: number | null;
  fromTeamName: string | null;
  fromTeamTag: string | null;
  toTeamId: number | null;
  toTeamName: string | null;
  toTeamTag: string | null;
  transferredAt: string | null;
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function TransferRow({ transfer }: { transfer: ClanTransfer }) {
  const player = transfer.playerName?.trim() || transfer.username || `Player ${transfer.playerId}`;

  return (
    <div
      className="clan-row grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t px-3 py-2.5"
      style={{ borderColor: clanTheme.border }}
      data-testid={`transfer-row-${transfer.id}`}
    >
      {/* From */}
      <div className="flex min-w-0 items-center justify-end gap-2 text-right">
        {transfer.fromTeamName ? (
          <>
            <span className="truncate text-[13px] font-semibold text-white" title={transfer.fromTeamName}>
              {transfer.fromTeamName}
            </span>
            <ClanBadge
              name={transfer.fromTeamName}
              tag={transfer.fromTeamTag ?? ""}
              logoUrl={null}
              size={24}
            />
          </>
        ) : (
          <span className="clan-chip px-2 py-0.5 text-[10px]" style={{ color: clanTheme.muted }}>
            Free agent
          </span>
        )}
      </div>

      {/* Player + date */}
      <div className="flex min-w-[150px] flex-col items-center">
        <div className="flex items-center gap-1.5">
          {transfer.avatarUrl ? (
            <img src={transfer.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[9px] font-black text-white">
              {player.charAt(0)}
            </span>
          )}
          <span className="max-w-[130px] truncate text-[12px] font-bold text-white" title={player}>
            {player}
          </span>
        </div>
        <span
          className="mt-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide"
          style={{ color: clanTheme.accent }}
        >
          <ArrowRight className="h-3 w-3" />
          {formatWhen(transfer.transferredAt)}
        </span>
      </div>

      {/* To */}
      <div className="flex min-w-0 items-center gap-2">
        {transfer.toTeamName ? (
          <>
            <ClanBadge name={transfer.toTeamName} tag={transfer.toTeamTag ?? ""} logoUrl={null} size={24} />
            <span className="truncate text-[13px] font-semibold text-white" title={transfer.toTeamName}>
              {transfer.toTeamName}
            </span>
          </>
        ) : (
          <span className="clan-chip px-2 py-0.5 text-[10px]" style={{ color: clanTheme.muted }}>
            Released
          </span>
        )}
      </div>
    </div>
  );
}

export function TransfersPanel({
  transfers,
  isLoading,
  title,
}: {
  transfers: ClanTransfer[];
  isLoading: boolean;
  title: string;
}) {
  return (
    <section className={clanCard}>
      <header
        className="flex items-center gap-2.5 border-b px-4 py-3"
        style={{ borderColor: clanTheme.border }}
      >
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: clanGradient.brand, boxShadow: "0 0 18px -4px rgba(168,85,247,0.85)" }}
        >
          <Repeat className="h-4 w-4 text-white" />
        </span>
        <h2 className="truncate text-sm font-bold uppercase tracking-[0.12em] text-white">{title}</h2>
        <span className="clan-chip ml-auto shrink-0 px-2.5 py-1 text-[10px]" style={{ color: clanTheme.muted }}>
          {transfers.length} {transfers.length === 1 ? "transfer" : "transfers"}
        </span>
      </header>

      {transfers.length === 0 ? (
        <p className="px-4 py-10 text-center text-xs" style={{ color: clanTheme.muted }}>
          {isLoading ? "Loading transfers…" : "No clan transfers recorded yet."}
        </p>
      ) : (
        transfers.map((transfer) => <TransferRow key={transfer.id} transfer={transfer} />)
      )}
    </section>
  );
}

export default TransfersPanel;
