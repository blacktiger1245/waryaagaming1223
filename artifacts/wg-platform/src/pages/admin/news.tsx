import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Loader2, Upload, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Article = {
  id: number;
  title: string;
  slug: string;
  category: string | null;
  isFeatured: boolean;
  imageUrl: string | null;
  content: string;
  excerpt: string | null;
};

type FormState = {
  title: string;
  content: string;
  category: string;
  imageUrl: string;
};

const CATEGORIES = [
  { value: "tournament", label: "Tournament" },
  { value: "community", label: "Community" },
  { value: "federation", label: "Federation" },
];

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ── Drag-and-drop image uploader ────────────────────────────────────────────
function ImageDropzone({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const { toast } = useToast();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);

  const upload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Please drop an image file", variant: "destructive" });
        return;
      }
      setUploading(true);
      try {
        const { uploadURL, objectPath } = await api<{ uploadURL: string; objectPath: string }>(
          `${BASE}/api/storage/uploads/news-image`,
          {
            method: "POST",
            body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
          },
        );
        await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const publicUrl = `${BASE}/api/storage/objects/${objectPath.replace(/^\/objects\//, "")}`;
        setPreview(publicUrl);
        onChange(publicUrl);
        toast({ title: "Image uploaded" });
      } catch (err) {
        toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
      } finally {
        setUploading(false);
      }
    },
    [onChange, toast],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) upload(file);
    },
    [upload],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) upload(file);
    },
    [upload],
  );

  return (
    <div className="space-y-2">
      <label
        htmlFor="news-image-input"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center w-full h-36 rounded-lg border-2 border-dashed cursor-pointer transition-colors
          ${dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 bg-muted/30"}`}
      >
        {uploading ? (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        ) : preview ? (
          <img src={preview} alt="preview" className="h-full w-full object-cover rounded-lg" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="w-6 h-6" />
            <span className="text-xs font-semibold uppercase tracking-wider">Drop image here or click to browse</span>
          </div>
        )}
        <input
          id="news-image-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onInputChange}
        />
      </label>
      {preview && (
        <button
          type="button"
          onClick={() => { setPreview(null); onChange(""); }}
          className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Remove image
        </button>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AdminNewsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [form, setForm] = useState<FormState>({ title: "", content: "", category: "", imageUrl: "" });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin", "news"],
    queryFn: () => api<Article[]>(`${BASE}/api/admin/news`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "news"] });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api(`${BASE}/api/admin/news`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); setOpen(false); toast({ title: "Article created" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      api(`${BASE}/api/admin/news/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); setOpen(false); toast({ title: "Article updated" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api(`${BASE}/api/admin/news/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast({ title: "Article deleted" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setForm({ title: "", content: "", category: "", imageUrl: "" });
    setOpen(true);
  }

  function openEdit(row: Article) {
    setEditing(row);
    setForm({
      title: row.title ?? "",
      content: row.content ?? "",
      category: row.category ?? "",
      imageUrl: row.imageUrl ?? "",
    });
    setOpen(true);
  }

  function handleSubmit() {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (!form.content.trim()) {
      toast({ title: "Description is required", variant: "destructive" });
      return;
    }
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      content: form.content.trim(),
      slug: slugify(form.title.trim()),
      ...(form.category ? { category: form.category } : {}),
      ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate({ ...payload, publishedAt: new Date().toISOString() });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black uppercase tracking-wide">News Articles</h2>
        <Button size="sm" className="gap-2 font-bold" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Add Article
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Featured</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading...
                </TableCell>
              </TableRow>
            ) : !rows || rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No articles yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell className="capitalize">{row.category ?? "—"}</TableCell>
                  <TableCell>{row.isFeatured ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(row)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { if (confirm("Delete this article?")) deleteMutation.mutate(row.id); }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-wide">
              {editing ? "Edit Article" : "Add News Article"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Article title"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Description <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Write the article content here…"
                className="min-h-[120px]"
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Category <span className="text-muted-foreground/50 normal-case font-normal">(optional)</span>
              </label>
              <Select
                value={form.category || "none"}
                onValueChange={(v) => setForm({ ...form, category: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Image */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" /> Image <span className="text-muted-foreground/50 normal-case font-normal">(optional)</span>
              </label>
              <ImageDropzone
                value={form.imageUrl}
                onChange={(url) => setForm({ ...form, imageUrl: url })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? "Save Changes" : "Publish Article"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
