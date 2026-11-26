import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HeartHandshake, Loader2, Check, X, Smartphone, CreditCard, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface AdminDonation {
  id: number;
  playerId: number;
  method: string;
  amountCents: number;
  currency: string;
  status: string;
  payerName: string | null;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
  playerName: string | null;
  username: string | null;
  playerDonor: boolean | null;
}

const TABS = [
  { key: "pending_review", label: "Awaiting review" },
  { key: "paid", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const STATUS_STYLE: Record<string, string> = {
  pending_review: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
  awaiting_payment: "bg-muted text-muted-foreground border-border",
};

function formatUsd(cents: number): string {
  if (!cents) return "—";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

/**
 * Admin → Donations. Card donations are confirmed by the Stripe webhook; EVC
 * Plus transfers are reported by the donor and confirmed here. Approving grants
 * the supporter badge (yellow name + green tick).
 */
export default function AdminDonationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState("pending_review");

  const { data: rows = [], isLoading } = useQuery<AdminDonation[]>({
    queryKey: ["admin-donations", status],
    queryFn: () => apiFetch<AdminDonation[]>(`/api/admin/donations?status=${status}`),
  });

  const approve = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/donations/${id}/approve`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      toast({ title: "Donation approved", description: "The supporter badge was granted." });
      qc.invalidateQueries({ queryKey: ["admin-donations"] });
    },
    onError: (err: Error) => toast({ title: "Could not approve", description: err.message, variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/donations/${id}/reject`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      toast({ title: "Donation rejected" });
      qc.invalidateQueries({ queryKey: ["admin-donations"] });
    },
    onError: (err: Error) => toast({ title: "Could not reject", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-fuchsia-500">
          <HeartHandshake className="h-5 w-5 text-white" />
        </span>
        <div>
          <h1 className="text-xl font-black uppercase tracking-wide">Donations</h1>
          <p className="text-xs text-muted-foreground">
            Approving an EVC Plus donation grants the supporter badge (yellow name + green tick).
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatus(t.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
              status === t.key
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
          <span className="flex-1">Donor</span>
          <span className="w-24">Method</span>
          <span className="w-20 text-right">Amount</span>
          <span className="w-40">Reported</span>
          <span className="w-28">Status</span>
          <span className="w-40 text-right">Actions</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No donations in this view.</p>
        ) : (
          rows.map((d) => {
            const name = d.playerName ?? d.username ?? `Player ${d.playerId}`;
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-0"
                data-testid={`donation-row-${d.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-bold">
                    {name}
                    {d.playerDonor && <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />}
                  </p>
                  {d.payerName && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      Sent as: <span className="font-bold text-foreground">{d.payerName}</span>
                    </p>
                  )}
                </div>
                <span className="flex w-24 items-center gap-1.5 text-xs text-muted-foreground">
                  {d.method === "stripe" ? (
                    <CreditCard className="h-3.5 w-3.5" />
                  ) : (
                    <Smartphone className="h-3.5 w-3.5" />
                  )}
                  {d.method === "evcplus" ? "EVC Plus" : "Card"}
                </span>
                <span className="w-20 text-right font-bold tabular-nums">{formatUsd(d.amountCents)}</span>
                <span className="w-40 text-xs text-muted-foreground">{formatDate(d.createdAt)}</span>
                <span className="w-28">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                      STATUS_STYLE[d.status] ?? STATUS_STYLE.awaiting_payment
                    }`}
                  >
                    {d.status.replace("_", " ")}
                  </span>
                </span>
                <div className="flex w-40 justify-end gap-1.5">
                  {d.status !== "paid" && (
                    <Button
                      size="sm"
                      className="h-8 gap-1 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500"
                      disabled={approve.isPending}
                      onClick={() => approve.mutate(d.id)}
                    >
                      {approve.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Approve
                    </Button>
                  )}
                  {d.status === "pending_review" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 text-xs font-bold text-destructive"
                      disabled={reject.isPending}
                      onClick={() => reject.mutate(d.id)}
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}

      </div>
    </div>
  );
}
