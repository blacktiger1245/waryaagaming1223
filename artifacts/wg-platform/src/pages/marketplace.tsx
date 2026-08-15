import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Shield,
  Star,
  Users,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

type Player = {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  rating: number | null;
  points: number | null;
  teamId: number | null;
  teamName?: string | null;
  marketValue?: number | null;
  isFreeAgent?: boolean;
  createdAt?: string;
};

type MarketTab = "all" | "free" | "contract" | "termination";
type ChatMessage = {
  id: string;
  from: "coach" | "free_agent";
  text: string;
  sentAt: string;
};

const CHAT_KEY = "wg-transfer-market-chat";

const tabs: { id: MarketTab; label: string }[] = [
  { id: "all", label: "All Players" },
  { id: "free", label: "Free Agents" },
  { id: "contract", label: "Under Contract" },
  { id: "termination", label: "Under Termination" },
];

function buildFreeAgentReply(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("trial") || normalized.includes("training")) {
    return "I’d be happy to trial for your club. When can we set up a call?";
  }

  if (normalized.includes("contract") || normalized.includes("offer")) {
    return "I’m open to a deal. Send the terms and I’ll review them with my team.";
  }

  if (normalized.includes("salary") || normalized.includes("wage")) {
    return "I’m flexible, but I’d like to understand the full package before moving forward.";
  }

  if (normalized.includes("fitness") || normalized.includes("condition")) {
    return "I’m in good shape and ready to join if the timing works for both sides.";
  }

  return "Sounds good. Let’s set up a quick call and talk through the move.";
}

function initials(player: Player) {
  return (player.displayName ?? player.username).slice(0, 1).toUpperCase();
}

function PlayerAvatar({ player }: { player: Player }) {
  return player.avatarUrl ? (
    <img
      src={player.avatarUrl}
      alt=""
      className="h-12 w-12 rounded-full border border-white/10 object-cover"
    />
  ) : (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#3478ed] text-lg font-bold text-white">
      {initials(player)}
    </div>
  );
}

function PlayerCard({
  player,
  onOpenChat,
}: {
  player: Player;
  onOpenChat: (player: Player) => void;
}) {
  const isFree = !player.teamId;
  const rating = Math.max(0, Math.min(5, Math.round((player.rating ?? 0) / 20)));

  return (
    <Link href={`/players/${player.id}`}>
      <motion.article
        whileHover={{ y: -2 }}
        className="group cursor-pointer rounded-lg border border-[#272930] bg-[#18191e] p-4 transition-colors hover:border-[#3d414a]"
      >
        <div className="flex items-center gap-3">
          <PlayerAvatar player={player} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-bold text-[#dfe3e9]">
                {player.displayName ?? player.username}
              </h2>
              {player.country && <span className="h-2 w-2 rounded-full bg-[#08d56e]" title={player.country} />}
            </div>
            <p className="truncate text-xs text-[#858b96]">@{player.username}</p>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-[#aeb4bd]">
              <Star className="h-3 w-3 fill-[#b7c0ca] text-[#b7c0ca]" />
              <span>{rating || "—"} / 5</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-[#c3c8d0]">
          <Shield className="h-4 w-4 text-[#d7dbe1]" />
          <span className="truncate">{isFree ? "Free Agent" : player.teamName ?? "Under Contract"}</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#858b96]">
          <span className="inline-block h-3 w-3 rounded-sm border border-[#69717b]" />
          {isFree ? "Available now" : "Contracted player"}
        </div>

        {isFree && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenChat(player);
            }}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#1d7b48] bg-[#0c2f21] px-2 text-xs font-bold text-[#cafaeb] transition-colors hover:border-[#2a9b63] hover:bg-[#123d2d]"
          >
            <MessageSquare className="h-4 w-4" />
            Chat with coach
          </button>
        )}

        <div className="mt-3 flex h-9 items-center justify-center gap-2 rounded-md border border-[#25272d] bg-[#101115] text-xs font-bold text-[#dce1e8] transition-colors group-hover:border-[#3a3e47]">
          View Profile <ArrowRight className="h-4 w-4" />
        </div>
      </motion.article>
    </Link>
  );
}

