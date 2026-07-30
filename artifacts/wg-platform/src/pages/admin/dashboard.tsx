import { useQuery } from "@tanstack/react-query";
import { Users, Shield, Trophy, Swords, Newspaper, PlaySquare } from "lucide-react";

type Stats = {
  players: number;
  teams: number;
  tournaments: number;
  matches: number;
  news: number;
  media: number;
};

async function fetchStats(): Promise<Stats> {
  const res = await fetch("/api/admin/stats", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load stats");
  return res.json() as Promise<Stats>;
}

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["admin", "stats"], queryFn: fetchStats });

  const cards = [
    { label: "Players", value: stats?.players, icon: Users },
    { label: "Teams", value: stats?.teams, icon: Shield },
    { label: "Tournaments", value: stats?.tournaments, icon: Trophy },
    { label: "Matches", value: stats?.matches, icon: Swords },
    { label: "News Articles", value: stats?.news, icon: Newspaper },
    { label: "Media Items", value: stats?.media, icon: PlaySquare },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-wide">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Manage every part of Waryaa Gaming from here.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-lg border border-border bg-card p-6 flex items-center gap-4"
              data-testid={`card-stat-${card.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="size-12 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-black">{isLoading ? "—" : card.value}</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                  {card.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
