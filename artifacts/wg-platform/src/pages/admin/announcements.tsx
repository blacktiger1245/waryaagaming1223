import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Trash2, ToggleLeft, ToggleRight, ExternalLink } from "lucide-react";

interface Announcement {
  id: number;
  message: string;
  type: "info" | "warning" | "success" | "danger";
  link: string | null;
  linkText: string | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  info:    "bg-blue-500/10 text-blue-400 border-blue-500/30",
  warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  success: "bg-green-500/10 text-green-400 border-green-500/30",
  danger:  "bg-red-500/10 text-red-400 border-red-500/30",
};

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(path, { credentials: "include", ...opts });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

const EMPTY_FORM = { message: "", type: "info" as const, link: "", linkText: "", isActive: true, expiresAt: "" };

export default function AdminAnnouncementsPage() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["admin-announcements"],
    queryFn: () => apiFetch("/api/admin/announcements"),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function field(k: keyof typeof form, v: string | boolean) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.message.trim()) { setError("Message is required."); return; }
    setSaving(true); setError("");
    try {
      await apiFetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: form.message.trim(),
          type: form.type,
          link: form.link.trim() || undefined,
          linkText: form.linkText.trim() || undefined,
          isActive: form.isActive,
          expiresAt: form.expiresAt || undefined,
        }),
      });
      await qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item: Announcement) {
    await apiFetch(`/api/admin/announcements/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    qc.invalidateQueries({ queryKey: ["admin-announcements"] });
  }

  async function remove(id: number) {
    if (!confirm("Delete this announcement?")) return;
    await apiFetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["admin-announcements"] });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Announcements</h1>
          <p className="text-sm text-muted-foreground mt-1">Active announcements appear as a banner at the top of the home page.</p>
        </div>
        <button
          onClick={() => { setShowForm((s) => !s); setError(""); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Announcement
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={submit} className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p className="font-black text-sm uppercase tracking-wider">New Announcement</p>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Message *</label>
            <textarea
              rows={2}
              className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. Season 3 registration is now open!"
              value={form.message}
              onChange={(e) => field("message", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Type</label>
              <select
                className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                value={form.type}
                onChange={(e) => field("type", e.target.value)}
              >
                <option value="info">Info (blue)</option>
                <option value="success">Success (green)</option>
                <option value="warning">Warning (yellow)</option>
                <option value="danger">Danger (red)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Expires at (optional)</label>
              <input
                type="datetime-local"
                className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                value={form.expiresAt}
                onChange={(e) => field("expiresAt", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Link URL (optional)</label>
              <input
                type="url"
                className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="https://..."
                value={form.link}
                onChange={(e) => field("link", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Link text (optional)</label>
              <input
                type="text"
                className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Learn more"
                value={form.linkText}
                onChange={(e) => field("linkText", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={(e) => field("isActive", e.target.checked)}
              className="rounded"
            />
            <label htmlFor="isActive" className="text-sm font-bold">Active (visible to users immediately)</label>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-border text-sm font-bold hover:bg-muted transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <Megaphone className="w-10 h-10 text-muted-foreground opacity-30" />
          <p className="font-bold text-muted-foreground">No announcements yet</p>
          <p className="text-sm text-muted-foreground">Create one and it will appear at the top of the home page.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className={`rounded-xl border bg-card p-4 flex gap-4 items-start ${!item.isActive ? "opacity-50" : ""}`}>
              <span className={`mt-0.5 text-xs font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${TYPE_COLORS[item.type]}`}>
                {item.type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold leading-snug">{item.message}</p>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary">
                      <ExternalLink className="w-3 h-3" />
                      {item.linkText ?? item.link}
                    </a>
                  )}
                  {item.expiresAt && <span>Expires {new Date(item.expiresAt).toLocaleString()}</span>}
                  <span>Created {new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => toggle(item)} title={item.isActive ? "Deactivate" : "Activate"} className="text-muted-foreground hover:text-primary transition-colors">
                  {item.isActive ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => remove(item.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
