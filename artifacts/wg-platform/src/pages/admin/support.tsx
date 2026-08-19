import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, LifeBuoy, Bell, CheckCheck } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { supportAdmin, type AdminInboxTicket } from "@/lib/support";

const TABS = [
  { key: "new", label: "New", match: (t: AdminInboxTicket) => t.status === "waiting" && !t.assignedAdminId },
  { key: "waiting", label: "Waiting", match: (t: AdminInboxTicket) => t.status === "waiting" },
  { key: "mine", label: "My Active", match: (t: AdminInboxTicket) => t.status === "active" && !!t.assignedAdminId },
  { key: "closed", label: "Closed", match: (t: AdminInboxTicket) => t.status === "closed" },
  { key: "all", label: "All", match: () => true },
];

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

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; o.type = "sine";
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.start(); o.stop(ctx.currentTime + 0.25);
  } catch { /* audio unavailable */ }
}

export default function AdminSupportPage() {
  const qc = useQueryClient();
  const { admin } = useAdminAuth();
  const [tab, setTab] = useState("new");
  const [notifOpen, setNotifOpen] = useState(false);
  const [prevUnread, setPrevUnread] = useState(0);

  const { data: availability } = useQuery({ queryKey: ["support-availability"], queryFn: supportAdmin.availability, refetchInterval: 30_000 });
  const { data: badge } = useQuery({ queryKey: ["support-unread-badge"], queryFn: supportAdmin.unreadBadge, refetchInterval: 4000 });
  const { data: inbox, isLoading } = useQuery({ queryKey: ["support-inbox"], queryFn: supportAdmin.inbox, refetchInterval: 4000 });
  const { data: notifs } = useQuery({ queryKey: ["support-notifs"], queryFn: supportAdmin.notifications, refetchInterval: 5000, refetchIntervalInBackground: true });

  useEffect(() => {
    const t = setInterval(() => supportAdmin.heartbeat().catch(() => undefined), 20_000);
    supportAdmin.heartbeat().catch(() => undefined);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unread = badge?.unread ?? 0;
    if (unread > prevUnread && prevUnread >= 0) {
      beep();
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { new Notification("🔔 New support activity", { body: "A new ticket or reply needs attention." }); } catch { /* unsupported */ }
      }
    }
    setPrevUnread(unread);
  }, [badge?.unread, prevUnread]);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => undefined);
  }, []);

  const toggleOnline = useCallback(async () => {
    await supportAdmin.setAvailability(!(availability?.online ?? false));
    qc.invalidateQueries({ queryKey: ["support-availability"] });
  }, [availability?.online, qc]);

  const readAll = useCallback(async () => {
    await supportAdmin.readAllNotifications();
    qc.invalidateQueries({ queryKey: ["support-notifs"] });
    qc.invalidateQueries({ queryKey: ["support-unread-badge"] });
  }, [qc]);

  const tickets = inbox?.tickets ?? [];
  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0];
  const filtered = tickets.filter(activeTab.match);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-black uppercase tracking-tight"><LifeBuoy className="h-6 w-6 text-primary" /> Support Tickets</h1>
          <p className="text-sm text-muted-foreground">Review, accept and manage support tickets.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleOnline} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-black uppercase ${availability?.online ? "border-green-500/50 bg-green-500/10 text-green-400" : "border-zinc-600 bg-zinc-800 text-zinc-300"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${availability?.online ? "bg-green-500" : "bg-zinc-500"}`} />
            {availability?.online ? "Online" : "Offline"}
          </button>
          <div className="relative">
            <button onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) readAll(); }} className="relative flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-bold hover:border-primary/50">
              <Bell className="h-4 w-4" />
              {badge && badge.unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-pink-accent px-1 text-[10px] font-bold text-white">{badge.unread > 99 ? "99+" : badge.unread}</span>}
            </button>
            {notifOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="text-xs font-black uppercase tracking-wide">Notifications</span>
                    {notifs && notifs.totalUnread > 0 && <button onClick={readAll} className="flex items-center gap-1 text-[10px] font-bold text-primary"><CheckCheck className="h-3 w-3" /> Mark all read</button>}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {(notifs?.notifications ?? []).length === 0 ? (
                      <p className="p-4 text-center text-xs text-muted-foreground">No notifications</p>
                    ) : (notifs?.notifications ?? []).map((n) => (
                      <div key={n.id} className={`flex gap-2 border-b border-border px-3 py-2.5 ${!n.read ? "bg-primary/5" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold">{n.title}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{n.body}</p>
                        </div>
                        <Link href={`/admin/support/${n.ticketId}`} onClick={() => setNotifOpen(false)} className="shrink-0 text-[10px] font-bold text-primary">View</Link>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
            {t.key === "new" && tickets.some((tk) => tk.status === "waiting" && !tk.assignedAdminId) ? " ●" : ""}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No tickets in this view.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {filtered.map((t) => (
            <Link key={t.id} href={`/admin/support/${t.id}`} className={`flex items-center gap-3 border-b border-border p-3 transition-colors last:border-b-0 hover:bg-muted ${t.isNewWaiting ? "bg-primary/5" : ""}`}>
              {t.user?.avatarUrl ? <img src={t.user.avatarUrl} alt="" className="h-10 w-10 rounded-full" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-black text-primary">{(t.user?.displayName ?? t.user?.username ?? "?").charAt(0).toUpperCase()}</div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold">{t.subject}</p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{fmt(t.updatedAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.user?.displayName ?? t.user?.username ?? "Unknown"} · <span className="capitalize">{t.category}</span>
                  {t.assignedAdmin && <span> · Assigned: {t.assignedAdmin.displayName ?? t.assignedAdmin.username}</span>}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-px text-[9px] font-bold uppercase ${t.status === "closed" ? "border-zinc-600 text-zinc-400" : t.status === "active" ? "border-primary/40 bg-primary/10 text-primary" : "border-yellow-400/40 bg-yellow-400/10 text-yellow-400"}`}>{t.status}</span>
                  {t.lastMessage && <span className="truncate text-[11px] text-muted-foreground">{t.lastMessage.senderRole === "user" ? "👤" : "🛡️"} {t.lastMessage.hasAttachment ? "📎 Attachment" : t.lastMessage.text}</span>}
                  {t.unread > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-pink-accent px-1 text-[10px] font-bold text-white">{t.unread}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}