import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, CalendarRange, Star, Award, Medal, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BallonDorIcon, TopScorerIcon } from "@/components/award-icons";

interface Season {
  id: number;
  name: string;
  isCurrent: boolean;
  createdAt: string;
  topScorerPlayerId?: number | null;
  ballonDorPlayerId?: number | null;
  topScorerPlayer?: { id: number; username: string; displayName?: string | null; avatarUrl?: string | null } | null;
  ballonDorPlayer?: { id: number; username: string; displayName?: string | null; avatarUrl?: string | null } | null;
}

interface PlayerLite {
  id: number;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

function CreateSeasonDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [isCurrent, setIsCurrent] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setIsCurrent(false);
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Season name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/admin/seasons", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), isCurrent }),
      });
      toast({ title: "Season created!" });
      onCreated();
      handleClose();
    } catch (err) {
      toast({ title: "Failed to create season", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="w-5 h-5 text-primary" />
            Create Season
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Season Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2025-2026"
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Use a format like "2025-2026" or "Season 1"</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCurrent((v) => !v)}
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${isCurrent ? "bg-primary" : "bg-muted"}`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isCurrent ? "translate-x-5" : "translate-x-0.5"}`}
              />
            </button>
            <label className="text-sm font-medium cursor-pointer" onClick={() => setIsCurrent((v) => !v)}>
              Mark as current season
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Season
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── AwardsDialog ────────────────────────────────────────────────────────────────
function AwardsDialog({ season, open, onClose, onSaved }: { season: Season; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [topScorerId, setTopScorerId] = useState<number | null>(season.topScorerPlayerId ?? null);
  const [ballonDorId, setBallonDorId] = useState<number | null>(season.ballonDorPlayerId ?? null);
  const [saving, setSaving] = useState(false);

  const { data: players = [], isLoading: playersLoading } = useQuery<PlayerLite[]>({
    queryKey: ["admin", "award-players"],
    queryFn: () => apiFetch("/api/players"),
    enabled: open,
  });

  const filtered = players
    .filter((p) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (p.displayName ?? p.username).toLowerCase().includes(q) || p.username.toLowerCase().includes(q);
    })
    .slice(0, 8);

  function playerName(p?: { id: number; username: string; displayName?: string | null } | null) {
    return p ? p.displayName || p.username : null;
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/seasons/${season.id}`, {
        method: "PATCH",
        body: JSON.stringify({ topScorerPlayerId: topScorerId, ballonDorPlayerId: ballonDorId }),
      });
      toast({ title: "Season awards saved!" });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Failed to save awards", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function PickerRow({ label, icon, selectedId, onSelect }: { label: string; icon: React.ReactNode; selectedId: number | null; onSelect: (id: number | null) => void }) {
    const selected = selectedId != null ? players.find((p) => p.id === selectedId) ?? null : null;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">{icon}{label}</label>
          {selectedId != null && (
            <button type="button" className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1" onClick={() => onSelect(null)}>
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
        <div className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-sm font-bold flex items-center gap-2 min-h-10">
          {selected
            ? <>{selected.avatarUrl && <img src={selected.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />}{playerName(selected)}</>
            : <span className="text-muted-foreground font-normal">No winner selected</span>}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-400" />
            Season Awards — {season.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-3">
            <PickerRow label="Top Scorer" icon={<TopScorerIcon size={14} />} selectedId={topScorerId} onSelect={setTopScorerId} />
            <PickerRow label="Ballon d'Or" icon={<BallonDorIcon size={14} />} selectedId={ballonDorId} onSelect={setBallonDorId} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select a player</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players..." className="pl-9" />
            </div>
            <div className="rounded-lg border border-border divide-y divide-border max-h-56 overflow-y-auto">
              {playersLoading ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No players found</p>
              ) : (
                filtered.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                    {p.avatarUrl
                      ? <img src={p.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-black flex-shrink-0">{(p.displayName ?? p.username).slice(0, 2).toUpperCase()}</div>}
                    <span className="text-sm font-bold truncate flex-1">{p.displayName ?? p.username}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant={topScorerId === p.id ? "default" : "outline"} className="h-6 text-[10px] gap-1 px-2" onClick={() => setTopScorerId(topScorerId === p.id ? null : p.id)}>
                        <TopScorerIcon size={12} /> Top Scorer
                      </Button>
                      <Button size="sm" variant={ballonDorId === p.id ? "default" : "outline"} className="h-6 text-[10px] gap-1 px-2" onClick={() => setBallonDorId(ballonDorId === p.id ? null : p.id)}>
                        <BallonDorIcon size={12} /> Ballon d'Or
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
            Save Awards
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminSeasonsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [awardsSeason, setAwardsSeason] = useState<Season | null>(null);

  const { data: seasons = [], isLoading } = useQuery<Season[]>({
    queryKey: ["admin", "seasons"],
    queryFn: () => apiFetch("/api/admin/seasons"),
  });

  const setCurrentMutation = useMutation({
    mutationFn: ({ id, isCurrent }: { id: number; isCurrent: boolean }) =>
      apiFetch(`/api/admin/seasons/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isCurrent }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "seasons"] });
      toast({ title: "Season updated" });
    },
    onError: (err) => toast({ title: "Failed to update", description: (err as Error).message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/seasons/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "seasons"] });
      toast({ title: "Season deleted" });
    },
    onError: (err) => toast({ title: "Failed to delete", description: (err as Error).message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Seasons</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage competitive seasons. Tournaments are linked to a season for seasonal rankings.
          </p>
        </div>
        <Button size="sm" className="gap-2 font-bold" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" /> Add Season
        </Button>
      </div>

      <CreateSeasonDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["admin", "seasons"] })}
      />

      {awardsSeason && (
        <AwardsDialog
          season={awardsSeason}
          open={!!awardsSeason}
          onClose={() => setAwardsSeason(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "seasons"] })}
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : seasons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border flex flex-col items-center justify-center py-20 gap-3 text-center">
          <CalendarRange className="w-12 h-12 text-muted-foreground/30" />
          <p className="font-black text-lg">No seasons yet</p>
          <p className="text-sm text-muted-foreground">Create your first season to enable seasonal rankings and tournament grouping.</p>
          <Button size="sm" className="gap-2 mt-2" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> Create First Season
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Season</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Awards</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Created</th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <CalendarRange className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="font-bold">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {s.isCurrent ? (
                      <Badge className="gap-1 bg-primary/20 text-primary border-primary/30 hover:bg-primary/30">
                        <Star className="w-3 h-3 fill-primary" /> Current
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Past</Badge>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1">
                      {s.topScorerPlayer ? (
                        <span className="text-xs flex items-center gap-1.5"><TopScorerIcon size={12} className="flex-shrink-0" />{s.topScorerPlayer.displayName || s.topScorerPlayer.username}</span>
                      ) : null}
                      {s.ballonDorPlayer ? (
                        <span className="text-xs flex items-center gap-1.5"><BallonDorIcon size={12} className="flex-shrink-0" />{s.ballonDorPlayer.displayName || s.ballonDorPlayer.username}</span>
                      ) : null}
                      {!s.topScorerPlayer && !s.ballonDorPlayer && (
                        <span className="text-xs text-muted-foreground">No awards yet</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => setAwardsSeason(s)}
                      >
                        <Award className="w-3 h-3" /> Awards
                      </Button>
                      {!s.isCurrent && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => setCurrentMutation.mutate({ id: s.id, isCurrent: true })}
                          disabled={setCurrentMutation.isPending}
                        >
                          <Star className="w-3 h-3" /> Set Current
                        </Button>
                      )}
                      {s.isCurrent && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 text-muted-foreground"
                          onClick={() => setCurrentMutation.mutate({ id: s.id, isCurrent: false })}
                          disabled={setCurrentMutation.isPending}
                        >
                          Unset Current
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Delete season "${s.name}"? This will unlink it from all tournaments.`)) {
                            deleteMutation.mutate(s.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
