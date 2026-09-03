import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart, Loader2, CheckCircle2, X, Phone, User, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { storageUrl } from "@/lib/api";
import { formatPrice, placeShopOrder, SHOP_CATEGORY_META, type ShopProduct } from "@/lib/shop";

/**
 * "Complete Your Order" — the Buy button opens this form first; the final
 * order is only created when the customer submits it. Collects phone number,
 * full name and Discord username (auto-filled from the platform session when
 * available) and shows the product summary before "Place Order".
 */
export function PurchaseDialog({ product, onClose }: { product: ShopProduct; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  // Auto-fill the Discord username from the logged-in profile when known —
  // the customer can still see and adjust it before submitting.
  const [buyerDiscord, setBuyerDiscord] = useState(user?.username ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [orderFailed, setOrderFailed] = useState<string | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<number | null>(null);

  const order = useMutation({
    mutationFn: () =>
      placeShopOrder({
        productId: product.id,
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        buyerDiscord: buyerDiscord.trim(),
        note: note.trim() || undefined,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["shop", "orders"] });
      setPlacedOrderId(data.id);
      toast({ title: "Order placed!", description: `Order #${data.id} — track it under My Orders.` });
    },
    onError: (err: Error) => {
      // NEVER leave the customer with a dead dialog — show a readable error.
      setOrderFailed(err.message || "Unable to create order. Please try again.");
    },
  });

  const submit = () => {
    if (!buyerName.trim()) return setError("Please enter your full name.");
    if (!buyerPhone.trim()) return setError("Please enter your phone number.");
    if (!buyerDiscord.trim()) return setError("Please enter your Discord username.");
    setError(null);
    setOrderFailed(null);
    order.mutate();
  };

  const imageSrc = storageUrl(product.profileImagePath);
  const categoryMeta = SHOP_CATEGORY_META[product.category];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 backdrop-blur-sm px-4 py-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="dialog-purchase"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="flex items-center gap-2 font-black uppercase tracking-widest text-foreground">
            <ShoppingCart className="h-5 w-5 text-primary" /> Complete Your Order
          </h3>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {placedOrderId !== null ? (
          <div className="px-5 py-8 text-center space-y-3">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <h4 className="text-lg font-black uppercase tracking-wide">Order #{placedOrderId} placed!</h4>
            <p className="text-sm text-muted-foreground">
              Status: <span className="font-bold text-yellow-400">Pending</span>. Track it anytime under{" "}
              <span className="font-bold text-foreground">My Orders</span> — the private order chat opens once
              the team starts processing your delivery.
            </p>
            <Button className="mt-2 w-full font-bold" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-5 px-5 py-5">
            {/* Product summary */}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt={product.title}
                  className="size-16 flex-shrink-0 rounded-lg border border-border object-cover"
                />
              ) : (
                <div
                  className="flex size-16 flex-shrink-0 items-center justify-center rounded-lg border border-border text-xl font-black"
                  style={{ backgroundColor: categoryMeta.accentSoft, color: categoryMeta.accent }}
                >
                  {categoryMeta.label.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{product.title}</p>
                <p
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ color: categoryMeta.accent }}
                >
                  {categoryMeta.label}
                </p>
              </div>
              <p className="text-xl font-black text-primary">{formatPrice(product.priceCents)}</p>
            </div>

            {/* Customer details */}
            <div className="space-y-1.5">
              <Label htmlFor="checkout-phone">Phone Number</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="checkout-phone"
                  type="tel"
                  className="pl-9"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  placeholder="e.g. 0612345678"
                  data-testid="input-checkout-phone"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkout-name">Full Name</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="checkout-name"
                  className="pl-9"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="e.g. Abdul Aziz"
                  data-testid="input-checkout-name"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="checkout-discord">Discord Username</Label>
              <div className="relative">
                <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="checkout-discord"
                  className="pl-9"
                  value={buyerDiscord}
                  onChange={(e) => setBuyerDiscord(e.target.value)}
                  placeholder={user ? user.username : "e.g. Black_Tiger"}
                  data-testid="input-checkout-discord"
                />
              </div>
              {user ? (
                <p className="text-xs text-muted-foreground">
                  Auto-filled from your Discord profile — you can still edit it.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkout-note">Additional Note (optional)</Label>
              <Textarea
                id="checkout-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Anything we should know…"
              />
            </div>

            {error ? <p className="text-sm font-bold text-destructive">{error}</p> : null}

            {orderFailed ? (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3" data-testid="order-error">
                <p className="text-sm font-black uppercase tracking-wide text-red-400">Order Failed</p>
                <p className="mt-1 text-sm text-red-300">{orderFailed}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    setOrderFailed(null);
                    order.mutate();
                  }}
                  data-testid="button-order-try-again"
                >
                  Try Again
                </Button>
              </div>
            ) : null}

            <Button
              size="lg"
              className="w-full font-black uppercase tracking-wide"
              onClick={submit}
              disabled={order.isPending}
              data-testid="button-place-order"
            >
              {order.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShoppingCart className="mr-2 h-4 w-4" />
              )}
              {order.isPending ? "Placing order…" : "Place Order"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}


