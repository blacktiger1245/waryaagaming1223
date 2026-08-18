import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Eye, Pencil, Trash2, RefreshCw, LoaderCircle, ExternalLink, Image as ImageIcon } from "lucide-react";
import { storageUrl } from "@/lib/api";

interface RegLog {
  id: number;
  userId: number;
  deviceName: string;
  serialNumber: string;
  screenshotPath: string;
  status: string;
  submittedAt: string;
  username: string | null;
  displayName: string | null;
  userName: string;
  teamName: string | null;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(path, { credentials: "include", ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  approved: "bg-green-500/10 text-green-400 border-green-500/30",
  rejected: "bg-red-500/10 text-red-400 border-red-500/30",
};

const STATUS_OPTIONS = ["pending", "approved", "rejected"];

export default function AdminRegistrationLogsPage() {
  const qc = useQueryClient();
  const { data: items = [], isLoading, isFetching, refetch } = useQuery<RegLog[]>({
    queryKey: ["admin-registration-logs"],
    queryFn: () => apiFetch("/api/admin/registration-logs"),
  });

  const [viewLog, setViewLog] = useState<RegLog | null>(null);
  const [editLog, setEditLog] = useState<RegLog | null>(null);
  const [form, setForm] = useState({ status: "pending", serialNumber: "", deviceName: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function openEdit(log: RegLog) {
    setError("");
    setEditLog(log);
    setForm({ status: log.status, serialNumber: log.serialNumber, deviceName: log.deviceName });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editLog) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/admin/registration-logs/${editLog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: form.status,
          serialNumber: form.serialNumber.trim(),
          deviceName: form.deviceName.trim(),
        }),
      });
      setEditLog(null);
      await qc.invalidateQueries({ queryKey: ["admin-registration-logs"] });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(logId: number) {
    if (!confirm("Delete this registration log? This cannot be undone.")) return;
    setDeletingId(logId);
    try {
      await apiFetch(`/api/admin/registration-logs/${logId}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["admin-registration-logs"] });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2.5">
            <ClipboardList className="w-6 h-6 text-primary" /> Registration Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-collected every time a user submits "Add Your Details".
          </p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <span className="text-xs font-bold text-muted-foreground">
              {items.length} log{items.length === 1 ? "" : "s"}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold uppercase tracking-wide hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground text-sm">
          <LoaderCircle className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <ClipboardList className="w-10 h-10 text-muted-foreground opacity-30" />
          <p className="font-bold text-muted-foreground">No registration logs yet</p>
          <p className="text-sm text-muted-foreground">
            They appear here automatically when a team member submits their device details.
          </p>
        </div>
      ) : (
<div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Device Name</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Serial</th>
                <th className="px-4 py-3">Screenshot</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((log) => {
                const shotUrl = storageUrl(log.screenshotPath);
                return (
                  <tr key={log.id} className="hover:bg-muted/40 transition-colors align-middle">
                    <td className="px-4 py-3">
                      <div className="font-bold">{log.userName}</div>
                      <div className="text-xs text-muted-foreground">ID: {log.userId}</div>
                    </td>
                    <td className="px-4 py-3">{log.deviceName || "—"}</td>
                    <td className="px-4 py-3">{log.teamName || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{log.serialNumber}</td>
                    <td className="px-4 py-3">
                      {shotUrl ? (
                        <a href={shotUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                          <img src={shotUrl} alt="screenshot" className="h-10 w-10 rounded-md object-cover border border-border" />
                        </a>
                      ) : (
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(log.submittedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${STATUS_COLORS[log.status] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setViewLog(log)} title="View" className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(log)} title="Edit" className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => remove(log.id)} disabled={deletingId === log.id} title="Delete" className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
{error && <p className="text-sm text-red-400">{error}</p>}

      {viewLog && <ViewModal log={viewLog} onClose={() => setViewLog(null)} />}

      {editLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setEditLog(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black uppercase tracking-tight">Edit Log</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {editLog.userName} · {editLog.teamName ?? "No team"}
            </p>
            <form onSubmit={saveEdit} className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Serial Number</span>
                <input value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Device Name</span>
                <input value={form.deviceName} onChange={(e) => setForm((f) => ({ ...f, deviceName: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </label>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditLog(null)} className="px-4 py-2 rounded-lg border border-border text-sm font-bold hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ViewModal({ log, onClose }: { log: RegLog; onClose: () => void }) {
  const shotUrl = storageUrl(log.screenshotPath);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight">{log.userName}</h2>
            <p className="text-xs text-muted-foreground">User ID: {log.userId}</p>
          </div>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${STATUS_COLORS[log.status] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"}`}>
            {log.status}
          </span>
        </div>

        {shotUrl && (
          <a href={shotUrl} target="_blank" rel="noopener noreferrer" className="mt-4 block">
            <img src={shotUrl} alt="Serial number screenshot" className="w-full max-h-72 rounded-xl border border-border object-cover" />
          </a>
        )}

        <dl className="mt-5 space-y-3 text-sm">
          <Row label="Device Name" value={log.deviceName} />
          <Row label="Team" value={log.teamName ?? "—"} />
          <Row label="Serial Number" value={log.serialNumber} mono />
          <Row label="Submitted" value={new Date(log.submittedAt).toLocaleString()} />
        </dl>

        <div className="mt-6 flex items-center justify-between gap-2">
          <a
            href={`/players/${log.userId}`}
            className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-primary hover:underline"
          >
            View player <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-bold text-right ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}