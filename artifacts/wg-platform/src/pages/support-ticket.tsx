import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Loader2, Send, Image as ImageIcon, ArrowLeft, Plus, Star, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { user, uploadSupportAttachment, type SupportMessage, type Attachment } from "@/lib/support";
import { storageUrl } from "@/lib/api";

function clock(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Bubble({ m, mine }: { m: SupportMessage; mine: boolean }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-[#16223d] text-white"}`}>
        {m.attachmentPath && (
          <a href={storageUrl(m.attachmentPath)} target="_blank" rel="noreferrer" className="mb-1.5 block">
            <img src={storageUrl(m.attachmentPath)} alt={m.attachmentName ?? "attachment"} className="max-h-56 w-full rounded-lg object-cover" />
          </a>
        )}
        {m.text && m.text !== "•  File" && <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{m.text}</p>}
        {m.attachmentPath && m.text === "•  File" && <p className="text-xs font-bold opacity-80">{m.attachmentName ?? "Attachment"}</p>}
        <p className={`mt-1 text-right text-[10px] ${mine ? "text-primary-foreground/70" : "text-white/40"}`}>{clock(m.createdAt)}</p>
      </div>
    </div>
  );
}

function AdminCard({ admin }: { admin: { username: string; displayName: string | null; avatarUrl: string | null; role?: string; online?: boolean } | null }) {
  if (!admin) {
    return (
      <div className="rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-3 text-center">
        <p className="text-sm font-bold text-yellow-400">⏳ Waiting for Admin</p>
        <p className="text-xs text-muted-foreground">An admin will accept this ticket shortly.</p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      {admin.avatarUrl ? <img src={admin.avatarUrl} alt="" className="h-10 w-10 rounded-full" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-black text-primary">{(admin.displayName ?? admin.username)[0]?.toUpperCase()}</div>}
      <div className="min-w-0">
        <p className="truncate text-sm font-black">{admin.online ? "🟢" : "⚫"} {admin.displayName ?? admin.username}</p>
        <p className="text-xs capitalize text-muted-foreground">{admin.role === "owner" ? "Owner" : "Support Admin"} · {admin.online ? "Online" : "Offline"}</p>
      </div>
    </div>
  );
}

export default function SupportTicketPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { isLoggedIn, loginWithDiscord } = useAuth();
  const qc = useQueryClient();
  const ticketId = Number(id);
  const listEndRef = useRef<HTMLDivElement>(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["support-ticket", ticketId],
    queryFn: () => user.get(ticketId),
    enabled: isLoggedIn && Number.isInteger(ticketId),
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (detail && detail.status !== "closed") user.read(ticketId).catch(() => undefined);
  }, [detail?.id, detail?.status, detail?.messages?.length, ticketId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages?.length]);

  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");

  const [ratingMode, setRatingMode] = useState(detail?.status === "closed");
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [ratedMsg, setRatedMsg] = useState("");

  const send = useMutation({
    mutationFn: () => user.send(ticketId, { text, attachment }),
    onSuccess: () => {
      setText(""); setAttachment(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview("");
      qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
    },
    onError: (e: any) => setError(e.message),
  });

  const close = useMutation({
    mutationFn: () => user.close(ticketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      setRatingMode(true);
    },
    onError: (e: any) => setError(e.message),
  });

  const rate = useMutation({
    mutationFn: () => user.rate(ticketId, stars, feedback),
    onSuccess: () => {
      setRatedMsg("Thanks for your feedback! ⭐");
      setTimeout(() => navigate("/support"), 1200);
    },
    onError: (e: any) => setError(e.message),
  });

  async function pickFile(f: File | undefined) {
    setError("");
    if (!f) return;
    if (!f.type.startsWith("image/")) { setError("Only image attachments are supported."); return; }
    if (f.size > 10 * 1024 * 1024) { setError("Max attachment size is 10MB."); return; }
    try {
      const a = await uploadSupportAttachment(f);
      setAttachment(a);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(f));
    } catch (e: any) { setError(e.message); }
  }

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="font-black">Sign in to view this ticket.</p>
        <button onClick={loginWithDiscord} className="mt-4 rounded-lg bg-[#5865F2] px-4 py-2.5 text-sm font-black text-white hover:bg-[#4752C4]">Sign in with Discord</button>
      </div>
    );
  }

  if (isLoading || !detail) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const messages = [...detail.messages].reverse();

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 py-6">
      <button onClick={() => navigate("/support")} className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" /> Back to tickets</button>

      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black">{detail.subject}</h1>
            <p className="text-xs text-muted-foreground">#{detail.id} · <span className="capitalize">{detail.category}</span> · Opened {dayLabel(detail.createdAt)}</p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${detail.status === "closed" ? "border-zinc-600 text-zinc-400" : detail.status === "active" ? "border-primary/40 bg-primary/10 text-primary" : "border-yellow-400/40 bg-yellow-400/10 text-yellow-400"}`}>
            {detail.status === "closed" ? "Closed" : detail.status === "active" ? "Active" : "Waiting"}
          </span>
        </div>
        <div className="mt-3"><AdminCard admin={detail.assignedAdmin} /></div>
      </div>

      <div className="mb-4 space-y-2.5 rounded-2xl border border-border bg-[#0c1526] p-4" style={{ maxHeight: "55vh", overflowY: "auto" }}>
        {messages.map((m) => <Bubble key={m.id} m={m} mine={m.senderRole === "user"} />)}
        <div ref={listEndRef} />
      </div>

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      {detail.status !== "closed" ? (
        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim() || attachment) send.mutate(); } }}
              rows={2}
              placeholder="Write a message…"
              className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-border p-2.5 text-muted-foreground hover:border-primary/50">
              <ImageIcon className="h-4 w-4" />
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
            <button onClick={() => send.mutate()} disabled={send.isPending || (!text.trim() && !attachment)} className="rounded-lg bg-primary p-2.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          {attachment && (
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-muted p-2">
              {preview && <img src={preview} alt="" className="h-10 w-10 rounded object-cover" />}
              <span className="flex-1 truncate text-xs font-bold">{attachment.name}</span>
              <button onClick={() => { setAttachment(null); if (preview) URL.revokeObjectURL(preview); setPreview(""); }} className="text-muted-foreground hover:text-red-400"><X className="h-4 w-4" /></button>
            </div>
          )}
          <div className="mt-2 flex justify-end">
            <button onClick={() => { if (confirm("Close this ticket? You can rate the support you received.")) close.mutate(); }} className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-400/10">Close Ticket</button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 text-center">
          <p className="text-sm font-black text-primary">Ticket closed. Thanks for your patience!</p>
          {ratingMode && (
            <div className="mt-3">
              <p className="font-black">Rate Your Support Experience</p>
              <div className="mt-2 flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setStars(n)} className={`transition-transform hover:scale-125 ${n <= stars ? "text-yellow-400" : "text-zinc-600"}`}><Star className="h-6 w-6 fill-current" /></button>
                ))}
              </div>
              <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={1000} rows={2} placeholder="Tell us about your experience (optional)…" className="mt-3 w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary" />
              <button onClick={() => { if (stars >= 1 && stars <= 5) rate.mutate(); }} disabled={rate.isPending || stars === 0} className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {rate.isPending ? "Submitting…" : "Submit Rating"}
              </button>
              {ratedMsg && <p className="mt-2 text-sm font-bold text-primary">{ratedMsg}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}