import { AdminEntityManager } from "@/components/admin/admin-entity-manager";
import { User } from "lucide-react";

export default function AdminPlayersPage() {
  return (
    <AdminEntityManager
      endpoint="players"
      title="Player"
      columns={[
        {
          name: "avatarUrl",
          label: "Avatar",
          render: (r) =>
            r.avatarUrl ? (
              <img
                src={r.avatarUrl as string}
                alt=""
                className="w-9 h-9 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center ring-2 ring-border">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
            ),
        },
        { name: "username", label: "Username" },
        { name: "displayName", label: "Display Name" },
        { name: "rank", label: "Rank" },
        { name: "points", label: "Points" },
        { name: "isActive", label: "Active", render: (r) => (r.isActive ? "Yes" : "No") },
      ]}
      fields={[
        { name: "username", label: "Username", required: true },
        { name: "displayName", label: "Display Name" },
        { name: "avatarUrl", label: "Avatar URL" },
        { name: "teamId", label: "Team ID", type: "number" },
        { name: "rank", label: "Rank", type: "number" },
        { name: "tournamentWins", label: "Tournament Wins", type: "number" },
        { name: "winRate", label: "Win Rate (%)", type: "number" },
        { name: "matchesPlayed", label: "Matches Played", type: "number" },
        { name: "matchesWon", label: "Matches Won", type: "number" },
        { name: "points", label: "Points", type: "number" },
        { name: "country", label: "Country" },
        { name: "discordId", label: "Discord ID" },
        { name: "bio", label: "Bio", type: "textarea" },
        { name: "isActive", label: "Active", type: "boolean" },
        { name: "badges", label: "Badges", type: "array" },
      ]}
    />
  );
}
