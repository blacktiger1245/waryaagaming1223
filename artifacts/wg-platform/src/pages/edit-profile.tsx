import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Loader2, Monitor, Smartphone, UserSearch, Lock, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import { CountryPicker } from "@/components/country-picker";
import { BLOOD_GROUPS } from "@/lib/profile-constants";
import { useToast } from "@/hooks/use-toast";

// Mirrors MAX_BIO_LENGTH on the server (routes/auth.ts).
const MAX_BIO_LENGTH = 600;

/**
 * The player's own editable profile row, as returned by GET /auth/profile.
 * `username`, `displayName` and `avatarUrl` are read-only here — they are
 * mirrored from the linked Discord account.
 */
interface EditableProfile {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  discordId: string | null;
  gamingDevice: string | null;
  deviceName: string | null;
  konamiId: string | null;
  bloodGroup: string | null;
  country: string | null;
  bio: string | null;
  isFreeAgent: boolean;
}

export default function EditProfilePage() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading, isLoggedIn } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: profile, isLoading: profileLoading } = useQuery<EditableProfile>({
    queryKey: ["auth", "profile"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/auth/profile"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load your profile");
      return res.json() as Promise<EditableProfile>;
    },
    enabled: isLoggedIn,
  });

  const [gamingDevice, setGamingDevice] = useState<"mobile" | "pc" | "">("");
  const [deviceName, setDeviceName] = useState("");
  const [konamiId, setKonamiId] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [country, setCountry] = useState("");
  const [bio, setBio] = useState("");
  const [isFreeAgent, setIsFreeAgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login once the auth state is known.
  useEffect(() => {
    if (!authLoading && !isLoggedIn) navigate("/login");
  }, [authLoading, isLoggedIn, navigate]);

  // Hydrate the form from the server profile whenever it (re)fetches.
  useEffect(() => {
    if (!profile) return;
    setGamingDevice(
      profile.gamingDevice === "mobile" || profile.gamingDevice === "pc" ? profile.gamingDevice : "",
    );
    setDeviceName(profile.deviceName ?? "");
    setKonamiId(profile.konamiId ?? "");
    setBloodGroup(profile.bloodGroup ?? "");
    setCountry(profile.country ?? "");
    setBio(profile.bio ?? "");
    setIsFreeAgent(!!profile.isFreeAgent);
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gamingDevice) {
      setError("Please select your gaming device.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/auth/profile"), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gamingDevice, deviceName, konamiId, bloodGroup, country, bio, isFreeAgent }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      // Refresh the cached profile everywhere it is shown (this form, the
      // header, the player's own profile page).
      await qc.invalidateQueries({ queryKey: ["auth", "profile"] });
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      if (user) await qc.invalidateQueries({ queryKey: [`/api/players/${user.id}`] });
      toast({ title: "Profile updated", description: "Your details have been saved." });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !isLoggedIn) return null;

  const identityName =
    profile?.displayName ?? profile?.username ?? user?.displayName ?? user?.username ?? "";
  const avatarUrl = profile?.avatarUrl ?? user?.avatarUrl ?? null;
  const username = profile?.username ?? user?.username ?? "";

  return (
    <div className="container mx-auto px-4 py-10 max-w-2xl">
      <Button variant="ghost" size="sm" className="-ml-2 mb-4 gap-2 text-muted-foreground" asChild>
        <Link href={`/players/${user?.id ?? ""}`}>
          <ArrowLeft className="w-4 h-4" /> Back to my profile
        </Link>
      </Button>

      <div className="flex items-center gap-3 mb-6">
        <div className="size-11 bg-primary flex items-center justify-center rounded-md glow-primary">
          <Save className="text-primary-foreground size-6" />
        </div>
        <div>
          <h1 className="font-black text-xl uppercase tracking-widest">Edit My Profile</h1>
          <p className="text-sm text-muted-foreground">Update your player details at any time.</p>
        </div>
      </div>

      {/* ── Locked identity: name + avatar come from Discord ── */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center gap-4 mb-6">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={identityName}
            className="size-16 rounded-full border border-primary/40 object-cover shrink-0"
          />
        ) : (
          <div className="size-16 rounded-full bg-primary/20 flex items-center justify-center text-xl font-black text-primary shrink-0">
            {identityName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-black text-lg truncate">{identityName}</p>
            <Badge variant="secondary" className="gap-1 text-[10px] uppercase tracking-wider">
              <Lock className="w-3 h-3" /> Discord
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground truncate">@{username}</p>
          <p className="mt-1 text-xs text-muted-foreground flex items-start gap-1.5">
            <Lock className="w-3 h-3 mt-0.5 shrink-0" />
            Your name and avatar are tied to your linked Discord account and can't be changed here.
          </p>
        </div>
      </div>

      {profileLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your details…
        </div>
      )}

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
          <Label className="text-sm font-semibold uppercase tracking-wide">Country</Label>
          <CountryPicker value={country} onChange={setCountry} />
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <Label htmlFor="bio" className="text-sm font-semibold uppercase tracking-wide">
            Bio
          </Label>
          <Textarea
            id="bio"
            placeholder="Tell the community a little about yourself…"
            value={bio}
            maxLength={MAX_BIO_LENGTH}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
          />
          <p className="text-xs text-muted-foreground text-right">
            {bio.length}/{MAX_BIO_LENGTH}
          </p>
        </div>

        {/* Marketplace availability */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <UserSearch className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="space-y-1">
              <Label htmlFor="freeAgent" className="text-sm font-semibold uppercase tracking-wide cursor-pointer">
                Are you a free agent?
              </Label>
              <p className="text-xs text-muted-foreground">
                Show your player profile to teams looking for new talent in the marketplace.
              </p>
            </div>
            <input
              id="freeAgent"
              type="checkbox"
              checked={isFreeAgent}
              onChange={(e) => setIsFreeAgent(e.target.checked)}
              className="ml-auto mt-1 size-4 accent-primary"
            />
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button type="submit" className="font-bold gap-2" disabled={submitting || profileLoading}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {submitting ? "Saving…" : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" className="font-bold" asChild>
            <Link href={`/players/${user?.id ?? ""}`}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
