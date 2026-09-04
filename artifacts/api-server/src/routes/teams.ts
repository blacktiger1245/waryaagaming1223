import { Router } from "express";
import { db } from "@workspace/db";
import { teamsTable, playersTable, newsTable, matchesTable, tournamentsTable, playerTransfersTable, clanSettingsTable } from "@workspace/db";
import { eq, ilike, isNotNull, inArray, desc, sql, or, aliasedTable } from "drizzle-orm";
import {
  ListTeamsQueryParams,
  GetTeamParams,
} from "@workspace/api-zod";

const router = Router();

// ── team role helpers ──────────────────────────────────────────────────────────
type TeamRole = "president" | "coach" | "captain" | "player";

// Admin/owner platform staff bypass ordinary member checks (kept from the old
// system) but the four team roles always come from the database, never the body.
function isPlatformStaff(req: import("express").Request) {
  if (req.session?.isAdmin) return true;
  const username = (req.session?.username ?? "").toLowerCase();
  return username === "black_tiger" || req.session?.role === "admin" || req.session?.role === "owner";
}

/** Read the single clan registration settings row (id = 1). */
async function getClanSettings() {
  const [settings] = await db.select().from(clanSettingsTable).where(eq(clanSettingsTable.id, 1));
  if (settings) return settings;
  // Row should exist via ensureClanSchema(); fall back to defaults if missing.
  const [created] = await db
    .insert(clanSettingsTable)
    .values({ id: 1, serieARegistrationOpen: true, serieBRegistrationOpen: false })
    .onConflictDoNothing()
    .returning();
  return created ?? {
    id: 1,
    serieARegistrationOpen: true,
    serieBRegistrationOpen: false,
  } as typeof clanSettingsTable.$inferSelect;
}

/** Which division a newly registering clan should join, or null when closed. */
async function resolveRegistrationDivision(): Promise<"serie_a" | "serie_b" | null> {
  const settings = await getClanSettings();
  if (settings.serieARegistrationOpen) return "serie_a";
  if (settings.serieBRegistrationOpen) return "serie_b";
  return null;
}

// Resolve the authenticated user's actual role in a team entirely from the DB.
async function resolveTeamRole(
  req: import("express").Request,
  team: typeof teamsTable.$inferSelect | null | undefined,
): Promise<TeamRole | null> {
  if (!team) return null;
  const uid = req.session?.userId;
  if (!uid) return null;
  if (team.presidentId === uid) return "president";
  if (team.coachId === uid) return "coach";
  if (team.captainId === uid) return "captain";
  const [m] = await db
    .select({ teamId: playersTable.teamId })
    .from(playersTable)
    .where(eq(playersTable.id, uid));
  return m?.teamId === team.id ? "player" : null;
}

async function resolveTeamWithCheck(req: import("express").Request, teamId: number) {
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  const role = await resolveTeamRole(req, team);
  return { team, role };
}

async function playerBrief(id: number | null) {
  if (id == null) return null;
  const [p] = await db
    .select({ id: playersTable.id, username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl })
    .from(playersTable)
    .where(eq(playersTable.id, id));
  return p ? { id: p.id, username: p.username, name: p.displayName ?? p.username, displayName: p.displayName, avatarUrl: p.avatarUrl } : null;
}

// Enriched team payload shared by list / detail / mine endpoints.
// Each member is tagged with its role; leadership is exposed explicitly.
async function enrichTeam(t: typeof teamsTable.$inferSelect, selfId?: number) {
  const members = await db.select().from(playersTable).where(eq(playersTable.teamId, t.id));
  const withRoles = members.map((m) => {
    const teamRole: TeamRole =
      m.id === t.presidentId ? "president"
      : m.id === t.coachId ? "coach"
      : m.id === t.captainId ? "captain"
      : "player";
    return { ...m, teamName: t.name, teamRole, createdAt: m.createdAt.toISOString() };
  });
  let selfRole: TeamRole | null = null;
  if (selfId != null) {
    selfRole = withRoles.find((x) => x.id === selfId)?.teamRole ?? null;
  }
  const brief = (id: number | null) => withRoles.find((m) => m.id === id) ?? null;
  const leaderBrief = (id: number | null) => {
    const m = brief(id);
    return m ? { id: m.id, name: m.displayName ?? m.username, username: m.username, avatarUrl: m.avatarUrl } : null;
  };
  const president = leaderBrief(t.presidentId);
  const coach = leaderBrief(t.coachId);
  const captain = leaderBrief(t.captainId);
  return {
    ...t,
    president,
    coach,
    captain,
    captainName: captain?.name ?? "Unknown",
    presidentName: president?.name ?? "Unknown",
    memberCount: withRoles.length,
    members: withRoles,
    teammates: withRoles.filter((m) => m.teamRole === "player"),
    selfRole,
    createdAt: t.createdAt.toISOString(),
  };
}

