import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Loader2, Plus, Upload, X, Trophy, Calendar, DollarSign, User,
  CalendarRange, AlertTriangle, Folder, Layers, ArrowRight, ChevronLeft, Swords,
  ListOrdered, GitBranch,
} from "lucide-react";
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

interface Category {
  id: number;
  name: string;
  logoUrl?: string | null;
  createdAt: string;
}

type StageValue = "round-robin" | "round-robin-knockout" | "single-elimination";

const STAGE_OPTIONS: {
  value: StageValue;
  title: string;
  description: string;
  icon: typeof ListOrdered;
}[] = [
  {
    value: "round-robin",
    title: "Round Robin",
    description: "Every participant plays every other participant.",
    icon: ListOrdered,
  },
  {
    value: "round-robin-knockout",
    title: "Round Robin + Knock-out Rounds",
    description: "Participants first play Round Robin, then the qualified participants enter a knockout bracket.",
    icon: GitBranch,
  },
  {
    value: "single-elimination",
    title: "Knock-out Rounds",
    description: "Participants immediately enter an elimination bracket.",
    icon: Swords,
  },
];

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
  const res = await fetch(apiUrl("/api/storage/uploads/direct"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to upload logo");
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
    [onFile],
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
      className={`flex flex-col items-center justify-center gap-3 h-40 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-primary/5"}`}
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

// ── Add Tournament Chooser ─────────────────────────────────────────────────────
function TournamentChooser({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: "single" | "categories") => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            Add Tournament
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <button
            type="button"
            onClick={() => onSelect("single")}
            className="flex items-start gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Single Tournament</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Create one tournament with its own stages (Round Robin, Knock-out, or both).
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onSelect("categories")}
            className="flex items-start gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Tournament with Categories</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Group multiple tournaments under a category (e.g. Under 18).
              </p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Create Category Dialog ────────────────────────────────────────────────────
function CreateCategoryDialog({
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
  const [saving, setSaving] = useState(false);

  function reset() {
    setLogoFile(null);
    setLogoPreview(null);
    setName("");
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleLogoFile(f: File) {
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  }

  function clearLogo() {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Category name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let logoUrl: string | undefined;
      if (logoFile) logoUrl = await uploadLogo(logoFile);
      await apiFetch("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), logoUrl }),
      });
      toast({ title: "Category created!" });
      onCreated();
      handleClose();
    } catch (err) {
      toast({ title: "Failed to create category", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-primary" />
            Create Category
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Category Logo / Image
            </label>
            <LogoDropZone file={logoFile} preview={logoPreview} onFile={handleLogoFile} onClear={clearLogo} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              Category Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Under 18"
              required
            />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="gap-2 min-w-[120px]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Folder className="w-4 h-4" />}
              Create Category
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Create Tournament Dialog (multi-step) ─────────────────────────────────────
function CreateTournamentDialog({
  open,
  onClose,
  onCreated,
  categoryId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  categoryId?: number | null;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [prizePool, setPrizePool] = useState("");
  const [hostedBy, setHostedBy] = useState("");
  const [seasonId, setSeasonId] = useState<number | "">("");
  const [stage, setStage] = useState<StageValue>("round-robin");
  const [qualifyCount, setQualifyCount] = useState(8);
  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: ["admin", "seasons"],
    queryFn: () => apiFetch("/api/admin/seasons"),
    enabled: open,
  });

  function reset() {
    setStep(1);
    setLogoFile(null);
    setLogoPreview(null);
    setName("");
    setStartDate("");
    setPrizePool("");
    setHostedBy("");
    setSeasonId("");
    setStage("round-robin");
    setQualifyCount(8);
    setThirdPlaceMatch(false);
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleLogoFile(f: File) {
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  }

  function clearLogo() {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview(null);
  }

  const isFinalStep = step === 3 || (step === 2 && stage !== "round-robin-knockout");

  function goNext() {
    if (step === 1) {
      // Stage selection first — default is "round-robin", no validation needed.
      setStep(2);
    } else if (step === 2) {
      if (!name.trim()) {
        toast({ title: "Tournament name is required", variant: "destructive" });
        return;
      }
      if (stage === "round-robin-knockout") setStep(3);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Tournament name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let logoUrl: string | undefined;
      if (logoFile) logoUrl = await uploadLogo(logoFile);

      await apiFetch("/api/admin/tournaments", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          status: "upcoming",
          startDate: startDate || new Date().toISOString().split("T")[0],
          prizePool: prizePool.trim() || "$0",
          hostedBy: hostedBy.trim() || undefined,
          logoUrl,
          seasonId: seasonId !== "" ? seasonId : undefined,
          categoryId: categoryId ?? undefined,
          format: stage,
          qualifyCount: stage === "round-robin-knockout" ? qualifyCount : undefined,
          thirdPlaceMatch: stage === "round-robin-knockout" ? thirdPlaceMatch : undefined,
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
            {categoryId ? "Add Tournament" : "Create Tournament"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {step === 2 && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Tournament Logo
                </label>
                <LogoDropZone file={logoFile} preview={logoPreview} onFile={handleLogoFile} onClear={clearLogo} />
              </div>
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
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Start Date
                </label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" />
                  Prize Pool
                </label>
                <Input value={prizePool} onChange={(e) => setPrizePool(e.target.value)} placeholder="e.g. $500 or 50,000 SP" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Hosted By
                </label>
                <Input value={hostedBy} onChange={(e) => setHostedBy(e.target.value)} placeholder="e.g. Waryaa Gaming" />
              </div>
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
            </>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-foreground">Tournament Stages</p>
              {STAGE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = stage === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStage(option.value)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                      active ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-primary/5"
                    }`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">{option.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
                    </div>
                    <span className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${active ? "border-primary bg-primary" : "border-muted-foreground/40"}`} />
                  </button>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Qualified Participants
                </label>
                <select
                  value={qualifyCount}
                  onChange={(e) => setQualifyCount(Number(e.target.value))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {[2, 4, 8, 16].map((n) => (
                    <option key={n} value={n}>Top {n}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  After the Round Robin stage, the top ranked participants advance to the knockout bracket.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Third-place Match
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([false, true] as const).map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setThirdPlaceMatch(v)}
                      className={`py-2.5 rounded-lg text-sm font-bold capitalize transition-all border ${
                        thirdPlaceMatch === v
                          ? "bg-primary/20 border-primary text-primary"
                          : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                      }`}
                    >
                      {v ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            {step > 1 && (
              <Button type="button" variant="outline" onClick={() => setStep((step - 1) as 1 | 2 | 3)} disabled={saving}>
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            {!isFinalStep ? (
              <Button type="button" onClick={goNext} className="gap-2 min-w-[120px]">
                Continue
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
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
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Category Detail ────────────────────────────────────────────────────────────
function CategoryDetail({
  categoryId,
  onBack,
  onAddTournament,
}: {
  categoryId: number;
  onBack: () => void;
  onAddTournament: () => void;
}) {
  const { data: category, isLoading } = useQuery<Category & { tournaments: TournamentRow[] }>({
    queryKey: ["admin", "category", categoryId],
    queryFn: () => apiFetch(`/api/admin/categories/${categoryId}`),
  });

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="w-4 h-4" />
        All categories
      </button>

      <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
        {category?.logoUrl ? (
          <img src={storageUrl(category.logoUrl)} alt="" className="h-14 w-14 rounded-lg object-cover bg-black/20" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-border">
            <Folder className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1">
          <h2 className="text-lg font-extrabold text-foreground">{category?.name ?? "…"}</h2>
          <p className="text-xs text-muted-foreground">
            {category?.tournaments.length ?? 0} tournament{(category?.tournaments.length ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
        <Button size="sm" className="gap-2 font-bold" onClick={onAddTournament}>
          <Plus className="w-4 h-4" /> Add Tournament
        </Button>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : category && category.tournaments.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {category.tournaments.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-card p-4">
              {t.logoUrl ? (
                <img src={storageUrl(t.logoUrl)} alt="" className="mb-3 h-12 w-12 rounded-md object-cover bg-black/20" />
              ) : (
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-border">
                  <Trophy className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <p className="text-sm font-bold text-foreground">{t.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.prizePool} · {t.status}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No tournaments yet. Click "Add Tournament" to create one inside this category.
        </p>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminTournamentsPage() {
  const qc = useQueryClient();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [singleOpen, setSingleOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [categoryTournamentOpen, setCategoryTournamentOpen] = useState(false);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["admin", "categories"],
    queryFn: () => apiFetch("/api/admin/categories"),
  });

  function handleSelect(mode: "single" | "categories") {
    setChooserOpen(false);
    if (mode === "single") setSingleOpen(true);
    else setCategoryOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-2 font-bold" onClick={() => setChooserOpen(true)}>
          <Plus className="w-4 h-4" /> Add Tournament
        </Button>
      </div>

      <TournamentChooser open={chooserOpen} onClose={() => setChooserOpen(false)} onSelect={handleSelect} />
      <CreateTournamentDialog
        open={singleOpen}
        onClose={() => setSingleOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["admin", "tournaments"] })}
      />
      <CreateCategoryDialog
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["admin", "categories"] })}
      />
      <CreateTournamentDialog
        open={categoryTournamentOpen}
        onClose={() => setCategoryTournamentOpen(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["admin", "tournaments"] });
          qc.invalidateQueries({ queryKey: ["admin", "category", selectedCategoryId] });
        }}
        categoryId={selectedCategoryId}
      />

      {selectedCategoryId !== null ? (
        <CategoryDetail
          categoryId={selectedCategoryId}
          onBack={() => setSelectedCategoryId(null)}
          onAddTournament={() => setCategoryTournamentOpen(true)}
        />
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Categories</h2>
          {categories.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No categories yet. Click "Add Tournament" → "Tournament with Categories" to create one.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(c.id)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
                >
                  {c.logoUrl ? (
                    <img src={storageUrl(c.logoUrl)} alt="" className="h-12 w-12 rounded-lg object-cover bg-black/20" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-border">
                      <Folder className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">Open category</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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






