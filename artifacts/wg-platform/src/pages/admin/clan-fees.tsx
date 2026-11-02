import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

interface ClanRegistration {
  id: number;
  tournamentId: number;
  tournamentName: string | null;
  teamId: number;
  teamName: string | null;
  method: string;
  status: string;
  feeCents: number;
  payerNote: string | null;
  stripeSessionId: string | null;
  createdAt: string;
}

/**
 * Admin → Clan entry fees.
 *
 * Clan tournaments charge an entry fee. Card payments approve themselves through
 * the Stripe webhook (they appear here only for the audit trail). EVC Plus has no
 * API, so those transfers land here as `pending_review` until an admin confirms
 * the money arrived — approving registers the clan in the tournament immediately
 * and writes a `clan_registration_logs` row recording who approved it and when.
 */
export default function AdminClanFeesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending_review");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery<{ registrations: ClanRegistration[] }>({
    queryKey: ["admin-clan-registrations", status],
    queryFn: () => apiFetch(`/api/admin/clan-registrations?status=${status}`),
  });
  const rows = data?.registrations ?? [];

  async function decide(id: number, action: "approve" | "reject") {
    setBusyId(id);
    setError("");
    try {
      await apiFetch(`/api/admin/clan-registrations/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin-clan-registrations"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-wide">Clan entry fees</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          EVC Plus transfers waiting for your confirmation. Approving registers the clan in that
          tournament straight away and records who approved it. Card payments are registered
          automatically by Stripe.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: "pending_review", label: "Waiting for approval" },
          { id: "approved", label: "Approved" },
          { id: "rejected", label: "Rejected" },
          { id: "all", label: "All" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatus(tab.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
              status === tab.id
                ? "border-primary bg-primary/20 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <p className="font-bold text-foreground">
                    {r.teamName ?? `Clan #${r.teamId}`} → {r.tournamentName ?? `Tournament #${r.tournamentId}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.method === "stripe" ? "Card (Stripe)" : "EVC Plus"} · ${(r.feeCents / 100).toFixed(2)} ·{" "}
                    <span className="font-bold uppercase">{r.status.replace("_", " ")}</span> ·{" "}
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                  {r.payerNote && (
                    <p className="mt-1 text-xs text-muted-foreground">Reference: &ldquo;{r.payerNote}&rdquo;</p>
                  )}
                </div>
                {r.status === "approved" || r.status === "rejected" ? (
                  <span className="text-xs font-bold uppercase text-muted-foreground">{r.status}</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Note (optional)"
                      className="h-9 w-40"
                    />
                    <Button className="gap-1.5 font-bold" disabled={busyId === r.id} onClick={() => decide(r.id, "approve")}>
                      {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Approve
                    </Button>
                    <Button
                      className="gap-1.5 border border-border bg-transparent font-bold text-muted-foreground hover:bg-muted"
                      disabled={busyId === r.id}
                      onClick={() => decide(r.id, "reject")}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
