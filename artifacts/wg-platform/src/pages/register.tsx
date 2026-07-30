import { useEffect } from "react";
import { useLocation } from "wouter";
import { UserPlus, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_not_configured: "Discord login is not configured yet. Please contact an admin.",
  access_denied: "You cancelled the Discord authorization.",
  no_code: "Discord did not return an authorization code. Please try again.",
  invalid_state: "Your login session expired. Please try again.",
  token_failed: "Could not complete Discord registration. Please try again.",
  user_failed: "Could not fetch your Discord profile. Please try again.",
  session_failed: "Could not start your session. Please try again.",
  auth_failed: "Something went wrong registering you. Please try again.",
};

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const { isLoggedIn, isLoading, loginWithDiscord } = useAuth();

  const params = new URLSearchParams(window.location.search);
  const errorCode = params.get("error");
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] ?? "Registration failed. Please try again." : null;

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate("/dashboard");
    }
  }, [isLoading, isLoggedIn, navigate]);

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <div className="text-center mb-10">
        <p className="text-primary text-xs font-bold uppercase tracking-widest mb-2">Join The Roster</p>
        <h1 className="text-5xl font-black uppercase tracking-tight">Player Registration</h1>
        <p className="text-muted-foreground mt-4 max-w-lg mx-auto">
          Create your Waryaa Gaming player profile in one click. Your username, display name, and
          avatar are pulled straight from your Discord account — no forms to fill out.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-8 space-y-6">
        {errorMessage && (
          <p className="text-sm text-destructive text-center" data-testid="text-register-error">
            {errorMessage}
          </p>
        )}

        <Button
          size="lg"
          className="w-full gap-2 font-bold text-base h-14"
          onClick={loginWithDiscord}
          data-testid="button-register-discord"
        >
          <DiscordIcon />
          Register with Discord
        </Button>

        <div className="grid sm:grid-cols-3 gap-4 pt-4 border-t border-border">
          <Feature
            icon={UserPlus}
            title="Instant Profile"
            description="Your player card is created automatically the moment you authorize."
          />
          <Feature
            icon={RefreshCw}
            title="Always In Sync"
            description="Change your Discord name or avatar and it updates here on your next login."
          />
          <Feature
            icon={ShieldCheck}
            title="Secure"
            description="We never see your Discord password — only your public profile info."
          />
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Already have a profile? Just log in the same way —{" "}
        <button onClick={loginWithDiscord} className="text-primary font-bold hover:underline">
          Register with Discord
        </button>{" "}
        signs you in if you've registered before.
      </p>
    </div>
  );
}

function Feature({ icon: Icon, title, description }: { icon: typeof UserPlus; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="size-9 mx-auto mb-2 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Icon className="size-4 text-primary" />
      </div>
      <p className="text-xs font-bold uppercase tracking-wide">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

function DiscordIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.085.118 18.11.136 18.126a19.888 19.888 0 0 0 5.994 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.995a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
    </svg>
  );
}
