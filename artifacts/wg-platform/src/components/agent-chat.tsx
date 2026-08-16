import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, CheckCheck, Send, X } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchConversationMessages,
  openAgentConversation,
  sendConversationMessage,
  type AgentChatMessage,
  type AgentChatParticipant,
  type AgentChatRole,
  type AgentChatThread,
} from "@/lib/agent-chat";

function formatMessageTime(iso: string): string {
  return format(new Date(iso), "HH:mm");
}

/** Conversation-list timestamps: Today → HH:mm, Yesterday → "Yesterday", else dd/MM. */
export function formatConversationTime(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "dd/MM/yyyy");
}

export function AgentChatAvatar({
  participant,
  size = "md",
}: {
  participant: AgentChatParticipant | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg" ? "h-14 w-14 text-xl" : size === "sm" ? "h-9 w-9 text-sm" : "h-11 w-11 text-base";

  if (participant?.avatarUrl) {
    return (
      <img
        src={participant.avatarUrl}
        alt=""
        className={cn("shrink-0 rounded-full object-cover", sizeClass)}
      />
    );
  }

  const label = participant ? (participant.displayName ?? participant.username).slice(0, 1).toUpperCase() : "?";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2b7bff] to-[#1e5fd0] font-bold text-white",
        sizeClass,
      )}
    >
      {label}
    </div>
  );
}

function ChatMessageBubble({ message, mine }: { message: AgentChatMessage; mine: boolean }) {
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-3 py-1.5 text-sm leading-snug shadow-sm",
          mine
            ? "rounded-br-md bg-gradient-to-br from-[#2b7bff] to-[#1e5fd0] text-white"
            : "rounded-bl-md border border-[#22314f] bg-[#16203a] text-[#eaf0ff]",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <div
          className={cn(
            "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
            mine ? "text-[#b9dbff]" : "text-[#6f82a5]",
          )}
        >
          <span>{formatMessageTime(message.sentAt)}</span>
          {mine &&
            (message.readAt ? (
              <CheckCheck className="h-3.5 w-3.5 text-[#8fd3ff]" aria-label="Read" />
            ) : (
              <Check className="h-3.5 w-3.5" aria-label="Sent" />
            ))}
        </div>
      </div>
    </div>
  );
}
const CHAT_POLL_MS = 3000;

/**
 * A full WhatsApp-style chat pane (header with online indicator, message
 * thread, and input row). Polls the conversation so both sides see new
 * messages and read receipts in real time.
 */
