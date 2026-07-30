import { useEffect } from "react";
import { useLocation } from "wouter";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_not_configured: "Discord login is not configured yet. Please contact an admin.",
  access_denied: "You cancelled the Discord login.",
  no_code: "Discord did not return an authorization code. Please try again.",
  token_failed: "Could not complete Discord login. Please try again.",
  user_failed: "Could not fetch your Discord profile. Please try again.",
  session_failed: "Could not start your session. Please try again.",
  auth_failed: "Something went wrong signing you in. Please try again.",
};

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { isLoggedIn, isLoading, user, loginWithDiscord } = useAuth();

  const params = new URLSearchParams(window.location.search);
  const errorCode = params.get("error");
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] ?? "Login failed. Please try again." : null;

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate(user?.profileComplete ? "/dashboard" : "/onboarding");
    }
  }, [isLoading, isLoggedIn, user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-12 bg-primary flex items-center justify-center rounded-md glow-primary">
            <Shield className="text-primary-foreground size-7" />
          </div>
          <div>
            <h1 className="font-black text-lg uppercase tracking-widest">Welcome Back</h1>
            <p className="text-sm text-muted-foreground">Sign in to Waryaa Gaming with Discord</p>
          </div>
        </div>

        {errorMessage && (
          <p className="text-sm text-destructive" data-testid="text-login-error">
            {errorMessage}
          </p>
        )}

        <Button
          className="w-full gap-2 font-bold"
          onClick={loginWithDiscord}
          data-testid="button-login-discord"
        >
          <DiscordIcon />
          Login with Discord
        </Button>
      </div>
    </div>
  );
}

function DiscordIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.085.118 18.11.136 18.126a19.888 19.888 0 0 0 5.994 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.995a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
    </svg>
  );
}
