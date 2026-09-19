import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Trophy, Shield, CheckCircle2, XCircle, Loader2, RefreshCw, Eye, ClipboardList, History, Search, Clock3, RotateCcw, Swords, UserCheck, AlertTriangle, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiUrl, storageUrl } from "@/lib/api";

// ── Types (mirror API serialization) ─────────────────────────────────────────
interface ResultSubmission {
  id: number;
  fixtureId: number;
  playerGameId: number | null;
  submittedBy: number;
  status: "pending" | "approved" | "rejected" | "reopened";
  imagePath: string;
  homeScore: number | null;
  awayScore: number | null;
  homePossession: number | null;
  awayPossession: number | null;
  homeShots: number | null;
  awayShots: number | null;
  homeShotsOnTarget: number | null;
  awayShotsOnTarget: number | null;
  homeCornerKicks: number | null;
  awayCornerKicks: number | null;
  homeOffside: number | null;
  awayOffside: number | null;
  homeFreeKicks: number | null;
  awayFreeKicks: number | null;
  homeFouls: number | null;
  awayFouls: number | null;
  homeSuccessfulPasses: number | null;
  awaySuccessfulPasses: number | null;
  homeCrosses: number | null;
  awayCrosses: number | null;
  homeInterceptions: number | null;
  awayInterceptions: number | null;
  homeTackles: number | null;
  awayTackles: number | null;
  homeSaves: number | null;
  awaySaves: number | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  fixture?: {
    participant1Id: number | null;
    participant1Name: string | null;
    participant2Id: number | null;
    participant2Name: string | null;
    status: string | null;
  };
  playerGame?: {
    id: number;
    homePlayerId: number | null;
    awayPlayerId: number | null;
    homePlayerName: string | null;
    awayPlayerName: string | null;
  } | null;
  tournamentName?: string | null;
  submittedByName?: string | null;
  ocrMetadata?: OcrMetadata | null;
  assignment?: PlayerAssignment | null;
}

// ── Admin-controlled player assignment ───────────────────────────────────────
// The two players registered for this matchup. The administrator chooses which
// one is the Home side and which is the Away side before approving.
interface PlayerOption {
  id: number;
  name: string;
}

interface PlayerAssignment {
  homePlayerId: number | null;
  homePlayerName: string | null;
  awayPlayerId: number | null;
  awayPlayerName: string | null;
}

interface OcrMetadata {
  engine: string;
  available: boolean;
  error: string | null;
  durationMs: number;
  homeName: string | null;
  awayName: string | null;
  homeNameConfidence?: number;
  awayNameConfidence?: number;
  confidence: Record<string, number>;
  sources: Record<string, string>;
  uncertainFields: string[];
  rawText: string;
  notes: string[];
}

interface AuditRow {
  id: number;
  adminId: number | null;
  adminName: string | null;
  action: "approve" | "reject" | "reopen";
  fixtureId: number;
  submissionId: number;
  previousStatus: string;
  newStatus: string;
  rejectionReason: string | null;
  createdAt: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────
// Every statistic the admin can review/correct. The list matches the OCR
// extraction and the database columns exactly; `Successful Passes` is ONE field.
const STAT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "Score", label: "Score", required: true },
  { key: "Possession", label: "Possession" },
  { key: "Shots", label: "Shots" },
  { key: "ShotsOnTarget", label: "Shots on Target" },
  { key: "CornerKicks", label: "Corner Kicks" },
  { key: "Offside", label: "Offside" },
  { key: "FreeKicks", label: "Free Kicks" },
  { key: "Fouls", label: "Fouls" },
  { key: "SuccessfulPasses", label: "Successful Passes" },
  { key: "Crosses", label: "Crosses" },
  { key: "Interceptions", label: "Interceptions" },
  { key: "Tackles", label: "Tackles" },
  { key: "Saves", label: "Saves" },
];

