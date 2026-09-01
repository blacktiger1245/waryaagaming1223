import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Inbox, Send, Users, Loader2, UserCircle2, MessageSquare, ArrowLeft, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { storageUrl } from "@/lib/api";
import {
  social,
  type InboxMessage,
  type SentMessage,
  type TeamChatMessage,
} from "@/lib/social";

type Tab = "inbox" | "sent" | "team";

export default function MessagesPage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("inbox");
  const [activeThread, setActiveThread] = useState<number | null>(null);

  // Support /messages?to=<playerId> — opens a DM thread directly (Message button on profiles)
  const [search] = useLocation();
  const toParam = useMemo(() => {
    const q = search.split("?")[1];
    if (!q) return null;
    const v = new URLSearchParams(q).get("to");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [search]);
  useEffect(() => {
    if (toParam != null) {
      setActiveThread(toParam);
      setTab("inbox");
    }
  }, [toParam]);

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <MessageSquare className="w-14 h-14 mx-auto opacity-20 mb-4" />
        <p className="text-muted-foreground font-bold">Log in to see your messages.</p>
        <Button className="mt-4" asChild><Link href="/login">Log in</Link></Button>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof Inbox }[] = [
    { id: "inbox", label: "Inbox", icon: Inbox },
    { id: "sent", label: "Sent", icon: Send },
    { id: "team", label: "Team Chat", icon: Users },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-black mb-1">Messages</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Direct messages with other players and your team chat.
      </p>

      {activeThread != null ? (
        <ThreadView partnerId={activeThread} onBack={() => setActiveThread(null)} />
      ) : (
        <>
          <div className="flex gap-1 mb-6 border-b border-border">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {tab === "inbox" && <InboxTab onOpenThread={setActiveThread} />}
          {tab === "sent" && <SentTab onOpenThread={setActiveThread} />}
          {tab === "team" && <TeamChatTab myId={user?.id ?? 0} />}
        </>
      )}
    </div>
  );
}

