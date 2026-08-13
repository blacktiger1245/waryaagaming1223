import { Router } from "express";
import { db } from "@workspace/db";
import { teamsTable, playersTable, newsTable, matchesTable, tournamentsTable, playerTransfersTable } from "@workspace/db";
import { eq, ilike, isNotNull, inArray, desc, sql, or, aliasedTable } from "drizzle-orm";
import {
  ListTeamsQueryParams,
  GetTeamParams,
} from "@workspace/api-zod";

const router = Router();

// ── helpers ────────────────────────────────────────────────────────────────────
async function enrichTeam(t: typeof teamsTable.$inferSelect) {
  const [captain] = await db
    .select({ username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl })
    .from(playersTable)
    .where(eq(playersTable.id, t.captainId));

  const coachId = t.coachId;
  const coach = coachId
    ? (await db
        .select({ id: playersTable.id, username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl })
        .from(playersTable)
        .where(eq(playersTable.id, coachId)))[0] ?? null
    : null;

  const members = await db.select().from(playersTable).where(eq(playersTable.teamId, t.id));
  return {
    ...t,
    captainName: captain?.displayName ?? captain?.username ?? "Unknown",
    coach: coach ? { id: coach.id, name: coach.displayName ?? coach.username, avatarUrl: coach.avatarUrl } : null,
    memberCount: members.length,
    members: members.map((m) => ({ ...m, teamName: t.name, createdAt: m.createdAt.toISOString() })),
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

  return res.json(await Promise.all(teams.map(enrichTeam)));
});

