import { db } from "@workspace/db";
import { matchesTable, tournamentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type TournamentRow = typeof tournamentsTable.$inferSelect;

export interface TournamentWinner {
  id: number | null;
  name: string | null;
}

/** The decider of a bracket (never the third-place play-off). */
function isFinalName(name: string | null | undefined): boolean {
  if (!name) return false;
  return /final/i.test(name) && !/third/i.test(name);
}

function nameForId(
  id: number | null | undefined,
  p1Id: number | null,
  p1Name: string | null,
  p2Id: number | null,
  p2Name: string | null,
): string | null {
  if (id == null) return null;
  if (id === p1Id) return p1Name;
  if (id === p2Id) return p2Name;
  return null;
}

/**
 * Work out who won a tournament and persist the name on the tournament row.
 *
 * Rules (in order):
 *   1. A completed final decides the champion (knock-out formats).
 *   2. Otherwise the league/group table decides: most points, then goal
 *      difference, then goals scored (round-robin and group formats).
 *   3. Anything already stored on the tournament wins — admins can override it.
 *
 * The winner name is written back so `Winner: TBD` never appears for a finished
 * event, regardless of tournament format.
 */
export async function resolveAndStoreTournamentWinner(
  tournament: TournamentRow,
): Promise<TournamentWinner> {
  const storedName = tournament.winnerName?.trim();
  if (storedName && storedName.toUpperCase() !== "TBD") {
    return { id: tournament.winnerId ?? null, name: storedName };
  }

  const matches = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.tournamentId, tournament.id));
  const completed = matches.filter((m) => m.status === "completed");
  if (completed.length === 0) {
    return { id: null, name: null };
  }

  // ── 1. Knock-out final ────────────────────────────────────────────────────
  const final = completed.find((m) => isFinalName(m.roundName));
  if (final) {
    let id: number | null = null;
    let name: string | null = null;

    if (final.winnerId != null && final.winnerId > 0) {
      id = final.winnerId;
      name =
        final.winnerName ??
        nameForId(id, final.participant1Id, final.participant1Name, final.participant2Id, final.participant2Name);
    } else if (
      final.participant1Score != null &&
      final.participant2Score != null &&
      final.participant1Score !== final.participant2Score
    ) {
      const p1Won = final.participant1Score > final.participant2Score;
      id = p1Won ? final.participant1Id : final.participant2Id;
      name = p1Won ? final.participant1Name : final.participant2Name;
    }

    if (name && name.trim().toUpperCase() === "BYE") {
      // A bye is not a real champion — use the actual participant's name.
      name = nameForId(id, final.participant1Id, final.participant1Name, final.participant2Id, final.participant2Name);
    }

    if (name) {
      await db
        .update(tournamentsTable)
        .set({ winnerName: name })
        .where(eq(tournamentsTable.id, tournament.id));
      return { id, name };
    }
  }

  // ── 2. League / group table ───────────────────────────────────────────────
  // Only when the competition is actually decided (tournament completed or every
  // fixture played) — never show a mid-season leader as the "Winner".
  const allMatchesPlayed = matches.length > 0 && matches.every((m) => m.status === "completed");
  if (tournament.status !== "completed" && !allMatchesPlayed) {
    return { id: null, name: null };
  }

  const table = new Map<number, { id: number; name: string; pts: number; gf: number; ga: number }>();
  for (const m of completed) {
    const s1 = m.participant1Score;
    const s2 = m.participant2Score;
    if (m.participant1Id == null || m.participant2Id == null || s1 == null || s2 == null) continue;

    const rowFor = (id: number, name: string | null) => {
      let row = table.get(id);
      if (!row) {
        row = { id, name: name ?? `#${id}`, pts: 0, gf: 0, ga: 0 };
        table.set(id, row);
      }
      return row;
    };

    const a = rowFor(m.participant1Id, m.participant1Name);
    const b = rowFor(m.participant2Id, m.participant2Name);
    a.gf += s1; a.ga += s2;
    b.gf += s2; b.ga += s1;
    if (s1 > s2) a.pts += 3;
    else if (s2 > s1) b.pts += 3;
    else { a.pts += 1; b.pts += 1; }
  }

  const ranked = Array.from(table.values()).sort(
    (x, y) =>
      y.pts - x.pts ||
      (y.gf - y.ga) - (x.gf - x.ga) ||
      y.gf - x.gf ||
      x.name.localeCompare(y.name),
  );
  const champion = ranked[0];
  if (!champion) return { id: null, name: null };

  await db
    .update(tournamentsTable)
    .set({ winnerName: champion.name })
    .where(eq(tournamentsTable.id, tournament.id));
  return { id: champion.id, name: champion.name };
}
