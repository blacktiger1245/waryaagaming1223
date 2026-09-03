import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Gamepad2, Coins, Gem, ShoppingBag, Loader2, CheckCircle2, Clock, ClipboardCheck } from "lucide-react";
import { fetchManagerProducts, fetchManagerOrders, fetchSellLogs, formatPrice, formatDate, type ShopCategory } from "@/lib/shop";

function useCategoryCount(category: ShopCategory) {
  return useQuery({
    queryKey: ["manager-shop-products", category],
    queryFn: () => fetchManagerProducts({ category }),
  });
}

/** WG-SHOP Manager dashboard — /admin/shop (admin/owner gated). */
export default function AdminShopDashboardPage() {
  const efootball = useCategoryCount("efootball");
  const coins = useCategoryCount("coins");
  const nitro = useCategoryCount("nitro");
  const orders = useQuery({ queryKey: ["manager-shop-orders"], queryFn: () => fetchManagerOrders() });
  const sellLogs = useQuery({
    queryKey: ["manager-sell-logs", "pending"],
    queryFn: () => fetchSellLogs("pending"),
  });
  const pendingReviews = (sellLogs.data ?? []).length;

  const cards = [
    { label: "eFootball Accounts", icon: Gamepad2, data: efootball, accent: "#22c55e" },
    { label: "Coin Products", icon: Coins, data: coins, accent: "#eab308" },
    { label: "Nitro Products", icon: Gem, data: nitro, accent: "#5865F2" },
  ];

  const allOrders = orders.data ?? [];
  const pending = allOrders.filter((o) => o.status === "pending").length;
  const completed = allOrders.filter((o) => o.status === "completed").length;
  const revenue = allOrders.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + o.priceCents, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-wide">WG-SHOP Manager</h1>
        <p className="mt-1 text-muted-foreground">
          Publish accounts, coins and Nitro to the storefront and manage customer orders.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const products = card.data.data ?? [];
          const published = products.filter((p) => p.published).length;
          return (
            <div key={card.label} className="rounded-lg border border-border bg-card p-6 flex items-center gap-4">
              <div
                className="size-12 rounded-md border flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${card.accent}1a`, borderColor: card.accent }}
              >
                <Icon className="w-6 h-6" style={{ color: card.accent }} />
              </div>
              <div>
                <p className="text-2xl font-black">
                  {card.data.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : products.length}
                </p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">{card.label}</p>
                <p className="text-[11px] text-muted-foreground">{published} published</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sell Logs — user-submitted account review queue */}
      <Link href="/admin/shop/sell-logs" data-testid="link-manager-sell-logs">
        <div className="flex items-center gap-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-5 transition-colors hover:border-amber-500">
          <div className="flex size-12 flex-shrink-0 items-center justify-center rounded-md border border-amber-500/60 bg-amber-500/10">
            <ClipboardCheck className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-amber-400">{sellLogs.isLoading ? "—" : pendingReviews}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Accounts pending review
            </p>
            <p className="text-[11px] font-bold text-amber-400/80">Open Sell Logs to approve or reject →</p>
          </div>
        </div>
      </Link>

      {/* Order stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <ShoppingBag className="h-3.5 w-3.5" /> Total Orders
          </p>
          <p className="mt-1 text-2xl font-black">{orders.isLoading ? "—" : allOrders.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-yellow-400" /> Pending
          </p>
          <p className="mt-1 text-2xl font-black text-yellow-400">{orders.isLoading ? "—" : pending}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Completed
          </p>
          <p className="mt-1 text-2xl font-black text-green-400">{orders.isLoading ? "—" : completed}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Revenue (excl. cancelled)</p>
          <p className="mt-1 text-2xl font-black text-primary">{orders.isLoading ? "—" : formatPrice(revenue)}</p>
        </div>
      </div>

      {/* Recent orders */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-black uppercase tracking-wide">Recent orders</h2>
        </div>
        {orders.isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : allOrders.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No customer orders yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {allOrders.slice(0, 8).map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-bold">
                    #{order.id} · {order.productTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.buyerName} ({order.buyerContact}) · {formatDate(order.createdAt)}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span className="font-black text-primary">{formatPrice(order.priceCents)}</span>
                  <span className="text-xs font-bold uppercase text-muted-foreground">{order.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
