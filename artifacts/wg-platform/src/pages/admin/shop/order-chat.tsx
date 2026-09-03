import { useRoute } from "wouter";
import { OrderChat } from "@/components/shop/order-chat";

/**
 * Manager side of the private order chat — /admin/shop/orders/:id/chat.
 * Includes the Transcript and Close/Delete controls; all authorization is
 * enforced by the API (WG-SHOP Manager role only).
 */
export default function AdminShopOrderChatPage() {
  const [match, params] = useRoute("/admin/shop/orders/:id/chat");
  const orderId = match && params ? Number(params.id) : NaN;
  if (!match || !Number.isInteger(orderId) || orderId <= 0) return null;
  return <OrderChat orderId={orderId} viewer="manager" />;
}