// ── GET /teams/mine (current user's team, if any) ──────────────────────────────
router.get("/teams/mine", async (req, res) => {
  if (!req.session?.userId) return res.json(null);

  const userId = req.session.userId;
  const [team] = await db
    .select({ team: teamsTable })
    .from(teamsTable)
    .leftJoin(playersTable, eq(playersTable.teamId, teamsTable.id))
    .where(or(eq(teamsTable.coachId, userId), eq(teamsTable.captainId, userId), eq(playersTable.id, userId)))
    .limit(1);

  return res.json(team?.team ? await enrichTeam(team.team) : null);
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
router.post("/teams/register", async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "You must be logged in to register a team" });
  }

  const { name, tag, description, logoUrl, captainId, playerIds } = req.body ?? {};

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ error: "Team name must be at least 2 characters" });
  }
  if (typeof captainId !== "number") {
    return res.status(400).json({ error: "captainId is required" });
  }

  const coachId = req.session.userId;

  const extraIds: number[] = Array.isArray(playerIds) ? playerIds.filter((id: unknown) => typeof id === "number") : [];
  // Always include the coach as a team member so the person registering
  // the team is automatically part of their own squad.
  const allPlayerIds = Array.from(new Set([captainId, coachId, ...extraIds]));

  // All work runs inside a serializable transaction so concurrent registrations
  // cannot both pass the "player not yet on a team" check at the same time.
  let team: typeof teamsTable.$inferSelect;
  try {
    team = await db.transaction(async (tx) => {
      // 1. Ensure name is unique
      const [existing] = await tx.select({ id: teamsTable.id }).from(teamsTable).where(eq(teamsTable.name, name.trim()));
      if (existing) {
        const err = new Error("A team with that name already exists");
        (err as any).status = 409;
        throw err;
      }

      // 2. Lock the player rows (FOR UPDATE) so concurrent transactions must wait,
      //    then verify none are already on a team.
      if (allPlayerIds.length > 0) {
        const idArray = sql`ARRAY[${sql.join(allPlayerIds.map((id) => sql`${id}`), sql`, `)}]::int[]`;
        const lockedPlayers = await tx.execute(
          sql`SELECT id, display_name, username, team_id FROM players WHERE id = ANY(${idArray}) ORDER BY id FOR UPDATE`
        );
        const rows = (lockedPlayers as any).rows as { id: number; display_name: string | null; username: string; team_id: number | null }[];
        const alreadyTeamed = rows.filter((p) => p.team_id !== null);
        if (alreadyTeamed.length > 0) {
          const names = alreadyTeamed.map((p) => p.display_name ?? p.username).join(", ");
          const err = new Error(`The following player(s) already belong to a team: ${names}`);
          (err as any).status = 409;
          throw err;
        }
      }

      // 3. Create the team
      const [newTeam] = await tx.insert(teamsTable).values({
        name: name.trim(),
        tag: tag ?? null,
        description: description ?? null,
        logoUrl: logoUrl ?? null,
        captainId,
        coachId,
      }).returning();

      // 4. Assign all selected players (including captain) to this team
      if (allPlayerIds.length > 0) {
        const updated = await tx
          .update(playersTable)
          .set({ teamId: newTeam.id, isFreeAgent: false })
          .where(inArray(playersTable.id, allPlayerIds))
          .returning({ id: playersTable.id });

        // Sanity check: if fewer rows were updated than expected, someone else
        // won the race (shouldn't happen with FOR UPDATE, but be defensive).
        if (updated.length !== allPlayerIds.length) {
          const err = new Error("One or more players could not be assigned — they may have just joined another team");
          (err as any).status = 409;
          throw err;
        }

        // Initial roster assignment is not a transfer: every selected player
        // was verified to have no team above.  Do not write transfer-history
        // rows with a null from_team_id here, because production databases may
        // still have an older constraint on that legacy history table.  Actual
        // add/remove operations below continue to record transfers.
      }

      return newTeam;
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    return res.status(status).json({ error: err.message ?? "Registration failed" });
  }

  return res.status(201).json(await enrichTeam(team));
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

router.get("/teams/:id", async (req, res) => {
  const params = GetTeamParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, params.data.id));
  if (!team) return res.status(404).json({ error: "Team not found" });

  const [captain, members] = await Promise.all([
    db.select({ username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl })
      .from(playersTable).where(eq(playersTable.id, team.captainId)).then(r => r[0]),
    db.select().from(playersTable).where(eq(playersTable.teamId, params.data.id)),
  ]);

  const coachId = team.coachId;
  const coachRow = coachId
    ? await db.select({ id: playersTable.id, username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl })
        .from(playersTable).where(eq(playersTable.id, coachId)).then(r => r[0] ?? null)
    : null;

  return res.json({
    ...team,
    captainName: captain?.displayName ?? captain?.username ?? "Unknown",
    coach: coachRow ? { id: coachRow.id, name: coachRow.displayName ?? coachRow.username, avatarUrl: coachRow.avatarUrl } : null,
    memberCount: members.length,
    members: members.map((m) => ({ ...m, teamName: team.name, createdAt: m.createdAt.toISOString() })),
    createdAt: team.createdAt.toISOString(),
  });
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
  if (uid !== team.coachId && uid !== team.captainId)
    return res.status(403).json({ error: "Only the coach or captain can manage squad images" });

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
  if (uid !== team.coachId && uid !== team.captainId)
    return res.status(403).json({ error: "Only the coach or captain can delete squad images" });

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
  if (uid !== team.coachId && uid !== team.captainId) {
    return res.status(403).json({ error: "Only the coach or captain can post team news" });
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

  if (req.session.userId !== team.coachId)
    return res.status(403).json({ error: "Only the coach can remove players" });

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
  await db.insert(playerTransfersTable).values({ playerId, fromTeamId: teamId, toTeamId: null });
  return res.json({ ok: true });
});

// ── POST /teams/:id/members  (captain only — add a free-agent player) ─────────
router.post("/teams/:id/members", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login required" });

  const teamId = Number(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team id" });

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) return res.status(404).json({ error: "Team not found" });

  if (req.session.userId !== team.coachId)
    return res.status(403).json({ error: "Only the coach can add players" });

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

  if (req.session.userId !== team.coachId)
    return res.status(403).json({ error: "Only the coach can change the captain" });

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

  if (req.session.userId !== team.coachId)
    return res.status(403).json({ error: "Only the current coach can transfer the coach role" });

  const { playerId } = req.body ?? {};
  if (typeof playerId !== "number") return res.status(400).json({ error: "playerId is required" });

  const [player] = await db.select().from(playersTable)
    .where(sql`${playersTable.id} = ${playerId} AND ${playersTable.teamId} = ${teamId}`);
  if (!player) return res.status(400).json({ error: "Player is not a member of this team" });

  await db.update(teamsTable).set({ coachId: playerId }).where(eq(teamsTable.id, teamId));
  return res.json({ ok: true });
});

export default router;