// ── GET /teams ─────────────────────────────────────────────────────────────────
router.get("/teams", async (req, res) => {
  const query = ListTeamsQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Invalid query" });

  const { search } = query.data;
  const teams = await db
    .select()
    .from(teamsTable)
    .where(search ? ilike(teamsTable.name, `%${search}%`) : undefined)
    .orderBy(teamsTable.points);

  const selfId = req.session?.userId;
  return res.json(await Promise.all(teams.map((t) => enrichTeam(t, selfId))));
});

// ── GET /teams/mine (current user's team, if any) ──────────────────────────────
router.get("/teams/mine", async (req, res) => {
  if (!req.session?.userId) return res.json(null);

  const userId = req.session.userId;
  const [team] = await db
    .select({ team: teamsTable })
    .from(teamsTable)
    .leftJoin(playersTable, eq(playersTable.teamId, teamsTable.id))
    .where(or(eq(teamsTable.coachId, userId), eq(teamsTable.captainId, userId), eq(teamsTable.presidentId, userId), eq(playersTable.id, userId)))
    .limit(1);

  return res.json(team?.team ? await enrichTeam(team.team, userId) : null);
});

// ── GET /players/discord-registered ───────────────────────────────────────────
// Returns all players who have logged in via Discord (have a discordId).
router.get("/players/discord-registered", async (_req, res) => {
  const players = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      discordId: playersTable.discordId,
      teamId: playersTable.teamId,
    })
    .from(playersTable)
    .where(isNotNull(playersTable.discordId))
    .orderBy(playersTable.displayName);
  return res.json(players);
});

// ── POST /teams/register (requires auth) ──────────────────────────────────────
// The authenticated user automatically becomes the team President.
// Coach and Captain are selected from registered players; other members go under
// "Players". Roles are derived from the DB, never from the client body.
router.post("/teams/register", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: "You must be logged in to register a team" });
  }

  const { name, tag, description, logoUrl, coachId, captainId, playerIds } = req.body ?? {};

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ error: "Team name must be at least 2 characters" });
  }
  if (typeof captainId !== "number" || typeof coachId !== "number") {
    return res.status(400).json({ error: "Both a Coach and a Captain are required" });
  }
  if (!Number.isInteger(captainId) || !Number.isInteger(coachId) || captainId <= 0 || coachId <= 0) {
    return res.status(400).json({ error: "Invalid Coach or Captain selection" });
  }

  // The auth user is the President/owner and cannot be assigned another role.
  if (coachId === userId || captainId === userId) {
    return res.status(400).json({ error: "The President must not also hold another team role" });
  }
  if (coachId === captainId) {
    return res.status(400).json({ error: "Coach and Captain cannot be the same person" });
  }

  const extraIds: number[] = Array.isArray(playerIds)
    ? Array.from(new Set(playerIds.filter((id: unknown): id is number => Number.isInteger(id) && (id as number) > 0)))
    : [];
  if (extraIds.includes(userId) || extraIds.includes(coachId) || extraIds.includes(captainId)) {
    return res.status(400).json({ error: "President, Coach and Captain cannot also be listed as Players" });
  }

  // Everyone in the new squad: President + Coach + Captain + Players.
  const allPlayerIds = Array.from(new Set([userId, coachId, captainId, ...extraIds]));

  try {
    // New clans join the currently open division (Serie A first, then Serie B).
    const division = await resolveRegistrationDivision();
    if (!division) {
      return res.status(403).json({ error: "Clan registration is currently closed" });
    }

    const team = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: teamsTable.id }).from(teamsTable).where(eq(teamsTable.name, name.trim()));
      if (existing) {
        const err = new Error("A team with that name already exists");
        (err as any).status = 409;
        throw err;
      }

      // Verify every selected user actually exists (President/Coach/Captain/Players).
      const idArray = sql`ARRAY[${sql.join(allPlayerIds.map((id) => sql`${id}`), sql`, `)}]::int[]`;
      const lockedPlayers = await tx.execute(
        sql`SELECT id, display_name, username, team_id FROM players WHERE id = ANY(${idArray}) ORDER BY id FOR UPDATE`
      );
      const rows = (lockedPlayers as any).rows as { id: number; display_name: string | null; username: string; team_id: number | null }[];

      // Every requested id must exist.
      if (rows.length !== allPlayerIds.length) {
        const found = new Set(rows.map((p) => p.id));
        const missing = allPlayerIds.filter((id) => !found.has(id));
        const err = new Error(`One or more selected players do not exist: ${missing.join(", ")}`);
        (err as any).status = 400;
        throw err;
      }

      // None may already belong to a team.
      const alreadyTeamed = rows.filter((p) => p.team_id !== null);
      if (alreadyTeamed.length > 0) {
        const names = alreadyTeamed.map((p) => p.display_name ?? p.username).join(", ");
        const err = new Error(`The following player(s) already belong to a team: ${names}`);
        (err as any).status = 409;
        throw err;
      }

      const [newTeam] = await tx.insert(teamsTable).values({
        name: name.trim(),
        tag: tag ?? null,
        description: description ?? null,
        logoUrl: logoUrl ?? null,
        division,
        presidentId: userId,
        captainId,
        coachId,
      }).returning();

      const updated = await tx
        .update(playersTable)
        .set({ teamId: newTeam.id, isFreeAgent: false })
        .where(inArray(playersTable.id, allPlayerIds))
        .returning({ id: playersTable.id });

      if (updated.length !== allPlayerIds.length) {
        const err = new Error("One or more players could not be assigned — they may have just joined another team");
        (err as any).status = 409;
        throw err;
      }

      return newTeam;
    });

    return res.status(201).json(await enrichTeam(team, userId));
  } catch (err: any) {
    const status = err.status ?? 500;
    return res.status(status).json({ error: err.message ?? "Registration failed" });
  }
});

