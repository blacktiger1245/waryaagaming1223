import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  UploadCloud,
  Trash2,
  Tag,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  Gamepad2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { storageUrl } from "@/lib/api";
import {
  fetchMySellSubmissions,
  submitSellAccount,
  uploadSellImage,
  formatDate,
  formatPrice,
  SHOP_SELL_STATUS_META,
} from "@/lib/shop";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Yes / No pill toggle used for the account link questions. */
function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide transition-colors ${
            value
              ? "border-green-500 bg-green-500/15 text-green-400"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide transition-colors ${
            !value
              ? "border-red-500 bg-red-500/15 text-red-400"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          No
        </button>
      </div>
    </div>
  );
}

/** Drag & drop / click image upload area. */
function ImageDropZone({
  multiple,
  onUploaded,
  label,
  hint,
}: {
  multiple: boolean;
  onUploaded: (paths: string[]) => void;
  label: string;
  hint: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/") && f.size <= MAX_IMAGE_BYTES);
    if (images.length === 0) {
      toast({
        title: "Images only",
        description: "Please use image files up to 10 MB each.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const paths: string[] = [];
      for (const file of multiple ? images : images.slice(0, 1)) {
        paths.push(await uploadSellImage(file));
      }
      onUploaded(paths);
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not upload the image.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !uploading && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !uploading) inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!uploading) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!uploading) handleFiles(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
        dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-card"
      }`}
      data-testid={multiple ? "dropzone-sell-gallery" : "dropzone-sell-profile"}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {uploading ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : (
        <UploadCloud className="h-6 w-6 text-muted-foreground" />
      )}
      <p className="text-sm font-bold">{uploading ? "Uploading…" : label}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Seller's own submissions with live status. */
function MySubmissions() {
  const { data: submissions, isLoading } = useQuery({
    queryKey: ["shop", "sell", "mine"],
    queryFn: fetchMySellSubmissions,
    refetchInterval: 30_000,
  });

  const STATUS_ICONS = { pending: Clock, approved: CheckCircle2, rejected: XCircle };

  return (
    <section className="mt-8">
      <h2 className="text-xl font-black uppercase tracking-wide">My Submissions</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Accounts you submitted from this device. Approved accounts appear in the shop automatically.
      </p>

      {isLoading ? (
        <div className="mt-5 flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your submissions…
        </div>
      ) : !submissions || submissions.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          No submissions yet — fill in the form above to sell your account.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {submissions.map((s) => {
            const status = SHOP_SELL_STATUS_META[s.status];
            const StatusIcon = STATUS_ICONS[s.status];
            return (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
                data-testid={`card-submission-${s.id}`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {s.profileImagePath ? (
                    <img
                      src={storageUrl(s.profileImagePath)}
                      alt=""
                      className="size-12 flex-shrink-0 rounded-lg border border-border object-cover"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate font-bold">
                      eFootball Account #{s.id} · {formatPrice(s.priceCents)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Submitted {formatDate(s.createdAt)}
                      {s.teamStrength !== null ? ` · ${s.teamStrength.toLocaleString()} TS` : ""}
                    </p>
                    {s.status === "rejected" && s.rejectionReason ? (
                      <p className="mt-1 text-xs font-bold text-red-400">Reason: {s.rejectionReason}</p>
                    ) : null}
                  </div>
                </div>
                <span
                  className={`inline-flex flex-shrink-0 items-center gap-1.5 self-start rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide sm:self-center ${status.className}`}
                >
                  <StatusIcon className="h-3.5 w-3.5" />
                  {status.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Sell Your Account — /shop/sell
 * Normal users submit their eFootball account for review. They never pick a
 * tier (the WG-SHOP Manager assigns Cheap/Normal/Expensive on approval).
 */
export default function ShopSellPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Images (stored as object-storage paths)
  const [profilePath, setProfilePath] = useState<string | null>(null);
  const [galleryPaths, setGalleryPaths] = useState<string[]>([]);

  // Account facts
  const [priceDollars, setPriceDollars] = useState("");
  const [teamStrength, setTeamStrength] = useState("");
  const [konami, setKonami] = useState(false);
  const [gplay, setGplay] = useState(false);
  const [gcenter, setGcenter] = useState(false);

  // Seller contact
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [discord, setDiscord] = useState("");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = (): string | null => {
    if (!profilePath) return "Please upload the account profile picture.";
    if (galleryPaths.length === 0) return "Please upload at least one full account picture.";
    const price = Number(priceDollars);
    if (!Number.isFinite(price) || price <= 0) return "Please enter a valid price greater than zero.";
    if (teamStrength && (!Number.isInteger(Number(teamStrength)) || Number(teamStrength) <= 0)) {
      return "Team strength must be a positive whole number.";
    }
    if (!fullName.trim()) return "Please enter your full name.";
    if (!phone.trim()) return "Please enter your phone number.";
    if (!discord.trim()) return "Please enter your Discord username.";
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitSellAccount({
        profileImagePath: profilePath!,
        galleryPaths,
        priceCents: Math.round(Number(priceDollars) * 100),
        teamStrength: teamStrength ? Number(teamStrength) : null,
        konamiIdLinked: konami,
        googlePlayLinked: gplay,
        gameCenterLinked: gcenter,
        phone: phone.trim(),
        sellerName: fullName.trim(),
        sellerDiscord: discord.trim(),
        notes: notes.trim() || undefined,
      });
      qc.invalidateQueries({ queryKey: ["shop", "sell", "mine"] });
      toast({
        title: "Submitted for review",
        description: "Your account is now Pending Review. The WG-SHOP team will verify it shortly.",
      });
      setProfilePath(null);
      setGalleryPaths([]);
      setPriceDollars("");
      setTeamStrength("");
      setKonami(false);
      setGplay(false);
      setGcenter(false);
      setFullName("");
      setPhone("");
      setDiscord("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit your account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(500px 240px at 15% 0%, rgba(34,197,94,0.22), transparent), radial-gradient(420px 220px at 90% 100%, rgba(234,179,8,0.14), transparent)",
          }}
          aria-hidden
        />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">WG-SHOP / Sell</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black uppercase tracking-wide sm:text-3xl">
            <Tag className="h-7 w-7 text-green-400" /> Sell Your Account
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Submit your eFootball account for sale. Our team reviews every submission — once approved it is
            published in the right category and we handle the sale for you.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="mt-6 space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-8">
        {/* 1 — Profile picture */}
        <div className="space-y-3">
          <Label>1 · Account Profile Picture</Label>
          {profilePath ? (
            <div className="flex items-center gap-4 rounded-xl border border-border p-3">
              <img
                src={storageUrl(profilePath)}
                alt="Profile preview"
                className="size-20 rounded-lg border border-border object-cover"
              />
              <div className="flex-1">
                <p className="flex items-center gap-1.5 text-sm font-bold text-green-400">
                  <CheckCircle2 className="h-4 w-4" /> Profile picture uploaded
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 h-8 text-red-400 hover:text-red-300"
                  onClick={() => setProfilePath(null)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <ImageDropZone
              label="Drop your profile picture here or click to upload"
              hint="This is the main image buyers see on the card"
              multiple={false}
              onUploaded={(paths) => setProfilePath(paths[0] ?? null)}
            />
          )}
        </div>

        {/* 2 — Full account pictures */}
        <div className="space-y-3">
          <Label>2 · Full Account Pictures</Label>
          <ImageDropZone
            label="Drop account screenshots here or click to upload"
            hint="Upload all screenshots of the account — buyers see them on View More Details"
            multiple={true}
            onUploaded={(paths) => setGalleryPaths((prev) => [...prev, ...paths])}
          />
          {galleryPaths.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {galleryPaths.map((path, idx) => (
                <div key={`${path}-${idx}`} className="group relative overflow-hidden rounded-lg border border-border">
                  <img src={storageUrl(path)} alt="" className="aspect-square w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded bg-black/70 p-1 text-red-400 opacity-0 transition-opacity hover:bg-red-500/30 group-hover:opacity-100"
                    onClick={() => setGalleryPaths((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label="Remove image"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] font-bold text-white">
                    {idx + 1}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* 3+ — Account & seller details */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sell-price">3 · Price (USD)</Label>
            <Input
              id="sell-price"
              type="number"
              min="0.5"
              step="0.01"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              placeholder="e.g. 45.00"
              data-testid="input-sell-price"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sell-strength">4 · Team Strength</Label>
            <Input
              id="sell-strength"
              type="number"
              min="1"
              value={teamStrength}
              onChange={(e) => setTeamStrength(e.target.value)}
              placeholder="e.g. 3200"
              data-testid="input-sell-strength"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Account links</Label>
          <YesNo label="Konami ID Linked" value={konami} onChange={setKonami} />
          <YesNo label="Google Play Account" value={gplay} onChange={setGplay} />
          <YesNo label="Game Center" value={gcenter} onChange={setGcenter} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sell-name">Full Name</Label>
            <Input
              id="sell-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ahmed Ali"
              data-testid="input-sell-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sell-phone">Phone Number</Label>
            <Input
              id="sell-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +252 61 5551234"
              data-testid="input-sell-phone"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sell-discord">Discord Username</Label>
            <Input
              id="sell-discord"
              value={discord}
              onChange={(e) => setDiscord(e.target.value)}
              placeholder="e.g. waryaa_seller"
              data-testid="input-sell-discord"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sell-notes">Additional Notes (optional)</Label>
          <Textarea
            id="sell-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything else the review team should know…"
          />
        </div>

        {error ? <p className="text-sm font-bold text-destructive">{error}</p> : null}

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs text-muted-foreground">
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <span>
              Your account stays <strong className="text-yellow-400">Pending Review</strong> and is never shown
              publicly until the WG-SHOP team approves it. You do <strong>not</strong> pick the category — the
              team assigns Cheap, Normal or Expensive after verification.
            </span>
          </p>
        </div>

        <Button
          size="lg"
          className="w-full font-black uppercase tracking-wide"
          onClick={submit}
          disabled={submitting}
          data-testid="button-submit-account"
        >
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {submitting ? "Submitting…" : "Submit Account for Review"}
        </Button>
      </div>

      <MySubmissions />

      {/* Footer hint */}
      <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Gamepad2 className="h-3.5 w-3.5" />
        WG-SHOP — eFootball accounts, coins & Discord Nitro
      </p>
    </div>
  );
}




