import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { coins, formatCoins, type CoinPackage } from "@/lib/coins";

export default function BuyCoinsPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ["coins", "balance"],
    queryFn: coins.balance,
    enabled: isLoggedIn,
  });

  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ["coins", "packages"],
    queryFn: coins.packages,
  });

  const purchase = useMutation({
    mutationFn: (pkg: CoinPackage) => coins.purchase(pkg.id),
    onSuccess: (data) => {
      qc.setQueryData(["coins", "balance"], { balance: data.balance });
      qc.invalidateQueries({ queryKey: ["coins", "transactions"] });
      toast({
        title: "Purchase complete!",
        description: `${formatCoins(data.purchased.coins)} coins added to your balance.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Purchase failed", description: err.message, variant: "destructive" });
    },
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
                  disabled={!isLoggedIn || purchase.isPending}
                  onClick={() => purchase.mutate(pkg)}
                  data-testid={`button-buy-${pkg.id}`}
                >
                  {purchase.isPending && purchase.variables?.id === pkg.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <BadgeCheck className="w-4 h-4" />
                  )}
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
