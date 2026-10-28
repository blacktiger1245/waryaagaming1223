import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "wouter";
import { Coins, Loader2, BadgeCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { coins, formatCoins } from "@/lib/coins";

// How often the page asks the server whether the paid Checkout Session has been
// credited yet, and how long it keeps asking before saying it is still waiting.
// Stripe's webhook normally lands within a second or two of the redirect.
const CREDIT_POLL_INTERVAL_MS = 2500;
const CREDIT_POLL_TIMEOUT_MS = 30_000;

// -- Page ---------------------------------------------------------------------------
export default function BuyCoinsPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // The package currently being handed to Stripe, so only that card spins.
  const [pendingPackageId, setPendingPackageId] = useState<string | null>(null);
  // The Checkout Session the buyer just came back from. Captured before the query
  // string is cleared, so the credit check survives the URL cleanup.
  const [paidSessionId, setPaidSessionId] = useState<string | null>(null);
  // Purchases already reported to the buyer, so a re-render (or a re-mount) can
  // never produce a second toast for the same Checkout Session.
  const reportedSessions = useRef<Set<string>>(new Set());
  // Credit-check window, keyed by Checkout Session. Showing a toast re-renders
  // this component, so the effect below can re-run — the window must not move.
  const creditCheckWindow = useRef<{ sessionId: string; deadline: number } | null>(null);

  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ["coins", "balance"],
    queryFn: coins.balance,
    enabled: isLoggedIn,
  });

  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ["coins", "packages"],
    queryFn: coins.packages,
  });

  const checkout = useMutation({
    mutationFn: (packageId: string) => coins.createCheckoutSession(packageId),
    onSuccess: (data) => {
      // Hosted Stripe Checkout — hand the browser over to Stripe's payment page.
      window.location.href = data.url;
    },
    onError: (err: Error) => {
      setPendingPackageId(null);
      toast({ title: "Could not start checkout", description: err.message, variant: "destructive" });
    },
  });

  // Stripe sends the buyer back to
  // /buy-coins?checkout=success&session_id=cs_... The webhook credits the coins a
  // moment later, so the paid session id is captured here and the query string is
  // dropped straight away (a refresh must not repeat any of this).
  const checkoutResult = searchParams.get("checkout");
  const returnedSessionId = searchParams.get("session_id");

  useEffect(() => {
    if (checkoutResult !== "success" && checkoutResult !== "cancelled") return;

    if (checkoutResult === "success") {
      if (returnedSessionId) setPaidSessionId(returnedSessionId);
      // The balance is only ever read from the server; the credit itself is
      // confirmed below, against the Checkout Session that was paid.
      qc.invalidateQueries({ queryKey: ["coins", "balance"] });
      qc.invalidateQueries({ queryKey: ["coins", "transactions"] });
    } else {
      toast({ title: "Checkout cancelled", description: "No payment was taken." });
    }

    // Drop the query string so a refresh does not repeat any of this.
    setSearchParams({}, { replace: true });
  }, [checkoutResult, returnedSessionId, qc, setSearchParams, toast]);

  // Confirm the purchase against the Checkout Session it paid for, never against
  // a balance snapshot: the webhook may already have credited the coins before
  // this page rendered, which is exactly what used to produce a false "Still
  // confirming". Polls until the session reports credited, then stops for good.
  useEffect(() => {
    if (!paidSessionId || !isLoggedIn) return;
    // Already reported for this purchase (showing a toast re-renders this page
    // and can re-run this effect) — there is nothing left to confirm.
    if (reportedSessions.current.has(paidSessionId)) return;

    const sessionId = paidSessionId;
    if (creditCheckWindow.current?.sessionId !== sessionId) {
      creditCheckWindow.current = { sessionId, deadline: Date.now() + CREDIT_POLL_TIMEOUT_MS };
    }
    const deadline = creditCheckWindow.current.deadline;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Exactly one toast per purchase, no matter how often this effect re-runs.
    const report = (title: string, description: string) => {
      if (reportedSessions.current.has(sessionId)) return;
      reportedSessions.current.add(sessionId);
      toast({ title, description });
    };

    const poll = async () => {
      let credited = false;
      try {
        const status = await coins.checkoutSessionStatus(sessionId);
        credited = status.credited;
        if (credited && !cancelled) {
          qc.invalidateQueries({ queryKey: ["coins", "balance"] });
          qc.invalidateQueries({ queryKey: ["coins", "transactions"] });
          report(
            "WG Coins added",
            status.balance != null
              ? `Your balance is now ${formatCoins(status.balance)} WG Coins.`
              : `${formatCoins(status.coins ?? 0)} WG Coins were added to your balance.`,
          );
        }
      } catch {
        // A failed poll is not a failed payment — keep trying until the deadline.
      }

      if (cancelled || credited) return;

      if (Date.now() >= deadline) {
        report(
          "Still confirming",
          "Stripe has not confirmed this payment yet. Your WG Coins will appear as soon as it does.",
        );
        // Re-read the balance once more, in case the credit landed between polls.
        qc.invalidateQueries({ queryKey: ["coins", "balance"] });
        return;
      }

      timer = setTimeout(poll, CREDIT_POLL_INTERVAL_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paidSessionId, isLoggedIn, qc, toast]);

  const startCheckout = (packageId: string) => {
    setPendingPackageId(packageId);
    checkout.mutate(packageId);
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-black uppercase tracking-widest text-primary wg-brand-glow flex items-center justify-center gap-3">
          <Coins className="w-8 h-8" /> Buy Coins
        </h1>
        <p className="text-muted-foreground mt-2">Top up your WG Coins balance and unlock more across Waryaa Gaming.</p>
      </div>

      {isLoggedIn ? (
        <Card className="mb-8 border-primary/30">
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-widest text-xs font-bold">Your balance</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-black text-primary flex items-center gap-2">
              <Coins className="w-7 h-7" />
              {balanceLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : formatCoins(balanceData?.balance ?? 0)}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!authLoading && !isLoggedIn && (
        <Card className="mb-8 border-pink-accent/40 text-center py-8">
          <CardContent>
            <p className="text-muted-foreground mb-4">Log in with Discord to buy coins and keep your balance.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {packagesLoading && (
          <div className="col-span-full flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {packagesData?.packages.map((pkg) => {
          const best = pkg.id === "coins-100m";
          const pending = pendingPackageId === pkg.id;
          return (
            <Card
              key={pkg.id}
              className={`relative flex flex-col items-center text-center transition-transform hover:-translate-y-1 ${
                best ? "border-primary glow-primary" : "border-border"
              }`}
            >
              {best && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary-foreground">
                  Best value
                </span>
              )}
              <CardContent className="pt-6 pb-5 flex flex-col items-center gap-1 w-full">
                <p className="text-2xl font-black text-foreground">{pkg.label}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-primary" /> WG Coins
                </p>
                <p className="text-3xl font-black text-primary mt-3">{pkg.price}</p>
                <Button
                  className="w-full mt-4 font-bold"
                  disabled={!isLoggedIn || pending}
                  onClick={() => startCheckout(pkg.id)}
                  data-testid={`button-buy-${pkg.id}`}
                >
                  {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                  {isLoggedIn ? (pending ? "Redirecting…" : "Buy now") : "Login required"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        Payments are processed securely by Stripe. Your card details are never stored on Waryaa Gaming.
      </p>

      {isLoggedIn && (
        <div className="mt-10">
          <h2 className="text-sm font-black uppercase tracking-widest text-primary mb-3">Purchase history</h2>
          <PurchaseHistory />
        </div>
      )}
    </div>
  );
}

function PurchaseHistory() {
  const { data, isLoading } = useQuery({ queryKey: ["coins", "transactions"], queryFn: coins.transactions });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const txs = data?.transactions ?? [];
  if (txs.length === 0) return <p className="text-sm text-muted-foreground">No purchases yet.</p>;
  return (
    <ul className="space-y-2">
      {txs.map((t) => (
        <li key={t.id} className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 text-sm">
          <span className="font-bold flex items-center gap-2">
            <Coins className="w-4 h-4 text-primary" /> {formatCoins(t.coins)} coins
          </span>
          <span className="text-muted-foreground">${t.priceUsd} · {t.createdAt ? new Date(t.createdAt).toLocaleString() : ""}</span>
        </li>
      ))}
    </ul>
  );
}
