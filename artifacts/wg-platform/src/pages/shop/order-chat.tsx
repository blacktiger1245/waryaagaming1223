import { useRoute } from "wouter";
import { OrderChat } from "@/components/shop/order-chat";

/**
 * Customer side of the private order chat — /shop/orders/:orderId/chat.
 * Rendered inside the global layout + WG-SHOP section bar. All authorization
 * is enforced by the API (own clientId / own user id only).
 */
export default function ShopOrderChatPage() {
  const [match, params] = useRoute("/shop/orders/:orderId/chat");
  const orderId = match && params ? Number(params.orderId) : NaN;
  if (!match || !Number.isInteger(orderId) || orderId <= 0) return null;
  return <OrderChat orderId={orderId} viewer="customer" />;
}
