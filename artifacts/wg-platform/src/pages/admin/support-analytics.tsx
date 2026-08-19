import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { Loader2, BarChart2, Star, Trophy, Inbox, LifeBuoy, Clock, CheckCircle2 } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { supportAdmin } from "@/lib/support";

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Icon className={`h-4 w-4 ${accent ?? "text-primary"}`} /> {label}</div>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return <span className="inline-flex gap-0.5">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-3.5 w-3.5 ${i < n ? "fill-yellow-400 text-yellow-400" : "text-zinc-600"}`} />)}</span>;
}

export default function SupportAnalyticsPage() {
  const { isOwner, isLoading: authLoading } = useAdminAuth();
  const { data, isLoading } = useQuery({ queryKey: ["support-analytics"], queryFn: supportAdmin.analytics, enabled: isOwner });

  if (authLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!isOwner) return <Redirect to="/admin" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-black uppercase tracking-tight"><BarChart2 className="h-6 w-6 text-primary" /> Support Analytics</h1>
        <p className="text-sm text-muted-foreground">Owner-only statistics computed from real ticket & rating data.</p>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <StatCard icon={Trophy} label="Total Tickets" value={data.overview.total} />
            <StatCard icon={Inbox} label="Open" value={data.overview.open} accent="text-yellow-400" />
            <StatCard icon={CheckCircle2} label="Closed" value={data.overview.closed} accent="text-green-400" />
            <StatCard icon={LifeBuoy} label="Waiting" value={data.overview.waiting} />
            <StatCard icon={LifeBuoy} label="Active" value={data.overview.active} accent="text-primary" />
            <StatCard icon={Clock} label="Avg Response (h)" value={data.overview.avgResponseHours} />
            <StatCard icon={Clock} label="Avg Resolution (h)" value={data.overview.avgResolutionHours} />
            <StatCard icon={Star} label="Total Ratings" value={data.overview.totalRatings} />
            <StatCard icon={Star} label="Overall Rating" value={`${data.overview.overallAvg} ⭐`} accent="text-yellow-400" />
          </div>

          <div>
            <h2 className="mb-3 flex items-center gap-2 font-black uppercase tracking-wide"><Trophy className="h-5 w-5 text-primary" /> Admins ranked by rating</h2>
            {data.admins.length === 0 ? (
              <p className="text-sm text-muted-foreground">No admins yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                {data.admins.map((a, idx) => (
                  <div key={a.id} className={`flex flex-wrap items-center gap-4 border-b border-border p-4 last:border-b-0 ${idx === 0 && (a.ratingCount ?? 0) > 0 ? "bg-primary/5" : ""}`}>
                    {a.avatarUrl ? <img src={a.avatarUrl} alt="" className="h-11 w-11 rounded-full" /> : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/20 text-lg font-black text-primary">{(a.displayName ?? a.username)[0]?.toUpperCase()}</div>}
                    <div className="min-w-0 flex-1">
                      <p className="font-black">{a.displayName ?? a.username} {idx === 0 && (a.ratingCount ?? 0) > 0 && <span className="text-yellow-400">👑</span>}</p>
                      <p className="text-xs capitalize text-muted-foreground">{a.role} · {a.ticketsHandled} handled · {a.ticketsClosed} closed</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>5⭐ {a.breakdown?.[5] ?? 0}</span>
                        <span>4⭐ {a.breakdown?.[4] ?? 0}</span>
                        <span>3⭐ {a.breakdown?.[3] ?? 0}</span>
                        <span>2⭐ {a.breakdown?.[2] ?? 0}</span>
                        <span>1⭐ {a.breakdown?.[1] ?? 0}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-yellow-400">{(a.avgRating ?? 0) > 0 ? a.avgRating : "—"}</p>
                      <Stars n={Math.round(a.avgRating ?? 0)} />
                      <p className="text-xs text-muted-foreground">{a.ratingCount ?? 0} ratings</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}