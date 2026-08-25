import { db } from "@workspace/db";
import { matchesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export function isKnockoutRoundName(name: string | null | undefined): boolean {
  if (!name) return false;
  return /final|round of|quarter|semi|third place/i.test(name);
}

export function resolveMatchWinner(
  match: typeof matchesTable.$inferSelect | null,
): { id: number; name: string | null } | null {
  if (!match || match.status !== "completed") return null;
  if (match.winnerId != null && match.winnerId > 0 && match.winnerName !== "BYE") {
    return { id: match.winnerId, name: match.winnerName };
  }
  const s1 = match.participant1Score;
  const s2 = match.participant2Score;
  if (s1 != null && s2 != null && s1 !== s2) {
    if (s1 > s2 && match.participant1Id) return { id: match.participant1Id, name: match.participant1Name };
    if (s2 > s1 && match.participant2Id) return { id: match.participant2Id, name: match.participant2Name };
  }
  return null;
}

/** Derive winnerId / winnerName from scores or from a supplied winnerName string. */
export function computeWinnerFromResult(
  match: typeof matchesTable.$inferSelect,
  data: {
    participant1Score?: number | null;
    participant2Score?: number | null;
    winnerName?: string | null;
    winnerId?: number | null;
  },
): { winnerId?: number | null; winnerName?: string | null } {
  if (data.winnerId != null) {
    // winnerId already provided — ensure winnerName aligns with it.
    if (data.winnerId === match.participant1Id) return { winnerId: data.winnerId, winnerName: match.participant1Name };
    if (data.winnerId === match.participant2Id) return { winnerId: data.winnerId, winnerName: match.participant2Name };
    return { winnerId: data.winnerId, winnerName: data.winnerName ?? match.winnerName };
  }
  if (data.winnerName) {
    if (data.winnerName === match.participant1Name) return { winnerId: match.participant1Id, winnerName: data.winnerName };
    if (data.winnerName === match.participant2Name) return { winnerId: match.participant2Id, winnerName: data.winnerName };
    // If winnerName doesn't match either participant, fall through to scores.
  }
  const s1 = data.participant1Score ?? match.participant1Score;
  const s2 = data.participant2Score ?? match.participant2Score;
  if (s1 != null && s2 != null && s1 !== s2) {
    if (s1 > s2 && match.participant1Id) return { winnerId: match.participant1Id, winnerName: match.participant1Name };
    if (s2 > s1 && match.participant2Id) return { winnerId: match.participant2Id, winnerName: match.participant2Name };
  }
  return {};
}

/** Recompute every knockout slot that is fed by a parent match winner. */
export async function syncKnockoutProgression(tournamentId: number, stage = 2) {
  // Load the FULL match set for the tournament so parents (including seeded
  // matches and BYE rows) are always resolvable, regardless of their stage.
  const allRows = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.tournamentId, tournamentId));
  if (allRows.length === 0) return;

  // A row belongs to the bracket when it is explicitly `stage` OR carries a
  // knockout round name. This covers legacy brackets that predate the stage
  // column/backfill: their rounds (Round of 16, Quarter Finals, ...) still
  // match and the whole tree recomputes exactly the same way.
  const koRows = allRows.filter(
    (m) => m.stage === stage || isKnockoutRoundName(m.roundName),
  );
  const byId = new Map(allRows.map((m) => [m.id, m]));

  for (const m of koRows) {
    const a = m.parentMatch1Id != null ? resolveMatchWinner(byId.get(m.parentMatch1Id) ?? null) : null;
    const b = m.parentMatch2Id != null ? resolveMatchWinner(byId.get(m.parentMatch2Id) ?? null) : null;

    const set: Partial<typeof matchesTable.$inferInsert> = {};
    if (m.parentMatch1Id != null) {
      set.participant1Id = a ? a.id : null;
      set.participant1Name = a ? a.name : null;
    }
    if (m.parentMatch2Id != null) {
      set.participant2Id = b ? b.id : null;
      set.participant2Name = b ? b.name : null;
    }
    const changed =
      (set.participant1Id ?? null) !== (m.participant1Id ?? null) ||
      (set.participant2Id ?? null) !== (m.participant2Id ?? null);
    if (changed) {
      await db.update(matchesTable).set(set).where(eq(matchesTable.id, m.id));
      // Keep the in-memory copy in sync for downstream links in this pass.
      m.participant1Id = set.participant1Id ?? null;
      m.participant1Name = set.participant1Name ?? null;
      m.participant2Id = set.participant2Id ?? null;
      m.participant2Name = set.participant2Name ?? null;
    }
  }
}

/** Advance the winner of a completed match into the next round. */
export async function advanceKnockoutWinner(match: typeof matchesTable.$inferSelect) {
  // Trigger the whole-tree recompute whenever this is a knockout match: it has
  // an explicit stage 2, carries a next-match link, OR its round name is a
  // knockout round. The last check fixes legacy brackets whose matches were
  // stored with stage = 1 (default) before the stage backfill existed.
  const isKnockout =
    (match.stage ?? 1) === 2 ||
    match.nextMatchId != null ||
    isKnockoutRoundName(match.roundName);
  if (isKnockout) {
    await syncKnockoutProgression(match.tournamentId, 2);
    return;
  }

  // Legacy fallback for old brackets without parent/next links.
  if (match.status !== "completed" || !match.winnerId) return;
  if (match.winnerId === 0 || match.winnerName === "BYE") return;
  if (!isKnockoutRoundName(match.roundName)) return;

  const nextMatches = await db
    .select()
    .from(matchesTable)
    .where(
      and(
        eq(matchesTable.tournamentId, match.tournamentId),
        eq(matchesTable.stage, match.stage ?? 2),
        eq(matchesTable.round, match.round + 1),
      ),
    )
    .orderBy(matchesTable.id);

  for (const next of nextMatches) {
    if (next.participant1Id == null) {
      await db
        .update(matchesTable)
        .set({ participant1Id: match.winnerId, participant1Name: match.winnerName })
        .where(eq(matchesTable.id, next.id));
      return;
    }
    if (next.participant2Id == null) {
      await db
        .update(matchesTable)
        .set({ participant2Id: match.winnerId, participant2Name: match.winnerName })
        .where(eq(matchesTable.id, next.id));
      return;
    }
  }
}
