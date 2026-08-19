import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, History } from "lucide-react";
import { supportAdmin } from "@/lib/support";

export default function AdminSupportHistoryPage() {
  const { data, isLoading } = useQuery({ queryKey: ["support-history"], queryFn: supportAdmin.history });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-black uppercase tracking-tight"><History className="h-6 w-6 text-primary" /> Support History</h1>
        <p className="text-sm text-muted-foreground">Tickets you handled previously (Owners see all support history).</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !data || data.tickets.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No tickets yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {(data.tickets ?? []).map((t) => (
            <Link key={t.id} href={`/admin/support/${t.id}`} className="flex items-center gap-3 border-b border-border p-3 transition-colors last:border-b-0 hover:bg-muted">
              {t.user?.avatarUrl ? <img src={t.user.avatarUrl} alt="" className="h-9 w-9 rounded-full" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-black text-primary">{(t.user?.displayName ?? t.user?.username ?? "?").charAt(0).toUpperCase()}</div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold">{t.subject}</p>
                  <span className={`rounded-full border px-2 py-px text-[9px] font-bold uppercase ${t.status === "closed" ? "border-zinc-600 text-zinc-400" : "border-primary/40 bg-primary/10 text-primary"}`}>{t.status}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t.user?.displayName ?? t.user?.username ?? "Unknown"} · <span className="capitalize">{t.category}</span></p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}