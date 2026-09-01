import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Pencil, Trash2, Plus, Loader2, Save, X, Eye, EyeOff,
  Lightbulb, BookOpen, UserRound, Search, Upload, Image as ImageIcon, Timer,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// -- Types ---------------------------------------------------------------------
type Category = "player_training" | "tips_tricks" | "formations" | "kick_points";

interface AcademyPost {
  id: number;
  category: string;
  title: string;
  body: string;
  imageUrl: string | null;
  sortOrder: number;
  isPublished: boolean;
  updatedBy?: string | null;
  updatedAt?: string;
}

const CATEGORY_TABS: { key: Category; label: string; icon: typeof UserRound }[] = [
  { key: "player_training", label: "Player Training", icon: UserRound },
  { key: "tips_tricks", label: "Tips and Tricks", icon: Lightbulb },
  { key: "formations", label: "Formations", icon: BookOpen },
  { key: "kick_points", label: "Kick Points Exchange", icon: Timer },
];

// Content categories stored in the DB (kick_points is a coming-soon page).
const DB_CATEGORIES = ["player_training", "tips_tricks", "formations"] as const;

function isDbCategory(cat: Category): cat is (typeof DB_CATEGORIES)[number] {
  return (DB_CATEGORIES as readonly string[]).includes(cat);
}

// -- Professional auto-formatter -----------------------------------------------
type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "steps"; items: string[] };

function formatBody(raw: string): Block[] {
  const blocks: Block[] = [];
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let bullets: string[] = [];
  let steps: string[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (bullets.length) { blocks.push({ kind: "bullets", items: bullets }); bullets = []; }
    if (steps.length) { blocks.push({ kind: "steps", items: steps }); steps = []; }
    if (paragraph.length) { blocks.push({ kind: "paragraph", text: paragraph.join(" ") }); paragraph = []; }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }

    const isHeadingColon = /[:\uFF1A]$/.test(line) && line.length <= 80 && !/^[-\u2022*\d]/.test(line);
    const isCapsHeading = /^[A-Z0-9 '&\-!.]{4,60}$/.test(line) && /[A-Z]/.test(line);
    if (isHeadingColon || isCapsHeading) {
      flush();
      blocks.push({ kind: "heading", text: line.replace(/[:\uFF1A]$/, "") });
      continue;
    }

    const bullet = line.match(/^[-\u2022*]\s+(.*)$/);
    if (bullet) { if (paragraph.length || steps.length) flush(); bullets.push(bullet[1]); continue; }

    const step = line.match(/^(?:step\s+)?(\d{1,2})[.):]\s+(.*)$/i);
    if (step) { if (paragraph.length || bullets.length) flush(); steps.push(step[2]); continue; }

    if (bullets.length || steps.length) flush();
    paragraph.push(line);
  }
  flush();
  return blocks;
}
function TextBody({ body }: { body: string }) {
  const blocks = formatBody(body);
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        if (b.kind === "heading")
          return (
            <h3 key={i} className="pt-1 text-base font-black uppercase tracking-wide text-cyan-300">
              {b.text}
            </h3>
          );
        if (b.kind === "bullets")
          return (
            <ul key={i} className="space-y-2">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-2.5 text-sm leading-relaxed text-slate-300">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          );
        if (b.kind === "steps")
          return (
            <ol key={i} className="space-y-2">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-3 text-sm leading-relaxed text-slate-300">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/15 text-[11px] font-black text-cyan-300">
                    {j + 1}
                  </span>
                  <span className="pt-0.5">{item}</span>
                </li>
              ))}
            </ol>
          );
        return <p key={i} className="text-sm leading-relaxed text-slate-300">{b.text}</p>;
      })}
    </div>
  );
}

