import { useEffect } from "react";
import { useLocation } from "wouter";
import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { user, isLoading, isLoggedIn, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      navigate("/login");
    }
  }, [isLoading, isLoggedIn, navigate]);

  if (isLoading || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <div className="rounded-lg border border-border bg-card p-8 space-y-6">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName ?? user.username}
              className="size-16 rounded-full border border-primary/50 object-cover"
              data-testid="img-dashboard-avatar"
            />
          ) : (
            <div className="size-16 rounded-full bg-primary/20 flex items-center justify-center text-xl font-black text-primary">
              {(user.displayName ?? user.username).charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="font-black text-2xl uppercase tracking-wide" data-testid="text-dashboard-name">
              {user.displayName ?? user.username}
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-dashboard-username">
              @{user.username}
            </p>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Discord ID
          </p>
          <p className="font-mono text-sm">{user.discordId}</p>
        </div>

        <Button
          variant="outline"
          className="gap-2 font-bold border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => logout()}
          data-testid="button-dashboard-logout"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}
