import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Loader2, CheckCircle2, XCircle, Clock3, Eye, Trophy } from "lucide-react";
import { apiUrl, storageUrl } from "@/lib/api";

// ── Data types (mirror the API serialization) ────────────────────────────────
export interface ResultSubmission {
  id: number;
  fixtureId: number;
  submittedBy: number;
  status: "pending" | "approved" | "rejected" | "reopened";
  imagePath: string;
  homeScore: number | null;
  awayScore: number | null;
  homePosition: number | null;
  awayPosition: number | null;
  homeShots: number | null;
  awayShots: number | null;
  homeShotsOnTarget: number | null;
  awayShotsOnTarget: number | null;
  homeCorners: number | null;
  awayCorners: number | null;
  homeYellowCards: number | null;
  awayYellowCards: number | null;
  homeRedCards: number | null;
  awayRedCards: number | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface SubmissionMatch {
  id: number;
  status: string;
  participant1Id: number | null;
  participant2Id: number | null;
  participant1Name?: string | null;
  participant2Name?: string | null;
  tournamentType?: string | null;
}

/** A player-vs-player matchup inside a team fixture (match_player_games row). */
interface SubmissionPlayerGame {
  id: number;
  status: string;
  homePlayerId: number | null;
  awayPlayerId: number | null;
  homePlayerName?: string | null;
  awayPlayerName?: string | null;
}

async function fetchSubmission(matchId: number): Promise<ResultSubmission | null> {
  const res = await fetch(apiUrl(`/api/matches/${matchId}/result-submission`), { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Could not load submission status");
  return res.json();
}

async function fetchGameSubmission(gameId: number): Promise<ResultSubmission | null> {
  const res = await fetch(apiUrl(`/api/player-games/${gameId}/result-submission`), { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Could not load submission status");
  return res.json();
}

type DropLike = {
  preventDefault(): void;
  dataTransfer: { files?: FileList | undefined } | undefined;
};

// ── Local stateless sub-components ───────────────────────────────────────────
function StatusBadge({ submission }: { submission: ResultSubmission }) {
  if (submission.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">
        <Clock3 className="h-3 w-3" /> Pending Admin Approval
      </span>
    );
  }
  if (submission.status === "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Approved
      </span>
    );
  }
  if (submission.status === "reopened") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-sky-300">
        <ImageUp className="h-3 w-3" /> Reopened — Resubmit
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-300">
      <XCircle className="h-3 w-3" /> Rejected
    </span>
  );
}

function ViewScreenshot({ imagePath }: { imagePath: string }) {
  const [open, setOpen] = useState(false);
  const url = storageUrl(imagePath);
  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#00F0FF]/40 bg-[#00F0FF]/10 px-2.5 py-1 text-[10px] font-black text-[#00E0FF] transition-colors hover:bg-[#00F0FF]/20"
      >
        <Eye className="h-3 w-3" /> View Screenshot
      </button>
      {open && url && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setOpen(false)}
        >
          <img
            src={url}
            alt="Match result screenshot"
            className="max-h-[85vh] max-w-[92vw] rounded-xl border border-[#29406e] object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// Statistics that come out of the admin-approved screenshot. `null` means the
// value was not detected and is therefore displayed as "Not detected".
const STAT_ROWS: { label: string; home: keyof ResultSubmission; away: keyof ResultSubmission }[] = [
  { label: "Position", home: "homePosition", away: "awayPosition" },
  { label: "Shots", home: "homeShots", away: "awayShots" },
  { label: "Shots on Target", home: "homeShotsOnTarget", away: "awayShotsOnTarget" },
  { label: "Corners", home: "homeCorners", away: "awayCorners" },
  { label: "Yellow Cards", home: "homeYellowCards", away: "awayYellowCards" },
  { label: "Red Cards", home: "homeRedCards", away: "awayRedCards" },
];

function StatValue({ value }: { value: number | string | null }) {
  if (value === null || value === undefined) return <span className="text-zinc-600">Not detected</span>;
  return <>{value}</>;
}

/**
 * Read-only official result view: score, the statistics extracted from the
 * approved screenshot and a button to open the original screenshot.
 */
function OfficialResult({
  submission,
  homeName,
  awayName,
}: {
  submission: ResultSubmission;
  homeName: string;
  awayName: string;
}) {
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">
          <Trophy className="h-3 w-3" /> Match Completed
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Official Result</span>
        <ViewScreenshot imagePath={submission.imagePath} />
      </div>

      <div className="mt-2 flex items-center justify-center gap-3 rounded-lg border border-[#29406e] bg-[#0b1424] px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-right text-sm font-black text-white">{homeName}</span>
        <span className="shrink-0 rounded-md border border-[#00F0FF]/40 bg-[#00F0FF]/10 px-3 py-1 text-base font-black text-[#00E0FF]">
          {submission.homeScore ?? "—"} — {submission.awayScore ?? "—"}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-sm font-black text-white">{awayName}</span>
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[320px] text-xs">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-zinc-500">
              <th className="py-1 pr-2 text-left font-black">Match Statistics</th>
              <th className="px-2 py-1 text-center font-black text-[#00E0FF]">{homeName}</th>
              <th className="px-2 py-1 text-center font-black text-[#FF2A5F]">{awayName}</th>
            </tr>
          </thead>
          <tbody>
            {STAT_ROWS.map((row) => (
              <tr key={row.label} className="border-t border-[#29406e]/50">
                <td className="py-1 pr-2 font-medium text-zinc-400">{row.label}</td>
                <td className="px-2 py-1 text-center font-bold text-white">
                  <StatValue value={submission[row.home]} />
                </td>
                <td className="px-2 py-1 text-center font-bold text-white">
                  <StatValue value={submission[row.away]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[9px] text-zinc-500">
        Statistics extracted from the admin-approved match screenshot · source image kept on file.
      </p>
    </div>
  );
}
function UploadButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-[#00E0FF] to-[#0a84b0] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#04121c] shadow-[0_3px_12px_rgba(0,240,255,0.35)] transition-transform hover:-translate-y-0.5"
    >
      <ImageUp className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
// ── Main component ───────────────────────────────────────────────────────────
// Two modes:
//   • `match`      — a solo fixture, where the fixture itself is the matchup.
//   • `playerGame` — a player-vs-player matchup inside a team fixture. The
//                  upload is bound to the matchup, not the parent team card.
export function ResultSubmission({
  match,
  playerGame,
  userId,
  isAdmin = false,
}: {
  match?: SubmissionMatch;
  playerGame?: SubmissionPlayerGame;
  userId: number | null;
  isAdmin?: boolean;
}) {
  const qc = useQueryClient();
  const isGameMode = playerGame != null;
  const targetId = isGameMode ? playerGame.id : match?.id;

  const { data: submission, isLoading, refetch } = useQuery<ResultSubmission | null>({
    queryKey: isGameMode ? ["player-game-result-submission", targetId] : ["match-result-submission", targetId],
    queryFn: () => (isGameMode ? fetchGameSubmission(targetId!) : fetchSubmission(targetId!)),
    retry: false,
    enabled: targetId != null,
  });

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPickFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(f.type)) {
      alert("Please choose a PNG, JPEG, WEBP or GIF screenshot.");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      alert("Image is too large. Maximum size is 8 MB.");
      return;
    }
    setFile(f);
  };

  // Show a preview of the selected image before it is submitted.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const uploadMutation = useMutation({
    mutationFn: async (f: File) => {
      const endpoint = isGameMode
        ? `/api/player-games/${targetId}/result-submission`
        : `/api/matches/${targetId}/result-submission`;
      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": f.type || "image/png" },
        body: f,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? "Upload failed");
      return data as ResultSubmission;
    },
    onSuccess: () => {
      setFile(null);
      setPreview(null);
      refetch();
      qc.invalidateQueries({
        queryKey: isGameMode ? ["player-game-result-submission", targetId] : ["match-result-submission", targetId],
      });
    },
  });

  const handleDrop = (e: DropLike) => {
    e.preventDefault();
    setDragging(false);
    onPickFile(e.dataTransfer?.files?.[0]);
  };

  const isParticipant = isGameMode
    ? userId != null && (userId === playerGame.homePlayerId || userId === playerGame.awayPlayerId)
    : userId != null && match != null && (userId === match.participant1Id || userId === match.participant2Id);
  const isTeamMatch = !isGameMode && match?.tournamentType === "team";
  const completed = isGameMode
    ? playerGame.status === "completed"
    : match?.status === "completed" || match?.status === "cancelled";

  // Only the players assigned to this matchup ever see this panel. For team
  // fixtures the panel lives on the player-vs-player matchup (isGameMode), not
  // on the parent card. Admins/owners always see it so they can upload a
  // screenshot on a player's behalf (the server allows it too).
  if (!isParticipant && !isTeamMatch && !isAdmin) return null;
  // A finished matchup with no submission of my own has nothing left to show.
  if (!isLoading && !submission && completed) return null;

  const current: ResultSubmission | null = submission ?? null;
  const pick = () => inputRef.current?.click();
  // A completed matchup cannot be resubmitted unless an admin reopens it.
  const canUpload = !completed && (current === null || current.status === "rejected" || current.status === "reopened");
  const homeName = isGameMode ? playerGame.homePlayerName ?? "Player A" : match?.participant1Name ?? "Player A";
  const awayName = isGameMode ? playerGame.awayPlayerName ?? "Player B" : match?.participant2Name ?? "Player B";

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2.5"
      style={{ borderColor: "rgba(0,240,255,0.25)", background: "rgba(19,34,63,0.35)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => onPickFile(e.target.files?.[0])}
      />

      {isLoading ? (
        <span className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Result status…
        </span>
      ) : current === null ? (
        <>
          <UploadButton label="Upload Match Result" onClick={pick} />
          <span className="text-[10px] text-zinc-500">Screenshot of the completed match</span>
        </>
      ) : current.status === "approved" ? (
        <OfficialResult submission={current} homeName={homeName} awayName={awayName} />
      ) : current.status === "rejected" || current.status === "reopened" ? (
        <>
          <StatusBadge submission={current} />
          <span className={`text-[10px] font-bold ${current.status === "reopened" ? "text-sky-300" : "text-red-300"}`}>
            Reason: {current.rejectionReason ?? "Unspecified"}
          </span>
          {canUpload ? (
            <UploadButton label="Upload New Screenshot" onClick={pick} />
          ) : (
            <span className="text-[10px] text-zinc-500">This fixture is closed — contact an admin.</span>
          )}
        </>
      ) : (
        <>
          <StatusBadge submission={current} />
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-zinc-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-amber-300" /> Result Submitted — awaiting verification
          </span>
          <ViewScreenshot imagePath={current.imagePath} />
        </>
      )}
{/* Upload panel (opened once a file is chosen) */}
      {file && (
        <div className="mt-1 w-full">
          <div
            className={`rounded-lg border border-dashed p-3 ${dragging ? "border-[#00F0FF] bg-[#00F0FF]/10" : "border-[#29406e]"}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            {preview ? (
              <img src={preview} alt="Preview" className="max-h-52 rounded-md border border-[#29406e] object-contain" />
            ) : (
              <div className="flex h-32 items-center justify-center text-xs text-zinc-500">
                Drag &amp; drop or pick a screenshot
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="max-w-[220px] truncate text-[10px] text-zinc-400">{file.name}</span>
            <button onClick={(e) => { e.stopPropagation(); pick(); }} className="text-[10px] font-bold text-[#00E0FF] underline">
              Change image
            </button>
            <div className="ml-auto flex gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }}
                className="rounded-md border border-zinc-600 px-3 py-1.5 text-[10px] font-black text-zinc-400 hover:border-zinc-400"
              >
                Cancel
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); if (file) uploadMutation.mutate(file); }}
                disabled={uploadMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-emerald-400 to-emerald-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#04121c] disabled:opacity-60"
              >
                {uploadMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Submit for Verification
              </button>
            </div>
          </div>
          {uploadMutation.isError && (
            <p className="mt-2 text-[11px] font-bold text-red-400">
              {(uploadMutation.error as Error | null)?.message ?? "Upload failed. Please try again."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}