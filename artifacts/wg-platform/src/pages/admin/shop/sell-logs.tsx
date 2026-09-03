import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  ClipboardCheck,
  Inbox,
  Hash,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { storageUrl } from "@/lib/api";
import { StatusChip } from "@/components/shop/product-card";
import {
  approveSellSubmission,
  fetchSellLogs,
  formatDate,
  formatPrice,
  rejectSellSubmission,
  EFOOTBALL_TIER_META,
  SHOP_SELL_STATUS_META,
  type EfootballTier,
  type ManagerShopSellSubmission,
} from "@/lib/shop";

const TIERS: EfootballTier[] = ["cheap", "medium", "expensive"];

/**
 * Large, bold Aqoonsi display — manager eyes only. The API never returns this
 * field outside of the manager endpoints, so customers can never see it.
 */
function AqoonsiBadge({ value }: { value: string }) {
  return (
    <div
      className="inline-flex items-center gap-2.5 rounded-xl border-2 border-amber-500/60 bg-amber-500/10 px-4 py-2.5 shadow-[0_0_18px_rgba(245,158,11,0.25)]"
      title="Aqoonsi (account ID) — visible to the WG-SHOP Manager only"
      data-testid="aqoonsi-badge"
    >
      <Hash className="h-5 w-5 text-amber-400" />
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400/80">Aqoonsi</p>
        <p className="text-3xl font-black leading-none tracking-widest text-amber-300">{value}</p>
      </div>
    </div>
  );
}

