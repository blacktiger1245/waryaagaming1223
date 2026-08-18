import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Upload, X, Check, ChevronDown, Loader2,
  UserCircle2, Crown, Users, Star, Image as ImageIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { apiUrl, uploadTeamLogo } from "@/lib/api";

// ── types ──────────────────────────────────────────────────────────────────────
interface DiscordPlayer {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  discordId: string | null;
  teamId: number | null;
  teamName: string | null;
}

// ── helpers ────────────────────────────────────────────────────────────────────
async function fetchAllPlayers(): Promise<DiscordPlayer[]> {
  const res = await fetch(apiUrl("/api/players"), {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load players");
  return res.json();
}

async function registerTeam(payload: {
  name: string;
  tag?: string;
  description?: string;
  logoUrl?: string;
  coachId: number;
  captainId: number;
  playerIds: number[];
}) {
  const res = await fetch(apiUrl("/api/teams/register"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Registration failed");
  return data;
}

// ── PlayerPill ─────────────────────────────────────────────────────────────────
function PlayerPill({
  player,
  removable,
  onRemove,
}: {
  player: DiscordPlayer;
  removable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5"
    >
      {player.avatarUrl ? (
        <img src={player.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
      ) : (
        <UserCircle2 className="w-6 h-6 text-muted-foreground" />
      )}
      <span className="text-sm font-semibold">
        {player.displayName ?? player.username}
      </span>
      {removable && (
        <button
          onClick={onRemove}
          className="ml-1 text-muted-foreground hover:text-red-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </motion.div>
  );
}

// ── PlayerDropdown ─────────────────────────────────────────────────────────────
function PlayerDropdown({
  players,
  selectedIds,
  excludeIds,
  placeholder,
  onSelect,
}: {
  players: DiscordPlayer[];
  selectedIds: number[];
  excludeIds: number[];
  placeholder: string;
  onSelect: (p: DiscordPlayer) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Exclude already-selected or explicitly excluded players from the list entirely
  const visible = players.filter(
    (p) => !excludeIds.includes(p.id) && !selectedIds.includes(p.id)
  );
  const filtered = visible.filter((p) => {
    const name = (p.displayName ?? p.username).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 bg-card border border-border rounded-xl px-4 py-3 text-sm hover:border-primary/50 transition-colors"
      >
        <span className="text-muted-foreground">{placeholder}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-full mt-2 left-0 right-0 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
          >
            <div className="p-2 border-b border-border">
              <Input
                placeholder="Search players..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 bg-background text-sm"
                autoFocus
              />
            </div>
            <div className="max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-4">No players found</p>
              ) : (
                filtered.map((p) => {
                  const takenByTeam = p.teamId !== null ? p.teamName ?? "another team" : null;
                  return takenByTeam ? (
                    // Already on a team — show as disabled
                    <div
                      key={p.id}
                      className="w-full flex items-center gap-3 px-4 py-2.5 opacity-50 cursor-not-allowed text-left"
                      title={`Already on ${takenByTeam}`}
                    >
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt="" className="w-8 h-8 rounded-full grayscale" />
                      ) : (
                        <UserCircle2 className="w-8 h-8 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{p.displayName ?? p.username}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          On <span className="font-medium">{takenByTeam}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { onSelect(p); setOpen(false); setSearch(""); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-primary/10 transition-colors text-left"
                    >
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <UserCircle2 className="w-8 h-8 text-muted-foreground" />
                      )}
                      <div>
                        <div className="text-sm font-semibold">{p.displayName ?? p.username}</div>
                        <div className="text-xs text-muted-foreground">@{p.username}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function RegisterTeamPage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  // form state
  const [teamName, setTeamName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [captain, setCaptain] = useState<DiscordPlayer | null>(null);
  const [coach, setCoach] = useState<DiscordPlayer | null>(null);
  const [players, setPlayers] = useState<DiscordPlayer[]>([]);

  // async state
  const [discordPlayers, setDiscordPlayers] = useState<DiscordPlayer[] | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load all players on mount and auto-add the coach (current user) to squad
  useEffect(() => {
    if (!user) return;
    setLoadingPlayers(true);
    fetchAllPlayers()
      .then((allPlayers) => {
        setDiscordPlayers(allPlayers);
        // The current user is the auto-assigned President, NOT a plain Player,
        // so they are not pre-added to the squad.
      })
      .catch(() => setDiscordPlayers([]))
      .finally(() => setLoadingPlayers(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
    [handleLogoFile]
  );

  const addPlayer = (p: DiscordPlayer) => {
    // Prevent the President (current user), Coach or Captain from also being
    // added as a plain Player, and prevent duplicates.
    if (p.id === user?.id || coach?.id === p.id || captain?.id === p.id) return;
    setPlayers((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
  };

  const removePlayer = (id: number) => {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return setError("Team name is required");
    if (!coach) return setError("Please select a team Coach");
    if (!captain) return setError("Please select a team Captain");
    setError(null);
    setSubmitting(true);

    try {
      let logoUrl: string | undefined;

       // Upload through the API so this flow does not depend on R2 bucket CORS.
      if (logoFile) {
         const objectPath = await uploadTeamLogo(logoFile);
         logoUrl = `/api/storage${objectPath}`;
      }

      const team = await registerTeam({
        name: teamName.trim(),
        logoUrl,
        coachId: coach.id,
        captainId: captain.id,
        playerIds: players.map((p) => p.id),
      });

      // Invalidate teams + auth so everything refreshes
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["auth"] });
      qc.invalidateQueries({ queryKey: ["my-team"] });
      navigate(`/teams/${team.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  // all players who cannot be picked for "add players" (president + coach + captain + already picked)
  const excludedFromPlayers = [
    ...(user ? [user.id] : []),
    ...(coach ? [coach.id] : []),
    ...(captain ? [captain.id] : []),
    ...players.map((p) => p.id),
  ];

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <Shield className="w-16 h-16 mx-auto text-muted-foreground opacity-30 mb-4" />
        <h2 className="text-2xl font-black mb-2">Login Required</h2>
        <p className="text-muted-foreground mb-6">You must be logged in with Discord to register a team.</p>
        <Button onClick={() => navigate("/login")}>Login with Discord</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="mb-10">
          <p className="text-primary text-xs font-bold uppercase tracking-widest mb-2">Teams</p>
          <h1 className="text-4xl font-black uppercase tracking-tight">Register Your Team</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Fill in your team details below. You will automatically become the team President.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ── Team Name ── */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Team Identity</h2>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Team Name <span className="text-red-500">*</span></label>
              <Input
                placeholder="e.g. Shadow Wolves"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                maxLength={50}
                className="bg-card border-border"
              />
            </div>
          </div>

          {/* ── Team Logo ── */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Team Logo</h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer
                transition-all duration-200 py-10
                ${dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 bg-card"}
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleLogoFile(e.target.files[0])}
              />

              {logoPreview ? (
                <div className="flex flex-col items-center gap-3">
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="w-24 h-24 rounded-2xl object-cover border border-border shadow-md"
                  />
                  <p className="text-sm text-primary font-semibold flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    {logoFile?.name}
                  </p>
                  <p className="text-xs text-muted-foreground">Click or drop to replace</p>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    {dragOver ? (
                      <Upload className="w-7 h-7 text-primary animate-bounce" />
                    ) : (
                      <ImageIcon className="w-7 h-7 text-primary" />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">
                      {dragOver ? "Drop to upload" : "Drag & drop your logo here"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">or click to browse — PNG, JPG, SVG, WEBP</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Team President (auto — current user, read-only) ── */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Team President <span className="text-red-500">*</span>
            </h2>
            <div className="flex items-center gap-3 bg-card border border-primary/30 rounded-xl px-4 py-3">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
              ) : (
                <UserCircle2 className="w-10 h-10 text-muted-foreground" />
              )}
              <div>
                <div className="font-black flex items-center gap-1.5"><Crown className="w-3.5 h-3.5 text-yellow-400" />{user?.displayName ?? user?.username}</div>
                <div className="text-xs text-muted-foreground">@{user?.username}</div>
              </div>
              <div className="ml-auto">
                <span className="text-[10px] bg-primary/20 text-primary font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                  President
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              You are automatically the President / owner of the team.
            </p>
          </div>

          {/* ── Team Coach (select) ── */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Team Coach <span className="text-red-500">*</span>
            </h2>

            {loadingPlayers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading players…
              </div>
            ) : (
              <>
                {coach ? (
                  <AnimatePresence>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      className="flex items-center gap-3 bg-card border border-primary/40 rounded-xl px-4 py-3"
                    >
                      {coach.avatarUrl ? (
                        <img src={coach.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                      ) : (
                        <UserCircle2 className="w-10 h-10 text-muted-foreground" />
                      )}
                      <div>
                        <div className="font-black">{coach.displayName ?? coach.username}</div>
                        <div className="text-xs text-muted-foreground">@{coach.username}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCoach(null)}
                        className="ml-auto text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  <PlayerDropdown
                    players={discordPlayers ?? []}
                    selectedIds={[]}
                    excludeIds={[...(user ? [user.id] : []), ...(captain ? [captain.id] : []), ...players.map((p) => p.id)]}
                    placeholder="Select team coach…"
                    onSelect={(p) => {
                      setCoach(p);
                      // Ensure the coach is not also a player or captain.
                      setPlayers((prev) => prev.filter((x) => x.id !== p.id));
                      if (captain?.id === p.id) setCaptain(null);
                    }}
                  />
                )}
              </>
            )}
          </div>

          {/* ── Team Captain ── */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Team Captain <span className="text-red-500">*</span>
            </h2>

            {loadingPlayers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading players…
              </div>
            ) : (
              <>
                {captain ? (
                  <AnimatePresence>
                    <div className="flex items-center gap-3 bg-card border border-primary/40 rounded-xl px-4 py-3">
                      {captain.avatarUrl ? (
                        <img src={captain.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                      ) : (
                        <UserCircle2 className="w-10 h-10 text-muted-foreground" />
                      )}
                      <div>
                        <div className="font-black flex items-center gap-1.5">
                          <Star className="w-3.5 h-3.5 text-blue-400" />
                          {captain.displayName ?? captain.username}
                        </div>
                        <div className="text-xs text-muted-foreground">@{captain.username}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCaptain(null)}
                        className="ml-auto text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </AnimatePresence>
                ) : (
                  <PlayerDropdown
                    players={discordPlayers ?? []}
                    selectedIds={[]}
                    excludeIds={[...(user ? [user.id] : []), ...(coach ? [coach.id] : []), ...players.map((p) => p.id)]}
                    placeholder="Select team captain…"
                    onSelect={(p) => {
                      setCaptain(p);
                      // The captain cannot also be the coach or a squad player.
                      setPlayers((prev) => prev.filter((x) => x.id !== p.id));
                      if (coach?.id === p.id) setCoach(null);
                    }}
                  />
                )}
              </>
            )}
          </div>

          {/* ── Add Players ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Squad Members
              </h2>
              <span className="text-xs text-muted-foreground">{players.length} added</span>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Select players from everyone registered on the platform.
            </p>

            {!loadingPlayers && (
              <PlayerDropdown
                players={discordPlayers ?? []}
                selectedIds={players.map((p) => p.id)}
                excludeIds={[]}
                placeholder="Add a player…"
                onSelect={addPlayer}
              />
            )}

            <AnimatePresence>
              {players.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-wrap gap-2 pt-1"
                >
                  {players.map((p) => (
                    <PlayerPill
                      key={p.id}
                      player={p}
                      removable
                      onRemove={() => removePlayer(p.id)}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Roster preview ── */}
          {(captain || players.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-border bg-card p-4 space-y-3"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Roster Preview — {1 + (coach ? 1 : 0) + (captain ? 1 : 0) + players.length} members
              </p>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-1.5">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                  ) : (
                    <UserCircle2 className="w-6 h-6 text-muted-foreground" />
                  )}
                  <span className="text-sm font-semibold">{user?.displayName ?? user?.username}</span>
                  <span className="text-[9px] font-bold bg-primary/20 text-primary uppercase tracking-wider px-1.5 py-0.5 rounded-full">President</span>
                </div>
                {coach && (
                  <div className="flex items-center gap-2 bg-sky-400/10 border border-sky-400/30 rounded-lg px-3 py-1.5">
                    {coach.avatarUrl ? (
                      <img src={coach.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <UserCircle2 className="w-6 h-6 text-muted-foreground" />
                    )}
                    <span className="text-sm font-semibold">{coach.displayName ?? coach.username}</span>
                    <span className="text-[9px] font-bold bg-sky-400/20 text-sky-400 uppercase tracking-wider px-1.5 py-0.5 rounded-full">Coach</span>
                  </div>
                )}
                {captain && (
                  <div className="flex items-center gap-2 bg-yellow-400/10 border border-yellow-400/30 rounded-lg px-3 py-1.5">
                    {captain.avatarUrl ? (
                      <img src={captain.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <UserCircle2 className="w-6 h-6 text-muted-foreground" />
                    )}
                    <span className="text-sm font-semibold">{captain.displayName ?? captain.username}</span>
                    <Star className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                )}
                {players.map((p) => (
                  <PlayerPill key={p.id} player={p} />
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Error ── */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400"
              >
                <X className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Submit ── */}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-12 font-black text-base uppercase tracking-wider"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Registering…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Shield className="w-4 h-4" /> Register Team
              </span>
            )}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
