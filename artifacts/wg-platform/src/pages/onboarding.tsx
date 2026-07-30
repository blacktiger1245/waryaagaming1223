import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Shield, Monitor, Smartphone, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { COUNTRIES, countryCodeToFlag } from "@/lib/countries";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

/** Searchable country picker with flag preview */
function CountryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const selected = COUNTRIES.find((c) => c.name === value);
  const flag = selected ? countryCodeToFlag(selected.code) : null;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:border-primary/50 focus:outline-none focus:border-primary"
      >
        {flag && <span className="text-xl leading-none">{flag}</span>}
        <span className={`flex-1 text-left ${value ? "text-foreground" : "text-muted-foreground"}`}>
          {value || "Select your country…"}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-md border border-border bg-background shadow-xl overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              placeholder="Search country…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {/* List */}
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">No results</li>
            ) : (
              filtered.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => { onChange(c.name); setOpen(false); setSearch(""); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-primary/10 hover:text-primary
                      ${value === c.name ? "bg-primary/10 text-primary font-bold" : ""}`}
                  >
                    <span className="text-lg leading-none">{countryCodeToFlag(c.code)}</span>
                    {c.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  const [, navigate] = useLocation();
  const { isLoggedIn, isLoading, user } = useAuth();
  const qc = useQueryClient();

  const [gamingDevice, setGamingDevice] = useState<"mobile" | "pc" | "">("");
  const [deviceName, setDeviceName] = useState("");
  const [konamiId, setKonamiId] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [country, setCountry] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect away once auth state is known
  useEffect(() => {
    if (isLoading) return;
    if (!isLoggedIn) { navigate("/login"); return; }
    if (user?.profileComplete) { navigate("/dashboard"); return; }
  }, [isLoading, isLoggedIn, user, navigate]);

  if (isLoading || !isLoggedIn || user?.profileComplete) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gamingDevice) {
      setError("Please select your gaming device.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gamingDevice, deviceName, konamiId, bloodGroup, country }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      // Invalidate auth cache so profileComplete refreshes, then go home
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      navigate("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 space-y-7">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="size-12 bg-primary flex items-center justify-center rounded-md glow-primary">
            <Shield className="text-primary-foreground size-7" />
          </div>
          <div>
            <h1 className="font-black text-lg uppercase tracking-widest">Complete Your Profile</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Fill in your details before entering the arena.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Gaming Device */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold uppercase tracking-wide">
              Gaming Device <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setGamingDevice("mobile")}
                className={`flex flex-col items-center gap-2 rounded-md border px-4 py-4 text-sm font-semibold transition-colors focus:outline-none ${
                  gamingDevice === "mobile"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50"
                }`}
              >
                <Smartphone className="size-6" />
                Mobile
              </button>
              <button
                type="button"
                onClick={() => setGamingDevice("pc")}
                className={`flex flex-col items-center gap-2 rounded-md border px-4 py-4 text-sm font-semibold transition-colors focus:outline-none ${
                  gamingDevice === "pc"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50"
                }`}
              >
                <Monitor className="size-6" />
                PC
              </button>
            </div>
          </div>

          {/* Device Name */}
          <div className="space-y-2">
            <Label htmlFor="deviceName" className="text-sm font-semibold uppercase tracking-wide">
              Device Name
            </Label>
            <Input
              id="deviceName"
              placeholder={gamingDevice === "mobile" ? "e.g. iPhone 15 Pro" : "e.g. ASUS ROG Strix"}
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </div>

          {/* Konami ID */}
          <div className="space-y-2">
            <Label htmlFor="konamiId" className="text-sm font-semibold uppercase tracking-wide">
              Konami ID
            </Label>
            <Input
              id="konamiId"
              placeholder="Your Konami ID"
              value={konamiId}
              onChange={(e) => setKonamiId(e.target.value)}
            />
          </div>

          {/* Blood Group */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold uppercase tracking-wide">Blood Group</Label>
            <div className="grid grid-cols-4 gap-2">
              {BLOOD_GROUPS.map((bg) => (
                <button
                  key={bg}
                  type="button"
                  onClick={() => setBloodGroup(bg === bloodGroup ? "" : bg)}
                  className={`rounded-md border px-2 py-2 text-sm font-semibold transition-colors focus:outline-none ${
                    bloodGroup === bg
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {bg}
                </button>
              ))}
            </div>
          </div>

          {/* Country */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold uppercase tracking-wide">
              Country
            </Label>
            <CountryPicker value={country} onChange={setCountry} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full font-bold" disabled={submitting}>
            {submitting ? "Saving…" : "Enter the Arena"}
          </Button>
        </form>
      </div>
    </div>
  );
}
