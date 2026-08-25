import { db } from "@workspace/db";
import { tournamentsTable } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Automatically flip upcoming tournaments to active once their start date is
 * reached (date-only comparison, so the tournament becomes active at midnight
 * UTC on the start date). Called on server boot and every 5 minutes.
 */
export async function activateUpcomingTournaments(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayText = today.toISOString().split("T")[0];

  const result = await db
    .update(tournamentsTable)
    .set({ status: "active" })
    .where(
      and(
        eq(tournamentsTable.status, "upcoming"),
        lte(tournamentsTable.startDate, todayText),
      ),
    )
    .returning({ id: tournamentsTable.id, name: tournamentsTable.name });

  if (result.length > 0) {
    logger.info({ count: result.length, tournaments: result.map((t) => ({ id: t.id, name: t.name })) }, "Auto-activated upcoming tournaments");
  }
  return result.length;
}
