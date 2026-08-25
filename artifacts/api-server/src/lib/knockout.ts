import { db } from "@workspace/db";
import { matchesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

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

function safeUpdate(id: number, set: Record<string, unknown>) {
  const entries = Object.entries(set).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return Promise.resolve();
  return db.update(matchesTable).set(Object.fromEntries(entries) as Parameters<ReturnType<typeof db.update>["set"]>[0]).where(eq(matchesTable.id, id));
}

export async function syncKnockoutProgression(tournamentId: number, stage = 2) {
  try {
    const allRows = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.tournamentId, tournamentId));
    if (allRows.length === 0) return;

    const koRows = allRows.filter(
      (m) => m.stage === stage || isKnockoutRoundName(m.roundName),
    );
    const byId = new Map(allRows.map((m) => [m.id, m]));

    logger.info({ tournamentId, koMatchCount: koRows.length }, "syncKnockoutProgression started");

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
      if (Object.keys(set).length === 0) continue;

      const changed =
        (set.participant1Id ?? null) !== (m.participant1Id ?? null) ||
        (set.participant1Name ?? null) !== (m.participant1Name ?? null) ||
        (set.participant2Id ?? null) !== (m.participant2Id ?? null) ||
        (set.participant2Name ?? null) !== (m.participant2Name ?? null);
      if (!changed) continue;

      logger.info({ matchId: m.id, set }, "syncKnockoutProgression updating match slot");
      await safeUpdate(m.id, set as Record<string, unknown>);
      m.participant1Id = set.participant1Id ?? null;
      m.participant1Name = set.participant1Name ?? null;
      m.participant2Id = set.participant2Id ?? null;
      m.participant2Name = set.participant2Name ?? null;
    }

    // 2. Rebuild next_match_id / next_slot from parent relationships.
    for (const parent of koRows) {
      for (const child of koRows) {
        if (child.parentMatch1Id === parent.id) {
          if (parent.nextMatchId !== child.id || parent.nextSlot !== 1) {
            logger.info({ parentId: parent.id, childId: child.id, slot: 1 }, "syncKnockoutProgression linking parent to child");
            await safeUpdate(parent.id, { nextMatchId: child.id, nextSlot: 1 });
            parent.nextMatchId = child.id;
            parent.nextSlot = 1;
          }
        }
        if (child.parentMatch2Id === parent.id) {
          if (parent.nextMatchId !== child.id || parent.nextSlot !== 2) {
            logger.info({ parentId: parent.id, childId: child.id, slot: 2 }, "syncKnockoutProgression linking parent to child");
            await safeUpdate(parent.id, { nextMatchId: child.id, nextSlot: 2 });
            parent.nextMatchId = child.id;
            parent.nextSlot = 2;
          }
        }
      }
    }
  } catch (err) {
    logger.error({ err, tournamentId }, "syncKnockoutProgression failed");
    throw err;
  }
}

export async function advanceKnockoutWinner(match: typeof matchesTable.$inferSelect) {
  const isKnockout =
    (match.stage ?? 1) === 2 ||
    match.nextMatchId != null ||
    isKnockoutRoundName(match.roundName);
  if (!isKnockout) {
    logger.debug({ matchId: match.id }, "advanceKnockoutWinner skipped: not a knockout match");
    return;
  }

  logger.info({ matchId: match.id, roundName: match.roundName, status: match.status }, "advanceKnockoutWinner started");

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
  if (!fresh) {
    logger.warn({ matchId: match.id }, "advanceKnockoutWinner: match disappeared after sync");
    return;
  }

  const winner = resolveMatchWinner(fresh);
  if (!winner || winner.id <= 0) {
    logger.info(
      { matchId: match.id, status: fresh.status, scores: [fresh.participant1Score, fresh.participant2Score] },
      "advanceKnockoutWinner: no winner to advance",
    );
    return;
  }

  if (fresh.nextMatchId == null || fresh.nextSlot == null) {
    logger.info(
      { matchId: match.id, nextMatchId: fresh.nextMatchId, nextSlot: fresh.nextSlot },
      "advanceKnockoutWinner: no next match (final or orphaned)",
    );
    return;
  }

  // If the downstream slot currently holds a different winner, clear it first
  // so a previous edit doesn't leave a stale player in the bracket.
  const [nextMatch] = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.id, fresh.nextMatchId));
  if (!nextMatch) {
    logger.warn({ matchId: match.id, nextMatchId: fresh.nextMatchId }, "advanceKnockoutWinner: next match not found");
    return;
  }

  const slotKey = fresh.nextSlot === 2 ? "participant2Id" : "participant1Id";
  const nameKey = fresh.nextSlot === 2 ? "participant2Name" : "participant1Name";

  if ((nextMatch[slotKey] ?? null) !== winner.id) {
    await safeUpdate(nextMatch.id, { [slotKey]: winner.id, [nameKey]: winner.name });
    logger.info(
      { matchId: match.id, nextMatchId: nextMatch.id, slot: fresh.nextSlot, winnerId: winner.id, winnerName: winner.name },
      "advanceKnockoutWinner: advanced winner",
    );
  } else {
    logger.info(
      { matchId: match.id, nextMatchId: nextMatch.id, slot: fresh.nextSlot, winnerId: winner.id },
      "advanceKnockoutWinner: slot already correct",
    );
  }
}