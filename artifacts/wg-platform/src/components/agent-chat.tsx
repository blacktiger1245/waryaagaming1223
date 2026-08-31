import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, CheckCheck, Send, UserPlus, X } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchConversationMessages,
  fetchAgentChannelContext,
  openAgentConversation,
  respondToInvite,
  sendConversationMessage,
  sendTeamInvite,
  parseWgSystemMessage,
  type AgentChannelContext,
  type AgentChatMessage,
  type AgentChatParticipant,
  type AgentChatRole,
  type AgentChatThread,
  type WgInvitePayload,
  type WgInviteResultPayload,
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
 * Invite card rendered inside a team invitation message. On the invited
 * player's (agent) side it shows Agree / Reject while still pending; on the
 * President/Coach side (and once resolved) it shows the invitation status.
 */
function InviteCard({
  invite,
  messageId,
  meRole,
  pending,
  busy,
  onAgree,
  onReject,
}: {
  invite: WgInvitePayload;
  messageId: number;
  meRole: AgentChatRole;
  pending: boolean;
  busy: boolean;
  onAgree?: (inviteId: number) => void;
  onReject?: (inviteId: number) => void;
}) {
  const isAgentSide = meRole === "agent";
  return (
    <div className="max-w-[82%] rounded-2xl border border-[#2a3f6b] bg-gradient-to-br from-[#16203a] to-[#101a30] px-3 py-2.5 text-sm shadow-sm">
      <div className="mb-1.5 flex items-center gap-1.5">
        <UserPlus className="h-4 w-4 text-[#2b7bff]" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#8fa3c8]">Team Invitation</span>
      </div>
      {pending ? (
        <>
          <p className="text-[#eaf0ff]">
            Do you agree to join my team <span className="font-bold text-[#5aa2ff]">{invite.teamName}</span>?
          </p>
          <p className="mt-1 text-xs text-[#ffd66e]">
            Contract offer: <span className="font-bold">{invite.seasons ?? 1} season{(invite.seasons ?? 1) > 1 ? "s" : ""}</span> — the
            contract expires after that many seasons.
          </p>
          {isAgentSide ? (
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onAgree?.(invite.inviteId)}
                className="flex-1 rounded-lg bg-gradient-to-br from-[#2ee6a8] to-[#19b879] py-1.5 text-xs font-bold text-[#06231a] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Agree
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onReject?.(invite.inviteId)}
                className="flex-1 rounded-lg border border-[#ff5b6a]/40 bg-[#3a1620] py-1.5 text-xs font-bold text-[#ff8f9c] transition-opacity hover:bg-[#4a1c28] disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-[#8fa3c8]">Waiting for the player to respond...</p>
          )}
        </>
      ) : isAgentSide ? (
        <p className="text-xs text-[#8fa3c8]">This invitation has already been answered.</p>
      ) : (
        <p className="text-xs text-[#8fa3c8]">Invitation sent — waiting for the agent to respond.</p>
      )}
    </div>
  );
}