function Avatar({ url, size = "w-10 h-10" }: { url: string | null; size?: string }) {
  return (
    <div className={`${size} rounded-full bg-muted border border-border overflow-hidden flex items-center justify-center flex-shrink-0`}>
      {url
        ? <img src={storageUrl(url) ?? url} alt="" className="w-full h-full object-cover" />
        : <UserCircle2 className="w-5 h-5 text-muted-foreground" />}
    </div>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Inbox ─────────────────────────────────────────────────────────────────────
function InboxTab({ onOpenThread }: { onOpenThread: (id: number) => void }) {
  const { data, isLoading } = useQuery<InboxMessage[]>({
    queryKey: ["messages", "inbox"],
    queryFn: social.inbox,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const msgs = data ?? [];
  if (msgs.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No messages yet. Visit a player profile to send one.</p>;
  }

  return (
    <ul className="space-y-2">
      {msgs.map((m) => (
        <li key={m.id}>
          <button
            onClick={() => onOpenThread(m.partnerId)}
            className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-primary/40 transition-colors"
          >
            <Avatar url={m.partner.avatarUrl} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm truncate">{m.partner.displayName ?? m.partner.username}</span>
                <span className="text-[11px] text-muted-foreground ml-auto">{timeAgo(m.createdAt)}</span>
              </div>
              <p className="text-sm text-muted-foreground truncate">{m.content}</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Sent ──────────────────────────────────────────────────────────────────────
function SentTab({ onOpenThread }: { onOpenThread: (id: number) => void }) {
  const { data, isLoading } = useQuery<SentMessage[]>({
    queryKey: ["messages", "sent"],
    queryFn: social.sent,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const msgs = data ?? [];
  if (msgs.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">You haven't sent any messages yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {msgs.map((m) => (
        <li key={m.id}>
          <button
            onClick={() => onOpenThread(m.partnerId)}
            className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-primary/40 transition-colors"
          >
            <Avatar url={m.partner.avatarUrl} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm truncate">To: {m.partner.displayName ?? m.partner.username}</span>
                <span className="text-[11px] text-muted-foreground ml-auto">{timeAgo(m.createdAt)}</span>
              </div>
              <p className="text-sm text-muted-foreground truncate">{m.content}</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Conversation thread ───────────────────────────────────────────────────────
function ThreadView({ partnerId, onBack }: { partnerId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: thread, isLoading } = useQuery({
    queryKey: ["messages", "thread", partnerId],
    queryFn: () => social.thread(partnerId),
    refetchInterval: 5000,
  });

  const send = useMutation({
    mutationFn: () => social.sendMessage(partnerId, draft),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["messages", "thread", partnerId] });
      qc.invalidateQueries({ queryKey: ["messages", "sent"] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.length]);

  return (
    <div className="flex flex-col h-[70vh] rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 px-2">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <MessageSquare className="w-4 h-4 text-primary" />
        <span className="font-bold text-sm">Conversation</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {(thread ?? []).map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                m.mine
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted rounded-bl-sm"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
              <p className={`text-[10px] mt-1 ${m.mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {timeAgo(m.createdAt)}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex gap-2 p-3 border-t border-border"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) send.mutate();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          maxLength={2000}
        />
        <Button type="submit" disabled={!draft.trim() || send.isPending} className="gap-2">
          {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </Button>
      </form>
      {send.isError && <p className="px-4 pb-2 text-xs text-destructive">{(send.error as Error).message}</p>}
    </div>
  );
}

// ── Team chat (members only) ──────────────────────────────────────────────────
function TeamChatTab({ myId }: { myId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [teamId, setTeamId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Find the team the logged-in player belongs to
  const { data: myTeams = [], isLoading: teamsLoading } = useQuery<any[]>({
    queryKey: ["my-teams", myId],
    queryFn: async () => {
      const r = await fetch(`/api/players/${myId}`, { credentials: "include" });
      if (!r.ok) return [];
      const p = await r.json();
      return p.teamId ? [{ id: p.teamId, name: p.teamName ?? `Team ${p.teamId}` }] : [];
    },
    enabled: myId > 0,
  });

  useEffect(() => {
    if (myTeams.length > 0 && teamId == null) setTeamId(myTeams[0].id);
  }, [myTeams, teamId]);

  const { data: messages = [], isLoading: chatLoading, error: chatError } = useQuery<TeamChatMessage[]>({
    queryKey: ["team-chat", teamId],
    queryFn: () => social.teamChat(teamId!),
    enabled: teamId != null,
    refetchInterval: 5000,
    retry: false,
  });

  useEffect(() => {
    setError(chatError ? (chatError as Error).message : "");
  }, [chatError]);

  const send = useMutation({
    mutationFn: () => social.sendTeamChat(teamId!, draft),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["team-chat", teamId] });
    },
    onError: (e: Error) => toast({ title: "Failed to send", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (teamsLoading || myId === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  }

  if (myTeams.length === 0) {
    return (
      <div className="py-12 text-center">
        <Shield className="w-12 h-12 mx-auto opacity-20 mb-3" />
        <p className="text-sm text-muted-foreground">You're not in a team yet — team chat unlocks when you join one.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[70vh] rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <Shield className="w-4 h-4 text-primary" />
        <span className="font-bold text-sm">Team Chat</span>
        {myTeams.length > 1 && (
          <select
            value={teamId ?? ""}
            onChange={(e) => setTeamId(Number(e.target.value))}
            className="ml-auto rounded-lg border border-border bg-background px-2 py-1 text-xs"
          >
            {myTeams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {chatLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!chatLoading && error && (
          <p className="text-sm text-destructive text-center py-8">{error}</p>
        )}
        {!chatLoading && !error && messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No team messages yet. Say something to your squad!
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.mine ? "justify-end" : "justify-start"}`}>
            {!m.mine && <Avatar url={m.sender.avatarUrl} size="w-8 h-8" />}
            <div className={`max-w-[75%] ${m.mine ? "items-end" : "items-start"} flex flex-col`}>
              {!m.mine && (
                <Link href={`/players/${m.senderId}`} className="text-[11px] font-bold text-primary hover:underline">
                  {m.sender.displayName ?? m.sender.username}
                </Link>
              )}
              <div
                className={`rounded-2xl px-4 py-2 text-sm ${
                  m.mine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted rounded-bl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <p className={`text-[10px] mt-1 ${m.mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {timeAgo(m.createdAt)}
                </p>
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex gap-2 p-3 border-t border-border"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) send.mutate();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message your team…"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          maxLength={1000}
        />
        <Button type="submit" disabled={!draft.trim() || send.isPending} className="gap-2">
          {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </Button>
      </form>
    </div>
  );
}