function ChatDialog({
  player,
  onClose,
}: {
  player: Player | null;
  onClose: () => void;
}) {
  const { isLoggedIn } = useAuth();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!player) return;

    const raw = window.localStorage.getItem(`${CHAT_KEY}:${player.id}`);
    const parsed: ChatMessage[] = raw ? JSON.parse(raw) : [
      {
        id: `welcome-${player.id}`,
        from: "free_agent",
        text: `Hi coach — I’m open to new opportunities. Tell me what you need from me.`,
        sentAt: new Date().toISOString(),
      },
    ];

    setMessages(parsed);
  }, [player]);

  useEffect(() => {
    if (!player) return;
    window.localStorage.setItem(`${CHAT_KEY}:${player.id}`, JSON.stringify(messages));
  }, [messages, player]);

  if (!player) return null;

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !isLoggedIn) return;

    const nextCoachMessage: ChatMessage = {
      id: `coach-${Date.now()}`,
      from: "coach",
      text,
      sentAt: new Date().toISOString(),
    };

    const nextMessages = [...messages, nextCoachMessage];
    setMessages(nextMessages);
    setDraft("");

    window.setTimeout(() => {
      const reply: ChatMessage = {
        id: `free-agent-${Date.now()}`,
        from: "free_agent",
        text: buildFreeAgentReply(text),
        sentAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, reply]);
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 md:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-[#30343c] bg-[#111216] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2a2d34] px-4 py-3">
          <div className="flex items-center gap-3">
            <PlayerAvatar player={player} />
            <div>
              <p className="text-sm font-bold text-[#ebeff5]">{player.displayName ?? player.username}</p>
              <p className="text-[11px] text-[#8e949d]">Free agent contact</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-[#30343c] p-2 text-[#b7bec7] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto px-4 py-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                message.from === "coach"
                  ? "ml-auto bg-[#00e86b] text-[#07150d]"
                  : "bg-[#1b1d23] text-[#edf1f6]"
              }`}
            >
              <p>{message.text}</p>
              <p className={`mt-1 text-[10px] ${message.from === "coach" ? "text-[#0c2d1b]" : "text-[#8e949d]"}`}>
                {new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-[#2a2d34] p-3">
          {!isLoggedIn ? (
            <p className="rounded-md border border-[#2c323b] bg-[#171a20] px-3 py-2 text-xs text-[#a3acb8]">
              Sign in to contact this free agent.
            </p>
          ) : (
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Send a message to the free agent..."
                className="h-10 border-[#2c323b] bg-[#171a20] text-sm text-[#edf1f6] placeholder:text-[#7b838b]"
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendMessage();
                }}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!draft.trim()}
                className="inline-flex h-10 items-center justify-center rounded-md bg-[#00e86b] px-3 text-sm font-bold text-[#07150d] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<MarketTab>("all");
  const [chatPlayer, setChatPlayer] = useState<Player | null>(null);
  const { data: allPlayers = [], isLoading: allLoading, refetch } = useQuery<Player[]>({
    queryKey: ["players", "marketplace-all"],
    queryFn: async () => {
      const res = await fetch("/api/players?limit=100");
      if (!res.ok) throw new Error("Failed to load players");
      return res.json();
    },
  });
  const { data: freeAgents = [], isLoading: freeLoading } = useQuery<Player[]>({
    queryKey: ["marketplace", "free-agents"],
    queryFn: async () => {
      const res = await fetch("/api/players/marketplace");
      if (!res.ok) throw new Error("Failed to load free agents");
      return res.json();
    },
  });

  const visiblePlayers = useMemo(() => {
    const source =
      activeTab === "free"
        ? freeAgents
        : activeTab === "contract"
          ? allPlayers.filter((player) => Boolean(player.teamId))
          : activeTab === "termination"
            ? []
            : allPlayers;
    const query = search.trim().toLowerCase();
    return source.filter((player) =>
      !query ||
      [player.displayName, player.username, player.country, player.teamName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [activeTab, allPlayers, freeAgents, search]);

  const recentTransfers = useMemo(
    () => allPlayers.filter((player) => player.teamId).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 4),
    [allPlayers],
  );
  const isLoading = allLoading || (activeTab === "free" && freeLoading);
  const tabCount = activeTab === "free" ? freeAgents.length : activeTab === "contract" ? allPlayers.filter((p) => p.teamId).length : allPlayers.length;

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#0f1014] px-4 py-8 text-[#e5e7eb] sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1120px]">
        <header className="mb-7">
          <h1 className="text-4xl font-extrabold tracking-[-0.04em] text-[#e7ebef] sm:text-5xl">
            Transfer <span className="text-[#00e86b]">Market</span>
          </h1>
          <p className="mt-3 text-sm text-[#8b929c] sm:text-base">
            Browse available players and contracted players
          </p>
        </header>

        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_274px]">
          <section className="min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#858b96]" />
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search players..."
                  className="h-9 border-[#272930] bg-[#111216] pl-10 text-xs text-[#dfe3e9] placeholder:text-[#777e89] focus-visible:ring-[#3a3e47]"
                />
              </div>
              <div className="flex shrink-0 overflow-x-auto rounded-md border border-[#272930] bg-[#20232a] p-0.5">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`whitespace-nowrap rounded-sm px-3 py-2 text-[11px] font-semibold transition-colors ${
                      activeTab === tab.id
                        ? "bg-[#101115] text-[#e7ebef] shadow-sm"
                        : "text-[#949ba5] hover:text-[#dfe3e9]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between text-xs text-[#858b96]">
              <span>
                Showing <strong className="text-[#b9c0c9]">{tabCount}</strong> of{" "}
                <strong className="text-[#b9c0c9]">{allPlayers.length || "—"}</strong> players
              </span>
              <button
                type="button"
                onClick={() => refetch()}
                className="flex items-center gap-2 text-[#9ca3ad] transition-colors hover:text-[#e7ebef]"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>

            {isLoading ? (
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((item) => <div key={item} className="h-44 animate-pulse rounded-lg border border-[#272930] bg-[#18191e]" />)}
              </div>
            ) : visiblePlayers.length === 0 ? (
              <div className="mt-8 rounded-lg border border-dashed border-[#30343c] bg-[#18191e] px-6 py-14 text-center">
                <Users className="mx-auto h-9 w-9 text-[#59606b]" />
                <p className="mt-3 text-sm font-semibold text-[#dfe3e9]">
                  {search ? "No matching players" : activeTab === "termination" ? "No players under termination" : "No players listed yet"}
                </p>
                <p className="mt-1 text-xs text-[#858b96]">Try another filter or search term.</p>
              </div>
            ) : (
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {visiblePlayers.map((player) => (
                  <PlayerCard key={player.id} player={player} onOpenChat={setChatPlayer} />
                ))}
              </div>
            )}
          </section>

          <aside className="h-fit rounded-lg border border-[#272930] bg-[#18191e] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#e1e5ea]">
                <ArrowUpRight className="h-4 w-4 text-[#00e86b]" /> Recent Transfers
              </h2>
              <button type="button" onClick={() => refetch()} aria-label="Refresh recent transfers" className="text-[#9ca3ad] hover:text-[#e7ebef]">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {recentTransfers.length === 0 ? (
                <p className="rounded-md border border-[#272930] px-3 py-8 text-center text-xs text-[#858b96]">No transfers to show yet.</p>
              ) : recentTransfers.map((player) => (
                <Link key={player.id} href={`/players/${player.id}`}>
                  <div className="flex items-center gap-3 rounded-md border border-[#292c33] px-3 py-3 transition-colors hover:border-[#414650]">
                    <PlayerAvatar player={player} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-[#dce1e8]">{player.displayName ?? player.username}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[#8d949e]">Under contract</p>
                      <p className="mt-1 truncate text-[10px] text-[#737a85]">→ {player.teamName ?? "New team"}</p>
                    </div>
                    <ArrowDownToLine className="h-4 w-4 shrink-0 text-[#b2bac4]" />
                  </div>
                </Link>
              ))}
            </div>
            <button type="button" className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-[#2b2f37] py-2 text-xs font-semibold text-[#aeb5be] hover:text-[#e7ebef]">
              View all transfers <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </aside>
        </div>
      </div>

      <ChatDialog player={chatPlayer} onClose={() => setChatPlayer(null)} />
    </main>
  );
}
