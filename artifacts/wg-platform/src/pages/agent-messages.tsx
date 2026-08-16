import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchAgentInbox,
  type AgentChatConversation,
} from "@/lib/agent-chat";
import {
  AgentChatAvatar,
  ChatPane,
  formatConversationTime,
} from "@/components/agent-chat";

const INBOX_POLL_MS = 4000;

function participantName(conversation: AgentChatConversation): string {
  const participant = conversation.player;
  return participant ? participant.displayName ?? participant.username : "Player";
}

export default function AgentMessagesPage() {
  const { isLoggedIn, loginWithDiscord } = useAuth();
  const [conversations, setConversations] = useState<AgentChatConversation[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchAgentInbox();
      setConversations(data.conversations);
      // If the selected conversation disappears (deleted), clear the selection.
      setSelectedId((current) =>
        current !== null && !data.conversations.some((c) => c.id === current) ? null : current,
      );
    } catch {
      // Transient errors keep the last good list; the interval retries.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    refresh();
    const timer = window.setInterval(refresh, INBOX_POLL_MS);
    return () => window.clearInterval(timer);
  }, [isLoggedIn, refresh]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) => {
      const participant = conversation.player;
      if (!participant) return false;
      return [participant.displayName, participant.username]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [conversations, search]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, conversation) => sum + conversation.unreadByAgent, 0),
    [conversations],
  );

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const chatOpen = Boolean(selected);

  const following = conversations.slice(0, 8);

  if (!isLoggedIn) {
    return (
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#0b1120] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#22304f] bg-[#0f1a30] p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#16223d] text-[#4e6da8]">
            <MessageCircle className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-lg font-extrabold text-[#eaf0fb]">Agent Messages</h1>
          <p className="mt-2 text-xs leading-relaxed text-[#8fa3c8]">
            Sign in to see conversations and messages from players who contacted you on the
            Transfer Market.
          </p>
          <button
            type="button"
            onClick={loginWithDiscord}
            className="mt-6 w-full rounded-xl bg-gradient-to-br from-[#2b7bff] to-[#1e5fd0] px-5 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
          >
            Sign in with Discord
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#0b1120] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-5">
          <h1 className="text-3xl font-extrabold tracking-[-0.04em] text-[#e7ecf7] sm:text-4xl">
            Agent <span className="text-[#4d8dff]">Messages</span>
          </h1>
          <p className="mt-2 text-sm text-[#8fa3c8]">
            Every conversation with a player who wants to know more about your listed players.
          </p>
        </header>

        <div className="overflow-hidden rounded-2xl border border-[#22304f] bg-[#0d1626] shadow-2xl lg:grid lg:h-[660px] lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* ── Conversation list ─────────────────────────────────────────── */}
          <aside
            className={cn(
              "flex-col border-[#1e2b49] bg-[#0e1930] lg:flex lg:border-r",
              chatOpen ? "hidden" : "flex",
            )}
          >
            {/* Inbox header + search */}
            <div className="border-b border-[#1e2b49] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-[#eaf0fb]">Agent Inbox</h2>
                {totalUnread > 0 && (
                  <span className="rounded-full bg-gradient-to-br from-[#2b7bff] to-[#1e5fd0] px-2 py-0.5 text-[10px] font-bold text-white">
                    {totalUnread} new
                  </span>
                )}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5d7195]" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search conversations..."
                  className="h-9 w-full rounded-xl border border-[#22345c] bg-[#0a1428] pl-9 pr-3 text-xs text-[#eef3ff] placeholder:text-[#5d7195] outline-none transition-colors focus:border-[#3b6fe0]"
                />
              </div>
            </div>

            {/* Following */}
            <div className="border-b border-[#1e2b49] px-4 pb-3 pt-4">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#5d7195]">
                Following
              </h3>
              {following.length === 0 ? (
                <p className="text-[11px] text-[#6f82a5]">Players you follow will appear here.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {following.map((conversation) => {
                    const participant = conversation.player;
                    if (!participant) return null;
                    const active = selectedId === conversation.id;
                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => setSelectedId(conversation.id)}
                        className={cn(
                          "flex w-[72px] shrink-0 flex-col items-center gap-1 transition-opacity hover:opacity-80",
                          active ? "opacity-100" : "opacity-90",
                        )}
                      >
                        <div className="relative">
                          <AgentChatAvatar participant={participant} size="sm" />
                          <span
                            className={cn(
                              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0e1930]",
                              participant.online ? "bg-[#2ee6a8]" : "bg-[#4a5878]",
                            )}
                          />
                        </div>
                        <span className="w-full truncate text-center text-[10px] font-semibold text-[#aebfe2]">
                          {participant.displayName ?? participant.username}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
{/* Conversation list */}
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading ? (
                <p className="px-3 py-8 text-center text-xs text-[#6f82a5]">Loading messages…</p>
              ) : filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-[#6f82a5]">
                  {search
                    ? "No conversations match your search."
                    : "No messages yet. Players who click “Chat with agent” on your Transfer Market listing will appear here."}
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {filtered.map((conversation) => {
                    const participant = conversation.player;
                    const active = selectedId === conversation.id;
                    const last = conversation.lastMessage;
                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => setSelectedId(conversation.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                          active ? "bg-[#1a2a4d]" : "hover:bg-[#14203c]",
                        )}
                      >
                        <div className="relative shrink-0">
                          <AgentChatAvatar participant={participant} size="md" />
                          <span
                            className={cn(
                              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0e1930]",
                              participant?.online ? "bg-[#2ee6a8]" : "bg-[#4a5878]",
                            )}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-sm font-bold text-[#eaf0fb]">
                              {participantName(conversation)}
                            </p>
                            <span className="shrink-0 text-[10px] text-[#5d7195]">
                              {conversation.updatedAt
                                ? formatConversationTime(conversation.updatedAt)
                                : ""}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-[#8fa3c8]">
                              {last ? last.text : "No messages yet"}
                            </p>
                            {conversation.unreadByAgent > 0 && (
                              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2b7bff] to-[#1e5fd0] px-1.5 text-[10px] font-bold text-white">
                                {conversation.unreadByAgent}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          {/* ── Chat pane ─────────────────────────────────────────────────── */}
          <section
            className={cn(
              "min-h-0 flex-col lg:flex",
              chatOpen ? "flex" : "hidden",
            )}
          >
            {selected ? (
              <ChatPane
                conversationId={selected.id}
                onBack={() => setSelectedId(null)}
                className="rounded-t-2xl lg:rounded-none"
              />
            ) : (
              <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center gap-3 bg-[#0c1526] p-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#16223d] text-[#4e6da8]">
                  <MessageCircle className="h-7 w-7" />
                </div>
                <p className="text-sm font-bold text-[#dbe6fa]">Select a conversation</p>
                <p className="max-w-[280px] text-xs leading-relaxed text-[#7c90b5]">
                  Choose a player from your messages to open the chat and reply as their agent.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}