import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Search,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetTeamQueryKey, useGetTeam } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type TeamMember = {
  id: number;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  points?: number | null;
  rating?: number | null;
  createdAt?: string;
};

function initials(name?: string | null) {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function PersonAvatar({ person, size = "md" }: { person?: TeamMember | null; size?: "sm" | "md" }) {
  const name = person?.displayName ?? person?.username ?? "Player";
  return (
    <div className={`${size === "sm" ? "h-9 w-9 text-[10px]" : "h-11 w-11 text-xs"} shrink-0 overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 flex items-center justify-center font-black text-zinc-300`}>
      {person?.avatarUrl ? (
        <img src={person.avatarUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </div>
  );
}

function RoleCard({
  label,
  person,
  accent,
}: {
  label: string;
  person?: TeamMember | null;
  accent: "yellow" | "teal";
}) {
  const name = person?.displayName ?? person?.username ?? "Not assigned";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
      <p className={`mb-2 text-[10px] font-black uppercase tracking-[0.18em] ${accent === "yellow" ? "text-yellow-400" : "text-teal-400"}`}>
        {label}
      </p>
      <div className="flex items-center gap-3">
        <PersonAvatar person={person} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{name}</p>
          <p className="truncate text-xs text-zinc-500">@{person?.username ?? "unassigned"}</p>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  children,
  onClick,
  tone = "dark",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  tone?: "yellow" | "dark";
}) {
  return (
    <Button
      onClick={onClick}
      className={`h-10 gap-2 px-4 text-xs font-black ${tone === "yellow" ? "bg-yellow-400 text-black hover:bg-yellow-300" : "border border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800"}`}
    >
      {icon}
      {children}
    </Button>
  );
}

export default function TeamManagePage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = Number(rawId);
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: team, isLoading: teamLoading } = useGetTeam(id);
  const qc = useQueryClient();

  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [pendingCaptainId, setPendingCaptainId] = useState<number | null>(null);
  const [pendingCoachId, setPendingCoachId] = useState<number | null>(null);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const members = (team?.members ?? []) as TeamMember[];
  const captain = members.find((member) => member.id === team?.captainId);
  const coach = members.find((member) => member.id === (team as any)?.coachId);
  const isOwner = !!user && user.id === (team as any)?.coachId;
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(members.length / pageSize));
  const visibleMembers = members.slice((page - 1) * pageSize, page * pageSize);

  const { data: freeAgents = [], isLoading: freeAgentsLoading } = useQuery<TeamMember[]>({
    queryKey: ["free-agents", "team-manage"],
    queryFn: async () => {
      const response = await fetch("/api/players/marketplace", { credentials: "include" });
      if (!response.ok) return [];
      const players = await response.json();
      return players.filter((player: TeamMember & { teamId?: number | null }) => player.teamId == null);
    },
    enabled: addPlayerOpen && isOwner,
  });

  const filteredFreeAgents = useMemo(
    () =>
      freeAgents.filter((player) =>
        !addSearch ||
        (player.displayName ?? player.username).toLowerCase().includes(addSearch.toLowerCase()),
      ),
    [addSearch, freeAgents],
  );

  async function mutateRoster(
    url: string,
    options: RequestInit,
    success: () => void = () => undefined,
  ) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, { ...options, credentials: "include" });
      const data = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      success();
      // Cache refresh must not turn a completed server mutation into a
      // misleading failure state.
      await Promise.allSettled([
        qc.invalidateQueries({ queryKey: getGetTeamQueryKey(id) }),
        qc.invalidateQueries({ queryKey: ["/api/teams"] }),
        qc.invalidateQueries({ queryKey: ["my-team"] }),
      ]);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function addPlayer(playerId: number) {
    void mutateRoster(
      `/api/teams/${id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      },
      () => {
        setAddPlayerOpen(false);
        setAddSearch("");
      },
    );
  }

  function removePlayer(playerId: number) {
    void mutateRoster(`/api/teams/${id}/members/${playerId}`, { method: "DELETE" }, () => {
      setRemoveId(null);
      if (visibleMembers.length === 1 && page > 1) setPage(page - 1);
    });
  }

  function updateRole(role: "captain" | "coach", playerId: number) {
    void mutateRoster(
      `/api/teams/${id}/${role}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      },
      () => {
        if (role === "captain") setPendingCaptainId(null);
        else setPendingCoachId(null);
      },
    );
  }

  function deleteTeam() {
    void mutateRoster(`/api/teams/${id}`, { method: "DELETE" }, () => {
      navigate("/teams");
    });
  }

  if (authLoading || teamLoading) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <Shield className="mx-auto mb-4 h-14 w-14 text-zinc-700" />
        <p className="font-bold text-zinc-400">Team not found</p>
        <Button variant="ghost" className="mt-4 gap-2" asChild>
          <Link href="/teams"><ArrowLeft className="h-4 w-4" /> Back to Teams</Link>
        </Button>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <Shield className="mx-auto mb-4 h-14 w-14 text-zinc-700" />
        <h1 className="text-2xl font-black text-white">Owner access required</h1>
        <p className="mt-2 text-sm text-zinc-500">Only the team owner can manage this team.</p>
        <Button className="mt-5 gap-2" asChild><Link href={`/teams/${id}`}><ArrowLeft className="h-4 w-4" /> View team profile</Link></Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Dashboard <span className="px-1 text-zinc-700">›</span> Teams <span className="px-1 text-zinc-700">›</span> <span className="text-yellow-400">Manage Team</span></p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-black tracking-tight text-white">Manage Team</h1>
            <Button variant="ghost" size="sm" className="gap-2 text-zinc-400 hover:text-white" asChild>
              <Link href={`/teams/${id}`}><ArrowLeft className="h-4 w-4" /> View public profile</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-800">
                {team.logoUrl ? <img src={team.logoUrl} alt={team.name} className="h-full w-full object-cover" /> : <Shield className="h-14 w-14 text-yellow-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 className="text-2xl font-black text-white">{team.name}</h2>
                  {team.tag && <span className="text-sm font-bold text-zinc-500">[{team.tag}]</span>}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{team.description || "No team description yet."}</p>
                <div className="mt-5 grid grid-cols-4 divide-x divide-zinc-800">
                  <div className="pr-3"><p className="text-xs text-zinc-500">Players</p><p className="mt-1 text-2xl font-black text-yellow-400">{team.memberCount ?? members.length}</p></div>
                  <div className="px-3"><p className="text-xs text-zinc-500">Wins</p><p className="mt-1 text-2xl font-black text-green-400">{team.wins}</p></div>
                  <div className="px-3"><p className="text-xs text-zinc-500">Losses</p><p className="mt-1 text-2xl font-black text-red-400">{team.losses}</p></div>
                  <div className="pl-3"><p className="text-xs text-zinc-500">Points</p><p className="mt-1 text-2xl font-black text-blue-400">{team.points}</p></div>
                </div>
              </div>
            </div>
          </section>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <RoleCard label="Captain" person={captain} accent="yellow" />
            <RoleCard label="Coach / Owner" person={coach ?? (user as TeamMember)} accent="teal" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <ActionButton icon={<UserPlus className="h-4 w-4" />} onClick={() => setAddPlayerOpen(true)} tone="yellow">Add Player</ActionButton>
          <ActionButton icon={<Crown className="h-4 w-4" />} onClick={() => setPendingCaptainId(pendingCaptainId ? null : -1)}>Change Captain</ActionButton>
          <ActionButton icon={<Users className="h-4 w-4" />} onClick={() => setPendingCoachId(pendingCoachId ? null : -1)}>Change Coach</ActionButton>
        </div>

        {error && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">{error}</div>}

        <section className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
            <h2 className="flex items-center gap-2 font-black text-white"><Users className="h-4 w-4 text-yellow-400" /> Team Players ({members.length})</h2>
            <span className="text-xs text-zinc-500">Owner controls</span>
          </div>
          <div className="hidden grid-cols-[38px_minmax(180px,1fr)_100px_100px_130px_92px] gap-3 bg-zinc-800/70 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400 sm:grid">
            <span>#</span><span>Player</span><span>Points</span><span>Rating</span><span>Joined At</span><span>Action</span>
          </div>
          <div className="divide-y divide-zinc-800">
            {visibleMembers.map((member, index) => {
              const isCaptain = member.id === team.captainId;
              const isCoach = member.id === (team as any).coachId;
              return (
                <div key={member.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[38px_minmax(180px,1fr)_100px_100px_130px_92px] sm:items-center">
                  <span className="hidden text-sm font-bold text-zinc-500 sm:block">{(page - 1) * pageSize + index + 1}</span>
                  <div className="flex min-w-0 items-center gap-3">
                    <PersonAvatar person={member} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{member.displayName ?? member.username}</p>
                      <p className="truncate text-xs text-zinc-500">@{member.username}</p>
                      <div className="mt-1 flex gap-1.5">
                        {isCaptain && <span className="rounded bg-yellow-400/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-yellow-400">Captain</span>}
                        {isCoach && <span className="rounded bg-teal-400/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-teal-400">Owner</span>}
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-black text-yellow-400 sm:block"><span className="mr-2 text-[10px] font-bold uppercase text-zinc-600 sm:hidden">Points</span>{member.points ?? 0}</span>
                  <span className="text-sm font-bold text-zinc-300"><span className="mr-2 text-[10px] font-bold uppercase text-zinc-600 sm:hidden">Rating</span>{member.rating ?? "—"}</span>
                  <span className="text-xs text-zinc-400"><span className="mr-2 text-[10px] font-bold uppercase text-zinc-600 sm:hidden">Joined</span>{member.createdAt ? new Date(member.createdAt).toLocaleDateString("en-CA") : "—"}</span>
                  <div>
                    {removeId === member.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setRemoveId(null)} className="rounded border border-zinc-700 p-1.5 text-zinc-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                        <button onClick={() => removePlayer(member.id)} disabled={busy} className="rounded bg-red-500 px-2 py-1.5 text-[10px] font-black text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setRemoveId(member.id)} disabled={isCaptain || busy} className="flex items-center gap-1.5 rounded border border-red-500/50 px-2.5 py-1.5 text-[10px] font-black text-red-400 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30"><UserMinus className="h-3.5 w-3.5" /> Remove</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-5 py-3 text-xs text-zinc-500">
            <span>Showing {members.length ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, members.length)} of {members.length} players</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="rounded p-1.5 hover:bg-zinc-800 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button key={number} onClick={() => setPage(number)} className={`h-7 min-w-7 rounded px-2 text-xs font-black ${page === number ? "bg-yellow-400 text-black" : "text-zinc-400 hover:bg-zinc-800"}`}>{number}</button>)}
              <button onClick={() => setPage(Math.min(pageCount, page + 1))} disabled={page === pageCount} className="rounded p-1.5 hover:bg-zinc-800 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </section>

        {pendingCaptainId !== null && (
          <RolePicker title="Choose a new captain" members={members.filter((member) => member.id !== team.captainId)} onClose={() => setPendingCaptainId(null)} onChoose={(playerId) => updateRole("captain", playerId)} busy={busy} />
        )}
        {pendingCoachId !== null && (
          <RolePicker title="Choose a new coach" members={members.filter((member) => member.id !== (team as any).coachId)} onClose={() => setPendingCoachId(null)} onChoose={(playerId) => updateRole("coach", playerId)} busy={busy} />
        )}

        {addPlayerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setAddPlayerOpen(false)}>
            <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between"><h2 className="text-lg font-black text-white">Add Player</h2><button onClick={() => setAddPlayerOpen(false)} className="text-zinc-500 hover:text-white"><X className="h-5 w-5" /></button></div>
              <div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input value={addSearch} onChange={(event) => setAddSearch(event.target.value)} placeholder="Search free agents..." className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-yellow-400" /></div>
              <div className="mt-4 max-h-72 space-y-1 overflow-y-auto">
                {freeAgentsLoading ? <Skeleton className="h-12 rounded-xl" /> : filteredFreeAgents.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">No free agents found.</p> : filteredFreeAgents.map((player) => <button key={player.id} onClick={() => addPlayer(player.id)} disabled={busy} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-zinc-800 disabled:opacity-50"><PersonAvatar person={player} size="sm" /><span className="flex-1 text-sm font-bold text-white">{player.displayName ?? player.username}<span className="block text-xs font-normal text-zinc-500">@{player.username}</span></span><UserPlus className="h-4 w-4 text-yellow-400" /></button>)}
              </div>
            </div>
          </div>
        )}

        <div className="mt-10 border-t border-red-500/20 pt-6">
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/5 p-5 sm:flex-row sm:items-center">
            <div><h2 className="font-black text-red-300">Danger zone</h2><p className="mt-1 text-sm text-zinc-500">Delete this team and release every player from its roster.</p></div>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" className="gap-2 border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4" /> Delete Team</Button></AlertDialogTrigger>
              <AlertDialogContent className="border-zinc-700 bg-zinc-900">
                <AlertDialogHeader><AlertDialogTitle>Delete {team.name}?</AlertDialogTitle><AlertDialogDescription>This cannot be undone. The team will be removed and all {members.length} rostered players will become free agents.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); deleteTeam(); }} className="bg-red-500 text-white hover:bg-red-600">Delete Team</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </div>
  );
}

function RolePicker({
  title,
  members,
  onClose,
  onChoose,
  busy,
}: {
  title: string;
  members: TeamMember[];
  onClose: () => void;
  onChoose: (playerId: number) => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-black text-white">{title}</h2><button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="h-5 w-5" /></button></div>
        <div className="mt-4 max-h-72 space-y-1 overflow-y-auto">
          {members.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">There are no other players on this team.</p> : members.map((member) => <button key={member.id} onClick={() => onChoose(member.id)} disabled={busy} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-zinc-800 disabled:opacity-50"><PersonAvatar person={member} size="sm" /><span className="flex-1 text-sm font-bold text-white">{member.displayName ?? member.username}<span className="block text-xs font-normal text-zinc-500">@{member.username}</span></span><Check className="h-4 w-4 text-teal-400" /></button>)}
        </div>
      </div>
    </div>
  );
}