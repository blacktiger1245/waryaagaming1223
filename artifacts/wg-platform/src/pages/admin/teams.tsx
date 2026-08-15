import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, Trash2, UserMinus, ChevronDown, ChevronUp, AlertTriangle, Users, X } from "lucide-react";
import { storageUrl } from "@/lib/api";

interface TeamMember {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  teamId: number | null;
}

interface Team {
  id: number;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  captainId: number | null;
  coachId: number | null;
  wins: number;
  losses: number;
  points: number;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(path, { credentials: "include", ...opts });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export default function AdminTeamsPage() {
  const qc = useQueryClient();

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ["admin-teams"],
    queryFn: () => apiFetch("/api/admin/teams"),
  });

  const { data: allPlayers = [] } = useQuery<TeamMember[]>({
    queryKey: ["admin-all-players"],
    queryFn: () => apiFetch("/api/admin/players"),
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [kickConfirm, setKickConfirm] = useState<{ teamId: number; playerId: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function membersOf(teamId: number) {
    return allPlayers.filter((p) => p.teamId === teamId);
  }

  async function deleteTeam(teamId: number) {
    setLoading(true); setError("");
    try {
      await apiFetch(`/api/admin/teams/${teamId}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      setExpandedId(null);
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
      qc.invalidateQueries({ queryKey: ["admin-all-players"] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function removePlayer(teamId: number, playerId: number) {
    setLoading(true); setError("");
    try {
      await apiFetch(`/api/admin/teams/${teamId}/members/${playerId}`, { method: "DELETE" });
      setKickConfirm(null);
      qc.invalidateQueries({ queryKey: ["admin-all-players"] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-black">Teams</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Manage team rosters and delete teams</p>
        </div>
        <span className="text-xs text-zinc-500 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 font-bold">
          {teams.length} teams
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError("")} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl h-16 animate-pulse" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-20 border border-zinc-800 rounded-2xl">
          <Shield className="w-12 h-12 mx-auto opacity-20 mb-3" />
          <p className="font-bold text-zinc-400">No teams yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => {
            const members = membersOf(team.id);
            const isExpanded = expandedId === team.id;
            const isDeletingThis = deleteConfirmId === team.id;

            return (
              <div key={team.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                {/* Team row */}
                <div className="px-5 py-4 flex items-center gap-4">
                  {/* Logo */}
                  <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {storageUrl(team.logoUrl)
                      ? <img src={storageUrl(team.logoUrl)} alt="" className="w-full h-full object-cover" />
                      : <Shield className="w-5 h-5 text-zinc-600" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-white truncate">{team.name}</p>
                      {team.tag && (
                        <span className="text-[11px] font-bold text-zinc-400 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded-md">{team.tag}</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      <span className="text-green-400 font-bold">{team.wins}W</span>
                      <span className="mx-1 text-zinc-600">·</span>
                      <span className="text-red-400 font-bold">{team.losses}L</span>
                      <span className="mx-1 text-zinc-600">·</span>
                      <span className="flex items-center gap-1 inline-flex">
                        <Users className="w-3 h-3" />{members.length} players
                      </span>
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Expand roster */}
                    <button
                      onClick={() => { setExpandedId(isExpanded ? null : team.id); setDeleteConfirmId(null); }}
                      className="text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      Roster {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => setDeleteConfirmId(isDeletingThis ? null : team.id)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5
                        ${isDeletingThis
                          ? "bg-red-500/20 border-red-500/40 text-red-400"
                          : "text-zinc-400 hover:text-red-400 bg-zinc-800 border-zinc-700 hover:border-red-400/30"}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>

                {/* Delete confirmation */}
                {isDeletingThis && (
                  <div className="mx-4 mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-red-400">Delete "{team.name}"?</p>
                      <p className="text-xs text-zinc-500 mt-0.5">All {members.length} players will be removed from the team. This cannot be undone.</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="text-xs font-black text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteTeam(team.id)}
                        disabled={loading}
                        className="text-xs font-black text-white bg-red-500 hover:bg-red-600 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loading ? "Deleting…" : "Yes, delete"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Roster */}
                {isExpanded && (
                  <div className="border-t border-zinc-800">
                    {members.length === 0 ? (
                      <p className="text-center text-sm text-zinc-600 py-6">No players on this team</p>
                    ) : (
                      <div className="divide-y divide-zinc-800">
                        {members.map((m) => {
                          const isCaptain = m.id === team.captainId;
                          const isKicking = kickConfirm?.teamId === team.id && kickConfirm.playerId === m.id;

                          return (
                            <div key={m.id} className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                {/* Avatar */}
                                <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center flex-shrink-0 border border-zinc-700">
                                  {m.avatarUrl
                                    ? <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                                    : <span className="text-xs font-black text-zinc-400">{(m.displayName ?? m.username)[0].toUpperCase()}</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold truncate">{m.displayName ?? m.username}</p>
                                  {isCaptain && (
                                    <span className="text-[10px] font-black text-yellow-400">Captain</span>
                                  )}
                                </div>
                                {!isCaptain && (
                                  <button
                                    onClick={() => setKickConfirm(isKicking ? null : { teamId: team.id, playerId: m.id })}
                                    className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1.5
                                      ${isKicking
                                        ? "bg-red-500/20 border-red-500/40 text-red-400"
                                        : "text-zinc-400 hover:text-red-400 bg-zinc-800 border-zinc-700 hover:border-red-400/30"}`}
                                  >
                                    <UserMinus className="w-3 h-3" /> Remove
                                  </button>
                                )}
                              </div>

                              {/* Kick confirmation */}
                              {isKicking && (
                                <div className="mt-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                                  <p className="text-xs text-red-400 font-bold">Remove {m.displayName ?? m.username} from team?</p>
                                  <div className="flex gap-2 shrink-0">
                                    <button
                                      onClick={() => setKickConfirm(null)}
                                      className="text-xs font-black text-zinc-400 hover:text-white px-2 py-1 rounded-lg border border-zinc-700 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => removePlayer(team.id, m.id)}
                                      disabled={loading}
                                      className="text-xs font-black text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                      {loading ? "…" : "Remove"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
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
