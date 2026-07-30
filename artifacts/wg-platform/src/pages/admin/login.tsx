import { useState } from "react";
import { useLocation, Redirect } from "wouter";
import { Gamepad2, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useAuth } from "@/hooks/use-auth";

const LOGIN_PATH = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/auth/discord`;

function DiscordIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.085.118 18.11.136 18.126a19.888 19.888 0 0 0 5.994 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.995a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
    </svg>
  );
}

export default function AdminLoginPage() {
  const [, navigate] = useLocation();
  const { admin, isLoading: adminLoading } = useAdminAuth();
  const { user, isLoading: userLoading } = useAuth();
  const { login, isLoggingIn, loginError } = useAdminAuth();

  const [showLegacy, setShowLegacy] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // If already authenticated as admin, go straight to the panel.
  if (!adminLoading && admin) {
    return <Redirect to="/admin" />;
  }

  const isLoading = adminLoading || userLoading;

  async function handleLegacySubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login({ username, password });
      navigate("/admin");
    } catch {
      // error surfaced via loginError
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="size-12 bg-primary flex items-center justify-center rounded-md glow-primary">
            <Gamepad2 className="text-primary-foreground size-7" />
          </div>
          <div>
            <h1 className="font-black text-lg uppercase tracking-widest">WG Admin</h1>
            <p className="text-sm text-muted-foreground">Manage Waryaa Gaming</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : user ? (
          // Discord user is logged in — check if they have the right role
          user.role === "admin" || user.role === "owner" ? (
            // Has admin/owner role — they're already authenticated server-side,
            // just redirect them in. The admin panel will recognise the role.
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md bg-primary/10 border border-primary/30 px-4 py-3">
                <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary capitalize">{user.role}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.displayName ?? user.username}</p>
                </div>
              </div>
              <Button className="w-full font-bold" onClick={() => navigate("/admin")}>
                Enter Admin Panel
              </Button>
            </div>
          ) : (
            // Logged in but no admin role
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3">
                <ShieldOff className="w-5 h-5 text-destructive flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-destructive">No admin access</p>
                  <p className="text-xs text-muted-foreground truncate">
                    Your account ({user.displayName ?? user.username}) does not have admin privileges.
                  </p>
                </div>
              </div>
              <Button variant="outline" className="w-full font-bold" onClick={() => window.location.href = "/"}>
                Back to Site
              </Button>
            </div>
          )
        ) : (
          // Not logged in — prompt Discord login
          <div className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              Sign in with Discord to access the admin panel.
            </p>
            <Button
              className="w-full gap-2 font-bold"
              onClick={() => { window.location.href = LOGIN_PATH; }}
            >
              <DiscordIcon />
              Login with Discord
            </Button>
          </div>
        )}

        {/* Legacy password fallback (collapsed by default) */}
        <div className="pt-2 border-t border-border">
          <button
            type="button"
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors w-full text-center"
            onClick={() => setShowLegacy(!showLegacy)}
          >
            {showLegacy ? "Hide legacy login" : "Use legacy login"}
          </button>

          {showLegacy && (
            <form onSubmit={handleLegacySubmit} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Username
                </label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  data-testid="input-admin-username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  data-testid="input-admin-password"
                  required
                />
              </div>
              {loginError && (
                <p className="text-sm text-destructive text-center">{loginError.message}</p>
              )}
              <Button
                type="submit"
                variant="outline"
                className="w-full gap-2 font-bold"
                disabled={isLoggingIn}
                data-testid="button-admin-login"
              >
                {isLoggingIn && <Loader2 className="w-4 h-4 animate-spin" />}
                Sign In
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