/** Approve confirmation: enter the Aqoonsi and pick exactly one category. */
function ApproveDialog({
  submission,
  onClose,
}: {
  submission: ManagerShopSellSubmission;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [aqoonsi, setAqoonsi] = useState("");
  const [tier, setTier] = useState<EfootballTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: () =>
      approveSellSubmission(submission.id, {
        aqoonsiId: aqoonsi.trim(),
        subcategory: tier as EfootballTier,
      }),
    onSuccess: ({ product }) => {
      qc.invalidateQueries({ queryKey: ["manager-sell-logs"] });
      qc.invalidateQueries({ queryKey: ["manager-shop-products"] });
      qc.invalidateQueries({ queryKey: ["shop", "products"] });
      // Defensive lookup — never assume the tier label exists in the response.
      const tierMeta = product.subcategory ? EFOOTBALL_TIER_META[product.subcategory] : undefined;
      toast({
        title: "Account Approved Successfully ✓",
        description: tierMeta ? `Published in ${tierMeta.label}.` : "The account is now live in the shop.",
      });
      onClose();
    },
    // NEVER crash the page: keep the dialog mounted and show a readable
    // error with a Try Again button instead.
    onError: (err: Error) =>
      setFailed(err.message || "The approval request failed. Please try again."),
  });

  const confirm = () => {
    if (!aqoonsi.trim()) {
      setError("Enter the Aqoonsi (account ID).");
      return;
    }
    if (!tier) {
      setError("Select a category: Cheap, Normal or Expensive.");
      return;
    }
    setError(null);
    approve.mutate();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg" data-testid="dialog-approve-submission">
        <DialogHeader>
          <DialogTitle>Approve account #{submission.id}</DialogTitle>
          <DialogDescription>
            Enter the account's Aqoonsi (ID number) and pick the category. The account is published instantly in
            the selected tier.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="aqoonsi-input">Aqoonsi / Account ID</Label>
            <Input
              id="aqoonsi-input"
              value={aqoonsi}
              onChange={(e) => setAqoonsi(e.target.value)}
              placeholder="e.g. 12345"
              className="h-12 text-lg font-black tracking-widest"
              data-testid="input-aqoonsi"
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <div className="grid grid-cols-3 gap-2">
              {TIERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={`rounded-lg border px-3 py-2.5 text-xs font-black uppercase tracking-wide transition-colors ${
                    tier === t
                      ? "border-green-500 bg-green-500/15 text-green-400"
                      : "border-border bg-card text-muted-foreground hover:border-green-500/50 hover:text-green-400"
                  }`}
                  data-testid={`button-approve-tier-${t}`}
                >
                  {EFOOTBALL_TIER_META[t].label.replace(" Accounts", "")}
                </button>
              ))}
            </div>
          </div>

          {error ? <p className="text-sm font-bold text-destructive">{error}</p> : null}

          {failed ? (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3" data-testid="approval-error">
              <p className="text-sm font-black uppercase tracking-wide text-red-400">Approval Failed</p>
              <p className="mt-1 text-sm text-red-300">{failed}</p>
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setFailed(null)}>
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  className="font-black uppercase tracking-wide"
                  onClick={() => {
                    setFailed(null);
                    approve.mutate();
                  }}
                  data-testid="button-try-again"
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Try Again
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={approve.isPending}>
            Cancel
          </Button>
          <Button
            className="font-black uppercase tracking-wide"
            onClick={confirm}
            disabled={approve.isPending}
            data-testid="button-confirm-approve"
          >
            {approve.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Approve & Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reject confirmation with an optional reason the seller can read. */
function RejectDialog({
  submission,
  onClose,
}: {
  submission: ManagerShopSellSubmission;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  const reject = useMutation({
    mutationFn: () => rejectSellSubmission(submission.id, reason.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manager-sell-logs"] });
      qc.invalidateQueries({ queryKey: ["shop", "sell", "mine"] });
      toast({ title: "Submission rejected" });
      onClose();
    },
    onError: (err: Error) =>
      toast({ title: "Rejection failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg" data-testid="dialog-reject-submission">
        <DialogHeader>
          <DialogTitle>Reject account #{submission.id}</DialogTitle>
          <DialogDescription>
            The seller keeps their submission status visible. You can optionally tell them why.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reject-reason">Reason (optional)</Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Screenshots are unclear — please resubmit with full inventory views."
            data-testid="input-reject-reason"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={reject.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="font-black uppercase tracking-wide"
            onClick={() => reject.mutate()}
            disabled={reject.isPending}
            data-testid="button-confirm-reject"
          >
            {reject.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Full manager-only detail card for one sell submission. */
function SubmissionCard({
  submission,
  onApprove,
  onReject,
}: {
  submission: ManagerShopSellSubmission;
  onApprove: () => void;
  onReject: () => void;
}) {
  const status = SHOP_SELL_STATUS_META[submission.status];
  const StatusIcon =
    submission.status === "approved" ? CheckCircle2 : submission.status === "rejected" ? XCircle : Clock;

  return (
    <div
      className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
      data-testid={`card-sell-log-${submission.id}`}
    >
      {/* Header: seller identity + status */}
      <div className="flex flex-wrap items-start gap-3">
        {submission.profileImagePath ? (
          <img
            src={storageUrl(submission.profileImagePath)}
            alt=""
            className="size-14 flex-shrink-0 rounded-lg border border-border object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-black uppercase tracking-wide">
            #{submission.id} · {submission.sellerName}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Phone: <span className="font-bold text-foreground">{submission.phone}</span> · Discord:{" "}
            <span className="font-bold text-foreground">{submission.sellerDiscord}</span>
          </p>
          <p className="text-xs text-muted-foreground">Submitted {formatDate(submission.createdAt)}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${status.className}`}
        >
          <StatusIcon className="h-3.5 w-3.5" />
          {status.label}
        </span>
      </div>

      {/* Facts grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Price</p>
          <p className="text-lg font-black text-primary">{formatPrice(submission.priceCents)}</p>
        </div>
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Team Strength</p>
          <p className="text-lg font-black text-green-400">
            {submission.teamStrength !== null ? submission.teamStrength.toLocaleString() : "—"}
          </p>
        </div>
        <div className="col-span-2 rounded-lg border border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Account links</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <StatusChip label="Konami ID" ok={submission.konamiIdLinked} />
            <StatusChip label="Google Play" ok={submission.googlePlayLinked} />
            <StatusChip label="Game Center" ok={submission.gameCenterLinked} />
          </div>
        </div>
      </div>

      {/* Manager-only Aqoonsi — large & bold */}
      {submission.aqoonsiId ? <AqoonsiBadge value={submission.aqoonsiId} /> : null}

      {/* Rejection reason */}
      {submission.status === "rejected" && submission.rejectionReason ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          <span className="font-black uppercase tracking-wide">Rejection reason:</span> {submission.rejectionReason}
        </p>
      ) : null}

      {/* Seller notes (private) */}
      {submission.notes ? (
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Seller notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{submission.notes}</p>
        </div>
      ) : null}

      {/* All account pictures */}
      {submission.galleryPaths.length > 0 ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Account pictures ({submission.galleryPaths.length})
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {submission.galleryPaths.map((path, idx) => (
              <a
                key={`${path}-${idx}`}
                href={storageUrl(path)}
                target="_blank"
                rel="noreferrer"
                className="flex-shrink-0"
                title="Open full image"
              >
                <img
                  src={storageUrl(path)}
                  alt=""
                  className="h-20 w-20 rounded-lg border border-border object-cover transition-transform hover:scale-105"
                />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {/* Actions */}
      {submission.status === "pending" ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <Button
            variant="destructive"
            className="font-black uppercase tracking-wide"
            onClick={onReject}
            data-testid={`button-reject-${submission.id}`}
          >
            <XCircle className="mr-1.5 h-4 w-4" /> Reject
          </Button>
          <Button
            className="font-black uppercase tracking-wide"
            onClick={onApprove}
            data-testid={`button-approve-${submission.id}`}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
          </Button>
        </div>
      ) : submission.publishedProductId ? (
        <p className="flex items-center justify-end gap-1.5 border-t border-border pt-3 text-xs font-bold text-muted-foreground">
          Published as product #{submission.publishedProductId}
          <a
            href={`/shop/product/${submission.publishedProductId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            View listing <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      ) : null}
    </div>
  );
}

type SellLogFilter = "pending" | "approved" | "rejected" | "all";

const FILTERS: { value: SellLogFilter; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

/**
 * Sell Logs — /admin/shop/sell-logs (WG-SHOP Manager only).
 * Reviews user-submitted eFootball accounts: approve (Aqoonsi + category →
 * publishes into that tier) or reject (optional reason).
 */
export default function AdminShopSellLogsPage() {
  const [filter, setFilter] = useState<SellLogFilter>("pending");
  const [approving, setApproving] = useState<ManagerShopSellSubmission | null>(null);
  const [rejecting, setRejecting] = useState<ManagerShopSellSubmission | null>(null);

  const { data: submissions, isLoading } = useQuery({
    queryKey: ["manager-sell-logs", filter],
    queryFn: () => fetchSellLogs(filter === "all" ? undefined : filter),
  });

  const list = submissions ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide">Sell Logs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review accounts submitted by sellers. Approving publishes the account in the chosen category.
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            data-testid={`tab-sell-logs-${f.value}`}
            className={`rounded-lg border px-4 py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
              filter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Submissions */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading sell logs…
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <Inbox className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <p className="mt-3 text-sm text-muted-foreground">
            {filter === "pending"
              ? "No accounts waiting for review — sellers' submissions will appear here."
              : "Nothing here yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((submission) => (
            <SubmissionCard
              key={submission.id}
              submission={submission}
              onApprove={() => setApproving(submission)}
              onReject={() => setRejecting(submission)}
            />
          ))}
        </div>
      )}

      {approving ? <ApproveDialog submission={approving} onClose={() => setApproving(null)} /> : null}
      {rejecting ? <RejectDialog submission={rejecting} onClose={() => setRejecting(null)} /> : null}

      {/* Manager-only reminder */}
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ClipboardCheck className="h-3.5 w-3.5" />
        Sell Logs and the Aqoonsi are visible to the WG-SHOP Manager only.
      </p>
    </div>
  );
}