const REJECT_REASONS = [
  "Screenshot is unclear",
  "Wrong fixture",
  "Player names do not match this matchup",
  "Result does not match",
  "Screenshot is incomplete",
  "Invalid submission",
];

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending Verification", cls: "bg-amber-400/15 text-amber-300 border-amber-400/40" },
  approved: { label: "Approved", cls: "bg-emerald-400/15 text-emerald-300 border-emerald-400/40" },
  rejected: { label: "Rejected", cls: "bg-red-400/15 text-red-300 border-red-400/40" },
  reopened: { label: "Reopened — Awaiting Resubmission", cls: "bg-sky-400/15 text-sky-300 border-sky-400/40" },
};

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? "Request failed");
  return data as T;
}

const fmtDateTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};

const fmt = (v: number | null) => (v === null || v === undefined ? "Not detected" : String(v));

// A numeric stat accessor used to pull each draft/confirmed value.
function valueAt(s: ResultSubmission, side: "home" | "away", field: string): number | null {
  const key = `${side}${field}`;
  return (s[key as keyof ResultSubmission] as number | null) ?? null;
}

// ── Home/Away player options ───────────────────────────────────────────────
// The two players registered for this submission's matchup, in the order the
// administrator can choose from. A player-vs-player matchup exposes its own two
// players; a solo fixture exposes the fixture's two participants.
function playerOptions(s: ResultSubmission): PlayerOption[] {
  const opts: PlayerOption[] = [];
  const g = s.playerGame;
  if (g?.homePlayerId != null) {
    opts.push({ id: g.homePlayerId, name: g.homePlayerName ?? `Player #${g.homePlayerId}` });
  }
  if (g?.awayPlayerId != null) {
    opts.push({ id: g.awayPlayerId, name: g.awayPlayerName ?? `Player #${g.awayPlayerId}` });
  }
  if (opts.length === 0 && s.fixture?.participant1Id != null) {
    opts.push({
      id: s.fixture.participant1Id,
      name: s.fixture.participant1Name ?? `Player #${s.fixture.participant1Id}`,
    });
  }
  if (s.fixture?.participant2Id != null && s.fixture.participant2Id !== s.fixture.participant1Id) {
    opts.push({
      id: s.fixture.participant2Id,
      name: s.fixture.participant2Name ?? `Player #${s.fixture.participant2Id}`,
    });
  }
  return opts;
}

