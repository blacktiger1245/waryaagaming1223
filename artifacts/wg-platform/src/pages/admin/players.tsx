import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User, Ban, CheckCircle, AlertTriangle, X, ChevronDown } from "lucide-react";

interface Player {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  rank: number;
  points: number;
  teamId: number | null;
  isActive: boolean;
  role: string;
  bannedUntil: string | null;
}

const BAN_DURATIONS = [
  { value: "1d",      label: "1 Day" },
  { value: "5d",      label: "5 Days" },
  { value: "10d",     label: "10 Days" },
  { value: "forever", label: "Forever" },
];

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(path, { credentials: "include", ...opts });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function isBanned(player: Player): boolean {
  if (!player.bannedUntil) return false;
  return new Date(player.bannedUntil) > new Date();
}

function banLabel(player: Player): string {
  if (!player.bannedUntil) return "";
  const d = new Date(player.bannedUntil);
  if (d.getFullYear() >= 9999) return "Banned forever";
  return `Banned until ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export default function AdminPlayersPage() {
  const qc = useQueryClient();

  const { data: players = [], isLoading } = useQuery<Player[]>({
    queryKey: ["admin-players"],
    queryFn: () => apiFetch("/api/admin/players"),
  });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "banned" | "active">("all");
  const [banMenuId, setBanMenuId] = useState<number | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<string>("1d");
  const [unbanConfirmId, setUnbanConfirmId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filtered = players.filter((p) => {
    const matchSearch = !search || [p.username, p.displayName ?? ""].some(
      (s) => s.toLowerCase().includes(search.toLowerCase())
    );
    const banned = isBanned(p);
    const matchFilter =
      filter === "all" ? true :
      filter === "banned" ? banned :
      !banned;
    return matchSearch && matchFilter;
  });

  async function banPlayer(playerId: number, duration: string) {
    setLoading(true); setError("");
    try {
      await apiFetch(`/api/admin/players/${playerId}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration }),
      });
      setBanMenuId(null);
      qc.invalidateQueries({ queryKey: ["admin-players"] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function unbanPlayer(playerId: number) {
    setLoading(true); setError("");
    try {
      await apiFetch(`/api/admin/players/${playerId}/ban`, { method: "DELETE" });
      setUnbanConfirmId(null);
      qc.invalidateQueries({ queryKey: ["admin-players"] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const bannedCount = players.filter(isBanned).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-black">Players</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Manage players and bans</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 font-bold">
            {players.length} total
          </span>
          {bannedCount > 0 && (
            <span className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 font-bold">
              {bannedCount} banned
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError("")} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username or name…"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-teal-500 transition-colors"
        />
        <div className="flex rounded-xl overflow-hidden border border-zinc-700 text-xs font-bold">
          {(["all", "active", "banned"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 capitalize transition-colors
                ${filter === f
                  ? f === "banned" ? "bg-red-500/20 text-red-400" : "bg-zinc-700 text-white"
                  : "bg-zinc-900 text-zinc-500 hover:text-white"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl h-16 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-zinc-800 rounded-2xl">
          <User className="w-10 h-10 mx-auto opacity-20 mb-3" />
          <p className="font-bold text-zinc-400">No players found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((player) => {
            const banned = isBanned(player);
            const isBanning = banMenuId === player.id;
            const isUnbanning = unbanConfirmId === player.id;

            return (
              <div
                key={player.id}
                className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-colors
                  ${banned ? "border-red-500/30" : "border-zinc-800"}`}
              >
                <div className="px-4 py-3 flex items-center gap-3">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 border-2
                    ${banned ? "border-red-500/40 opacity-60" : "border-zinc-700"}`}>
                    {player.avatarUrl
                      ? <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                          <User className="w-4 h-4 text-zinc-500" />
                        </div>}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-black truncate ${banned ? "text-zinc-500 line-through" : "text-white"}`}>
                        {player.displayName ?? player.username}
                      </p>
                      {player.displayName && (
                        <span className="text-[11px] text-zinc-500">@{player.username}</span>
                      )}
                      {player.role !== "player" && (
                        <span className="text-[10px] font-black text-teal-400 bg-teal-400/10 border border-teal-400/20 px-1.5 py-0.5 rounded-full">
                          {player.role}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {banned ? (
                        <span className="text-[11px] font-bold text-red-400 flex items-center gap-1">
                          <Ban className="w-3 h-3" /> {banLabel(player)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-zinc-500">
                          Rank #{player.rank} · {player.points} pts
                          {player.teamId && <span className="ml-1">· In team</span>}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {banned ? (
                      <button
                        onClick={() => setUnbanConfirmId(isUnbanning ? null : player.id)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5
                          ${isUnbanning
                            ? "bg-green-500/20 border-green-500/40 text-green-400"
                            : "text-zinc-400 hover:text-green-400 bg-zinc-800 border-zinc-700 hover:border-green-400/30"}`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Unban
                      </button>
                    ) : (
                      <button
                        onClick={() => { setBanMenuId(isBanning ? null : player.id); setSelectedDuration("1d"); }}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5
                          ${isBanning
                            ? "bg-red-500/20 border-red-500/40 text-red-400"
                            : "text-zinc-400 hover:text-red-400 bg-zinc-800 border-zinc-700 hover:border-red-400/30"}`}
                      >
                        <Ban className="w-3.5 h-3.5" /> Ban <ChevronDown className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Ban duration picker */}
                {isBanning && (
                  <div className="border-t border-zinc-800 px-4 py-3 bg-zinc-950/50">
                    <p className="text-xs font-black text-red-400 mb-3">
                      Select ban duration for {player.displayName ?? player.username}:
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {BAN_DURATIONS.map((d) => (
                        <button
                          key={d.value}
                          onClick={() => setSelectedDuration(d.value)}
                          className={`text-xs font-black px-3 py-1.5 rounded-lg border transition-colors
                            ${selectedDuration === d.value
                              ? d.value === "forever"
                                ? "bg-red-500/30 border-red-500/60 text-red-300"
                                : "bg-orange-500/20 border-orange-500/40 text-orange-300"
                              : "text-zinc-400 bg-zinc-800 border-zinc-700 hover:border-zinc-500"}`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setBanMenuId(null)}
                        className="text-xs font-black text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => banPlayer(player.id, selectedDuration)}
                        disabled={loading}
                        className={`text-xs font-black text-white px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50
                          ${selectedDuration === "forever" ? "bg-red-600 hover:bg-red-700" : "bg-orange-500 hover:bg-orange-600"}`}
                      >
                        {loading ? "Banning…" : `Ban for ${BAN_DURATIONS.find(d => d.value === selectedDuration)?.label}`}
                      </button>
                    </div>
                  </div>
                )}

                {/* Unban confirmation */}
                {isUnbanning && (
                  <div className="border-t border-zinc-800 px-4 py-3 bg-green-500/5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-green-400 font-bold">
                        Lift ban on {player.displayName ?? player.username}?
                      </p>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setUnbanConfirmId(null)}
                          className="text-xs font-black text-zinc-400 hover:text-white px-3 py-1 rounded-lg border border-zinc-700 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => unbanPlayer(player.id)}
                          disabled={loading}
                          className="text-xs font-black text-white bg-green-600 hover:bg-green-700 px-4 py-1 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {loading ? "…" : "Yes, unban"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
