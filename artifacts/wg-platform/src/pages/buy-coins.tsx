import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2, BadgeCheck, CreditCard, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { coins, formatCoins, type CoinPackage } from "@/lib/coins";

// -- Card input helpers -----------------------------------------------------------
function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function validateCard(card: {
  name: string;
  number: string;
  expiry: string;
  cvv: string;
}): string | null {
  if (!card.name.trim()) return "Please enter the cardholder name.";
  const digits = card.number.replace(/\s/g, "");
  if (digits.length !== 16 || !/^\d+$/.test(digits)) return "Card number must be 16 digits.";
  const m = card.expiry.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return "Expiry must be in MM / YY format.";
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return "Expiry month must be between 01 and 12.";
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1))
    return "This card has expired.";
  if (!/^\d{3,4}$/.test(card.cvv)) return "CVC must be 3 or 4 digits.";
  return null;
}

// Brand badges shown inside the card number field (Stripe-style)
function CardBrands() {
  return (
    <span className="flex items-center gap-1">
      {/* Visa */}
      <svg viewBox="0 0 36 24" className="h-5 w-8 rounded-[3px]" aria-label="Visa">
        <rect width="36" height="24" rx="3" fill="#1434CB" />
        <text x="18" y="16.5" textAnchor="middle" fontSize="9" fontWeight="900" fontStyle="italic" fill="#fff" fontFamily="Arial">VISA</text>
      </svg>
      {/* Mastercard */}
      <svg viewBox="0 0 36 24" className="h-5 w-8 rounded-[3px]" aria-label="Mastercard">
        <rect width="36" height="24" rx="3" fill="#1A1F36" />
        <circle cx="15" cy="12" r="7" fill="#EB001B" />
        <circle cx="21" cy="12" r="7" fill="#F79E1B" fillOpacity="0.9" />
      </svg>
      {/* Amex */}
      <svg viewBox="0 0 36 24" className="h-5 w-8 rounded-[3px]" aria-label="American Express">
        <rect width="36" height="24" rx="3" fill="#2E77BC" />
        <text x="18" y="15.5" textAnchor="middle" fontSize="6.5" fontWeight="900" fill="#fff" fontFamily="Arial">AMEX</text>
      </svg>
      {/* Discover */}
      <svg viewBox="0 0 36 24" className="h-5 w-8 rounded-[3px]" aria-label="Discover">
        <rect width="36" height="24" rx="3" fill="#fff" stroke="#D9DCE3" />
        <circle cx="24" cy="12" r="5.5" fill="#F76B1C" />
        <text x="11" y="15" textAnchor="middle" fontSize="6" fontWeight="900" fill="#1A1F36" fontFamily="Arial">DISC</text>
      </svg>
    </span>
  );
}
// -- Checkout dialog ---------------------------------------------------------------
function CheckoutDialog({
  pkg,
  onClose,
}: {
  pkg: CoinPackage;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [card, setCard] = useState({ name: "", number: "", expiry: "", cvv: "" });
  const [error, setError] = useState<string | null>(null);

  const purchase = useMutation({
    mutationFn: () => coins.purchase(pkg.id),
    onSuccess: (data) => {
      qc.setQueryData(["coins", "balance"], { balance: data.balance });
      qc.invalidateQueries({ queryKey: ["coins", "transactions"] });
      toast({
        title: "Purchase complete!",
        description: `${formatCoins(data.purchased.coins)} coins added to your balance.`,
      });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Payment failed", description: err.message, variant: "destructive" });
    },
  });

  const submit = () => {
    const problem = validateCard(card);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    purchase.mutate();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="flex items-center gap-2 font-black uppercase tracking-widest text-foreground">
            <CreditCard className="h-5 w-5 text-primary" /> Payment
          </h3>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CheckoutBody card={card} setCard={setCard} error={error} pkg={pkg} pending={purchase.isPending} submit={submit} />
      </div>
    </div>
  );
}

function CheckoutBody({
  card,
  setCard,
  error,
  pkg,
  pending,
  submit,
}: {
  card: { name: string; number: string; expiry: string; cvv: string };
  setCard: (c: { name: string; number: string; expiry: string; cvv: string }) => void;
  error: string | null;
  pkg: CoinPackage;
  pending: boolean;
  submit: () => void;
}) {
  return (
    <div className="px-5 py-5 space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
        <span className="text-sm font-bold">{pkg.label} — WG Coins</span>
        <span className="text-lg font-black text-primary">{pkg.price}</span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            Cardholder name
          </label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            value={card.name}
            onChange={(e) => setCard({ ...card, name: e.target.value })}
            placeholder="Name on card"
            autoComplete="cc-name"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            Card number
          </label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tracking-widest text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            value={card.number}
            onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })}
            placeholder="1234 5678 9012 3456"
            inputMode="numeric"
            autoComplete="cc-number"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              Expiry
            </label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              value={card.expiry}
              onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
              placeholder="MM/YY"
              inputMode="numeric"
              autoComplete="cc-exp"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              CVV
            </label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              value={card.cvv}
              onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              placeholder="123"
              inputMode="numeric"
              type="password"
              autoComplete="cc-csc"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-xs font-bold text-red-400">{error}</p>}

      <Button className="w-full font-black uppercase tracking-widest" disabled={pending} onClick={submit}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        Pay {pkg.price}
      </Button>
      <p className="text-center text-[10px] text-muted-foreground">
        <Lock className="mr-1 inline h-3 w-3" />
        Secured checkout. Your card details are never stored.
      </p>
    </div>
  );
}
// -- Page ---------------------------------------------------------------------------
export default function BuyCoinsPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [checkout, setCheckout] = useState<CoinPackage | null>(null);

  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ["coins", "balance"],
    queryFn: coins.balance,
    enabled: isLoggedIn,
  });

  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ["coins", "packages"],
    queryFn: coins.packages,
  });

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
                  disabled={!isLoggedIn}
                  onClick={() => setCheckout(pkg)}
                  data-testid={`button-buy-${pkg.id}`}
                >
                  <BadgeCheck className="w-4 h-4" />
                  {isLoggedIn ? "Buy now" : "Login required"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoggedIn && (
        <div className="mt-10">
          <h2 className="text-sm font-black uppercase tracking-widest text-primary mb-3">Purchase history</h2>
          <PurchaseHistory />
        </div>
      )}

      {checkout && <CheckoutDialog pkg={checkout} onClose={() => setCheckout(null)} />}
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