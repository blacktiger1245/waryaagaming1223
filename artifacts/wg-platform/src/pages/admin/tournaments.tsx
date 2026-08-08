import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminEntityManager } from "@/components/admin/admin-entity-manager";
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
import { Loader2, Plus, Upload, X, Trophy, Calendar, DollarSign, User, Users, Shield, CalendarRange, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { apiUrl, storageUrl } from "@/lib/api";

interface Season {
  id: number;
  name: string;
  isCurrent: boolean;
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface TournamentRow {
  id: number;
  name: string;
  status: string;
  prizePool: string;
  startDate: string;
  hostedBy?: string;
  logoUrl?: string;
  currentParticipants: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(url), {
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

async function uploadLogo(file: File): Promise<string> {
  // Upload through the API instead of PUTing directly to R2. This avoids
  // requiring a separate R2 CORS rule for every hosted frontend origin.
  const res = await fetch(apiUrl("/api/storage/uploads/direct"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to upload tournament logo");
  }
  const { objectPath } = (await res.json()) as { objectPath: string };
  return objectPath;
}

// ── Logo Drop Zone ─────────────────────────────────────────────────────────────
function LogoDropZone({
  file,
  preview,
  onFile,
  onClear,
}: {
  file: File | null;
  preview: string | null;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped && dropped.type.startsWith("image/")) onFile(dropped);
    },
    [onFile]
  );

  if (preview && file) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-border h-40">
        <img src={preview} alt="Logo preview" className="w-full h-full object-contain bg-black/30" />
        <button
          type="button"
          onClick={onClear}
          className="absolute top-2 right-2 bg-black/60 rounded-full p-1 hover:bg-black/80 transition-colors"
        >
          <X className="w-4 h-4 text-white" />
        </button>
        <div className="absolute bottom-2 left-2 bg-black/60 rounded px-2 py-0.5 text-xs text-white/80 truncate max-w-[80%]">
          {file.name}
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        flex flex-col items-center justify-center gap-3 h-40 rounded-xl border-2 border-dashed cursor-pointer transition-colors
        ${dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-primary/5"}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
        <Upload className="w-5 h-5 text-primary" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">Drop your logo here</p>
        <p className="text-xs text-muted-foreground mt-0.5">or click to browse · PNG, JPG, SVG</p>
      </div>
    </div>
  );
}

// ── Create Dialog ─────────────────────────────────────────────────────────────
function CreateTournamentDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"upcoming" | "active">("upcoming");
  const [startDate, setStartDate] = useState("");
  const [prizePool, setPrizePool] = useState("");
  const [hostedBy, setHostedBy] = useState("");
  const [tournamentType, setTournamentType] = useState<"solo" | "team">("solo");
  const [seasonId, setSeasonId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: ["admin", "seasons"],
    queryFn: () => apiFetch("/api/admin/seasons"),
    enabled: open,
  });

  function reset() {
    setLogoFile(null);
    setLogoPreview(null);
    setName("");
    setStatus("upcoming");
    setStartDate("");
    setPrizePool("");
    setHostedBy("");
    setTournamentType("solo");
    setSeasonId("");
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleLogoFile(f: File) {
    setLogoFile(f);
    const url = URL.createObjectURL(f);
    setLogoPreview(url);
  }

  function clearLogo() {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (status === "upcoming" && !startDate) { toast({ title: "Start date is required for upcoming tournaments", variant: "destructive" }); return; }

    setSaving(true);
    try {
      let logoUrl: string | undefined;
      if (logoFile) {
        logoUrl = await uploadLogo(logoFile);
      }

      await apiFetch("/api/admin/tournaments", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          status,
          startDate: startDate || new Date().toISOString().split("T")[0],
          prizePool: prizePool.trim() || "$0",
          hostedBy: hostedBy.trim() || undefined,
          logoUrl,
          tournamentType,
          seasonId: seasonId !== "" ? seasonId : undefined,
        }),
      });

      toast({ title: "Tournament created!" });
      onCreated();
      handleClose();
    } catch (err) {
      toast({ title: "Failed to create", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            Create Tournament
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Logo */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tournament Logo
            </label>
            <LogoDropZone
              file={logoFile}
              preview={logoPreview}
              onFile={handleLogoFile}
              onClear={clearLogo}
            />
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              Tournament Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Waryaa Cup Season 3"
              required
            />
          </div>

          {/* Tournament Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tournament Type <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["solo", "team"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTournamentType(t)}
                  className={`
                    py-3 rounded-lg text-sm font-bold transition-all border flex flex-col items-center gap-1.5
                    ${tournamentType === t
                      ? t === "team"
                        ? "bg-teal-500/20 border-teal-500 text-teal-400"
                        : "bg-primary/20 border-primary text-primary"
                      : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"}
                  `}
                >
                  {t === "team"
                    ? <Shield className="w-5 h-5" />
                    : <User className="w-5 h-5" />}
                  {t === "team" ? "Team Tournament" : "Solo Tournament"}
                </button>
              ))}
            </div>
            {tournamentType === "team" && (
              <p className="text-xs text-teal-400 bg-teal-400/10 border border-teal-400/20 rounded-lg px-3 py-2 flex items-start gap-2">
                <Users className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                All registered teams will be automatically enrolled as participants when the tournament is created.
              </p>
            )}
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["upcoming", "active"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`
                    py-2.5 rounded-lg text-sm font-bold capitalize transition-all border
                    ${status === s
                      ? s === "active"
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                        : "bg-primary/20 border-primary text-primary"
                      : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"}
                  `}
                >
                  {s === "active" ? "🟢 Active" : "🕐 Upcoming"}
                </button>
              ))}
            </div>
          </div>

          {/* Start Date — only for upcoming */}
          {status === "upcoming" && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Start Date <span className="text-destructive">*</span>
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
          )}

          {/* Prize Pool */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              Prize Pool
            </label>
            <Input
              value={prizePool}
              onChange={(e) => setPrizePool(e.target.value)}
              placeholder="e.g. $500 or 50,000 SP"
            />
          </div>

          {/* Hoster */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Hosted By
            </label>
            <Input
              value={hostedBy}
              onChange={(e) => setHostedBy(e.target.value)}
              placeholder="e.g. Waryaa Gaming"
            />
          </div>

          {/* Season */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CalendarRange className="w-3.5 h-3.5" />
              Season
            </label>
            {seasons.length === 0 ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-300 leading-snug">
                  No seasons created yet.{" "}
                  <Link href="/admin/seasons" onClick={() => handleClose()} className="font-bold underline hover:text-amber-200">
                    Create a season
                  </Link>{" "}
                  first to enable seasonal rankings.
                </div>
              </div>
            ) : (
              <select
                value={seasonId}
                onChange={(e) => setSeasonId(e.target.value ? Number(e.target.value) : "")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">No season (all-time only)</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.isCurrent ? " (Current)" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="gap-2 min-w-[120px]">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {logoFile ? "Uploading…" : "Creating…"}
                </>
              ) : (
                <>
                  <Trophy className="w-4 h-4" />
                  Create Tournament
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminTournamentsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Custom Create Button + Dialog */}
      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-2 font-bold"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-4 h-4" /> Add Tournament
        </Button>
      </div>

      <CreateTournamentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["admin", "tournaments"] })}
      />

      {/* Existing table via AdminEntityManager (edit/delete still work) */}
      <AdminEntityManager
        endpoint="tournaments"
        title="Tournament"
        hideAddButton
        columns={[
          {
            name: "logoUrl",
            label: "Logo",
            render: (row) =>
              row.logoUrl ? (
                <img
                  src={storageUrl(row.logoUrl as string)}
                  alt=""
                  className="w-9 h-9 rounded-md object-cover bg-black/20"
                />
              ) : (
                <div className="w-9 h-9 rounded-md bg-border flex items-center justify-center">
                  <Trophy className="w-4 h-4 text-muted-foreground" />
                </div>
              ),
          },
          { name: "name", label: "Name" },
          {
            name: "status",
            label: "Status",
            render: (row) => (
              <Badge
                variant={
                  row.status === "active"
                    ? "default"
                    : row.status === "upcoming"
                    ? "secondary"
                    : "outline"
                }
              >
                {String(row.status)}
              </Badge>
            ),
          },
          { name: "prizePool", label: "Prize Pool" },
          { name: "hostedBy", label: "Hosted By" },
          { name: "currentParticipants", label: "Players" },
        ]}
        fields={[
          { name: "name", label: "Name", required: true },
          { name: "description", label: "Description", type: "textarea" },
          { name: "status", label: "Status (upcoming/active/completed)" },
          { name: "startDate", label: "Start Date", required: true },
          { name: "endDate", label: "End Date" },
          { name: "prizePool", label: "Prize Pool" },
          { name: "hostedBy", label: "Hosted By" },
          { name: "logoUrl", label: "Logo URL" },
          { name: "maxParticipants", label: "Max Participants", type: "number" },
          { name: "rules", label: "Rules", type: "textarea" },
          { name: "streamUrl", label: "Stream URL" },
        ]}
      />
    </div>
  );
}
