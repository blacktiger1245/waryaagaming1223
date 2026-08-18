import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * WG Team Member Registration — one row per team member who has submitted
 * their device details (serial number + screenshot proof). A player can only
 * submit once (enforced by a unique constraint on player_id and a route check).
 */
export const teamMemberDevicesTable = pgTable("team_member_devices", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().unique(),
  teamId: integer("team_id").notNull(),
  deviceName: text("device_name").notNull(),
  serialNumber: text("serial_number").notNull(),
  screenshotPath: text("screenshot_path").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTeamMemberDeviceSchema = createInsertSchema(teamMemberDevicesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTeamMemberDevice = z.infer<typeof insertTeamMemberDeviceSchema>;
export type TeamMemberDevice = typeof teamMemberDevicesTable.$inferSelect;