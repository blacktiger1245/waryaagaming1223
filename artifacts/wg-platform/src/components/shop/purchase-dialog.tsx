import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart, Loader2, CheckCircle2, X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { storageUrl } from "@/lib/api";
import { formatPrice, placeShopOrder, type ShopProduct } from "@/lib/shop";

/**
 * Guest checkout dialog — the storefront has no login, so the buyer leaves a
 * name + Discord contact and receives an order number trackable under
 * My Orders on this device.
 */
export function PurchaseDialog({ product, onClose }: { product: ShopProduct; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [buyerName, setBuyerName] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<number | null>(null);

  const order = useMutation({
    mutationFn: () =>
      placeShopOrder({
        productId: product.id,
        buyerName: buyerName.trim(),
        buyerContact: buyerContact.trim(),
        note: note.trim() || undefined,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["shop", "orders"] });
      setPlacedOrderId(data.id);
      toast({ title: "Order placed!", description: `Order #${data.id} — we will contact you on Discord.` });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const submit = () => {
    if (!buyerName.trim()) return setError("Please enter your name.");
    if (!buyerContact.trim()) return setError("Please enter your Discord username or contact.");
    setError(null);
    order.mutate();
  };

  const imageSrc = storageUrl(product.profileImagePath);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="dialog-purchase"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="flex items-center gap-2 font-black uppercase tracking-widest text-foreground">
            <ShoppingCart className="h-5 w-5 text-primary" /> Checkout
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
              Track its status anytime under <span className="font-bold text-foreground">My Orders</span>. Our team
              will reach out on Discord to complete delivery.
            </p>
            <Button className="mt-2 w-full font-bold" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <div className="px-5 py-5 space-y-4">
            {/* Product summary */}
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              {imageSrc ? <img src={imageSrc} alt="" className="h-12 w-12 rounded-md object-cover" /> : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{product.title}</p>
                <p className="text-xs text-muted-foreground">
                  {product.coinAmount ?? product.nitroPlan ?? "WG-SHOP product"}
                </p>
              </div>
              <span className="text-lg font-black text-primary">{formatPrice(product.priceCents)}</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="buyer-name">Your name</Label>
              <Input
                id="buyer-name"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="e.g. Ahmed"
                data-testid="input-buyer-name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="buyer-contact" className="flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" /> Discord username or contact
              </Label>
              <Input
                id="buyer-contact"
                value={buyerContact}
                onChange={(e) => setBuyerContact(e.target.value)}
                placeholder="e.g. ahmed_wg"
                data-testid="input-buyer-contact"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="buyer-note">Note (optional)</Label>
              <Textarea
                id="buyer-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything we should know?"
                rows={2}
              />
            </div>

            {error ? <p className="text-sm font-bold text-destructive">{error}</p> : null}

            <Button
              className="w-full font-black uppercase tracking-wide"
              onClick={submit}
              disabled={order.isPending}
            >
              {order.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShoppingCart className="mr-2 h-4 w-4" />
              )}
              Place Order — {formatPrice(product.priceCents)}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

