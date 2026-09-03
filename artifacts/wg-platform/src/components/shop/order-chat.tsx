import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  Send,
  ShieldCheck,
  Trash2,
  FileText,
  Ban,
  Lock,
  MessageSquare,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { storageUrl } from "@/lib/api";
import { generateTranscriptPng } from "@/lib/transcript";
import {
  deleteOrderChat,
  fetchOrderChat,
  fetchTranscriptData,
  formatPrice,
  sendChatMessage,
  sendTranscriptImage,
  SHOP_ORDER_STATUS_META,
  type ShopChatMessage,
} from "@/lib/shop";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** One chat bubble — own messages sit on the right with the neon accent. */
function MessageBubble({ message, own }: { message: ShopChatMessage; own: boolean }) {
  return (
    <div className={`flex flex-col ${own ? "items-end" : "items-start"}`}>
      <div className="mb-0.5 flex items-center gap-1.5 px-1">
        <span
          className={`text-[10px] font-black uppercase tracking-widest ${
            message.senderRole === "manager" ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {message.senderRole === "manager" ? (
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> {message.senderName}
            </span>
          ) : (
            message.senderName
          )}
        </span>
        <span className="text-[10px] text-muted-foreground/70">{formatTime(message.createdAt)}</span>
      </div>
      <div
        className={`max-w-[85%] rounded-2xl border px-3.5 py-2.5 text-sm ${
          own
            ? "rounded-br-sm border-primary/40 bg-primary/15 text-foreground"
            : "rounded-bl-sm border-border bg-card text-foreground"
        }`}
      >
        {message.imagePath ? (
          <div className="space-y-2">
            <a href={storageUrl(message.imagePath)} target="_blank" rel="noreferrer">
              <img
                src={storageUrl(message.imagePath)}
                alt="Order transcript"
                className="max-h-72 w-full rounded-lg border border-border object-contain"
              />
            </a>
            <a
              href={storageUrl(message.imagePath)}
              download={`wg-shop-transcript-order-${message.chatId}.png`}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-primary transition-colors hover:bg-primary/20"
              data-testid="link-download-transcript"
            >
              <Download className="h-3.5 w-3.5" /> Download Transcript PNG
            </a>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        )}
      </div>
    </div>
  );
}

/** Full-height status card used when the chat cannot be opened. */
function ChatStateCard({
  icon: Icon,
  title,
  description,
  backHref,
  backLabel,
  tone = "muted",
}: {
  icon: typeof MessageSquare;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  tone?: "muted" | "warning";
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <Icon className={`mx-auto h-12 w-12 ${tone === "warning" ? "text-yellow-400" : "text-muted-foreground/60"}`} />
        <h2 className="mt-3 text-lg font-black uppercase tracking-wide">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <Button asChild variant="outline" className="mt-5 font-bold">
          <Link href={backHref}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> {backLabel}
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Private order chat — shared by the customer (/shop/orders/:id/chat) and the
 * WG-SHOP Manager (/admin/shop/orders/:id/chat). The server decides the viewer
 * role and enforces access; the manager additionally gets the Transcript and
 * Close/Delete controls. Realtime via reliable 3s polling (no WebSocket in
 * this architecture).
 */
export function OrderChat({ orderId, viewer }: { orderId: number; viewer: "customer" | "manager" }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryKey = ["shop", "order-chat", orderId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchOrderChat(orderId),
    refetchInterval: 3000,
    retry: false,
  });

  const send = useMutation({
    mutationFn: () => sendChatMessage(orderId, draft.trim()),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey });
    },
    onError: (err: Error) =>
      toast({ title: "Message not sent", description: err.message, variant: "destructive" }),
  });

  // Generate the transcript PNG from real order data and post it to the chat
  // as an image message. The Aqoonsi (Account No) is only included for
  // eFootball orders and only inside the generated image.
  const transcript = useMutation({
    mutationFn: async () => {
      const info = await fetchTranscriptData(orderId);
      const dataUrl = await generateTranscriptPng({
        fullName: info.order.buyerName,
        phone: info.order.buyerPhone ?? "—",
        accountNo: info.order.category === "efootball" ? (info.product?.aqoonsiId ?? null) : null,
        discord: info.order.buyerDiscord ?? info.order.buyerContact,
        price: formatPrice(info.order.priceCents),
        orderId: `#WG-${info.order.id}`,
        productName: info.order.productTitle,
        date: new Date(info.order.createdAt).toLocaleDateString(),
        status: info.order.status,
      });
      return sendTranscriptImage(orderId, dataUrl);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Transcript sent to the customer ✓" });
    },
    onError: (err: Error) =>
      toast({ title: "Unable to generate transcript.", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: () => deleteOrderChat(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["manager-shop-orders"] });
      qc.invalidateQueries({ queryKey: ["manager-shop-chats"] });
      toast({ title: "Chat closed and deleted" });
      setConfirmDelete(false);
    },
    onError: (err: Error) =>
      toast({ title: "Unable to close the chat.", description: err.message, variant: "destructive" }),
  });

  const messages = data?.messages ?? [];
  const chatOpen = data?.chat.status === "open";

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const errorMessage = error instanceof Error ? error.message : "";
  const backHref = viewer === "manager" ? "/admin/shop/orders" : "/shop/orders";
  const backLabel = viewer === "manager" ? "Back to Orders" : "Back to My Orders";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading chat…
      </div>
    );
  }

  if (error && errorMessage.includes("Processing")) {
    return (
      <ChatStateCard
        icon={Lock}
        title="Chat not open yet"
        description="The private order chat opens as soon as the WG-SHOP Manager moves your order to Processing."
        backHref={backHref}
        backLabel={backLabel}
      />
    );
  }
  if (error && (errorMessage.includes("closed and deleted") || errorMessage.includes("no longer active"))) {
    return (
      <ChatStateCard
        icon={Ban}
        title="Chat closed & deleted"
        description="The WG-SHOP Manager closed and permanently deleted this conversation. Your order record is untouched."
        backHref={backHref}
        backLabel={backLabel}
        tone="warning"
      />
    );
  }
  if (error && (errorMessage.includes("access") || errorMessage.includes("not found"))) {
    return (
      <ChatStateCard
        icon={Lock}
        title="Chat unavailable"
        description={errorMessage}
        backHref={backHref}
        backLabel={backLabel}
      />
    );
  }
  if (error || !data) {
    return (
      <ChatStateCard
        icon={MessageSquare}
        title="Unable to open order chat."
        description={errorMessage || "Please try again in a moment."}
        backHref={backHref}
        backLabel={backLabel}
      />
    );
  }

  const { order, chat } = data;
  const statusMeta = SHOP_ORDER_STATUS_META[order.status] ?? SHOP_ORDER_STATUS_META.pending;
  const isOwn = (m: ShopChatMessage) =>
    viewer === "manager" ? m.senderRole === "manager" : m.senderRole === "customer";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Header: order summary ── */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0">
            <Link href={backHref} aria-label={backLabel}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Order Chat #WG-{order.id}
            </p>
            <h1 className="truncate text-lg font-black uppercase tracking-wide">{order.productTitle}</h1>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${statusMeta.className}`}
          >
            {statusMeta.label}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          {viewer === "manager" ? (
            <span>
              Customer: <span className="font-bold text-foreground">{order.buyerName}</span>
            </span>
          ) : null}
          <span>
            Price: <span className="font-black text-primary">{formatPrice(order.priceCents)}</span>
          </span>
          <span>
            Discord:{" "}
            <span className="font-bold text-foreground">{order.buyerDiscord ?? order.buyerContact}</span>
          </span>
          {viewer === "manager" && order.buyerPhone ? (
            <span>
              Phone: <span className="font-bold text-foreground">{order.buyerPhone}</span>
            </span>
          ) : null}
        </div>

        {viewer === "manager" ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
            <Button
              size="sm"
              className="font-black uppercase tracking-wide"
              onClick={() => transcript.mutate()}
              disabled={transcript.isPending || !chatOpen}
              data-testid="button-transcript"
            >
              {transcript.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-1.5 h-4 w-4" />
              )}
              Transcript
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="font-black uppercase tracking-wide"
              onClick={() => setConfirmDelete(true)}
              disabled={remove.isPending || !chatOpen}
              data-testid="button-close-delete"
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Close / Delete
            </Button>
          </div>
        ) : null}
      </div>

      {/* ── Messages ── */}
      <div
        ref={scrollRef}
        className="mt-4 flex h-[55vh] min-h-[360px] flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-background/40 p-4"
        data-testid="order-chat-messages"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
            No messages yet — say hello! This chat is private between the customer and the WG-SHOP team.
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} own={isOwn(m)} />)
        )}
      </div>

      {/* ── Composer ── */}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() && !send.isPending && chatOpen) send.mutate();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type your message…"
          disabled={!chatOpen || send.isPending}
          maxLength={2000}
          data-testid="input-chat-message"
        />
        <Button
          type="submit"
          className="font-black uppercase tracking-wide"
          disabled={!chatOpen || send.isPending || !draft.trim()}
          data-testid="button-send-message"
        >
          {send.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
          Send
        </Button>
      </form>

      {/* ── Close / Delete confirmation (manager only) ── */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md" data-testid="dialog-close-chat">
          <DialogHeader>
            <DialogTitle>Close and delete this chat?</DialogTitle>
            <DialogDescription>
              This permanently deletes every message in Order Chat #WG-{order.id}. The order, product and
              customer records are kept — only the conversation is removed. Neither side can reopen it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="font-black uppercase tracking-wide"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              data-testid="button-confirm-close-chat"
            >
              {remove.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Close &amp; Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



