import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Redirect } from "wouter";
import {
  Loader2,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  UploadCloud,
  Film,
  Pencil,
} from "lucide-react";
import { apiUrl, storageUrl } from "@/lib/api";

interface Ad {
  id: number;
  videoUrl: string;
  targetUrl: string;
  closeAfterSeconds: number;
  isActive: boolean;
  createdByUsername: string | null;
  createdAt: string;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(apiUrl(path), { credentials: "include", ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data;
}

// Upload a video through the API (server→R2) with real progress reporting.
function uploadVideoFile(file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl("/api/storage/uploads/ads-video/direct"));
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(100, Math.max(0, Math.round((e.loaded / e.total) * 100))));
    };
    xhr.onload = () => {
      let data: { objectPath?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* fall through */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.objectPath) {
        resolve(data.objectPath);
      } else {
        reject(new Error(data.error || "Failed to upload video"));
      }
    };
    xhr.onerror = () => reject(new Error("Failed to upload video"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(file);
  });
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}
function toLocaleDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

// ── Drag-and-drop video uploader ──────────────────────────────────────────────
function VideoDropzone({
  file,
  previewUrl,
  uploading,
  progress,
  onSelect,
  onClear,
}: {
  file: File | null;
  previewUrl: string;
  uploading: boolean;
  progress: number;
  onSelect: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      onSelect(f); // validation message surfaced by valid type check below
      return;
    }
    onSelect(f);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />

      {file ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {previewUrl ? (
            <video src={previewUrl} controls className="block h-auto max-h-72 w-full object-contain bg-black" />
          ) : null}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-border">
            <Film className="h-5 w-5 text-primary flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
            </div>
            {uploading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground w-full">
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="font-bold tabular-nums">{progress}%</span>
              </div>
            )}
            <button
              type="button"
              disabled={uploading}
              onClick={onClear}
              className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
            >
              {uploading ? "Uploading…" : "Remove"}
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            dragging ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
          }`}
        >
          <UploadCloud className={`h-10 w-10 ${dragging ? "text-primary" : "text-muted-foreground"}`} />
          <div>
            <p className="font-black uppercase tracking-wide text-foreground">Drag &amp; Drop Video Here</p>
            <p className="mt-1 text-sm font-bold uppercase tracking-wide text-primary">or</p>
            <p className="text-sm text-muted-foreground">Browse Files</p>
          </div>
          <p className="text-xs text-muted-foreground/70">MP4, WebM and MOV supported</p>
        </div>
      )}
    </div>
  );
}

// ── Advertisement form (create / edit) ─────────────────────────────────────────
function AdForm({
  initial,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initial: { targetUrl: string; closeAfterSeconds: string; videoUrl?: string };
  busy: boolean;
  error: string;
  onSubmit: (data: {
    targetUrl: string;
    closeAfterSeconds: number;
    videoUrl?: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [targetUrl, setTargetUrl] = useState(initial.targetUrl);
  const [seconds, setSeconds] = useState(initial.closeAfterSeconds);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState("");

  function selectFile(f: File) {
    setFile(f);
    setLocalError("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl("");
    setProgress(0);
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError("");

    const secondsNum = Number(seconds);
    const trimmedUrl = targetUrl.trim();

    if (!file && !initial.videoUrl) {
      setLocalError("Please provide a video (either by uploading a new file or keeping the existing one).");
      return;
    }
    if (!trimmedUrl) {
      setLocalError("Advertisement link is required.");
      return;
    }
    let safeUrl: URL;
    try {
      safeUrl = new URL(trimmedUrl);
      if (safeUrl.protocol !== "http:" && safeUrl.protocol !== "https:") throw new Error("unsafe");
    } catch {
      setLocalError("Advertisement link must be a valid http(s) URL.");
      return;
    }
    if (!Number.isFinite(secondsNum) || Math.floor(secondsNum) !== secondsNum || secondsNum <= 0) {
      setLocalError("Seconds to Close must be a positive whole number.");
      return;
    }

    try {
      // Upload the video first (when a new file was chosen), reporting progress.
      let videoUrl = initial.videoUrl;
      if (file) {
        setUploading(true);
        setProgress(0);
        try {
          videoUrl = await uploadVideoFile(file, (pct) => setProgress(pct));
        } finally {
          setUploading(false);
        }
      }

      await onSubmit({
        targetUrl: trimmedUrl,
        closeAfterSeconds: secondsNum,
        videoUrl,
      });
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : "Failed to save advertisement");
    }
  }

  const showUpload = file || !initial.videoUrl;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="mb-2 block text-xs font-black uppercase tracking-wider text-muted-foreground">Video Upload</label>
        <VideoDropzone
          file={file}
          previewUrl={previewUrl}
          uploading={uploading}
          progress={progress}
          onSelect={selectFile}
          onClear={clearFile}
        />
        {!showUpload && initial.videoUrl && (
          <p className="mt-2 text-xs text-muted-foreground">Keeping the existing video. Upload a new one to replace it.</p>
        )}
      </div>

      <div>
        <label htmlFor="ad-link" className="mb-2 block text-xs font-black uppercase tracking-wider text-muted-foreground">Advertisement Link *</label>
        <input
          id="ad-link"
          type="text"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://example.com/product"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
        />
      </div>

      <div>
        <label htmlFor="ad-seconds" className="mb-2 block text-xs font-black uppercase tracking-wider text-muted-foreground">Seconds to Close *</label>
        <input
          id="ad-seconds"
          type="number"
          min="1"
          step="1"
          value={seconds}
          onChange={(e) => setSeconds(e.target.value)}
          placeholder="15"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
        />
        <p className="mt-1 text-xs text-muted-foreground">How long the user must watch before the close button appears.</p>
      </div>

      {(localError || error) && <p className="text-sm font-bold text-red-400">{(localError || error)}</p>}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy || uploading}
          className="rounded-lg border border-border px-4 py-2 text-sm font-bold hover:bg-muted disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || uploading}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {busy || uploading ? "Saving…" : "Save Ads"}
        </button>
      </div>
    </form>
  );
}

// ── Admin Ads Management page ─────────────────────────────────────────────────
export default function AdminAdsPage() {
  const qc = useQueryClient();
  const { isOwner, isLoading: authLoading } = useAdminAuth();

  const { data: ads = [], isLoading } = useQuery<Ad[]>({
    queryKey: ["admin-ads"],
    queryFn: () => apiFetch("/api/admin/ads"),
    enabled: isOwner,
  });

  const [editor, setEditor] = useState<{ type: "create" } | { type: "edit"; ad: Ad } | null>(null);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [flash, setFlash] = useState("");

  if (authLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!isOwner) return <Redirect to="/admin" />;

  async function handleSave(data: { targetUrl: string; closeAfterSeconds: number; videoUrl?: string }) {
    setSaving(true);
    setPageError("");
    try {
      if (!data.videoUrl) throw new Error("A video is required. Upload a video first.");
      if (editor?.type === "edit") {
        await apiFetch(`/api/admin/ads/${editor.ad.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } else {
        await apiFetch("/api/admin/ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      }
      await qc.invalidateQueries({ queryKey: ["admin-ads"] });
      setEditor(null);
      setFlash(editor?.type === "edit" ? "Advertisement updated successfully." : "Advertisement saved and is now active.");
      window.setTimeout(() => setFlash(""), 4000);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : "Failed to save advertisement");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(ad: Ad) {
    try {
      await apiFetch(`/api/admin/ads/${ad.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !ad.isActive }),
      });
      await qc.invalidateQueries({ queryKey: ["admin-ads"] });
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this advertisement permanently? The uploaded video will also be removed.")) return;
    try {
      await apiFetch(`/api/admin/ads/${id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["admin-ads"] });
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : "Failed to delete advertisement");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Ads Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and manage video advertisements shown to website visitors.</p>
        </div>
        {!editor && (
          <button
            onClick={() => setEditor({ type: "create" })}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-black text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Ads
          </button>
        )}
      </div>

      {flash && <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm font-bold text-green-400">{flash}</div>}
      {pageError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400">{pageError}</div>}

      {editor && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-5 text-lg font-black uppercase tracking-wide">{editor.type === "edit" ? `Edit Advertisement #${editor.ad.id}` : "Add Ads"}</h2>
          <AdForm
            initial={
              editor.type === "edit"
                ? { targetUrl: editor.ad.targetUrl, closeAfterSeconds: String(editor.ad.closeAfterSeconds), videoUrl: editor.ad.videoUrl }
                : { targetUrl: "", closeAfterSeconds: "" }
            }
            busy={saving}
            error={pageError}
            onSubmit={handleSave}
            onCancel={() => { setEditor(null); setPageError(""); }}
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12 text-sm text-muted-foreground">Loading…</div>
      ) : ads.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-12 text-center">
          <Film className="h-10 w-10 text-muted-foreground opacity-30" />
          <p className="font-bold text-muted-foreground">No advertisements yet</p>
          <p className="text-sm text-muted-foreground">Click “Add Ads” to create your first video advertisement.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ads.map((ad) => (
            <div key={ad.id} className={`flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center ${!ad.isActive ? "opacity-60" : ""}`}>
              <div className="w-full sm:w-44 sm:shrink-0">
                {ad.videoUrl ? (
                  <video src={storageUrl(ad.videoUrl)} muted playsInline preload="metadata" className="h-24 w-full rounded-lg object-cover bg-black" data-testid="ad-preview" />
                ) : (
                  <div className="flex h-24 w-full items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"><Film className="h-6 w-6" /></div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-black uppercase tracking-wider rounded-full border px-2 py-0.5 ${ad.isActive ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-border bg-muted text-muted-foreground"}`}>
                    {ad.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className="text-xs font-bold text-muted-foreground">Close after {ad.closeAfterSeconds}s</span>
                </div>
                <a
                  href={ad.targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex max-w-full items-center gap-1.5 truncate text-sm font-bold text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{ad.targetUrl}</span>
                </a>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>Created {toLocaleDate(ad.createdAt)}</span>
                  <span>by {ad.createdByUsername ?? "unknown"}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:flex-col lg:flex-row">
                <button
                  onClick={() => setEditor({ type: "edit", ad })}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={() => toggleStatus(ad)}
                  title={ad.isActive ? "Deactivate" : "Activate"}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted transition-colors"
                >
                  {ad.isActive ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4" />}
                  {ad.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => remove(ad.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}