// ── POST /teams (legacy — kept for admin compatibility) ───────────────────────
router.post("/teams", async (req, res) => {
  const { name, tag, description, captainId } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const [team] = await db.insert(teamsTable).values({
    name, tag, description,
    captainId: captainId ?? req.session?.userId ?? 1,
    coachId: req.session?.userId ?? null,
  }).returning();
  return res.status(201).json(await enrichTeam(team));
});

// ── GET /teams/clan-settings ──────────────────────────────────────────────────
// Public: the Clans page needs to know whether registration is open.
router.get("/teams/clan-settings", async (_req, res) => {
  try {
    const settings = await getClanSettings();
    return res.json({
      serieARegistrationOpen: settings.serieARegistrationOpen,
      serieBRegistrationOpen: settings.serieBRegistrationOpen,
    });
  } catch {
    return res.status(500).json({ error: "Failed to load clan settings" });
  }
});

// ── PATCH /teams/clan-settings (admin/owner) ──────────────────────────────────
// Toggle each division's registration window.
router.patch("/teams/clan-settings", async (req, res) => {
  if (!isPlatformStaff(req)) return res.status(403).json({ error: "Admin access required" });

  const body = (req.body ?? {}) as Record<string, unknown>;
  await getClanSettings(); // ensure the single row exists before updating

  const updates: Partial<typeof clanSettingsTable.$inferInsert> = {};
  if (typeof body.serieARegistrationOpen === "boolean") {
    updates.serieARegistrationOpen = body.serieARegistrationOpen;
    // Closing Serie A automatically opens Serie B so clans keep registering.
    if (!body.serieARegistrationOpen) updates.serieBRegistrationOpen = true;
  }
  if (typeof body.serieBRegistrationOpen === "boolean") {
    updates.serieBRegistrationOpen = body.serieBRegistrationOpen;
  }

  const [settings] = await db
    .update(clanSettingsTable)
    .set(updates)
    .where(eq(clanSettingsTable.id, 1))
    .returning();

  return res.json({
    serieARegistrationOpen: settings?.serieARegistrationOpen ?? true,
    serieBRegistrationOpen: settings?.serieBRegistrationOpen ?? false,
  });
});

router.get("/teams/:id", async (req, res) => {
  const params = GetTeamParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, params.data.id));
  if (!team) return res.status(404).json({ error: "Team not found" });

  return res.json(await enrichTeam(team, req.session?.userId));
});

// ── PATCH /teams/:id/logo (president or coach only) ───────────────────────────
router.patch("/teams/:id/logo", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });

  const teamId = Number(req.params.id);
  const logoUrl = req.body?.logoUrl;
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });
  if (typeof logoUrl !== "string" || !logoUrl.trim()) {
    return res.status(400).json({ error: "A logo path is required" });
  }

  const { team, role } = await resolveTeamWithCheck(req, teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  if (role !== "president" && role !== "coach" && !isPlatformStaff(req)) {
    return res.status(403).json({ error: "Only the President or Coach can change the team logo" });
  }

  await db.update(teamsTable).set({ logoUrl: logoUrl.trim() }).where(eq(teamsTable.id, teamId));
  return res.json({ ok: true, logoUrl: logoUrl.trim() });
});

