import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShoppingBag, PackageOpen } from "lucide-react";
import { fetchMyShopOrders, formatDate, formatPrice, SHOP_CATEGORY_META, SHOP_ORDER_STATUS_META } from "@/lib/shop";

/**
 * My Orders — /shop/orders
 * Lists this browser's orders (guest checkout uses a local capability id) and
 * merges any orders tied to the current platform session.
 */
export default function ShopOrdersPage() {
  const { data: orders, isLoading } = useQuery({
    queryKey: ["shop", "orders"],
    queryFn: fetchMyShopOrders,
    refetchInterval: 30_000,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">WG-SHOP</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-black uppercase tracking-wide sm:text-3xl">
          <ShoppingBag className="h-7 w-7 text-primary" /> My Orders
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track every purchase you placed on this device and its delivery status.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your orders…
          </div>
        ) : !orders || orders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
            <PackageOpen className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <p className="mt-3 text-sm text-muted-foreground">
              You haven't placed any orders yet.{" "}
              <Link href="/shop" className="font-bold text-primary hover:underline">
                Browse the shop
              </Link>
            </p>
          </div>
        ) : (
          orders.map((order) => {
            const status = SHOP_ORDER_STATUS_META[order.status] ?? SHOP_ORDER_STATUS_META.pending;
            const accent = SHOP_CATEGORY_META[order.category]?.accent ?? "#22c55e";
            return (
              <div
                key={order.id}
                data-testid={`card-order-${order.id}`}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div
                    className="flex size-10 flex-shrink-0 items-center justify-center rounded-lg border text-lg font-black"
                    style={{ borderColor: accent, color: accent, backgroundColor: `${accent}1f` }}
                  >
                    #{order.id}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{order.productTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(order.createdAt)} · {SHOP_CATEGORY_META[order.category]?.label ?? order.category}
                      {order.note ? ` · “${order.note}”` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="text-lg font-black text-primary">{formatPrice(order.priceCents)}</span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
