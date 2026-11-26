import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "wouter";
import {
  HeartHandshake,
  CreditCard,
  Smartphone,
  Loader2,
  CheckCircle2,
  Trophy,
  Award,
  Rocket,
  Cpu,
  Users,
  Copy,
  Check,
  Sparkles,
  BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

interface DonationConfig {
  evcNumber: string;
  evcAccountName: string;
  amountsCents: number[];
  currency: string;
  cardEnabled: boolean;
}

interface DonationRow {
  id: number;
  method: string;
  amountCents: number;
  currency: string;
  status: string;
  payerName: string | null;
  stripeSessionId: string | null;
  createdAt: string;
  paidAt: string | null;
}

interface DonationsMe {
  isDonor: boolean;
  donorSince: string | null;
  donations: DonationRow[];
}

/** `$5` / `$2.50` from US cents. */
function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/** What a donation funds — mirrors the "Maxaa taageeradaadu qabanaysaa?" section. */
const PERKS = [
  { icon: Trophy, title: "Tartamada eFootball", body: "Qabanqaabinta tartamo tayo sare leh oo loogu talagalay ciyaartoyda Soomaaliyeed." },
  { icon: Award, title: "Abaalmarinnada", body: "Kordhinta abaalmarinnada iyo dhiirrigelinta ciyaartoyda guuleysta." },
  { icon: Rocket, title: "Horumarinta ciyaartoyda", body: "Abuurista fursado ay ciyaartoydu ku muujiyaan xirfadahooda." },
  { icon: Cpu, title: "Teknoolajiyadda", body: "Horumarinta website-ka, nidaamka tartamada iyo adeegyada bulshada." },
  { icon: Users, title: "Bulshada eFootball", body: "Dhisidda bulsho mideysan oo taageerta ciyaartoyda iyo horumarinta eFootball-ka Soomaaliya." },
];

/** How often /donate asks whether a card donation has been confirmed yet. */
const PAID_POLL_MS = 2500;
const PAID_POLL_TIMEOUT_MS = 45_000;

export default function DonatePage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [cardOpen, setCardOpen] = useState(false);
  const [evcOpen, setEvcOpen] = useState(false);
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [payerName, setPayerName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [evcSent, setEvcSent] = useState(false);
  const [paidSessionId, setPaidSessionId] = useState<string | null>(null);
  const reported = useRef<Set<string>>(new Set());

  const { data: config } = useQuery<DonationConfig>({
    queryKey: ["donation-config"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/donations/config"), { credentials: "include" });
      if (!res.ok) throw new Error("Could not load the donation options");
      return res.json();
    },
  });

  const { data: me } = useQuery<DonationsMe>({
    queryKey: ["donations-me"],
    enabled: isLoggedIn,
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/donations/me"), { credentials: "include" });
      if (!res.ok) return { isDonor: false, donorSince: null, donations: [] };
      return res.json();
    },
  });

  const amounts = config?.amountsCents?.length ? config.amountsCents : [200, 500, 1000, 2500, 5000];
  const selectedAmount = amountCents ?? amounts[Math.min(1, amounts.length - 1)];

  const cardDonation = useMutation({
    mutationFn: async (cents: number) => {
      const res = await fetch(apiUrl("/api/donations/checkout"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not start the card payment");
      return data.url;
    },
    onSuccess: (url) => {
      // Hosted Stripe Checkout — hand the browser over to Stripe's page.
      window.location.href = url;
    },
    onError: (err: Error) =>
      toast({ title: "Could not start the payment", description: err.message, variant: "destructive" }),
  });

  const evcDonation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(apiUrl("/api/donations/evc-plus"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payerName: name }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not send your name");
      return data;
    },
    onSuccess: () => {
      setEvcSent(true);
      qc.invalidateQueries({ queryKey: ["donations-me"] });
    },
    onError: (err: Error) => toast({ title: "Could not send", description: err.message, variant: "destructive" }),
  });

  // Stripe sends the donor back to /donate?donation=success&session_id=cs_...
  const donationResult = searchParams.get("donation");
  const returnedSessionId = searchParams.get("session_id");

  useEffect(() => {
    if (donationResult !== "success" && donationResult !== "cancelled") return;
    if (donationResult === "success") {
      if (returnedSessionId) setPaidSessionId(returnedSessionId);
    } else {
      toast({ title: "Payment cancelled", description: "No donation was taken." });
    }
    setSearchParams({}, { replace: true });
  }, [donationResult, returnedSessionId, setSearchParams, toast]);

  // Confirm the card donation against the Checkout Session it paid for: the
  // webhook grants the badge a moment after the redirect, so poll until it lands.
  useEffect(() => {
    if (!paidSessionId || !isLoggedIn) return;
    if (reported.current.has(paidSessionId)) return;
    const sessionId = paidSessionId;
    const deadline = Date.now() + PAID_POLL_TIMEOUT_MS;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      try {
        const res = await fetch(apiUrl(`/api/donations/session/${sessionId}`), { credentials: "include" });
        const data = res.ok ? ((await res.json()) as { paid?: boolean }) : null;
        if (cancelled) return;
        if (data?.paid) {
          reported.current.add(sessionId);
          qc.invalidateQueries({ queryKey: ["donations-me"] });
          toast({
            title: "Mahadsanid! 💛",
            description: "Your donation was received — you are now a Waryaa Gaming supporter.",
          });
          return;
        }
      } catch {
        // Transient network error — keep polling until the deadline.
      }
      if (cancelled) return;
      if (Date.now() > deadline) {
        reported.current.add(sessionId);
        toast({
          title: "Payment received",
          description: "Your supporter badge appears as soon as Stripe confirms the donation.",
        });
        return;
      }
      timer = setTimeout(check, PAID_POLL_MS);
    };

    timer = setTimeout(check, PAID_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paidSessionId, isLoggedIn, qc, toast]);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      // Clipboard blocked — the value is visible on screen anyway.
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0a0714] text-white">
      {/* Glow field */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute top-40 -left-24 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
        {/* Already a supporter */}
        {me?.isDonor && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
            <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-400" />
            <p className="text-sm font-bold text-emerald-200">
              Waad taageeraysaa Waryaa Gaming — mahadsanid! Badge-kaaga (magac huruud ah + calaamad cagaar ah) waa la dhaqaajiyay.
            </p>
          </div>
        )}

        {/* Hero */}
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
            <Sparkles className="h-3.5 w-3.5" /> Taageer
          </span>
          <h1 className="mt-4 text-4xl font-black uppercase leading-tight tracking-tight sm:text-5xl">
            Taageer{" "}
            <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
              Waryaa Gaming
            </span>{" "}
            <span aria-hidden>⚽</span>
          </h1>
          <p className="mt-3 text-base font-bold text-amber-200 sm:text-lg">
            Aan si wadajir ah u horumarino eFootball-ka Soomaaliyeed!
          </p>
        </header>

        {/* Manifesto */}
        <section className="mt-8 space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <p className="text-[15px] leading-relaxed text-white/80">
            Waryaa Gaming waa bulsho u heellan horumarinta iyo kobcinta ciyaarta eFootball ee Soomaaliya. Waxaan isku
            xirnaa ciyaartoyda eFootball, qabanqaabinnaa tartamo xiiso leh, abuurnaa fursado tartan iyo is-dhexgal,
            waxaana dhiirrigelinnaa hibada ciyaartoyda Soomaaliyeed.
          </p>
          <p className="text-[15px] leading-relaxed text-white/80">
            Himiladeennu waa inaan dhisno bulsho eFootball oo heer sare ah, halkaas oo ciyaartoyda Soomaaliyeed ay ku
            tartami karaan, ku horumari karaan, kuna gaari karaan heer caalami ah.
          </p>

          <div>
            <h2 className="text-xl font-black uppercase tracking-wide text-white">Maxaa taageeradaadu qabanaysaa?</h2>
            <p className="mt-1 text-sm text-white/60">Deeqdaadu waxay naga caawinaysaa:</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {PERKS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-fuchsia-500">
                      <Icon className="h-4 w-4 text-white" />
                    </span>
                    <p className="text-sm font-black text-white">{title}</p>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-white/70">{body}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-black uppercase tracking-wide text-white">Noqo qayb ka mid ah guusha!</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-white/80">
              Taageeradaadu, ha yaraato ama ha weynaato, waxay naga caawinaysaa inaan qabanno tartamo ka wanaagsan,
              abaalmarinno ka qiimo badan, iyo fursado badan oo ay ciyaartoyda Soomaaliyeed ku gaaraan riyooyinkooda.
            </p>
            <p className="mt-3 font-bold text-amber-200">
              Maanta nagu taageer, berri qayb ka noqo guusha eFootball-ka Soomaaliyeed!
            </p>
          </div>

          <div className="border-t border-white/10 pt-5 text-center">
            <p className="text-lg font-black uppercase tracking-[0.3em] text-white">Waryaa Gaming</p>
            <p className="mt-1 text-sm font-black uppercase tracking-[0.25em] text-emerald-300">Stronger Together ⚽</p>
            <p className="mt-3 text-xs text-white/60">
              Mahadsanid inaad taageerayso mustaqbalka eFootball-ka Soomaaliya!
            </p>
          </div>
        </section>

        {/* Donate */}
        <section
          id="donate"
          className="mt-6 rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 via-fuchsia-500/[0.06] to-transparent p-6 sm:p-8"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-fuchsia-500 shadow-lg shadow-amber-500/20">
              <HeartHandshake className="h-6 w-6 text-white" />
            </span>
            <div>
              <h2 className="text-lg font-black uppercase tracking-wide text-white">Taageer maanta</h2>
              <p className="text-xs text-white/60">
                Dooro habka aad ku taageerayso — kaadhka (Stripe) ama EVC Plus.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button
              size="lg"
              disabled={authLoading || !config?.cardEnabled}
              onClick={() => setCardOpen(true)}
              className="h-14 gap-2 bg-gradient-to-r from-cyan-500 to-violet-600 text-sm font-black uppercase tracking-wide text-white hover:opacity-90"
            >
              <CreditCard className="h-5 w-5" /> Donate with Debit Card
            </Button>
            <Button
              size="lg"
              disabled={authLoading}
              onClick={() => {
                setEvcSent(false);
                setEvcOpen(true);
              }}
              className="h-14 gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-sm font-black uppercase tracking-wide text-white hover:opacity-90"
            >
              <Smartphone className="h-5 w-5" /> Donate with EVC Plus
            </Button>
          </div>

          {config && !config.cardEnabled && (
            <p className="mt-3 text-center text-[11px] text-amber-200/80">
              Card donations are not configured on this host yet — EVC Plus is available.
            </p>
          )}
          {!isLoggedIn && !authLoading && (
            <p className="mt-3 text-center text-xs text-white/60">
              Waa in aad sameysaa login si aad u taageerto oo aad u hesho badge-ka.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <span className="flex items-center gap-1.5 text-sm font-black text-amber-300">
              Magacaaga <BadgeCheck className="h-4 w-4 text-emerald-400" />
            </span>
            <p className="text-xs text-white/70">
              Markaad deeqdo, magacaagu wuxuu noqonayaa mid huruud ah oo wuxuu helayaa calaamad cagaar ah (green tick).
            </p>
          </div>
        </section>

        {/* Card dialog */}
        <Dialog open={cardOpen} onOpenChange={setCardOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-cyan-400" /> Donate with Debit Card
              </DialogTitle>
            </DialogHeader>

            {!isLoggedIn ? (
              <p className="py-3 text-sm text-white/70">
                Fadlan marka hore sameyso login, kadib waxaad ku deeqi kartaa kaadhka.
              </p>
            ) : (
              <div className="space-y-4 py-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-white/60">Dooro lacagta</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {amounts.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAmountCents(c)}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-black transition ${
                          selectedAmount === c
                            ? "border-cyan-400 bg-cyan-500/20 text-white"
                            : "border-white/10 text-white/70 hover:border-cyan-400/40"
                        }`}
                      >
                        {formatUsd(c)}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-white/60">
                  Waxaad si toos ah ugu gudbi doontaa bogga lacag-bixinta ee Stripe.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setCardOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!isLoggedIn || cardDonation.isPending}
                onClick={() => cardDonation.mutate(selectedAmount)}
                className="gap-2 bg-gradient-to-r from-cyan-500 to-violet-600 font-black text-white"
              >
                {cardDonation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                Continue ({formatUsd(selectedAmount)})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* EVC Plus dialog */}
        <Dialog
          open={evcOpen}
          onOpenChange={(v) => {
            setEvcOpen(v);
            if (!v) {
              setEvcSent(false);
              setPayerName("");
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-emerald-400" /> Donate with EVC Plus
              </DialogTitle>
            </DialogHeader>

            {evcSent ? (
              <div className="py-4 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
                <p className="mt-3 text-sm font-bold text-white">Mahadsanid! Deeqdaada waa la diray.</p>
                <p className="mt-1 text-xs text-white/60">
                  Waxaan sugaynaa ansixinta admin-ka. Marka la ansixiyo, magacaaga wuxuu noqonayaa huruud oo wuxuu
                  helayaa calaamad cagaar ah.
                </p>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                  <p className="text-sm font-bold text-emerald-100">
                    Waakan numberka Waryaa Gaming, magaca ku qoran waa{" "}
                    <span className="text-white">{config?.evcAccountName ?? "Waryaa Gaming Store"}</span>
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-black/30 px-3 py-2.5">
                    <span className="font-mono text-lg font-black tracking-wide text-white">
                      {config?.evcNumber ?? "+252 61 3256466"}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-xs text-emerald-200"
                      onClick={() => copy(config?.evcNumber ?? "+252 61 3256466", "number")}
                    >
                      {copied === "number" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === "number" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-white/60">
                    Qor magaca aad lacagta ku dirtay
                  </label>
                  <Input
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    placeholder="Magacaaga"
                    maxLength={80}
                  />
                  <p className="text-[11px] text-white/50">
                    Magaca aad ku qortay markii aad EVC Plus lacagta ku dirtay — admin-ku wuu xaqiijin doonaa.
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setEvcOpen(false)}>
                Close
              </Button>
              {!evcSent && (
                <Button
                  disabled={!isLoggedIn || !payerName.trim() || evcDonation.isPending}
                  onClick={() => evcDonation.mutate(payerName.trim())}
                  className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 font-black text-white"
                >
                  {evcDonation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  I sent the money
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>


      </div>
    </div>
  );

}