// ── Home/Away assignment dialog (the approval step) ───────────────────────
// Approving is a two-part decision: the administrator first identifies which
// registered player is the HOME side of the screenshot and which is the AWAY
// side, then confirms. The OCR statistics are assigned by screenshot side, so
// the selection decides which player receives which statistics.
function AssignPlayersDialog({
  s,
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  s: ResultSubmission;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (homePlayerId: number, awayPlayerId: number) => void;
  pending: boolean;
}) {
  const options = playerOptions(s);
  const [homeId, setHomeId] = useState<number | null>(s.assignment?.homePlayerId ?? null);
  const [awayId, setAwayId] = useState<number | null>(s.assignment?.awayPlayerId ?? null);

  const samePlayer = homeId != null && awayId != null && homeId === awayId;
  const homeName = options.find((o) => o.id === homeId)?.name ?? null;
  const awayName = options.find((o) => o.id === awayId)?.name ?? null;
  const canConfirm = homeId != null && awayId != null && !samePlayer;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="assign-players-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" /> Assign Home &amp; Away players
          </DialogTitle>
          <DialogDescription>
            Review the screenshot, then choose which registered player is the Home side and which is the Away side. The detected statistics are saved to the players you select.
          </DialogDescription>
        </DialogHeader>

        {/* 1. MATCH SCREENSHOT */}
        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Match Screenshot</p>
          <a href={storageUrl(s.imagePath)} target="_blank" rel="noreferrer" className="block rounded-lg border border-border bg-black/20 p-1">
            <img
              src={storageUrl(s.imagePath)}
              alt="Match result screenshot"
              className="max-h-[280px] w-full rounded object-contain"
              data-testid="assign-screenshot"
            />
          </a>
        </div>

        {/* 2. HOME / AWAY SELECTION */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Home Player</p>
            {options.map((o) => (
              <button
                key={`home-${o.id}`}
                type="button"
                onClick={() => setHomeId(o.id)}
                data-testid={`home-option-${o.id}`}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                  homeId === o.id
                    ? "border-emerald-400/60 bg-emerald-400/10 font-bold text-foreground"
                    : "border-border bg-muted/20 text-foreground/80 hover:border-primary/50"
                }`}
              >
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${homeId === o.id ? "border-emerald-400" : "border-muted-foreground/50"}`}>
                  {homeId === o.id && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                </span>
                <span className="truncate">{o.name}</span>
              </button>
            ))}
            {options.length < 2 && (
              <p className="text-[11px] text-red-300">No players are registered for this matchup — assigning participants is not possible.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Away Player</p>
            {options.map((o) => (
              <button
                key={`away-${o.id}`}
                type="button"
                onClick={() => setAwayId(o.id)}
                data-testid={`away-option-${o.id}`}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                  awayId === o.id
                    ? "border-sky-400/60 bg-sky-400/10 font-bold text-foreground"
                    : "border-border bg-muted/20 text-foreground/80 hover:border-primary/50"
                }`}
              >
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${awayId === o.id ? "border-sky-400" : "border-muted-foreground/50"}`}>
                  {awayId === o.id && <span className="h-2 w-2 rounded-full bg-sky-400" />}
                </span>
                <span className="truncate">{o.name}</span>
              </button>
            ))}
          </div>
        </div>

        {samePlayer && (
          <p className="flex items-start gap-1.5 rounded-md border border-red-500/50 bg-red-500/10 px-2.5 py-2 text-[11px] font-black text-red-300" data-testid="assignment-same-player-error">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The same player cannot be selected for both Home and Away.
          </p>
        )}

        {/* 3. FINAL PREVIEW */}
        {homeName && awayName && !samePlayer && (
          <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-2" data-testid="assignment-preview">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Home</p>
              <p className="truncate text-sm font-bold text-foreground">{homeName}</p>
              <p className="text-[11px] text-muted-foreground">
                Score {s.homeScore ?? "?"} · {s.awayScore ?? "?"} · Home statistics
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-300">Away</p>
              <p className="truncate text-sm font-bold text-foreground">{awayName}</p>
              <p className="text-[11px] text-muted-foreground">Away statistics</p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            className="bg-emerald-500 text-black hover:bg-emerald-400"
            disabled={!canConfirm || pending}
            onClick={() => homeId != null && awayId != null && onConfirm(homeId, awayId)}
            data-testid="confirm-assignment"
          >
            {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
            Approve Result
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Single review card ───────────────────────────────────────────────────────
function ReviewCard({ s, onRefresh }: { s: ResultSubmission; onRefresh: () => void }) {
  const { toast } = useToast();

  // Editable confirmed values for a pending submission (pre-filled with the
  // values detected from the screenshot; empty = "Not detected").
  const draft: Record<string, string> = {};
  for (const field of STAT_FIELDS) {
    for (const side of ["home", "away"] as const) {
      const v = valueAt(s, side, field.key);
      draft[`${side}${field.key}`] = v === null ? "" : String(v);
    }
  }
  const [values, setValues] = useState<Record<string, string>>(draft);
  const set = (key: string, raw: string) => {
    const cleaned = /^-?\d*$/.test(raw) ? raw : values[key];
    setValues((prev) => ({ ...prev, [key]: cleaned }));
  };

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("Screenshot is unclear");
  const [rejectError, setRejectError] = useState<string | null>(null);

  const approve = useMutation({
    // The administrator's Home/Away selection is REQUIRED: it decides which
    // registered player receives the Home statistics and which receives Away.
    mutationFn: ({ homePlayerId, awayPlayerId }: { homePlayerId: number; awayPlayerId: number }) => {
      const body: Record<string, number | null> = { homePlayerId, awayPlayerId };
      for (const field of STAT_FIELDS) {
        for (const side of ["home", "away"] as const) {
          const raw = values[`${side}${field.key}`].trim();
          body[`${side}${field.key}`] = raw === "" ? null : Number(raw);
        }
      }
      if (body.homeScore == null || body.awayScore == null) {
        throw new Error("Both home and away scores are required before approval");
      }
      return api(`/api/admin/match-result-submissions/${s.id}/approve`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: "Result approved", description: "Official fixture result updated." });
      setAssignOpen(false);
      onRefresh();
    },
    onError: (err) => toast({ title: "Approval failed", description: err.message, variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: () =>
      api(`/api/admin/match-result-submissions/${s.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason.trim() }),
      }),
    onSuccess: () => {
      setRejectOpen(false);
      toast({ title: "Result rejected", description: "Player can now submit a new screenshot." });
      onRefresh();
    },
    onError: (err) => setRejectError(err.message),
  });

  // Reopening reverts the completed fixture so the player can upload again.
  const reopen = useMutation({
    mutationFn: () =>
      api(`/api/admin/match-result-submissions/${s.id}/reopen`, {
        method: "POST",
        body: JSON.stringify({ reason: "Fixture reopened by an administrator — please resubmit a screenshot." }),
      }),
    onSuccess: () => {
      toast({ title: "Fixture reopened", description: "The player can now submit a new screenshot." });
      onRefresh();
    },
    onError: (err) => toast({ title: "Reopen failed", description: err.message, variant: "destructive" }),
  });

  const p1 = s.fixture?.participant1Name ?? "Home";
  const p2 = s.fixture?.participant2Name ?? "Away";
  const imgUrl = storageUrl(s.imagePath);
  const status = STATUS_STYLE[s.status] ?? { label: s.status, cls: "bg-muted text-muted-foreground border-border" };
  // Provenance of the recognition pass, so the admin can see where each number came
  // from and which cells the engine could not read confidently.
  const ocr = s.ocrMetadata ?? null;
  // The two players this submission may be assigned to (the matchup's own
  // players). The administrator picks which is Home and which is Away.
  const options = playerOptions(s);

  return (
<div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
        <span className="text-sm font-black uppercase tracking-widest text-primary">Match Result #WG-{String(s.fixtureId).padStart(4, "0")}</span>
        <Badge className={status.cls} variant="outline">{status.label}</Badge>
        {s.tournamentName && <Badge variant="secondary"><Trophy className="w-3.5 h-3.5" /> {s.tournamentName}</Badge>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 px-4 py-3">
        {/* Screenshot */}
        <div>
          {imgUrl ? (
            <img src={imgUrl} alt="Match screenshot" className="rounded-lg border border-border object-contain max-h-64 w-full bg-muted" />
          ) : (
            <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">No screenshot</div>
          )}
          {imgUrl && (
            <a href={imgUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-primary">
              <Eye className="w-3.5 h-3.5" /> Open screenshot
            </a>
          )}
        </div>

        {/* Meta */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /><span className="font-medium text-foreground">{p1}</span><span className="text-muted-foreground">vs</span><span className="font-medium text-foreground">{p2}</span></div>
          {s.playerGame && (
            <div className="flex items-center gap-2 text-xs">
              <Swords className="w-3.5 h-3.5 text-primary" />
              <span className="text-muted-foreground">Player match:</span>
              <span className="font-bold text-foreground">
                {s.playerGame.homePlayerName ?? "Home"} vs {s.playerGame.awayPlayerName ?? "Away"}
              </span>
            </div>
          )}
          <div className="text-xs text-muted-foreground">Submitted by <span className="text-foreground font-medium">{s.submittedByName ?? `#${s.submittedBy}`}</span></div>
          <div className="text-xs text-muted-foreground">Date <span className="text-foreground font-medium">{fmtDateTime(s.createdAt)}</span></div>
          {s.status === "rejected" && (
            <div className="text-xs"><span className="text-red-500 font-bold">Reason:</span> <span className="text-foreground">{s.rejectionReason ?? "—"}</span></div>
          )}
          {s.status === "reopened" && (
            <div className="text-xs"><span className="text-sky-500 font-bold">Reopened:</span> <span className="text-foreground">{s.rejectionReason ?? "—"}</span></div>
          )}
          {s.status === "approved" && (
            <div className="text-xs"><span className="text-emerald-500 font-bold">Approved</span> <span className="text-muted-foreground">{fmtDateTime(s.approvedAt)}</span></div>
          )}
        </div>
      </div>

      {/* Admin player assignment — which registered player took each side */}
      {s.assignment?.homePlayerId != null && s.assignment?.awayPlayerId != null && (
        <div className="border-t border-border px-4 py-3" data-testid="assignment-summary">
          <div className="mb-2 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Assigned Players</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Home</p>
              <p className="truncate text-sm font-bold text-foreground">{s.assignment.homePlayerName ?? `Player #${s.assignment.homePlayerId}`}</p>
            </div>
            <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-300">Away</p>
              <p className="truncate text-sm font-bold text-foreground">{s.assignment.awayPlayerName ?? `Player #${s.assignment.awayPlayerId}`}</p>
            </div>
          </div>
        </div>
      )}

      {/* Detected statistics — confirmation fields for pending submissions */}
      <div className="px-4 pb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Detected Statistics</span>
          {s.status === "pending" && (
            <span className="text-[10px] text-muted-foreground">
              — review &amp; correct any field marked <span className="font-bold text-amber-400">Not detected</span> before approving
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pr-2 text-left font-bold">Statistic</th>
                <th className="px-2 py-1.5 text-center font-bold">{p1}</th>
                <th className="px-2 py-1.5 text-center font-bold">{p2}</th>
              </tr>
            </thead>
            <tbody>
              {STAT_FIELDS.map((field) => (
                <tr key={field.key} className="border-t border-border/60">
                  <td className="py-1.5 pr-2 text-xs font-medium text-muted-foreground">{field.label}</td>
                  {(["home", "away"] as const).map((side) => {
                    const key = `${side}${field.key}`;
                    const raw = values[key] ?? "";
                    const missing = raw.trim() === "";

                    if (s.status !== "pending") {
                      return (
                        <td key={key} className="px-2 py-1.5 text-center font-bold text-foreground">
                          {missing ? <span className="text-xs font-medium text-muted-foreground">Not detected</span> : raw}
                        </td>
                      );
                    }

                    // Highlight the score (always required) in red and every other
                    // unreadable statistic in amber so nothing is silently invented.
                    const tone = missing
                      ? field.required
                        ? "border-red-500/70 text-red-300"
                        : "border-amber-500/70 text-amber-200"
                      : "border-border";
                    return (
                      <td key={key} className="px-2 py-1.5 text-center">
                        <Input
                          value={raw}
                          onChange={(e) => set(key, e.target.value)}
                          placeholder="Not detected"
                          inputMode="numeric"
                          aria-label={`${p1} vs ${p2} ${field.label} ${side}`}
                          className={`mx-auto h-8 w-24 text-center text-sm font-bold ${tone}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Image recognition provenance — where every extracted number came from */}
      {ocr && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Image Recognition</span>
            {ocr.available ? (
              <Badge className="bg-emerald-400/15 text-emerald-300 border-emerald-400/40" variant="outline">
                Screenshot read by OCR
              </Badge>
            ) : (
              <Badge className="bg-red-400/15 text-red-300 border-red-400/40" variant="outline">
                OCR unavailable — enter values manually
              </Badge>
            )}
          </div>

          <div className="space-y-0.5 text-[11px] text-muted-foreground">
            <div><span className="font-bold text-foreground">Engine:</span> {ocr.engine}</div>
            <div><span className="font-bold text-foreground">Recognition time:</span> {(ocr.durationMs / 1000).toFixed(1)}s</div>
            {ocr.homeName && ocr.awayName && (
              <div><span className="font-bold text-foreground">Names read:</span> {ocr.homeName} vs {ocr.awayName}</div>
            )}
            {!ocr.available && ocr.error && (
              <div className="text-red-400"><span className="font-bold">Error:</span> {ocr.error}</div>
            )}
            {ocr.uncertainFields.length > 0 && (
              <div className="text-amber-400">
                <span className="font-bold">Not confidently read:</span> {ocr.uncertainFields.join(", ")}
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {STAT_FIELDS.flatMap((field) =>
              (["home", "away"] as const).map((side) => {
                const key = `${side}${field.key}`;
                const conf = ocr.confidence[key];
                const src = ocr.sources[key];
                if (src === undefined && conf === undefined) return [];
                return [
                  <span key={key} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px]">
                    <span className="font-medium text-muted-foreground">{side === "home" ? p1 : p2} · {field.label}</span>
                    <span className={`font-bold ${conf ? "text-foreground" : "text-amber-400"}`}>
                      {conf ? `${Math.round(conf)}%` : "n/a"}
                    </span>
                    {src === "digit-pass" && <span className="font-bold text-sky-400">re-read</span>}
                  </span>,
                ];
              }),
            )}
          </div>

          {ocr.rawText.trim().length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] font-bold text-primary">View raw text read from the screenshot</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-[10px] leading-snug text-muted-foreground">
                {ocr.rawText.trim()}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        {s.status === "pending" ? (
          <>
            <Button
              onClick={() => { setAssignError(null); setAssignOpen(true); }}
              className="font-black uppercase tracking-wider"
              title="Choose which registered player is the Home side and which is the Away side"
              data-testid={`button-approve-result-${s.id}`}
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve Result
            </Button>
            <Button
              variant="outline"
              onClick={() => { setRejectError(null); setRejectOpen(true); }}
              className="border-red-500/40 font-black uppercase tracking-wider text-red-400 hover:text-red-300"
              data-testid={`button-reject-result-${s.id}`}
            >
              <XCircle className="w-4 h-4" /> Reject Result
            </Button>
            <span className="text-[10px] text-muted-foreground">
              Approving opens the Home / Away player assignment, writes the official score and marks the fixture MATCH COMPLETED.
            </span>
          </>
        ) : s.status === "approved" ? (
          <>
            <span className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> Approved — official result saved · fixture MATCH COMPLETED
            </span>
            <Button
              variant="outline"
              onClick={() => reopen.mutate()}
              disabled={reopen.isPending}
              className="ml-auto font-black uppercase tracking-wider"
              title="Revert the fixture and let the player upload a new screenshot"
            >
              {reopen.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Reopen Fixture
            </Button>
          </>
        ) : s.status === "reopened" ? (
          <span className="inline-flex items-center gap-2 text-xs font-bold text-sky-400">
            <RotateCcw className="w-4 h-4" /> Reopened — awaiting a new screenshot from the player
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-xs font-bold text-red-400">
            <XCircle className="w-4 h-4" /> Rejected — {s.rejectionReason ?? "no reason given"}
          </span>
        )}
      </div>


      {/* Home/Away player assignment — the confirmation step before approval */}
      <AssignPlayersDialog
        s={s}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        pending={approve.isPending}
        onConfirm={(homePlayerId, awayPlayerId) => {
          setAssignError(null);
          approve.mutate({ homePlayerId, awayPlayerId });
        }}
      />
      {assignError && (
        <p className="border-t border-border px-4 py-2 text-[11px] font-bold text-red-400">{assignError}</p>
      )}

      {/* Rejection dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tight">Reject Match Result</DialogTitle>
            <DialogDescription>
              Match Result #WG-{String(s.fixtureId).padStart(4, "0")} — {p1} vs {p2}. The submitting player will see this
              reason and can upload a new screenshot.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Rejection reason (required)
              </label>
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Screenshot is unclear"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {REJECT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRejectReason(r)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                    rejectReason === r
                      ? "border-red-500/60 bg-red-500/15 text-red-300"
                      : "border-border text-muted-foreground hover:border-red-500/40 hover:text-red-300"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {rejectError && <p className="text-xs font-bold text-red-400">{rejectError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!rejectReason.trim()) { setRejectError("A rejection reason is required"); return; }
                reject.mutate();
              }}
              disabled={reject.isPending}
              className="bg-red-600 font-black uppercase tracking-wider text-white hover:bg-red-500"
            >
              {reject.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Admin page: MATCH RESULT VERIFICATION ────────────────────────────────────
type TabKey = "pending" | "approved" | "rejected" | "reopened" | "all";

const TABS: { key: TabKey; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "reopened", label: "Reopened" },
  { key: "all", label: "All" },
];

// -- Admin screenshot upload --------------------------------------------------
// The administrator is the person who uploads the match screenshot in this
// workflow. The screenshot is read by the real OCR pipeline and the submission
// appears in the review list below, where the admin assigns Home/Away players.
function AdminUploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"game" | "fixture">("game");
  const [targetId, setTargetId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const upload = useMutation({
    mutationFn: async () => {
      const id = Number(targetId);
      if (!Number.isInteger(id) || id <= 0) throw new Error("Enter a valid ID");
      if (!file) throw new Error("Choose a screenshot image first");
      const endpoint =
        mode === "game"
          ? `/api/admin/player-games/${id}/result-submission`
          : `/api/admin/matches/${id}/result-submission`;
      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": file.type || "image/png" },
        body: file,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? "Upload failed");
      return data as ResultSubmission;
    },
    onSuccess: (data) => {
      setUploadedUrl(storageUrl(data.imagePath) ?? null);
      toast({
        title: "Screenshot uploaded",
        description: "The screenshot was read by OCR and queued for verification.",
      });
      onUploaded();
    },
    onError: (err) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const close = (v: boolean) => {
    if (!v) {
      setFile(null);
      setTargetId("");
      setUploadedUrl(null);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="admin-upload-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight">
            <Upload className="h-5 w-5 text-primary" /> Upload Match Screenshot
          </DialogTitle>
          <DialogDescription>
            Upload the eFootball result screenshot for a player-vs-player matchup (or a solo fixture). The
            statistics are read automatically and you assign the Home and Away players before approving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Upload target
            </label>
            <div className="flex gap-1.5">
              {(["game", "fixture"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  data-testid={`upload-mode-${m}`}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                    mode === m
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "game" ? "Player vs Player matchup" : "Solo fixture"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {mode === "game" ? "Player matchup ID" : "Fixture ID"}
            </label>
            <Input
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              inputMode="numeric"
              placeholder={mode === "game" ? "e.g. 42" : "e.g. 128"}
              data-testid="upload-target-id"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Screenshot image
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-foreground"
              data-testid="upload-file"
            />
          </div>

          {(preview || uploadedUrl) && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Match Screenshot</p>
              <img
                src={uploadedUrl ?? preview ?? ""}
                alt="Match screenshot preview"
                className="max-h-56 w-full rounded-lg border border-border bg-black/20 object-contain"
                data-testid="upload-preview"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => close(false)} disabled={upload.isPending}>
            Close
          </Button>
          <Button
            className="font-black uppercase tracking-wider"
            onClick={() => upload.mutate()}
            disabled={upload.isPending || !file || !targetId.trim()}
            data-testid="upload-submit"
          >
            {upload.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            Upload Screenshot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminMatchResultsPage() {
  const [tab, setTab] = useState<TabKey>("pending");
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const submissions = useQuery<ResultSubmission[]>({
    queryKey: ["admin", "match-result-submissions"],
    queryFn: () => api("/api/admin/match-result-submissions"),
    refetchInterval: 30_000,
    retry: false,
  });

  const audit = useQuery<AuditRow[]>({
    queryKey: ["admin", "match-result-audit"],
    queryFn: () => api("/api/admin/match-result-audit"),
    retry: false,
  });

  const refresh = () => {
    submissions.refetch();
    audit.refetch();
  };

  const all = submissions.data ?? [];
  const counts: Record<TabKey, number> = {
    pending: all.filter((s) => s.status === "pending").length,
    approved: all.filter((s) => s.status === "approved").length,
    rejected: all.filter((s) => s.status === "rejected").length,
    reopened: all.filter((s) => s.status === "reopened").length,
    all: all.length,
  };

  const q = search.trim().toLowerCase();
  const visible = all.filter((s) => {
    if (tab !== "all" && s.status !== tab) return false;
    if (!q) return true;
    return [
      `wg-${String(s.fixtureId).padStart(4, "0")}`,
      String(s.fixtureId),
      s.fixture?.participant1Name ?? "",
      s.fixture?.participant2Name ?? "",
      s.tournamentName ?? "",
      s.submittedByName ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-black uppercase tracking-tight">
            <ClipboardList className="h-6 w-6 text-primary" /> Match Result Verification
          </h1>
          <p className="text-sm text-muted-foreground">
            Review player-submitted match screenshots, confirm the detected statistics and publish the official result.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {counts.pending > 0 && (
            <Badge variant="outline" className="border-amber-400/40 bg-amber-400/15 text-amber-300">
              <Clock3 className="h-3.5 w-3.5" /> {counts.pending} awaiting verification
            </Badge>
          )}
          <Button
            onClick={() => setUploadOpen(true)}
            className="font-black uppercase tracking-wider"
            data-testid="button-admin-upload"
          >
            <Upload className="h-4 w-4" /> Upload Screenshot
          </Button>
          <Button variant="outline" onClick={refresh} disabled={submissions.isFetching}>
            <RefreshCw className={`h-4 w-4 ${submissions.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <AdminUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={refresh} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                tab === t.key
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label} ({counts[t.key]})
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fixture, player or tournament"
            className="pl-9"
          />
        </div>
      </div>
{/* Submissions */}
      {submissions.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <Skeleton className="mb-3 h-5 w-56" />
              <Skeleton className="h-40 w-full" />
            </div>
          ))}
        </div>
      ) : submissions.isError ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-8 text-center text-sm font-bold text-red-400">
          {(submissions.error as Error).message}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-12 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          <p className="text-sm font-bold">{all.length === 0 ? "No match results submitted yet." : "Nothing in this view."}</p>
          <p className="text-xs text-muted-foreground">
            Player-submitted match screenshots appear here automatically for verification.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((s) => (
            <ReviewCard key={s.id} s={s} onRefresh={refresh} />
          ))}
        </div>
      )}

      {/* Audit log */}
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-muted-foreground">
          <History className="h-4 w-4 text-primary" /> Verification Audit Log
        </h2>
        {audit.data && audit.data.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 text-left font-bold">Admin</th>
                  <th className="p-3 text-left font-bold">Action</th>
                  <th className="p-3 text-left font-bold">Fixture</th>
                  <th className="p-3 text-left font-bold">Submission</th>
                  <th className="p-3 text-left font-bold">Status change</th>
                  <th className="p-3 text-left font-bold">Reason</th>
                  <th className="p-3 text-left font-bold">Date</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-b-0">
                    <td className="p-3 font-medium">{row.adminName ?? (row.adminId != null ? `#${row.adminId}` : "admin")}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1.5 font-black uppercase ${
                        row.action === "approve" ? "text-emerald-400" : row.action === "reopen" ? "text-sky-400" : "text-red-400"
                      }`}>
                        {row.action === "approve" ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : row.action === "reopen" ? (
                          <RotateCcw className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {row.action}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-primary">#WG-{String(row.fixtureId).padStart(4, "0")}</td>
                    <td className="p-3 text-muted-foreground">#{row.submissionId}</td>
                    <td className="p-3 text-xs text-muted-foreground">{row.previousStatus} → {row.newStatus}</td>
                    <td className="p-3 text-xs">{row.rejectionReason ?? "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{fmtDateTime(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
            No approval or rejection actions logged yet.
          </p>
        )}
      </div>
    </div>
  );
}