// ── DELETE /teams/:id (team owner only) ───────────────────────────────────────
router.delete("/teams/:id", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });

  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  try {
    const { team, role } = await resolveTeamWithCheck(req, teamId);
    if (!team) return res.status(404).json({ error: "Team not found" });

    // Only the President may delete the team. Coach/Captain/player cannot.
    if (role !== "president" && !isPlatformStaff(req)) {
      return res.status(403).json({ error: "Only the team President can delete this team" });
    }

    await db.transaction(async (tx) => {
      // Release the roster so players can join another team after deletion.
      await tx.update(playersTable)
        .set({ teamId: null, isFreeAgent: true })
        .where(eq(playersTable.teamId, teamId));

      // Keep historical records, but remove active references to the team.
      await tx.execute(sql`UPDATE news SET team_id = NULL WHERE team_id = ${teamId}`);
      await tx.execute(sql`UPDATE tournament_participants SET team_id = NULL WHERE team_id = ${teamId}`);
      const playerTransfersTable = await tx.execute(
        sql`SELECT to_regclass('public.player_transfers') AS table_name`,
      );
      if ((playerTransfersTable.rows[0] as { table_name?: string | null })?.table_name) {
        await tx.execute(sql`UPDATE player_transfers SET from_team_id = NULL WHERE from_team_id = ${teamId}`);
        await tx.execute(sql`UPDATE player_transfers SET to_team_id = NULL WHERE to_team_id = ${teamId}`);
      }

      // This table was added after the original schema and may not exist in
      // older databases. Deletion should not fail just because it is absent.
      const squadImagesTable = await tx.execute(
        sql`SELECT to_regclass('public.team_squad_images') AS table_name`,
      );
      if ((squadImagesTable.rows[0] as { table_name?: string | null })?.table_name) {
        await tx.execute(sql`DELETE FROM team_squad_images WHERE team_id = ${teamId}`);
      }

      await tx.delete(teamsTable).where(eq(teamsTable.id, teamId));
    });

    return res.json({ ok: true });
  } catch (error) {
    req.log.error({ err: error, teamId }, "Failed to delete team");
    return res.status(500).json({ error: "Unable to delete the team right now. Please try again." });
  }
});

// ── PATCH /teams/:id (edit team info; president or coach) ─────────────────────
router.patch("/teams/:id", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });
  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  const { name, tag, description } = req.body ?? {};
  if (name != null && (typeof name !== "string" || name.trim().length < 2)) {
    return res.status(400).json({ error: "Team name must be at least 2 characters" });
  }

  const { team, role } = await resolveTeamWithCheck(req, teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  if (role !== "president" && role !== "coach" && !isPlatformStaff(req)) {
    return res.status(403).json({ error: "Only the President or Coach can edit team information" });
  }

  await db.update(teamsTable).set({
    name: name != null ? name.trim() : team.name,
    tag: tag != null ? (typeof tag === "string" ? tag.trim() : null) : team.tag,
    description: description != null ? (typeof description === "string" ? description : null) : team.description,
  }).where(eq(teamsTable.id, teamId));

  const [updated] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  return res.json(await enrichTeam(updated, req.session?.userId));
});

// ── POST /teams/:id/players (add players; president or coach) ─────────────────
router.post("/teams/:id/players", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });
  const teamId = Number(req.params.id);
  const { playerIds } = req.body ?? {};
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  const ids = Array.isArray(playerIds)
    ? Array.from(new Set(playerIds.filter((id: unknown): id is number => Number.isInteger(id) && (id as number) > 0)))
    : [];
  if (ids.length === 0) return res.status(400).json({ error: "At least one player id is required" });

  const { team, role } = await resolveTeamWithCheck(req, teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  if (role !== "president" && role !== "coach" && !isPlatformStaff(req)) {
    return res.status(403).json({ error: "Only the President or Coach can add players" });
  }

  const conflictIds = [team.presidentId, team.coachId, team.captainId];
  if (ids.some((id) => conflictIds.includes(id))) {
    return res.status(400).json({ error: "Cannot add a player who already holds a team role" });
  }

  try {
    await db.transaction(async (tx) => {
      const idArray = sql`ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::int[]`;
      const locked = await tx.execute(sql`SELECT id, team_id FROM players WHERE id = ANY(${idArray}) ORDER BY id FOR UPDATE`);
      const rows = (locked as any).rows as { id: number; team_id: number | null }[];
      if (rows.length !== ids.length) {
        const found = new Set(rows.map((p) => p.id));
        const missing = ids.filter((id) => !found.has(id));
        const err = new Error(`One or more players do not exist: ${missing.join(", ")}`);
        (err as any).status = 400;
        throw err;
      }
      const alreadyTeamed = rows.filter((p) => p.team_id !== null);
      if (alreadyTeamed.length > 0) {
        const err = new Error("One or more selected players already belong to a team");
        (err as any).status = 409;
        throw err;
      }
      await tx.update(playersTable).set({ teamId, isFreeAgent: false }).where(inArray(playersTable.id, ids));
      await tx.insert(playerTransfersTable).values(ids.map((pid) => ({ playerId: pid, toTeamId: teamId, fromTeamId: teamId })));
    });
  } catch (err: any) {
    return res.status(err.status ?? 500).json({ error: err.message ?? "Could not add players" });
  }

  const [updated] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  return res.json(await enrichTeam(updated, req.session?.userId));
});

