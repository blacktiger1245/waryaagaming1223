import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Pencil, Trash2, Plus, Loader2, Save, X, Eye, EyeOff, ScrollText, Lightbulb, BookOpen } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

// ── Types ──────────────────────────────────────────────────────────────────────
interface AcademySection {
  id: number;
  slug: string;
  title: string;
  body: string;
  sortOrder: number;
  isPublished: boolean;
  updatedBy?: string | null;
  updatedAt?: string;
}

// ── Professional auto-formatter ────────────────────────────────────────────────
// Turns whatever the admin writes (plain text) into clean, structured content:
//   • "Rules:" style lines become headings
//   • "- item" / "• item" lines become bullet lists
//   • "1." / "1)" numbered lines become numbered steps
//   • Short ALL-CAPS lines become headings
//   • Blank lines separate paragraphs
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

    const isHeadingColon = /[:：]$/.test(line) && line.length <= 80 && !/^[-•*\d]/.test(line);
    const isCapsHeading = /^[A-Z0-9 '&\-!.]{4,60}$/.test(line) && /[A-Z]/.test(line);
    if (isHeadingColon || isCapsHeading) {
      flush();
      blocks.push({ kind: "heading", text: line.replace(/[:：]$/, "") });
      continue;
    }

    const bullet = line.match(/^[-•*]\s+(.*)$/);
    if (bullet) { if (paragraph.length || steps.length) flush(); bullets.push(bullet[1]); continue; }

    const step = line.match(/^(?:step\s+)?(\d{1,2})[.):]\s+(.*)$/i);
    if (step) { if (paragraph.length || bullets.length) flush(); steps.push(step[2]); continue; }

    if (bullets.length || steps.length) flush();
    paragraph.push(line);
  }
  flush();
  return blocks;
}

const SECTION_ICONS = [ScrollText, Lightbulb, BookOpen, GraduationCap];

function SectionBody({ body }: { body: string }) {
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

// ── Admin editor for one section ───────────────────────────────────────────────
function SectionEditor({ section, onDone }: { section: AcademySection; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState(section.title);
  const [body, setBody] = useState(section.body);

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/academy/sections/${section.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title, body }),
      }),
    onSuccess: () => {
      toast({ title: "Saved", description: `"${title}" is live with professional formatting.` });
      qc.invalidateQueries({ queryKey: ["academy-sections"] });
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
        placeholder="Section title"
      />
      <textarea
        className="min-h-[220px] w-full rounded-lg border border-slate-700 bg-[#07111F] px-3 py-2 text-sm leading-relaxed text-slate-200 focus:border-cyan-500 focus:outline-none"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={"Write anything — rules, tips, guides…\n\nIt will be formatted professionally automatically:\n- Lines ending with : become headings\n- Lines starting with - become bullet points\n- Lines starting with 1. 2. 3. become numbered steps"}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onDone} className="gap-1.5">
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending || !title.trim()}
          className="gap-1.5 border-0 bg-cyan-600 hover:bg-cyan-500"
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save & Publish
        </Button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function AcademyPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const { data: sections = [], isLoading } = useQuery<AcademySection[]>({
    queryKey: ["academy-sections"],
    queryFn: () =>
      isAdmin
        ? apiFetch("/api/admin/academy/sections")
        : apiFetch("/api/academy/sections"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch("/api/admin/academy/sections", {
        method: "POST",
        body: JSON.stringify({ title: newTitle, body: "" }),
      }),
    onSuccess: () => {
      setNewTitle("");
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["academy-sections"] });
    },
    onError: (e: Error) => toast({ title: "Could not create section", description: e.message, variant: "destructive" }),
  });

  const togglePublish = useMutation({
    mutationFn: (s: AcademySection) =>
      apiFetch(`/api/admin/academy/sections/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPublished: !s.isPublished }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academy-sections"] }),
  });

  const remove = useMutation({
    mutationFn: (s: AcademySection) =>
      apiFetch(`/api/admin/academy/sections/${s.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Section deleted" });
      qc.invalidateQueries({ queryKey: ["academy-sections"] });
    },
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07111F] px-4 pb-16 pt-10 text-white sm:px-6">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-blue-700/15 blur-[120px]" />

      <div className="relative mx-auto w-full max-w-3xl">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/20 to-blue-700/25">
            <GraduationCap className="h-8 w-8 text-cyan-400" strokeWidth={1.8} />
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">WG Academy</h1>
          <p className="mt-2 text-sm text-slate-400">Rules, tips and guides from the Waryaa Gaming team</p>
        </div>

        {isAdmin && (
          <div className="mb-8 rounded-xl border border-cyan-500/25 bg-[#0B1626] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-wider text-cyan-300">Admin — Academy Content</p>
              {!adding && (
                <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5 border-0 bg-cyan-600 hover:bg-cyan-500">
                  <Plus className="h-3.5 w-3.5" /> New Section
                </Button>
              )}
            </div>
            {adding && (
              <div className="mt-3 flex gap-2">
                <input
                  autoFocus
                  className="flex-1 rounded-lg border border-slate-700 bg-[#07111F] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="Section title (e.g. Tournament Rules, Tips & Tricks)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && newTitle.trim() && create.mutate()}
                />
                <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !newTitle.trim()} className="gap-1.5 border-0 bg-cyan-600 hover:bg-cyan-500">
                  {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAdding(false)}><X className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl border border-slate-800 bg-[#0B1626]" />
            ))}
          </div>
        ) : sections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-[#0B1626] p-10 text-center">
            <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="text-sm text-slate-400">
              {isAdmin ? "No sections yet — add your first one above." : "The academy is being prepared. Check back soon!"}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {sections.map((s, idx) => {
              const Icon = SECTION_ICONS[idx % SECTION_ICONS.length];
              return (
                <section key={s.id} className="rounded-2xl border border-slate-800 bg-gradient-to-b from-[#0B1626] to-[#101E32] p-6 shadow-lg shadow-black/20 sm:p-8">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10">
                        <Icon className="h-5 w-5 text-cyan-400" strokeWidth={1.8} />
                      </div>
                      <div>
                        <h2 className="text-lg font-black tracking-tight text-white">{s.title}</h2>
                        {s.updatedAt && (
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">
                            Updated {new Date(s.updatedAt).toLocaleDateString()}
                            {s.updatedBy ? ` · by ${s.updatedBy}` : ""}
                            {!s.isPublished && " · DRAFT (hidden from players)"}
                          </p>
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-cyan-400" onClick={() => setEditingId(editingId === s.id ? null : s.id)} title="Edit">
                          {editingId === s.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-amber-400" onClick={() => togglePublish.mutate(s)} title={s.isPublished ? "Unpublish" : "Publish"}>
                          {s.isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-slate-400 hover:text-red-400"
                          onClick={() => { if (window.confirm(`Delete "${s.title}"?`)) remove.mutate(s); }}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {editingId === s.id ? (
                    <SectionEditor section={s} onDone={() => setEditingId(null)} />
                  ) : (
                    <SectionBody body={s.body} />
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}