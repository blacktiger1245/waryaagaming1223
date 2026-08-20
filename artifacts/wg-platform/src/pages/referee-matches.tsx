import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, Link } from "wouter";
import { Loader2, Swords, Save } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { RefereeLayout } from "@/components/referee-layout";
import { apiUrl } from "@/lib/api";

interface RefMatch {
  id: number;
  tournamentId: number;
  tournamentName: string | null;
  round: number;
  roundName?: string | null;
  status: string;
  scheduledAt?: string | null;
  participant1Id?: number | null;
  participant1Name?: string | null;
  participant1Score?: number | null;
  participant2Id?: number | null;
  participant2Name?: string | null;
  participant2Score?: number | null;
  winnerId?: number | null;
  winnerName?: string | null;
}

interface MatchEdit {
  p1: string;
  p2: string;
  winner: "" | "p1" | "p2" | "draw";
}

const statusBadge: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground border-border",
  live: "bg-red-500/10 text-red-400 border-red-500/30",
  completed: "bg-primary/10 text-primary border-primary/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } | T;
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}

const EMPTY_EDIT: MatchEdit = { p1: "", p2: "", winner: "" };

function MatchResultEditor({ match }: { match: RefMatch }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<MatchEdit>({
    p1: match.participant1Score != null ? String(match.participant1Score) : "",
    p2: match.participant2Score != null ? String(match.participant2Score) : "",
    winner:
      match.winnerId != null && match.participant1Id != null && match.winnerId === match.participant1Id
        ? "p1"
        : match.winnerId != null && match.participant2Id != null && match.winnerId === match.participant2Id
          ? "p2"
          : match.winnerId == null && match.status === "completed"
            ? "draw"
            : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const p1v = edit.p1 !== "" ? Number(edit.p1) : null;
      const p2v = edit.p2 !== "" ? Number(edit.p2) : null;
      if (
        (edit.p1 !== "" && Number.isNaN(p1v)) ||
        (edit.p2 !== "" && Number.isNaN(Number(edit.p2)))
      ) {
        throw new Error("Scores must be numbers");
      }
      const body: Record<string, unknown> = {};
      if (p1v != null) body.participant1Score = p1v;
      if (p2v != null) body.participant2Score = p2v;

      // Auto-resolve the winner from the scores and complete the match when
      // both scores are present (whole, non-negative — enforced client + server).
      let winner = edit.winner;
      if (p1v != null && p2v != null) {
        if (winner === "") winner = p1v > p2v ? "p1" : p2v > p1v ? "p2" : "draw";
        body.status = "completed";
      }
      if (winner === "p1") body.winnerId = match.participant1Id;
      else if (winner === "p2") body.winnerId = match.participant2Id;
      else if (winner === "draw") body.winnerId = null;

      await apiFetch(`/api/matches/${match.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await qc.invalidateQueries({ queryKey: ["referee-matches"] });
      setSuccess("Result updated successfully.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save result");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-14 rounded-lg border border-border bg-background px-2 py-1 text-center text-sm font-bold text-foreground outline-none focus:border-primary";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        <input
          type="number"
          min="0"
          step="1"
          value={edit.p1}
          onChange={(e) => setEdit((p) => ({ ...p, p1: e.target.value }))}
          placeholder="-"
          aria-label={`${match.participant1Name ?? "Player 1"} score`}
          className={inputCls}
        />
        <input
          type="number"
          min="0"
          step="1"
          value={edit.p2}
          onChange={(e) => setEdit((p) => ({ ...p, p2: e.target.value }))}
          placeholder="-"
          aria-label={`${match.participant2Name ?? "Player 2"} score`}
          className={inputCls}
        />
      </div>
      <select
        value={edit.winner}
        onChange={(e) => setEdit((p) => ({ ...p, winner: e.target.value as MatchEdit["winner"] }))}
        className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs font-bold text-foreground outline-none focus:border-primary"
        aria-label="Winner"
      >
        <option value="">Winner…</option>
        <option value="p1">{match.participant1Name ?? "Player 1"}</option>
        <option value="p2">{match.participant2Name ?? "Player 2"}</option>
        <option value="draw">Draw</option>
      </select>
      {error && <p className="text-xs font-bold text-red-400">{error}</p>}
      {success && <p className="text-xs font-bold text-green-400">{success}</p>}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save Result"}
      </button>
    </div>
  );
}

export default function RefereeMatches() {
  const { user, isLoggedIn, isLoading } = useAuth();
  const { data: matches = [], isLoading: matchesLoading } = useQuery<RefMatch[]>({
    queryKey: ["referee-matches"],
    queryFn: () => apiFetch<RefMatch[]>("/api/referee/matches"),
    enabled: isLoggedIn && (user?.role as string | undefined) === "referee",
  });

  const groups = useMemo(() => {
    const map = new Map<number, { name: string; matches: RefMatch[] }>();
    for (const m of matches) {
      const existing = map.get(m.tournamentId);
      const g = existing ?? { name: m.tournamentName ?? `Tournament #${m.tournamentId}`, matches: [] };
      g.matches.push(m);
      map.set(m.tournamentId, g);
    }
    return [...map.values()];
  }, [matches]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isLoggedIn || (user.role as string) !== "referee") {
    return <Redirect to="/referees" />;
  }

  return (
    <RefereeLayout>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex items-center gap-2 text-primary">
          <Swords className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-widest">Referee Panel</span>
        </div>
        <h1 className="text-3xl font-black uppercase tracking-tight mb-2">My Assigned Matches</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          These are the matches assigned to you as a referee. You can enter the scores and save the result. Other match settings are managed by admins only.
        </p>

        {matchesLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <Swords className="mx-auto mb-4 h-10 w-10 text-muted-foreground opacity-30" />
            <p className="font-bold text-muted-foreground">No matches available</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Matches will appear here once tournaments have fixtures.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <div key={group.name} className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border bg-sidebar/40 px-5 py-3">
                  <span className="text-sm font-black uppercase tracking-wide text-foreground">{group.name}</span>
                  <span className="text-xs text-muted-foreground">{group.matches.length} matches</span>
                </div>
                <div className="divide-y divide-border">
                  {group.matches.map((m) => (
                    <div key={m.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto_240px] md:items-center">
                      <div>
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground">#{m.id}</span>
                          {m.roundName && <span className="text-xs font-bold text-primary">{m.roundName}</span>}
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusBadge[m.status] ?? "bg-muted text-muted-foreground border-border"}`}>
                            {m.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm font-black">
                          <span className="truncate">{m.participant1Name ?? m.participant1Id ?? "TBD"}</span>
                          <span className="text-muted-foreground font-bold">vs</span>
                          <span className="truncate">{m.participant2Name ?? m.participant2Id ?? "TBD"}</span>
                        </div>
                        {m.participant1Score != null && m.participant2Score != null && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Score: {m.participant1Score} – {m.participant2Score}
                            {m.winnerName ? ` · Winner: ${m.winnerName}` : ""}
                          </div>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="text-muted-foreground">
                            Result:{" "}
                            <span className="font-bold text-foreground">
                              {m.participant1Score != null && m.participant2Score != null
                                ? `${m.participant1Score} : ${m.participant2Score}`
                                : "—"}
                            </span>
                          </span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${m.status === "completed" ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"}`}>
                            {m.status === "completed" ? "Result Set" : "Result Pending"}
                          </span>
                          {m.scheduledAt && (
                            <span className="text-muted-foreground">{new Date(m.scheduledAt).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Link href={`/tournaments/${m.tournamentId}`} className="hover:text-primary">
                          View
                        </Link>
                      </div>
                      <MatchResultEditor match={m} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </RefereeLayout>
  );
}