// ── DELETE /teams/:id/players/:playerId (remove a player; president or coach) ─
router.delete("/teams/:id/players/:playerId", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });
  const teamId = Number(req.params.id);
  const playerId = Number(req.params.playerId);
  if (isNaN(teamId) || isNaN(playerId)) return res.status(400).json({ error: "Invalid id" });

  const { team, role } = await resolveTeamWithCheck(req, teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  if (role !== "president" && role !== "coach" && !isPlatformStaff(req)) {
    return res.status(403).json({ error: "Only the President or Coach can remove players" });
  }

  const leaders = [team.presidentId, team.coachId, team.captainId];
  if (leaders.includes(playerId)) {
    return res.status(400).json({ error: "Leadership roles cannot be removed from the roster — change the role first" });
  }

  const [member] = await db.select({ teamId: playersTable.teamId }).from(playersTable).where(eq(playersTable.id, playerId));
  if (!member || member.teamId !== teamId) {
    return res.status(404).json({ error: "Player is not a member of this team" });
  }

  await db.transaction(async (tx) => {
    await tx.update(playersTable).set({ teamId: null, isFreeAgent: true }).where(eq(playersTable.id, playerId));
    await tx.insert(playerTransfersTable).values({ playerId, fromTeamId: teamId, toTeamId: null });
  });

  const [updated] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  return res.json(await enrichTeam(updated, req.session?.userId));
});

// ── PATCH /teams/:id/captain (change captain; president or coach) ─────────────
router.patch("/teams/:id/captain", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });
  const teamId = Number(req.params.id);
  const { captainId } = req.body ?? {};
  const targetId = captainId ?? req.body?.playerId;
  if (isNaN(teamId) || !Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: "Invalid captain id" });
  }

  const { team, role } = await resolveTeamWithCheck(req, teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  if (role !== "president" && role !== "coach" && !isPlatformStaff(req)) {
    return res.status(403).json({ error: "Only the President or Coach can change the Captain" });
  }
  if (targetId === team.presidentId || targetId === team.coachId) {
    return res.status(400).json({ error: "The Captain must be a regular team member, not the President or Coach" });
  }
  const [candidate] = await db.select({ teamId: playersTable.teamId }).from(playersTable).where(eq(playersTable.id, targetId));
  if (!candidate || candidate.teamId !== teamId) {
    return res.status(400).json({ error: "The new Captain must already be a member of this team" });
  }

  await db.update(teamsTable).set({ captainId: targetId }).where(eq(teamsTable.id, teamId));
  const [updated] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  return res.json(await enrichTeam(updated, req.session?.userId));
});

// ── PATCH /teams/:id/coach (change coach; president only) ─────────────────────
router.patch("/teams/:id/coach", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });
  const teamId = Number(req.params.id);
  const { coachId } = req.body ?? {};
  const targetId = coachId ?? req.body?.playerId;
  if (isNaN(teamId) || !Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: "Invalid coach id" });
  }

  const { team, role } = await resolveTeamWithCheck(req, teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  if (role !== "president" && !isPlatformStaff(req)) {
    return res.status(403).json({ error: "Only the President can change the Coach" });
  }
  if (targetId === team.presidentId || targetId === team.captainId) {
    return res.status(400).json({ error: "The Coach must be a regular team member, not the President or Captain" });
  }
  const [candidate] = await db.select({ teamId: playersTable.teamId }).from(playersTable).where(eq(playersTable.id, targetId));
  if (!candidate || candidate.teamId !== teamId) {
    return res.status(400).json({ error: "The new Coach must already be a member of this team" });
  }

  await db.update(teamsTable).set({ coachId: targetId }).where(eq(teamsTable.id, teamId));
  const [updated] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  return res.json(await enrichTeam(updated, req.session?.userId));
});

// ── POST /teams/:id/transfer (transfer President; president only) ─────────────
router.post("/teams/:id/transfer", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });
  const teamId = Number(req.params.id);
  const { newPresidentId } = req.body ?? {};
  if (isNaN(teamId) || !Number.isInteger(newPresidentId) || newPresidentId <= 0) {
    return res.status(400).json({ error: "Invalid member id" });
  }

  const { team, role } = await resolveTeamWithCheck(req, teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  if (role !== "president" && !isPlatformStaff(req)) {
    return res.status(403).json({ error: "Only the current President can transfer ownership" });
  }

  const [candidate] = await db.select({ teamId: playersTable.teamId }).from(playersTable).where(eq(playersTable.id, newPresidentId));
  if (!candidate || candidate.teamId !== teamId) {
    return res.status(400).json({ error: "The new President must already be a member of this team" });
  }
  if (newPresidentId === team.presidentId) {
    return res.status(400).json({ error: "That member is already the President" });
  }

  await db.update(teamsTable).set({
    presidentId: newPresidentId,
    coachId: team.coachId === newPresidentId ? null : team.coachId,
    captainId: team.captainId === newPresidentId ? null : team.captainId,
  } as any).where(eq(teamsTable.id, teamId));

  const [updated] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  return res.json(await enrichTeam(updated, req.session?.userId));
});

