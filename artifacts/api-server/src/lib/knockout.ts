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
    if (data.winnerId === match.participant1Id) return { winnerId: data.winnerId, winnerName: match.participant1Name };
    if (data.winnerId === match.participant2Id) return { winnerId: data.winnerId, winnerName: match.participant2Name };
    return { winnerId: data.winnerId, winnerName: data.winnerName ?? match.winnerName };
  }
  if (data.winnerName) {
    if (data.winnerName === match.participant1Name) return { winnerId: match.participant1Id, winnerName: data.winnerName };
    if (data.winnerName === match.participant2Name) return { winnerId: match.participant2Id, winnerName: data.winnerName };
  }
  const s1 = data.participant1Score ?? match.participant1Score;
  const s2 = data.participant2Score ?? match.participant2Score;
  if (s1 != null && s2 != null && s1 !== s2) {
    if (s1 > s2 && match.participant1Id) return { winnerId: match.participant1Id, winnerName: match.participant1Name };
    if (s2 > s1 && match.participant2Id) return { winnerId: match.participant2Id, winnerName: match.participant2Name };
  }
  return {};
}

export async function syncKnockoutProgression(tournamentId: number, stage = 2) {
  const allRows = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.tournamentId, tournamentId));
  if (allRows.length === 0) return;

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
      m.participant1Id = set.participant1Id ?? null;
      m.participant1Name = set.participant1Name ?? null;
      m.participant2Id = set.participant2Id ?? null;
      m.participant2Name = set.participant2Name ?? null;
    }
  }

  for (const m of koRows) {
    for (const child of koRows) {
      if (child.parentMatch1Id === m.id) {
        if (child.nextMatchId !== m.id || child.nextSlot !== 1) {
          await db
            .update(matchesTable)
            .set({ nextMatchId: m.id, nextSlot: 1 })
            .where(eq(matchesTable.id, child.id));
        }
      }
      if (child.parentMatch2Id === m.id) {
        if (child.nextMatchId !== m.id || child.nextSlot !== 2) {
          await db
            .update(matchesTable)
            .set({ nextMatchId: m.id, nextSlot: 2 })
            .where(eq(matchesTable.id, child.id));
        }
      }
    }
  }
}

export async function advanceKnockoutWinner(match: typeof matchesTable.$inferSelect) {
  const isKnockout =
    (match.stage ?? 1) === 2 ||
    match.nextMatchId != null ||
    isKnockoutRoundName(match.roundName);
  if (!isKnockout) return;

  // 1. Recompute the whole bracket from parent links. This also rebuilds any
  //    missing next_match_id / next_slot links and fixes stale slots when a
  //    result is edited.
  await syncKnockoutProgression(match.tournamentId, 2);

  // 2. Use the (now-rebuilt) direct next-match link to write this match's
  //    winner into the exact next-round slot. Re-fetch so we see the links
  //    that syncKnockoutProgression just repaired.
  const [fresh] = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.id, match.id));
  if (!fresh) return;

  if (fresh.status === "completed" && fresh.nextMatchId && fresh.nextSlot) {
    const winner = resolveMatchWinner(fresh);
    if (winner && winner.id > 0) {
      const set: Partial<typeof matchesTable.$inferInsert> =
        fresh.nextSlot === 2
          ? { participant2Id: winner.id, participant2Name: winner.name }
          : { participant1Id: winner.id, participant1Name: winner.name };
      await db.update(matchesTable).set(set).where(eq(matchesTable.id, fresh.nextMatchId));
    }
  }
}