export function ChatPane({
  conversationId,
  onBack,
  headerAction,
  className,
}: {
  conversationId: number;
  onBack?: () => void;
  headerAction?: ReactNode;
  className?: string;
}) {
  const [thread, setThread] = useState<AgentChatThread | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;

    const load = async () => {
      try {
        const data = await fetchConversationMessages(conversationId);
        if (!active) return;
        setThread((current) =>
          current && current.conversationId !== data.conversationId ? current : data,
        );
      } catch {
        // Keep the last good thread on transient errors; polling retries.
      }
    };

    load();
    const timer = window.setInterval(load, CHAT_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [conversationId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread?.messages.length]);

  const participant = thread?.participant ?? null;
  const meRole: AgentChatRole = thread?.meRole ?? "player";

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    setSendError(false);
    try {
      await sendConversationMessage(conversationId, text);
      const data = await fetchConversationMessages(conversationId);
      setThread(data);
    } catch {
      setDraft(text);
      setSendError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col bg-[#0c1526]", className)}>
      {/* Chat header */}
      <div className="flex items-center gap-3 border-b border-[#1f2d4d] bg-[#101c33] px-4 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 rounded-full p-1.5 text-[#8fa3c8] transition-colors hover:bg-[#1a2a4d] hover:text-white"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <AgentChatAvatar participant={participant} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[#eaf0fb]">
            {participant ? participant.displayName ?? participant.username : "Agent"}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-[#8fa3c8]">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                participant?.online ? "bg-[#2ee6a8]" : "bg-[#4a5878]",
              )}
            />
            {participant?.online ? "Online" : "Offline"}
          </p>
        </div>
        {headerAction}
      </div>

      {/* Message thread */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-2">
          {thread && thread.messages.length === 0 && (
            <p className="mx-auto mt-10 max-w-[280px] rounded-xl border border-[#22304f] bg-[#0f1a30] px-4 py-3 text-center text-xs text-[#8fa3c8]">
              This is the beginning of your conversation. Say hello to{" "}
              {participant ? participant.displayName ?? participant.username : "the agent"}.
            </p>
          )}
          {thread?.messages.map((message) => (
            <ChatMessageBubble
              key={message.id}
              message={message}
              mine={message.senderRole === meRole}
            />
          ))}
        </div>
      </div>
      {/* Input row */}
      <div className="border-t border-[#1b2d4d] bg-[#0e1930] p-3">
        <div className="flex items-end gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
            maxLength={2000}
            placeholder="Type a message..."
            className="h-11 flex-1 rounded-xl border border-[#22345c] bg-[#0a1428] px-4 text-sm text-[#eef3ff] placeholder:text-[#5d7195] outline-none transition-colors focus:border-[#3b6fe0]"
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim() || sending}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2b7bff] to-[#1e5fd0] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        {sendError && (
          <p className="mt-1.5 text-[11px] text-[#ff9d9d]">Couldn't send the message. Tap send to retry.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Modal shown when a Transfer Market player card's "Chat with agent" button is
 * clicked. Opens (or reuses) the conversation with that player's agent.
 */
export function AgentChatDialog({
  agentPlayer,
  onClose,
}: {
  agentPlayer: {
    id: number;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  onClose: () => void;
}) {
  const { isLoggedIn, loginWithDiscord } = useAuth();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentPlayer || !isLoggedIn) {
      setConversationId(null);
      return;
    }
    let active = true;
    setOpening(true);
    setOpenError(null);
    openAgentConversation(agentPlayer.id)
      .then((conv) => {
        if (active) setConversationId(conv.id);
      })
      .catch((err: unknown) => {
        if (active) setOpenError(err instanceof Error ? err.message : "Failed to open chat");
      })
      .finally(() => {
        if (active) setOpening(false);
      });
    return () => {
      active = false;
    };
  }, [agentPlayer, isLoggedIn]);

  if (!agentPlayer) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden border border-[#22345c] bg-[#0b1526] shadow-2xl sm:h-[600px] sm:max-h-[80vh] sm:w-full sm:max-w-md sm:rounded-2xl">
        {!isLoggedIn ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#2b7bff] to-[#1e5fd0] text-xl font-bold text-white">
              {(agentPlayer.displayName ?? agentPlayer.username).slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-[#eaf0ff]">{agentPlayer.displayName ?? agentPlayer.username}</p>
              <p className="mt-1 text-xs text-[#8fa3c8]">Sign in to message {agentPlayer.username}'s agent</p>
            </div>
            <button
              type="button"
              onClick={loginWithDiscord}
              className="rounded-xl bg-gradient-to-br from-[#2b7bff] to-[#1e5fd0] px-5 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
            >
              Sign in with Discord
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#22345c] px-4 py-2 text-xs font-semibold text-[#dce5f8] transition-colors hover:bg-[#16203a]"
            >
              Close
            </button>
          </div>
        ) : opening ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#22345c] border-t-[#2b7bff]" />
          </div>
        ) : openError || !conversationId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-[#ff9d9d]">{openError ?? "Could not open the conversation"}</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#22345c] px-4 py-2 text-xs font-semibold text-[#dce5f8] transition-colors hover:bg-[#16203a]"
            >
              Close
            </button>
          </div>
        ) : (
          <ChatPane
            conversationId={conversationId}
            headerAction={
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[#22345c] p-1.5 text-[#8fa3c8] transition-colors hover:bg-[#1a2a4d] hover:text-white"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            }
          />
        )}
      </div>
    </div>
  );
}