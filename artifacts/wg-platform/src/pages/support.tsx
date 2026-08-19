import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Loader2, Plus, X, MessageSquare, Image as ImageIcon, Send, LifeBuoy } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { user, uploadSupportAttachment, SUPPORT_CATEGORIES, type MyTicket, type Attachment } from "@/lib/support";

const STATUS_LABEL: Record<string, string> = { waiting: "Waiting for Admin", active: "Active", closed: "Closed" };
const STATUS_COLOR: Record<string, string> = {
  waiting: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  active: "text-primary bg-primary/10 border-primary/30",
  closed: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
};

function fmt(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_COLOR[status] ?? ""}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default function SupportPage() {
  const { isLoggedIn, loginWithDiscord } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: status } = useQuery({ queryKey: ["support-status"], queryFn: user.status, staleTime: 60_000 });
  const { data: list, isLoading } = useQuery({ queryKey: ["support-my"], queryFn: user.list, enabled: isLoggedIn });

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>(SUPPORT_CATEGORIES[0]);
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function pickFile(f: File | undefined) {
    setError("");
    if (!f) return;
    if (!f.type.startsWith("image/")) { setError("Only image attachments are supported."); return; }
    if (f.size > 10 * 1024 * 1024) { setError("Max attachment size is 10MB."); return; }
    setUploading(true);
    try {
      const a = await uploadSupportAttachment(f);
      setAttachment(a);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(f));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!subject.trim()) throw new Error("Subject is required");
      if (!message.trim() && !attachment) throw new Error("Message is required");
      return user.create({ subject, category, message, attachment });
    },
    onSuccess: (ticket) => {
      setSubject(""); setMessage(""); setAttachment(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview("");
      qc.invalidateQueries({ queryKey: ["support-my"] });
      navigate(`/support/tickets/${ticket.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-black uppercase tracking-tight">
          <LifeBuoy className="h-7 w-7 text-primary" /> Support
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Get help from the Waryaa Gaming support team.</p>
      </div>

      {status && (
        <div className={`rounded-xl border p-4 text-sm ${status.adminOnline ? "border-primary/40 bg-primary/10" : "border-zinc-700 bg-zinc-900"}`}>
          {status.adminOnline ? (
            <p className="font-bold text-primary">🟢 Support is currently online. An admin will respond to your ticket shortly.</p>
          ) : (
            <>
              <p className="font-bold text-zinc-300">⚫ All support admins are currently offline.</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Your ticket has been received. An admin will respond when support is back online.</p>
            </>
          )}
        </div>
      )}
<div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-black uppercase tracking-wide"><Plus className="h-4 w-4 text-primary" /> Create Ticket</h2>
          {!isLoggedIn ? (
            <button onClick={loginWithDiscord} className="mt-4 w-full rounded-lg bg-[#5865F2] px-4 py-2.5 text-sm font-black text-white hover:bg-[#4752C4]">
              Sign in with Discord
            </button>
          ) : (
            <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Subject (e.g. Tournament Registration Problem)" className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary" />
              <div>
                <span className="mb-1 block text-xs font-bold text-muted-foreground">Category</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm capitalize outline-none focus:border-primary">
                  {SUPPORT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} rows={4} placeholder="Describe your issue…"
                className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary" />
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:border-primary/50">
                  <ImageIcon className="h-4 w-4" /> Attach image
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
                </label>
                {uploading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              </div>
              {attachment && (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted p-2">
                  {preview && <img src={preview} alt="" className="h-10 w-10 rounded object-cover" />}
                  <span className="flex-1 truncate text-xs font-bold">{attachment.name}</span>
                  <button type="button" onClick={() => { setAttachment(null); if (preview) URL.revokeObjectURL(preview); setPreview(""); }} className="text-muted-foreground hover:text-red-400"><X className="h-4 w-4" /></button>
                </div>
              )}
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" disabled={create.isPending} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {create.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : <><Send className="h-4 w-4" /> Submit Ticket</>}
              </button>
            </form>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-black uppercase tracking-wide"><MessageSquare className="h-4 w-4 text-primary" /> My Support Tickets</h2>
          {!isLoggedIn ? (
            <p className="mt-4 text-sm text-muted-foreground">Sign in to see your tickets.</p>
          ) : isLoading ? (
            <div className="mt-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : !list || list.tickets.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">No tickets yet. Create one to get help.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {list.tickets.map((t) => (
                <Link key={t.id} href={`/support/tickets/${t.id}`} className="block rounded-xl border border-border bg-muted/40 p-3 transition-colors hover:border-primary/50">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-bold">{t.subject}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {t.assignedAdmin ? `Support: ${t.assignedAdmin.displayName ?? t.assignedAdmin.username}` : "Waiting for admin"}
                      {t.userUnread > 0 && <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">{t.userUnread}</span>}
                    </span>
                    <span>{fmt(t.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}