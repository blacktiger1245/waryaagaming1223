import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Crown, Shield, ShieldOff, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Redirect } from "wouter";

interface PlayerRow {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  discordId: string | null;
  role: string;
}

async function fetchUsers(): Promise<PlayerRow[]> {
  const res = await fetch("/api/admin/users", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load users");
  return res.json() as Promise<PlayerRow[]>;
}

async function setRole(id: number, role: "player" | "admin"): Promise<void> {
  const res = await fetch(`/api/admin/users/${id}/role`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to update role");
  }
}

export default function ManageAdminsPage() {
  const { isOwner, isLoading: authLoading } = useAdminAuth();
  const qc = useQueryClient();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: fetchUsers,
    enabled: isOwner,
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: "player" | "admin" }) => setRole(id, role),
    onMutate: ({ id }) => setPendingId(id),
    onSettled: () => {
      setPendingId(null);
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Only the owner can reach this page.
  if (!isOwner) return <Redirect to="/admin" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-wide flex items-center gap-3">
          <UserCog className="w-6 h-6 text-primary" />
          Manage Admins
        </h1>
        <p className="text-muted-foreground mt-1">
          Grant or revoke admin access for registered players. Only you (the Owner) can do this.
        </p>
      </div>

      {/* Role legend */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Owner", icon: Crown, color: "text-yellow-400", desc: "Full control — cannot be changed" },
          { label: "Admin", icon: Shield, color: "text-primary", desc: "Full access to admin panel" },
          { label: "Player", icon: ShieldOff, color: "text-muted-foreground", desc: "No admin access" },
        ].map(({ label, icon: Icon, color, desc }) => (
          <div key={label} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
            <Icon className={`w-4 h-4 ${color}`} />
            <span className="font-bold text-sm">{label}</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">— {desc}</span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs text-muted-foreground">Player</th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs text-muted-foreground">Discord ID</th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-xs text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="avatar" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-black text-primary">
                          {(u.displayName ?? u.username).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-bold">{u.displayName ?? u.username}</p>
                        <p className="text-xs text-muted-foreground">@{u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {u.discordId ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.role === "owner" ? (
                      <span className="text-xs text-muted-foreground italic">Protected</span>
                    ) : (
                      <Button
                        size="sm"
                        variant={u.role === "admin" ? "outline" : "default"}
                        className={`font-bold text-xs gap-1.5 ${u.role === "admin" ? "border-destructive/50 text-destructive hover:bg-destructive/10" : ""}`}
                        disabled={pendingId === u.id}
                        onClick={() => roleMutation.mutate({ id: u.id, role: u.role === "admin" ? "player" : "admin" })}
                      >
                        {pendingId === u.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : u.role === "admin" ? (
                          <>
                            <ShieldOff className="w-3 h-3" />
                            Remove Admin
                          </>
                        ) : (
                          <>
                            <Shield className="w-3 h-3" />
                            Make Admin
                          </>
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "owner") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">
        <Crown className="w-3 h-3" />
        Owner
      </span>
    );
  }
  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">
        <Shield className="w-3 h-3" />
        Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted border border-border text-muted-foreground px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">
      <ShieldOff className="w-3 h-3" />
      Player
    </span>
  );
}
