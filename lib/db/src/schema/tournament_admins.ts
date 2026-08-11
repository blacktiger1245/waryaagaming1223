import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tournamentAdminsTable = pgTable(
  "tournament_admins",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id").notNull(),
    playerId: integer("player_id").notNull(),
    role: text("role").notNull().default("admin"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tournamentPlayerUnique: unique("tournament_admins_tournament_player_unique").on(
      table.tournamentId,
      table.playerId,
    ),
  }),
);

export const insertTournamentAdminSchema = createInsertSchema(tournamentAdminsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTournamentAdmin = z.infer<typeof insertTournamentAdminSchema>;
export type TournamentAdmin = typeof tournamentAdminsTable.$inferSelect;