// ── POST /teams/:id/leave (any member) ────────────────────────────────────────
// A President may not leave while other members would be left without a
// President — they must transfer ownership first. Other roles leave freely.
router.post("/teams/:id/leave", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });
  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });
  const uid = req.session.userId!;

  const { team, role } = await resolveTeamWithCheck(req, teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  if (role === "president") {
    const [others] = await db
      .select({ n: sql<number>`count(*)` })
      .from(playersTable)
      .where(sql`${playersTable.teamId} = ${teamId} AND ${playersTable.id} <> ${uid}`);
    if (Number(others?.n ?? 0) > 0) {
      return res.status(400).json({
        error: "You are the President and cannot leave while other members remain. Transfer ownership to a teammate first.",
      });
    }
  }

  await db.transaction(async (tx) => {
    await tx.update(playersTable).set({ teamId: null, isFreeAgent: true }).where(eq(playersTable.id, uid));
    const [remaining] = await tx.select({ n: sql<number>`count(*)` }).from(playersTable).where(eq(playersTable.teamId, teamId));
    const members = Number(remaining?.n ?? 0);
    if (members === 0) {
      await tx.execute(sql`UPDATE news SET team_id = NULL WHERE team_id = ${teamId}`);
      await tx.execute(sql`UPDATE tournament_participants SET team_id = NULL WHERE team_id = ${teamId}`);
      await tx.delete(teamsTable).where(eq(teamsTable.id, teamId));
    } else {
      await tx.update(teamsTable).set({
        presidentId: team.presidentId === uid ? null : team.presidentId,
        coachId: team.coachId === uid ? null : team.coachId,
        captainId: team.captainId === uid ? null : team.captainId,
      } as any).where(eq(teamsTable.id, teamId));
    }
  });

  return res.json({ ok: true, removed: true });
});

// ── GET /teams/:id/squad-images ───────────────────────────────────────────────
router.get("/teams/:id/squad-images", async (req, res) => {
  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  const rows = await db.execute(
    sql`SELECT id, team_id, object_path, caption, uploaded_by, created_at FROM team_squad_images WHERE team_id = ${teamId} ORDER BY created_at DESC`
  );
  return res.json(rows.rows.map((r: any) => ({
    ...r,
    createdAt: r.created_at,
    teamId: r.team_id,
    objectPath: r.object_path,
    uploadedBy: r.uploaded_by,
  })));
});

// ── GET /teams/:id/transfers (player movement history for this team) ───────────
router.get("/teams/:id/transfers", async (req, res) => {
  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  const fromTeams = aliasedTable(teamsTable, "from_team");
  const toTeams = aliasedTable(teamsTable, "to_team");
  const rows = await db
    .select({
      id: playerTransfersTable.id,
      playerId: playerTransfersTable.playerId,
      playerName: playersTable.displayName,
      playerUsername: playersTable.username,
      avatarUrl: playersTable.avatarUrl,
      fromTeamId: playerTransfersTable.fromTeamId,
      fromTeamName: fromTeams.name,
      toTeamId: playerTransfersTable.toTeamId,
      toTeamName: toTeams.name,
      transferredAt: playerTransfersTable.transferredAt,
    })
    .from(playerTransfersTable)
    .innerJoin(playersTable, eq(playersTable.id, playerTransfersTable.playerId))
    .leftJoin(fromTeams, eq(fromTeams.id, playerTransfersTable.fromTeamId))
    .leftJoin(toTeams, eq(toTeams.id, playerTransfersTable.toTeamId))
    .where(or(eq(playerTransfersTable.fromTeamId, teamId), eq(playerTransfersTable.toTeamId, teamId)))
    .orderBy(desc(playerTransfersTable.transferredAt));

  return res.json(rows.map((row) => ({
    ...row,
    transferredAt: row.transferredAt.toISOString(),
  })));
});

// ── POST /teams/:id/squad-images (coach or captain only) ──────────────────────
router.post("/teams/:id/squad-images", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });

  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) return res.status(404).json({ error: "Team not found" });

  const uid = req.session.userId;
  if (uid !== team.coachId && uid !== team.captainId && uid !== team.presidentId)
    return res.status(403).json({ error: "Only a team leader can manage squad images" });

  const { objectPath, caption } = req.body ?? {};
  if (!objectPath || typeof objectPath !== "string")
    return res.status(400).json({ error: "objectPath is required" });

  const [row] = await db.execute(
    sql`INSERT INTO team_squad_images (team_id, object_path, caption, uploaded_by) VALUES (${teamId}, ${objectPath}, ${caption ?? null}, ${uid}) RETURNING id, team_id, object_path, caption, uploaded_by, created_at`
  ) as any;
  const r = (row as any).rows?.[0] ?? row;
  return res.status(201).json({
    id: r.id, teamId: r.team_id, objectPath: r.object_path,
    caption: r.caption, uploadedBy: r.uploaded_by, createdAt: r.created_at,
  });
});

