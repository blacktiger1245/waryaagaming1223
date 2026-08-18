import { Router } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  teamsTable,
  teamMemberDevicesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

/**
 * GET /member-device/details
 * Returns everything the "Add Your Details" panel needs for the logged-in user:
 * their registered device name (read-only), their current team (read-only),
 * and any existing submission (so the UI can show a "done" state).
 */
router.get("/member-device/details", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });

  const uid = req.session.userId;
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, uid));
  if (!player) return res.status(404).json({ error: "Player not found" });

  let team: { id: number; name: string } | null = null;
  if (player.teamId) {
    const [t] = await db
      .select({ id: teamsTable.id, name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.id, player.teamId));
    if (t) team = { id: t.id, name: t.name };
  }

  const [existing] = await db
    .select()
    .from(teamMemberDevicesTable)
    .where(eq(teamMemberDevicesTable.playerId, uid));

  return res.json({
    deviceName: player.deviceName ?? null,
    gamingDevice: player.gamingDevice ?? null,
    team,
    submission: existing
      ? {
          id: existing.id,
          teamId: existing.teamId,
          serialNumber: existing.serialNumber,
          screenshotPath: existing.screenshotPath,
          submittedAt: existing.createdAt.toISOString(),
        }
      : null,
  });
});

/**
 * POST /member-device
 * Saves a team member's device registration (serial number + proof screenshot).
 * Only the current team member can submit; duplicates are rejected.
 */
router.post("/member-device", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });
  const uid = req.session.userId;

  const { teamId, serialNumber, screenshotPath } = req.body ?? {};
  if (!Number.isInteger(teamId)) return res.status(400).json({ error: "Invalid team" });

  const serial = typeof serialNumber === "string" ? serialNumber.trim() : "";
  if (!serial) return res.status(400).json({ error: "Serial number is required" });

  const shot = typeof screenshotPath === "string" ? screenshotPath.trim() : "";
  if (!shot || !shot.startsWith("/api/storage")) {
    return res.status(400).json({ error: "A screenshot of the serial number is required" });
  }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, uid));
  if (!player) return res.status(404).json({ error: "Player not found" });

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) return res.status(404).json({ error: "Team not found" });

  const isMember =
    player.teamId === teamId ||
    [team.presidentId, team.coachId, team.captainId].includes(uid);
  if (!isMember) {
    return res.status(403).json({ error: "You are not a member of this team" });
  }

  const deviceName = typeof player.deviceName === "string" ? player.deviceName.trim() : "";
  if (!deviceName) {
    return res.status(400).json({
      error: "No registered device name found. Complete your profile (onboarding) first.",
    });
  }

  const [existing] = await db
    .select()
    .from(teamMemberDevicesTable)
    .where(eq(teamMemberDevicesTable.playerId, uid));
  if (existing) {
    return res.status(409).json({ error: "You have already submitted your device details" });
  }

  try {
    const [row] = await db
      .insert(teamMemberDevicesTable)
      .values({
        playerId: uid,
        teamId,
        deviceName,
        serialNumber: serial,
        screenshotPath: shot,
      })
      .returning();
    return res.status(201).json({
      ok: true,
      submission: {
        id: row.id,
        submittedAt: row.createdAt.toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(message)) {
      return res.status(409).json({ error: "You have already submitted your device details" });
    }
    req.log.error({ err }, "Error saving member device details");
    return res.status(500).json({ error: "Failed to save your device details" });
  }
});

export default router;