import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShoppingBag, MessageCircle, MessageSquare, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { storageUrl } from "@/lib/api";
import {
  fetchManagerOrders,
  fetchManagerChats,
  updateManagerOrderStatus,
  formatDate,
  formatPrice,
  SHOP_CATEGORY_META,
  SHOP_ORDER_STATUS_META,
  type ShopOrderStatus,
} from "@/lib/shop";

const STATUS_FILTERS: Array<ShopOrderStatus | "all"> = ["all", "pending", "processing", "completed", "cancelled"];

/** WG-SHOP Manager — customer orders with status control. */
export default function AdminShopOrdersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ShopOrderStatus | "all">("all");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["manager-shop-orders", statusFilter],
    queryFn: () => fetchManagerOrders(statusFilter === "all" ? undefined : statusFilter),
    refetchInterval: 30_000,
  });

  // Orders with an active (open) private chat get an "Open Chat" control.
  const { data: chats } = useQuery({
    queryKey: ["manager-shop-chats"],
    queryFn: fetchManagerChats,
    refetchInterval: 15_000,
  });
  const chatOrderIds = new Set((chats ?? []).map((c) => c.orderId));

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ShopOrderStatus }) => updateManagerOrderStatus(id, status),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["manager-shop-orders"] });
      toast({ title: `Order #${updated.id} → ${updated.status}` });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black uppercase tracking-wide">
          <ShoppingBag className="h-6 w-6 text-primary" /> My Orders
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every customer order from the storefront. Update the status as you fulfil deliveries.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              statusFilter === status
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {status === "all" ? "All" : SHOP_ORDER_STATUS_META[status].label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading orders…
        </div>
      ) : !orders || orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center text-sm text-muted-foreground">
          {statusFilter === "all" ? "No customer orders yet." : `No ${statusFilter} orders.`}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-bold">Order</th>
                <th className="px-4 py-3 font-bold">Product</th>
                <th className="px-4 py-3 font-bold">Customer</th>
                <th className="px-4 py-3 font-bold">Phone</th>
                <th className="px-4 py-3 font-bold">Price</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Chat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-sidebar-accent/40" data-testid={`row-order-${order.id}`}>
                  <td className="px-4 py-3">
                    <p className="font-black">#{order.id}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {order.productImagePath ? (
                        <img
                          src={storageUrl(order.productImagePath)}
                          alt=""
                          className="size-10 flex-shrink-0 rounded-lg border border-border object-cover"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="max-w-[200px] truncate font-bold">{order.productTitle}</p>
                        <p
                          className="text-xs font-bold uppercase"
                          style={{ color: SHOP_CATEGORY_META[order.category]?.accent }}
                        >
                          {SHOP_CATEGORY_META[order.category]?.label ?? order.category}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold">{order.buyerName}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageCircle className="h-3 w-3" /> {order.buyerDiscord ?? order.buyerContact}
                    </p>
                    {order.note ? <p className="mt-0.5 max-w-[200px] truncate text-xs italic text-muted-foreground">“{order.note}”</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    {order.buyerPhone ? (
                      <p className="flex items-center gap-1 text-xs font-bold text-foreground">
                        <Phone className="h-3 w-3" /> {order.buyerPhone}
                      </p>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-black text-primary">{formatPrice(order.priceCents)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(["pending", "processing", "completed", "cancelled"] as ShopOrderStatus[]).map((status) => (
                        <Button
                          key={status}
                          size="sm"
                          variant={order.status === status ? "default" : "outline"}
                          className={`h-7 px-2 text-[11px] font-bold uppercase ${
                            order.status === status ? SHOP_ORDER_STATUS_META[status].className : ""
                          }`}
                          disabled={order.status === status || setStatus.isPending}
                          onClick={() => setStatus.mutate({ id: order.id, status })}
                        >
                          {SHOP_ORDER_STATUS_META[status].label}
                        </Button>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {chatOrderIds.has(order.id) || order.status === "processing" ? (
                      <Button
                        asChild
                        size="sm"
                        className="font-black uppercase tracking-wide"
                        data-testid={`link-manager-chat-${order.id}`}
                      >
                        <Link href={`/admin/shop/orders/${order.id}/chat`}>
                          <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Open Chat
                        </Link>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
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