// ── DELETE /teams/:id/squad-images/:imageId (coach or captain only) ───────────
router.delete("/teams/:id/squad-images/:imageId", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });

  const teamId = Number(req.params.id);
  const imageId = Number(req.params.imageId);
  if (isNaN(teamId) || isNaN(imageId)) return res.status(400).json({ error: "Invalid id" });

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) return res.status(404).json({ error: "Team not found" });

  const uid = req.session.userId;
  if (uid !== team.coachId && uid !== team.captainId && uid !== team.presidentId)
    return res.status(403).json({ error: "Only a team leader can delete squad images" });

  await db.execute(sql`DELETE FROM team_squad_images WHERE id = ${imageId} AND team_id = ${teamId}`);
  return res.json({ ok: true });
});

// ── GET /teams/:id/news ────────────────────────────────────────────────────────
router.get("/teams/:id/news", async (req, res) => {
  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  const articles = await db
    .select()
    .from(newsTable)
    .where(eq(newsTable.teamId, teamId))
    .orderBy(desc(newsTable.publishedAt));

  return res.json(articles.map((a) => ({
    ...a,
    publishedAt: a.publishedAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
  })));
});

// ── POST /teams/:id/news (coach or captain only) ───────────────────────────────
router.post("/teams/:id/news", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });

  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) return res.status(404).json({ error: "Team not found" });

  const uid = req.session.userId;
  if (uid !== team.coachId && uid !== team.captainId && uid !== team.presidentId) {
    return res.status(403).json({ error: "Only a team leader can post team news" });
  }

  const { title, content, excerpt } = req.body ?? {};
  if (!title || typeof title !== "string" || title.trim().length < 3)
    return res.status(400).json({ error: "Title must be at least 3 characters" });
  if (!content || typeof content !== "string" || content.trim().length < 10)
    return res.status(400).json({ error: "Content must be at least 10 characters" });

  const [author] = await db
    .select({ displayName: playersTable.displayName, username: playersTable.username })
    .from(playersTable)
    .where(eq(playersTable.id, uid));

  const base = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").substring(0, 60);
  const slug = `${base}-${Date.now()}`;

  const [article] = await db
    .insert(newsTable)
    .values({
      title: title.trim(),
      content: content.trim(),
      excerpt: excerpt?.trim() ?? title.trim().substring(0, 120),
      slug,
      category: "club",
      teamId,
      authorId: uid,
      authorName: author?.displayName ?? author?.username ?? "Unknown",
      isFeatured: false,
    })
    .returning();

  return res.status(201).json({
    ...article,
    publishedAt: article.publishedAt.toISOString(),
    createdAt: article.createdAt.toISOString(),
  });
});

// ── GET /teams/:id/fixtures (upcoming scheduled matches) ──────────────────────
router.get("/teams/:id/fixtures", async (req, res) => {
  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  // Same team-tournament-only guard as the /matches endpoint.
  const matches = await db
    .select({
      id: matchesTable.id,
      tournamentId: matchesTable.tournamentId,
      tournamentName: tournamentsTable.name,
      round: matchesTable.round,
      roundName: matchesTable.roundName,
      status: matchesTable.status,
      participant1Id: matchesTable.participant1Id,
      participant1Name: matchesTable.participant1Name,
      participant2Id: matchesTable.participant2Id,
      participant2Name: matchesTable.participant2Name,
      scheduledAt: matchesTable.scheduledAt,
      streamUrl: matchesTable.streamUrl,
    })
    .from(matchesTable)
    .leftJoin(tournamentsTable, eq(matchesTable.tournamentId, tournamentsTable.id))
    .where(
      sql`(${matchesTable.participant1Id} = ${teamId} OR ${matchesTable.participant2Id} = ${teamId})
          AND ${matchesTable.status} = 'scheduled'
          AND ${tournamentsTable.tournamentType} = 'team'`
    )
    .orderBy(matchesTable.scheduledAt);

  return res.json(matches);
});

// ── GET /teams/:id/matches (completed match results) ──────────────────────────
router.get("/teams/:id/matches", async (req, res) => {
  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  // Only return matches from team tournaments (tournamentType = 'team').
  // participant1Id/participant2Id store player IDs in solo tournaments and
  // team IDs in team tournaments — without this filter, a team whose numeric
  // ID collides with a player ID would absorb that player's individual matches.
  const matches = await db
    .select({
      id: matchesTable.id,
      tournamentId: matchesTable.tournamentId,
      tournamentName: tournamentsTable.name,
      tournamentType: tournamentsTable.tournamentType,
      round: matchesTable.round,
      roundName: matchesTable.roundName,
      status: matchesTable.status,
      participant1Id: matchesTable.participant1Id,
      participant1Name: matchesTable.participant1Name,
      participant1Score: matchesTable.participant1Score,
      participant2Id: matchesTable.participant2Id,
      participant2Name: matchesTable.participant2Name,
      participant2Score: matchesTable.participant2Score,
      winnerId: matchesTable.winnerId,
      winnerName: matchesTable.winnerName,
      scheduledAt: matchesTable.scheduledAt,
      manOfTheMatchName: matchesTable.manOfTheMatchName,
    })
    .from(matchesTable)
    .leftJoin(tournamentsTable, eq(matchesTable.tournamentId, tournamentsTable.id))
    .where(
      sql`(${matchesTable.participant1Id} = ${teamId} OR ${matchesTable.participant2Id} = ${teamId})
          AND ${matchesTable.status} = 'completed'
          AND ${tournamentsTable.tournamentType} = 'team'`
    )
    .orderBy(desc(matchesTable.scheduledAt));

  return res.json(matches);
});

