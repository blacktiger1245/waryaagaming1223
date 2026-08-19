import { useQuery } from "@tanstack/react-query";
import { Redirect, Link } from "wouter";
import { Loader2, Users2, Star, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { fetchReferees } from "@/lib/api";
import { RefereeLayout } from "@/components/referee-layout";

export default function RefereeHome() {
  const { user, isLoggedIn, isLoading } = useAuth();
  const { data: referees } = useQuery({ queryKey: ["referees"], queryFn: fetchReferees, enabled: isLoggedIn });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Referee-only interface: only accounts with the Referee role get this page.
  if (!user || !isLoggedIn || (user.role as string) !== "referee") {
    return <Redirect to="/referees" />;
  }

  const me = referees?.find((r) => r.id === user.id) ?? null;

  return (
    <RefereeLayout>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <Users2 className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-widest">Referee Panel</span>
        </div>
        <h1 className="text-4xl font-black uppercase tracking-tight mb-8">Welcome, {user.displayName ?? user.username}</h1>

        {/* Referee account summary (auto from account record) */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-20 h-20 rounded-2xl object-cover border border-primary/20" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <span className="text-3xl font-black text-primary">{(user.displayName ?? user.username).charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black truncate">{user.displayName ?? user.username}</h2>
                {me?.verified && (
                  <img src={`${import.meta.env.BASE_URL}verified.png`} alt="" draggable={false} className="h-5 w-5 object-contain" />
                )}
              </div>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                <ShieldCheck className="h-3.5 w-3.5" /> Referee
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="rounded-xl bg-muted/40 p-4 text-center">
              <div className="text-2xl font-black text-primary">{me?.matchesPlayed ?? 0}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Matches</div>
            </div>
            <div className="rounded-xl bg-muted/40 p-4 text-center">
              <div className="text-2xl font-black">{me?.rating ?? 0}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Rating</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`h-4 w-4 ${i < Math.max(0, Math.min(5, Math.round((me?.rating ?? 0) / 200))) ? "fill-yellow-400 text-yellow-400" : "text-zinc-600"}`} />
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            You are registered as a referee.{" "}
            <Link href="/referees" className="font-bold text-primary hover:underline">
              View the Referees list
            </Link>
            .
          </p>
        </div>
      </div>
    </RefereeLayout>
  );
}