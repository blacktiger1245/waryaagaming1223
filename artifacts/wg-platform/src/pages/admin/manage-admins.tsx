import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { Loader2, Crown, Shield, ShieldOff, UserPlus, Star } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { supportAdmin } from "@/lib/support";

interface PlayerRow { id: number; username: string; displayName: string | null; avatarUrl: string | null; role: string; }

async function fetchUsers(): Promise<PlayerRow[]> {
  const res = await fetch("/api/admin/users", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load users");
  return res.json() as Promise<PlayerRow[]>;
}

function fmtAgo(iso?: string | null) {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : "long ago";
}

function Stars({ n }: { n: number }) {
  return <span className="inline-flex gap-0.5">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-3 w-3 ${i < n ? "fill-yellow-400 text-yellow-400" : "text-zinc-600"}`} />)}</span>;
}

export default function ManageAdminsPage() {
  const { isOwner, isLoading: authLoading } = useAdminAuth();
  const qc = useQueryClient();

  const { data: adminsData, isLoading } = useQuery({ queryKey: ["support-admins"], queryFn: supportAdmin.admins, enabled: isOwner });
  const { data: players = [] } = useQuery({ queryKey: ["admin-users"], queryFn: fetchUsers, enabled: isOwner });

  const [grantId, setGrantId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  async function run(fn: () => Promise<unknown>, id: number) {
    setError(""); setBusyId(id);
    try { await fn(); qc.invalidateQueries({ queryKey: ["support-admins"] }); }
    catch (e: any) { setError(e.message); }
    finally { setBusyId(null); }
  }

  async function grantAdmin() {
    if (!grantId) return;
    setError(""); setBusyId(grantId);
    try {
      await supportAdmin.setRole(grantId, "admin");
      qc.invalidateQueries({ queryKey: ["support-admins"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setGrantId(null);
    } catch (e: any) { setError(e.message); }
    finally { setBusyId(null); }
  }

  if (authLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!isOwner) return <Redirect to="/admin" />;

  const admins = adminsData?.admins ?? [];
  const candidates = players.filter((p) => p.role !== "admin" && p.role !== "owner");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-black uppercase tracking-tight"><UserPlus className="h-6 w-6 text-primary" /> Manage Admins</h1>
        <p className="text-sm text-muted-foreground">Owner-only. Grant/revoke admin roles, promote owners and view each admin's support statistics.</p>
      </div>

      {error && <p className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 font-black uppercase tracking-wide"><Shield className="h-4 w-4 text-primary" /> Add Admin</h2>
        <div className="flex gap-2">
          <select value={grantId ?? ""} onChange={(e) => setGrantId(Number(e.target.value))} className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="">Select a player…</option>
            {candidates.map((p) => <option key={p.id} value={p.id}>{p.displayName ?? p.username}</option>)}
          </select>
          <button onClick={grantAdmin} disabled={!grantId || busyId !== null} className="rounded-lg bg-primary px-4 py-2 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busyId === grantId ? "…" : "Grant Admin"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : admins.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No admins yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {admins.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-4 border-b border-border p-4 last:border-b-0">
              {a.avatarUrl ? <img src={a.avatarUrl} alt="" className="h-11 w-11 rounded-full" /> : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/20 text-lg font-black text-primary">{(a.displayName ?? a.username)[0]?.toUpperCase()}</div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-black">{a.displayName ?? a.username}</p>
                  {a.role === "owner" ? <span className="inline-flex items-center gap-1 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-2 py-0.5 text-[10px] font-bold uppercase text-yellow-400"><Crown className="h-2.5 w-2.5" /> Owner</span> : <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary"><Shield className="h-2.5 w-2.5" /> Admin</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  🟢 online · last seen {fmtAgo(a.lastActiveAt)} · {a.ticketsHandled} handled · {a.ticketsClosed} closed
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-bold text-yellow-400">{(a.avgRating ?? 0) > 0 ? a.avgRating : "—"}</span>
                  <Stars n={Math.round(a.avgRating ?? 0)} />
                  <span>{a.ratingCount} ratings</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {a.role === "owner" ? (
                  <button onClick={() => { if (confirm(`Demote ${a.displayName ?? a.username} to Admin?`)) run(() => supportAdmin.demoteOwner(a.id), a.id); }} disabled={busyId === a.id} className="rounded-lg border border-yellow-400/40 px-3 py-1.5 text-xs font-bold text-yellow-400 hover:bg-yellow-400/10 disabled:opacity-50">Demote to Admin</button>
                ) : (
                  <>
                    <button onClick={() => { if (confirm(`Promote ${a.displayName ?? a.username} to Owner?`)) run(() => supportAdmin.promoteOwner(a.id), a.id); }} disabled={busyId === a.id} className="flex items-center gap-1 rounded-lg border border-yellow-400/40 px-3 py-1.5 text-xs font-bold text-yellow-400 hover:bg-yellow-400/10 disabled:opacity-50"><Crown className="h-3 w-3" /> Make Owner</button>
                    <button onClick={() => { if (confirm(`Remove ${a.displayName ?? a.username} as admin?`)) run(() => supportAdmin.setRole(a.id, "player"), a.id); }} disabled={busyId === a.id} className="flex items-center gap-1 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-400/10 disabled:opacity-50"><ShieldOff className="h-3 w-3" /> Remove</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}