// ── DELETE /teams/:id/members/:playerId  (coach only — kick a player) ─────────
router.delete("/teams/:id/members/:playerId", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });

  const teamId   = Number(req.params.id);
  const playerId = Number(req.params.playerId);
  if (isNaN(teamId) || isNaN(playerId)) return res.status(400).json({ error: "Invalid id" });

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) return res.status(404).json({ error: "Team not found" });

  const role = await resolveTeamRole(req, team);
  if (role !== "president" && role !== "coach" && !isPlatformStaff(req))
    return res.status(403).json({ error: "Only the President or Coach can remove players" });

  // Cannot remove the captain without reassigning first
  if (playerId === team.captainId)
    return res.status(400).json({ error: "Cannot remove the captain. Change the captain first, then remove them." });

  const [player] = await db.select({ id: playersTable.id }).from(playersTable).where(
    sql`${playersTable.id} = ${playerId} AND ${playersTable.teamId} = ${teamId}`
  );
  if (!player) return res.status(404).json({ error: "Player is not a member of this team" });

  await db.update(playersTable).set({ teamId: null, isFreeAgent: true }).where(
    sql`${playersTable.id} = ${playerId} AND ${playersTable.teamId} = ${teamId}`
  );
  // The roster update is the user-facing operation. Keep it successful even
  // when an older production transfer-history constraint rejects a nullable
  // destination team, so the UI never reports a failure after removing a player.
  try {
    await db.insert(playerTransfersTable).values({ playerId, fromTeamId: teamId, toTeamId: null });
  } catch (err) {
    req.log.warn({ err, playerId, teamId }, "Player removed but transfer history could not be recorded");
  }
  return res.json({ ok: true });
});

// ── POST /teams/:id/members  (captain only — add a free-agent player) ─────────
router.post("/teams/:id/members", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });

  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) return res.status(404).json({ error: "Team not found" });

  const role = await resolveTeamRole(req, team);
  if (role !== "president" && role !== "coach" && !isPlatformStaff(req))
    return res.status(403).json({ error: "Only the President or Coach can add players" });

  const { playerId } = req.body ?? {};
  if (typeof playerId !== "number") return res.status(400).json({ error: "playerId is required" });

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) return res.status(404).json({ error: "Player not found" });
  if (player.teamId != null) return res.status(409).json({ error: "Player is already on a team" });

  await db.update(playersTable).set({ teamId, isFreeAgent: false }).where(eq(playersTable.id, playerId));
  await db.insert(playerTransfersTable).values({ playerId, fromTeamId: null, toTeamId: teamId });
  return res.json({ ok: true });
});

// ── PATCH /teams/:id/captain  (coach only — change the captain) ───────────────
router.patch("/teams/:id/captain", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });

  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) return res.status(404).json({ error: "Team not found" });

  const role = await resolveTeamRole(req, team);
  if (role !== "president" && role !== "coach" && !isPlatformStaff(req))
    return res.status(403).json({ error: "Only the President or Coach can change the captain" });

  const { playerId } = req.body ?? {};
  if (typeof playerId !== "number") return res.status(400).json({ error: "playerId is required" });

  const [player] = await db.select().from(playersTable)
    .where(sql`${playersTable.id} = ${playerId} AND ${playersTable.teamId} = ${teamId}`);
  if (!player) return res.status(400).json({ error: "Player is not a member of this team" });

  await db.update(teamsTable).set({ captainId: playerId }).where(eq(teamsTable.id, teamId));
  return res.json({ ok: true });
});

// ── PATCH /teams/:id/coach  (coach only — transfer the coach role) ────────────
router.patch("/teams/:id/coach", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });

  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) return res.status(404).json({ error: "Team not found" });

  const role = await resolveTeamRole(req, team);
  if (role !== "president" && !isPlatformStaff(req))
    return res.status(403).json({ error: "Only the President can change the Coach" });

  const { playerId } = req.body ?? {};
  if (typeof playerId !== "number") return res.status(400).json({ error: "playerId is required" });

  const [player] = await db.select().from(playersTable)
    .where(sql`${playersTable.id} = ${playerId} AND ${playersTable.teamId} = ${teamId}`);
  if (!player) return res.status(400).json({ error: "Player is not a member of this team" });

  await db.update(teamsTable).set({ coachId: playerId }).where(eq(teamsTable.id, teamId));
  return res.json({ ok: true });
});

export default router;
