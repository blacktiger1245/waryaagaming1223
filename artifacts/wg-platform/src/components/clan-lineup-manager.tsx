import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Member = {
  id: number;
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  teamRole?: string | null;
};

/**
 * President/Coach of a clan that is ALREADY registered: review and change which
 * players will play a tournament (player vs player), capped by the admin's
 * players-per-team limit. Lets a clan that registered before picking a line-up —
 * or that simply wants a change — set it without re-registering.
 */
export function ClanLineupManager({
  teamId,
  tournamentId,
  playersPerTeam,
  members = [],
}: {
  teamId: number;
  tournamentId: number;
  playersPerTeam?: number | null;
  members?: Member[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<number[] | null>(null);

  const limit = playersPerTeam && playersPerTeam > 0 ? playersPerTeam : null;

  const { data } = useQuery<{ limit: number | null; roster: number[] }>({
    queryKey: ["clan-tournament-lineup", teamId, tournamentId],
    queryFn: async () => {
      const r = await fetch(`/api/teams/${teamId}/tournaments/${tournamentId}/lineup`, { credentials: "include" });
      if (!r.ok) return { limit, roster: [] as number[] };
      return r.json();
    },
  });
  const selected = sel ?? data?.roster ?? [];

  function toggle(id: number) {
    setSel((prev) => {
      const cur = prev ?? data?.roster ?? [];
      return cur.includes(id)
        ? cur.filter((x) => x !== id)
        : limit != null && cur.length >= limit
          ? cur
          : [...cur, id];
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/teams/${teamId}/tournaments/${tournamentId}/lineup`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerIds: selected }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string })?.error ?? "Could not save the line-up");
      return d;
    },
    onSuccess: () => {
      toast({ title: "Line-up saved", description: "These players will play this tournament." });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["clan-tournament-lineup", teamId, tournamentId] });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button disabled className="gap-2 h-12 px-6 text-base font-bold bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/20 cursor-default">
        <CheckCircle2 className="w-4 h-4" /> Your Team is Registered
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs font-bold"
        onClick={() => { setSel(null); setOpen((o) => !o); }}
      >
        <Users className="w-3.5 h-3.5" /> {open ? "Close" : `Manage players (${selected.length})`}
      </Button>

      {open && (
        <div className="w-72 rounded-xl border border-border bg-card p-3 text-left">
          <p className="text-xs font-bold">Players who will play{limit ? ` (up to ${limit})` : ""}</p>
          <p className="text-[11px] text-muted-foreground">
            Selected {selected.length}{limit ? `/${limit}` : ""}.
          </p>
          {members.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Your clan has no players yet.</p>
          ) : (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border">
              {members.map((m, i) => {
                const name = m.displayName ?? m.username ?? `Player ${m.id}`;
                const checked = selected.includes(m.id);
                const atLimit = limit != null && selected.length >= limit;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    disabled={!checked && atLimit}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 border-b border-border last:border-0 text-left transition-colors ${
                      checked ? "bg-primary/10" : i % 2 === 0 ? "bg-card" : ""
                    } ${!checked && atLimit ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/20"}`}
                  >
                    {m.avatarUrl
                      ? <img src={m.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                      : <div className="w-6 h-6 rounded-full bg-muted shrink-0 flex items-center justify-center text-[9px] font-black text-muted-foreground">{name.charAt(0)}</div>}
                    <span className="flex-1 text-xs font-bold truncate">{name}</span>
                    {checked
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                      : <span className="w-3.5 h-3.5 rounded border border-border shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
          <Button
            size="sm"
            className="mt-3 w-full gap-1.5 text-xs font-bold"
            disabled={save.isPending || (selected.length === 0 && members.length > 0)}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Save line-up
          </Button>
        </div>
      )}
    </div>
  );
}
