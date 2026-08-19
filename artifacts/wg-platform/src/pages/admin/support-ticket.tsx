import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Loader2, Send, Image as ImageIcon, ArrowLeft, CheckCheck, X, Users } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { supportAdmin, type SupportMessage, type Attachment } from "@/lib/support";
import { storageUrl } from "@/lib/api";

function clock(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
        <p className={`mt-1 text-right text-[10px] ${mine ? "text-primary-foreground/70" : "text-white/40"}`}>{clock(m.createdAt)} <span className="ml-1 uppercase">{m.senderRole}</span></p>
      </div>
    </div>
  );
}

export default function AdminSupportTicketPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { admin } = useAdminAuth();
  const qc = useQueryClient();
  const ticketId = Number(id);
  const listEndRef = useRef<HTMLDivElement>(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["admin-support-ticket", ticketId],
    queryFn: () => supportAdmin.get(ticketId),
    enabled: Number.isInteger(ticketId),
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (detail) supportAdmin.markRead(ticketId).catch(() => undefined);
  }, [detail?.id, detail?.messages?.length, ticketId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages?.length]);

  const { data: adminsList } = useQuery({
    queryKey: ["support-admins"],
    queryFn: supportAdmin.admins,
    enabled: detail?.isOwner,
  });
  const [reassignId, setReassignId] = useState<number | null>(null);

  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");

  const send = useMutation({
    mutationFn: () => supportAdmin.send(ticketId, { text, attachment }),
    onSuccess: () => {
      setText(""); setAttachment(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview("");
      qc.invalidateQueries({ queryKey: ["admin-support-ticket", ticketId] });
    },
    onError: (e: any) => setError(e.message),
  });

  const accept = useMutation({
    mutationFn: () => supportAdmin.accept(ticketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-support-ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-inbox"] });
    },
    onError: (e: any) => setError(e.message),
  });

  const close = useMutation({
    mutationFn: () => supportAdmin.close(ticketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-support-ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-inbox"] });
    },
    onError: (e: any) => setError(e.message),
  });

  const reassign = useMutation({
    mutationFn: (adminId: number) => supportAdmin.reassign(ticketId, adminId),
    onSuccess: () => {
      setReassignId(null);
      qc.invalidateQueries({ queryKey: ["admin-support-ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-inbox"] });
    },
    onError: (e: any) => setError(e.message),
  });

  async function pickFile(f: File | undefined) {
    setError("");
    if (!f) return;
    if (!f.type.startsWith("image/")) { setError("Only image attachments are supported."); return; }
    if (f.size > 10 * 1024 * 1024) { setError("Max attachment size is 10MB."); return; }
    try {
      const a = await (await import("@/lib/support")).uploadSupportAttachment(f);
      setAttachment(a);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(f));
    } catch (e: any) { setError(e.message); }
  }

  if (isLoading || !detail) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const messages = [...detail.messages].reverse();
  const canSend = detail.canManage && detail.status !== "closed";
  const canAccept = detail.status === "waiting" && !detail.assignedAdminId;

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 py-6">
      <button onClick={() => navigate("/admin/support")} className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" /> Back to inbox</button>

      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-black">{detail.subject}</h1>
            <p className="text-xs text-muted-foreground">#{detail.id} · {detail.user?.displayName ?? detail.user?.username ?? "Unknown"} · <span className="capitalize">{detail.category}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${detail.status === "closed" ? "border-zinc-600 text-zinc-400" : detail.status === "active" ? "border-primary/40 bg-primary/10 text-primary" : "border-yellow-400/40 bg-yellow-400/10 text-yellow-400"}`}>{detail.status}</span>
            {canAccept && (
              <button onClick={() => accept.mutate()} disabled={accept.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {accept.isPending ? "Accepting…" : "Accept Ticket"}
              </button>
            )}
            {detail.canManage && detail.status !== "closed" && (
              <button onClick={() => { if (confirm("Close this ticket?")) close.mutate(); }} disabled={close.isPending} className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-400/10 disabled:opacity-50">Close</button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            {detail.assignedAdmin ? (
              <div className="flex items-center gap-2.5">
                {detail.assignedAdmin.avatarUrl ? <img src={detail.assignedAdmin.avatarUrl} alt="" className="h-9 w-9 rounded-full" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-black text-primary">{(detail.assignedAdmin.displayName ?? detail.assignedAdmin.username)[0]?.toUpperCase()}</div>}
                <div>
                  <p className="text-sm font-black">🟢 {detail.assignedAdmin.displayName ?? detail.assignedAdmin.username}</p>
                  <p className="text-xs capitalize text-muted-foreground">{detail.assignedAdmin.role === "owner" ? "Owner" : "Support Admin"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm font-bold text-yellow-400">⏳ Waiting for Admin to accept</p>
            )}
          </div>
          {detail.isOwner && detail.status !== "closed" && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <select value={reassignId ?? ""} onChange={(e) => setReassignId(Number(e.target.value))} className="rounded-lg border border-border bg-muted px-2 py-1.5 text-xs outline-none focus:border-primary">
                <option value="">Reassign…</option>
                {(adminsList?.admins ?? []).map((a) => <option key={a.id} value={a.id}>{a.displayName ?? a.username} ({a.role})</option>)}
              </select>
              <button onClick={() => { if (reassignId) reassign.mutate(reassignId); }} disabled={!reassignId || reassign.isPending} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold hover:border-primary/50 disabled:opacity-40">Reassign</button>
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 space-y-2.5 rounded-2xl border border-border bg-[#0c1526] p-4" style={{ maxHeight: "55vh", overflowY: "auto" }}>
        {messages.map((m) => <Bubble key={m.id} m={m} mine={m.senderRole !== "user"} />)}
        <div ref={listEndRef} />
      </div>

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      {detail.status === "closed" ? (
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4 text-center text-sm text-zinc-300">This ticket is closed and read-only.</div>
      ) : canSend ? (
        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim() || attachment) send.mutate(); } }}
              rows={2}
              placeholder="Reply to the user…"
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
        </div>
      ) : (
        <div className="rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-4 text-center text-sm">
          <p className="font-bold text-yellow-400">This ticket is assigned to another admin.</p>
          <p className="mt-1 text-xs text-muted-foreground">Only the assigned admin or an Owner can reply here.</p>
        </div>
      )}
    </div>
  );
}