// -- Drag-and-drop image uploader (admin) ---------------------------------------
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
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Please choose an image file", variant: "destructive" });
        return;
      }
      setUploading(true);
      try {
        // Upload through the API (server-to-R2) so the browser never talks to the
        // bucket directly -- same pattern as the news admin uploader.
        const res = await fetch(`${BASE}/api/storage/uploads/news-image/direct`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const data = (await res.json().catch(() => ({}))) as { objectPath?: string; error?: string };
        if (!res.ok || !data.objectPath) {
          throw new Error(data.error ?? "Upload failed");
        }
        const publicUrl = `${BASE}/api/storage/objects/${data.objectPath.replace(/^\/objects\//, "")}`;
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

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) upload(file);
        }}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${
          dragging ? "border-cyan-400 bg-cyan-500/10" : "border-slate-700 bg-[#07111F] hover:border-cyan-500/50"
        }`}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        ) : preview ? (
          <img src={preview} alt="Preview" className="max-h-40 rounded-lg object-contain" />
        ) : (
          <>
            <Upload className="h-6 w-6 text-slate-500" />
            <p className="text-xs text-slate-400">
              Drag &amp; drop an image here, or <span className="text-cyan-400">click to upload</span>
            </p>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
      {preview && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-500">Image ready</p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-slate-400 hover:text-red-400"
            onClick={() => { setPreview(null); onChange(""); }}
          >
            <X className="h-3 w-3" /> Remove
          </Button>
        </div>
      )}
    </div>
  );
}
// -- Admin editor for one post ---------------------------------------------------
function PostEditor({
  post,
  category,
  isTraining,
  onDone,
}: {
  post?: AcademyPost;
  category: (typeof DB_CATEGORIES)[number];
  isTraining: boolean;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [imageUrl, setImageUrl] = useState(post?.imageUrl ?? "");

  const save = useMutation({
    mutationFn: () =>
      post
        ? apiFetch(`/api/admin/academy/posts/${post.id}`, {
            method: "PATCH",
            body: JSON.stringify({ title, body, imageUrl: imageUrl || null }),
          })
        : apiFetch("/api/admin/academy/posts", {
            method: "POST",
            body: JSON.stringify({ category, title, body, imageUrl: imageUrl || null }),
          }),
    onSuccess: () => {
      toast({ title: post ? "Saved" : "Published", description: `"${title}" is now live.` });
      qc.invalidateQueries({ queryKey: ["academy-posts"] });
      onDone();
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3 rounded-xl border border-cyan-500/30 bg-[#0B1626] p-4">
      <input
        className="w-full rounded-lg border border-slate-700 bg-[#07111F] px-3 py-2 text-sm font-bold text-white focus:border-cyan-500 focus:outline-none"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={isTraining ? "Player Name" : "Post title"}
        autoFocus
      />
      {isTraining && (
        <ImageDropzone value={imageUrl} onChange={setImageUrl} />
      )}
      {!isTraining && (
        <>
          <textarea
            className="min-h-[160px] w-full rounded-lg border border-slate-700 bg-[#07111F] px-3 py-2 text-sm leading-relaxed text-slate-200 focus:border-cyan-500 focus:outline-none"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={"Write text content (optional)...\n\nFormatting happens automatically:\n- Lines ending with : become headings\n- Lines starting with - become bullet points\n- Lines starting with 1. 2. 3. become numbered steps"}
          />
          <ImageDropzone value={imageUrl} onChange={setImageUrl} />
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onDone} className="gap-1.5">
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending || !title.trim() || (!isTraining && !body.trim() && !imageUrl.trim())}
          className="gap-1.5 border-0 bg-cyan-600 hover:bg-cyan-500"
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {post ? "Save" : "Publish"}
        </Button>
      </div>
    </div>
  );
}

// -- Coming Soon (Kick Points Exchange) ------------------------------------------
function ComingSoon() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-b from-[#0B1626] to-[#101E32] px-6 py-16 text-center shadow-lg shadow-black/20">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-[90px]" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-blue-700/15 blur-[90px]" />
      <div className="relative">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/20 to-blue-700/25">
          <Timer className="h-10 w-10 text-cyan-400" strokeWidth={1.8} />
        </div>
        <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Kick Points Exchange</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400">
          Trade your Kick Points for exclusive rewards, player boosts and more.
          We are putting the finishing touches on the exchange - it will go live very soon.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-5 py-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
          </span>
          <span className="text-xs font-black uppercase tracking-widest text-cyan-300">Coming Soon</span>
        </div>
      </div>
    </div>
  );
}
// -- Page -------------------------------------------------------------------------
export default function AcademyPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Category>("player_training");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const isDbTab = isDbCategory(tab);
  const isTraining = tab === "player_training";

  const { data: posts = [], isLoading } = useQuery<AcademyPost[]>({
    queryKey: ["academy-posts", tab, isAdmin, search],
    enabled: isDbTab,
    queryFn: () => {
      const params = new URLSearchParams({ category: tab });
      if (search.trim()) params.set("q", search.trim());
      return isAdmin
        ? apiFetch(`/api/admin/academy/posts?${params}`)
        : apiFetch(`/api/academy/posts?${params}`);
    },
  });

  const togglePublish = useMutation({
    mutationFn: (p: AcademyPost) =>
      apiFetch(`/api/admin/academy/posts/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPublished: !p.isPublished }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academy-posts"] }),
  });

  const remove = useMutation({
    mutationFn: (p: AcademyPost) => apiFetch(`/api/admin/academy/posts/${p.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Post deleted" });
      qc.invalidateQueries({ queryKey: ["academy-posts"] });
    },
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07111F] px-4 pb-16 pt-10 text-white sm:px-6">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-blue-700/15 blur-[120px]" />

      <div className="relative mx-auto w-full max-w-5xl">
        <div className="mb-8 text-center">
          <img
            src={`${import.meta.env.BASE_URL}logo.jpg`}
            alt="WG Academy"
            className="mx-auto mb-5 h-16 w-16 rounded-2xl border border-cyan-400/25 object-cover glow-primary"
          />
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">WG Academy</h1>
          <p className="mt-2 text-sm text-slate-400">Training, tips and guides from the Waryaa Gaming team</p>
        </div>

        {/* Category tabs */}
        <div className="mb-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center">
          {CATEGORY_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setAdding(false); setEditingId(null); setSearch(""); }}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition sm:text-sm ${
                tab === key
                  ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-300 shadow-lg shadow-cyan-500/10"
                  : "border-slate-800 bg-[#0B1626] text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Coming Soon category */}
        {tab === "kick_points" && <ComingSoon />}

        {/* Search bar -- Player Training */}
        {isTraining && (
          <div className="relative mb-6">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player training by name..."
              className="h-11 rounded-xl border-slate-700 bg-[#0B1626] pl-10 text-sm text-white placeholder:text-slate-500 focus-visible:ring-cyan-500"
            />
          </div>
        )}
        {/* Admin toolbar */}
        {isAdmin && isDbTab && (
          <div className="mb-6 rounded-xl border border-cyan-500/25 bg-[#0B1626] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-wider text-cyan-300">
                Admin - {CATEGORY_TABS.find((c) => c.key === tab)?.label}
              </p>
              {!adding && (
                <Button size="sm" onClick={() => { setAdding(true); setEditingId(null); }} className="gap-1.5 border-0 bg-cyan-600 hover:bg-cyan-500">
                  <Plus className="h-3.5 w-3.5" /> {isTraining ? "Add Training Post" : "New Post"}
                </Button>
              )}
            </div>
            {adding && (
              <div className="mt-3">
                <PostEditor
                  category={tab as (typeof DB_CATEGORIES)[number]}
                  isTraining={isTraining}
                  onDone={() => setAdding(false)}
                />
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {isDbTab && (
          isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-2xl border border-slate-800 bg-[#0B1626]" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-[#0B1626] p-10 text-center">
              {isTraining ? <ImageIcon className="mx-auto mb-3 h-10 w-10 text-slate-600" /> : <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-600" />}
              <p className="text-sm text-slate-400">
                {search.trim()
                  ? `No results found for "${search.trim()}".`
                  : isAdmin
                    ? "Nothing here yet - publish the first post above."
                    : "Content is being prepared. Check back soon!"}
              </p>
            </div>
          ) : isTraining ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((p) => (
                <div key={p.id} className="group overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-[#0B1626] to-[#101E32] shadow-lg shadow-black/20 transition hover:border-cyan-500/40">
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#07111F]">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <UserRound className="h-12 w-12 text-slate-700" />
                      </div>
                    )}
                    {isAdmin && (
                      <div className="absolute right-2 top-2 flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 bg-black/50 text-slate-300 hover:text-cyan-400" onClick={() => { setEditingId(editingId === p.id ? null : p.id); setAdding(false); }} title="Edit">
                          {editingId === p.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 bg-black/50 text-slate-300 hover:text-amber-400" onClick={() => togglePublish.mutate(p)} title={p.isPublished ? "Unpublish" : "Publish"}>
                          {p.isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 bg-black/50 text-slate-300 hover:text-red-400"
                          onClick={() => { if (window.confirm(`Delete "${p.title}"?`)) remove.mutate(p); }}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {!p.isPublished && (
                      <span className="absolute left-2 top-2 rounded-md bg-amber-500/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">
                        Draft
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="truncate text-base font-black tracking-tight text-white">{p.title}</h3>
                    {p.updatedAt && (
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                        Updated {new Date(p.updatedAt).toLocaleDateString()}
                        {p.updatedBy ? ` by ${p.updatedBy}` : ""}
                      </p>
                    )}
                    {editingId === p.id && (
                      <div className="mt-3">
                        <PostEditor
                          post={p}
                          category="player_training"
                          isTraining
                          onDone={() => setEditingId(null)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {posts.map((p) => (
                <section key={p.id} className="rounded-2xl border border-slate-800 bg-gradient-to-b from-[#0B1626] to-[#101E32] p-6 shadow-lg shadow-black/20">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10">
                        {tab === "tips_tricks" ? <Lightbulb className="h-5 w-5 text-cyan-400" strokeWidth={1.8} /> : <BookOpen className="h-5 w-5 text-cyan-400" strokeWidth={1.8} />}
                      </div>
                      <div>
                        <h2 className="text-lg font-black tracking-tight text-white">{p.title}</h2>
                        {p.updatedAt && (
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">
                            Updated {new Date(p.updatedAt).toLocaleDateString()}
                            {p.updatedBy ? ` by ${p.updatedBy}` : ""}
                            {!p.isPublished && " - DRAFT (hidden from players)"}
                          </p>
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-cyan-400" onClick={() => { setEditingId(editingId === p.id ? null : p.id); setAdding(false); }} title="Edit">
                          {editingId === p.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-amber-400" onClick={() => togglePublish.mutate(p)} title={p.isPublished ? "Unpublish" : "Publish"}>
                          {p.isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-slate-400 hover:text-red-400"
                          onClick={() => { if (window.confirm(`Delete "${p.title}"?`)) remove.mutate(p); }}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {editingId === p.id ? (
                    <PostEditor
                      post={p}
                      category={tab as (typeof DB_CATEGORIES)[number]}
                      isTraining={false}
                      onDone={() => setEditingId(null)}
                    />
                  ) : (
                    <div className="space-y-4">
                      {p.imageUrl && (
                        <img src={p.imageUrl} alt={p.title} className="w-full rounded-xl border border-slate-800 object-cover" />
                      )}
                      <TextBody body={p.body} />
                    </div>
                  )}
                </section>
              ))}
            </div>
          )
        )}
      </div>
    </main>
  );
}