/** Announcement bubble shown when an invitation is accepted or rejected. */
function ResultCard({ result, meRole }: { result: WgInviteResultPayload; meRole: AgentChatRole }) {
  const iAmAgent = meRole === "agent";
  let title: string;
  let body: string;
  let tone: string;
  if (iAmAgent) {
    if (result.accepted) {
      title = "Congratulations!";
      body = `You joined the team ${result.teamName}.`;
      tone = "from-[#123822] to-[#0d2a18] border-[#1f7a4a]";
    } else {
      title = "Invitation declined";
      body = `You declined the invitation to ${result.teamName}.`;
      tone = "from-[#3a1620] to-[#2a1018] border-[#7a2430]";
    }
  } else {
    if (result.accepted) {
      title = "Great news!";
      body = `The agent ${result.agentName} accepted to join your team.`;
      tone = "from-[#123822] to-[#0d2a1b] border-[#1f7a4a]";
    } else {
      title = "Invitation declined";
      body = `The agent ${result.agentName} rejected to join your team.`;
      tone = "from-[#3a1620] to-[#2a1018] border-[#7a2430]";
    }
  }
  return (
    <div className={`max-w-[82%] rounded-2xl border bg-gradient-to-br px-4 py-2.5 text-sm shadow-sm ${tone}`}>
      <p className="font-bold text-[#eaf0fb]">{title}</p>
      <p className="mt-0.5 text-xs text-[#c7d4ee]">{body}</p>
    </div>
  );
}


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
  const [channel, setChannel] = useState<AgentChannelContext | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteSeasons, setInviteSeasons] = useState<1 | 2>(1);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch the current user's leadership context (for the invite button).
  useEffect(() => {
    let active = true;
    fetchAgentChannelContext()
      .then((ctx) => active && setChannel(ctx))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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

  const messages = thread?.messages ?? [];
  // Invite ids already answered by a result message in this thread.
  const resolvedInviteIds = new Set<number>();
  for (const m of messages) {
    const sys = parseWgSystemMessage(m.text);
    if (sys?.kind === "wg_invite_result") resolvedInviteIds.add(sys.inviteId);
  }
  const canInvite = meRole === "player" && !!channel?.isLeader && !!channel.teamId;

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

  const sendInvite = async () => {
    if (inviting || !channel?.teamId) return;
    setInviting(true);
    setInviteError(null);
    try {
      await sendTeamInvite(conversationId, inviteSeasons);
      const data = await fetchConversationMessages(conversationId);
      setThread(data);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Could not send the invitation");
    } finally {
      setInviting(false);
    }
  };

  const answerInvite = async (inviteId: number, decision: "accept" | "reject") => {
    if (respondingId != null) return;
    setRespondingId(inviteId);
    setInviteError(null);
    try {
      await respondToInvite(conversationId, inviteId, decision);
      const data = await fetchConversationMessages(conversationId);
      setThread(data);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Could not respond to the invitation");
    } finally {
      setRespondingId(null);
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
          {messages.map((message) => {
            const sys = parseWgSystemMessage(message.text);
            if (!sys) {
              return (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  mine={message.senderRole === meRole}
                />
              );
            }
            if (sys.kind === "wg_invite") {
              return (
                <div key={message.id} className="flex justify-start">
                  <InviteCard
                    invite={sys}
                    messageId={message.id}
                    meRole={meRole}
                    pending={!resolvedInviteIds.has(sys.inviteId)}
                    busy={respondingId === sys.inviteId}
                    onAgree={(id) => answerInvite(id, "accept")}
                    onReject={(id) => answerInvite(id, "reject")}
                  />
                </div>
              );
            }
            return <ResultCard key={message.id} result={sys} meRole={meRole} />;
          })}
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
          {canInvite && (
            <select
              value={inviteSeasons}
              onChange={(event) => setInviteSeasons(Number(event.target.value) === 2 ? 2 : 1)}
              disabled={inviting || sending}
              title="Contract length (seasons) for the invitation"
              aria-label="Contract length in seasons"
              className="h-11 shrink-0 rounded-xl border border-[#2a3f6b] bg-[#14223f] px-2 text-xs font-bold text-[#8fc0ff] outline-none transition-colors hover:bg-[#1a2c50] disabled:opacity-40"
            >
              <option value={1}>1 season</option>
              <option value={2}>2 seasons</option>
            </select>
          )}
          {canInvite && (
            <button
              type="button"
              onClick={sendInvite}
              disabled={inviting || sending}
              title={`Invite to join ${channel?.teamName ?? "my team"} (${inviteSeasons} season contract)`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#2a3f6b] bg-[#14223f] text-[#5aa2ff] transition-colors hover:bg-[#1a2c50] hover:text-[#8fc0ff] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Invite to join my team"
            >
              <UserPlus className="h-5 w-5" />
            </button>
          )}
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
        {inviteError && (
          <p className="mt-1.5 text-[11px] text-[#ff9d9d]">{inviteError}</p>
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
  const [channel, setChannel] = useState<AgentChannelContext | null>(null);

  useEffect(() => {
    if (!agentPlayer || !isLoggedIn) {
      setConversationId(null);
      setChannel(null);
      return;
    }
    let active = true;
    setOpening(true);
    setOpenError(null);
    // Only a team President/Coach may chat with an agent. Resolve the caller's
    // leadership context first; otherwise show the gate embed instead.
    fetchAgentChannelContext()
      .then((ctx) => {
        if (!active) return;
        setChannel(ctx);
        if (!ctx.isLeader) {
          setOpening(false);
          return;
        }
        return openAgentConversation(agentPlayer.id).then((conv) => {
          if (active) setConversationId(conv.id);
        });
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
        ) : channel && !channel.isLeader ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2b7bff] to-[#1e5fd0] text-xl font-black text-white shadow-lg">
              WG
            </div>
            <div>
              <p className="text-sm font-bold text-[#eaf0ff]">Agent Chat is for team leaders</p>
              <p className="mt-1.5 text-xs leading-relaxed text-[#8fa3c8]">
                You are not a President or Coach in a team, so you cannot start a
                conversation with the agent. Join or lead a team to enable this.
              </p>
            </div>
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