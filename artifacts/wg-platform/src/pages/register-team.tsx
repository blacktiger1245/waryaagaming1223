import { useCallback, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Shield, Upload, X, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { apiUrl, uploadTeamLogo } from "@/lib/api";

/**
 * Clan registration.
 *
 * A clan only needs a NAME and a LOGO. The founder automatically becomes the
 * President/Coach/Captain and can invite the rest of the squad afterwards from
 * the clan management page.
 */
async function registerTeam(payload: { name: string; logoUrl?: string }) {
  const res = await fetch(apiUrl("/api/teams/register"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Could not register your clan");
  return data as { id: number; name: string };
}

export default function RegisterTeamPage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [teamName, setTeamName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setLogoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleLogoFile(file);
    },
    [handleLogoFile],
  );

  const clearLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return setError("Clan name is required");
    setError(null);
    setSubmitting(true);
    try {
      let logoUrl: string | undefined;
      if (logoFile) {
        const objectPath = await uploadTeamLogo(logoFile);
        logoUrl = `/api/storage${objectPath}`;
      }

      const team = await registerTeam({ name: teamName.trim(), logoUrl });

      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["my-team"] });
      navigate(`/teams/${team.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register your clan");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-24 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isLoggedIn || !user) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
        <h1 className="text-2xl font-black uppercase tracking-tight mb-2">Register Your Clan</h1>
        <p className="text-muted-foreground mb-6">You must be logged in with Discord to register a team.</p>
        <Button asChild>
          <a href={apiUrl("/api/auth/discord")}>Login with Discord</a>
        </Button>
      </div>
    );
  }


  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground" onClick={() => navigate("/teams")}>
        <ArrowLeft className="w-4 h-4" /> Clans
      </Button>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="text-4xl font-black uppercase tracking-tight">Register Your Clan</h1>
          <p className="text-muted-foreground mt-2">
            Just pick a name and a logo — you become the clan President automatically.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── Team Logo ── */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Clan Logo</h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-3 h-44 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-primary/5"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleLogoFile(e.target.files[0])}
              />
              {logoPreview ? (
                <div className="relative">
                  <img src={logoPreview} alt="Logo preview" className="w-24 h-24 rounded-2xl object-cover ring-2 ring-primary/40" />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); clearLogo(); }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-white flex items-center justify-center"
                    aria-label="Remove logo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">{dragOver ? "Drop to upload" : "Drag & drop your logo here"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">or click to browse · PNG, JPG, SVG</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Clan Name ── */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <label htmlFor="clan-name" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Clan Name
            </label>
            <Input
              id="clan-name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Legend Yahye"
              maxLength={40}
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              <X className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full h-12 font-black text-base uppercase tracking-wider">
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Registering…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Register Clan
              </span>
            )}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
