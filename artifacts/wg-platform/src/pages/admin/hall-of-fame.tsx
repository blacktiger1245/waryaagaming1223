import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Trophy } from "lucide-react";
import { storageUrl } from "@/lib/api";

interface HofPlayer {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  games: number;
  trophies: number;
  goals: number;
  motmAwards: number;
  hof: { hofId: number; seasonId: number | null; seasonName: string | null } | null;
}

interface Season { id: number; name: string; isCurrent: boolean; }

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export default function AdminHallOfFamePage() {
  const qc = useQueryClient();
  const { data: players = [], isLoading } = useQuery<HofPlayer[]>({
    queryKey: ["admin-hof-players"],
    queryFn: () => apiFetch<HofPlayer[]>("/api/admin/hall-of-fame/players"),
  });
  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: ["seasons"],
    queryFn: () => apiFetch<Season[]>("/api/seasons"),
  });

  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<HofPlayer | null>(null);
  const [seasonId, setSeasonId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");

  async function activate(p: HofPlayer) {
    if (seasonId === "") { setErr("Please select a season"); return; }
    setBusy(true); setErr("");
    try {
      await apiFetch("/api/admin/hall-of-fame/toggle", {
        method: "POST",
        body: JSON.stringify({ playerId: p.id, on: true, seasonId: Number(seasonId) }),
      });
      await qc.invalidateQueries({ queryKey: ["admin-hof-players"] });
      setFlash(`${p.displayName ?? p.username} added to the Hall of Fame.`);
      window.setTimeout(() => setFlash(""), 4000);
      setPending(null); setSeasonId("");
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to update"); }
    finally { setBusy(false); }
  }

  async function deactivate(p: HofPlayer) {
    if (!window.confirm(`Remove ${p.displayName ?? p.username} from the Hall of Fame?`)) return;
    setErr("");
    try {
      await apiFetch("/api/admin/hall-of-fame/toggle", {
        method: "POST", body: JSON.stringify({ playerId: p.id, on: false }),
      });
      await qc.invalidateQueries({ queryKey: ["admin-hof-players"] });
      setFlash(`${p.displayName ?? p.username} removed from the Hall of Fame.`);
      window.setTimeout(() => setFlash(""), 4000);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to update"); }
  }

  const filtered = players.filter((p) =>
    (p.displayName ?? p.username).toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black uppercase tracking-tight"><Trophy className="h-6 w-6 text-primary" /> Hall of Fame</h1>
          <p className="mt-1 text-sm text-muted-foreground">Toggle players into the Hall of Fame. Active players appear on the homepage with their real stats and the selected season.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players…" className="w-56 rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
      </div>
      {flash && <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm font-bold text-green-400">{flash}</div>}
      {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400">{err}</div>}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border bg-sidebar/40 text-left text-xs font-black uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Player</th><th className="px-3 py-3">Games</th><th className="px-3 py-3">Trophies</th><th className="px-3 py-3">Goals</th><th className="px-3 py-3">MOTM</th><th className="px-3 py-3">Season</th><th className="px-4 py-3 text-right">Toggle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => {
                  const on = !!p.hof;
                  return (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {p.avatarUrl ? (
                            <img src={storageUrl(p.avatarUrl)} alt="" className="h-10 w-10 rounded-full object-cover border border-primary/30" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-black text-primary">{(p.displayName ?? p.username).charAt(0).toUpperCase()}</div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-bold">{p.displayName ?? p.username}</p>
                            <p className="truncate text-xs text-muted-foreground">@{p.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-black tabular-nums">{p.games}</td>
                      <td className="px-3 py-3 font-black tabular-nums">{p.trophies}</td>
                      <td className="px-3 py-3 font-black tabular-nums">{p.goals}</td>
                      <td className="px-3 py-3 font-black tabular-nums">{p.motmAwards}</td>
                      <td className="px-3 py-3">
                        {on ? <span className="text-xs font-bold text-yellow-400">{p.hof?.seasonName ?? "Live"}</span> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => (on ? deactivate(p) : setPending(p))}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-all ${
                            on
                              ? "border-green-500/50 bg-green-500/15 text-green-400 hover:bg-green-500/25"
                              : "border-red-500/50 bg-red-500/15 text-red-400 hover:bg-red-500/25"
                          }`}
                        >
                          <span className={`h-2.5 w-2.5 rounded-full ${on ? "bg-green-400 shadow-[0_0_8px_#22c55e]" : "bg-red-500 shadow-[0_0_8px_#ef4444]"}`} />
                          {on ? "ON" : "OFF"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">{players.length === 0 ? "No players registered yet." : `No players match “${search}”.`}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Season selection modal — shown when turning a player ON */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPending(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-xl font-black uppercase tracking-wide">Add Player to Hall of Fame</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Select the Hall of Fame season for <span className="font-bold text-foreground">{pending.displayName ?? pending.username}</span>.
            </p>
            <label className="mb-2 block text-xs font-black uppercase tracking-wider text-muted-foreground">Select Season</label>
            {seasons.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">No seasons exist yet. Create one in <span className="font-bold">Admin Panel → Seasons</span>.</p>
            ) : (
              <select
                value={seasonId}
                onChange={(e) => setSeasonId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-bold text-foreground outline-none focus:border-primary"
              >
                <option value="">Select existing season</option>
                {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setPending(null)} disabled={busy} className="rounded-lg border border-border px-4 py-2 text-sm font-bold hover:bg-muted disabled:opacity-50 transition-colors">Cancel</button>
              <button type="button" disabled={busy || seasonId === ""} onClick={() => activate(pending)} className="rounded-lg bg-primary px-5 py-2 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">{busy ? "Saving…" : "Finish"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}