import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  teamsTable,
  tournamentsTable,
  matchesTable,
  matchPlayerGamesTable,
  tournamentParticipantsTable,
  newsTable,
  mediaTable,
  hallOfFameTable,
  seasonsTable,
  tournamentAdminsTable,
} from "@workspace/db";
import { eq, desc, and, inArray, type AnyColumn } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

const router = Router();

// Legacy hardcoded credentials kept as an emergency fallback only.
const LEGACY_ADMIN_USERNAME = "black_tiger";
const LEGACY_ADMIN_PASSWORD = "zakiir123";

// ─── /admin/me ───────────────────────────────────────────────────────────────
// Returns the current admin identity regardless of how they authenticated
// (Discord role OR legacy password session).
router.get("/admin/me", (req, res) => {
  // Discord-based admin/owner role (primary path)
  if (req.session.userId && (req.session.role === "admin" || req.session.role === "owner")) {
    return res.json({
      username: req.session.username,
      displayName: req.session.displayName,
      avatarUrl: req.session.avatarUrl,
      role: req.session.role,
    });
  }
  // Legacy password-based session (fallback)
  if (req.session.isAdmin) {
    return res.json({
      username: req.session.adminUsername ?? LEGACY_ADMIN_USERNAME,
      displayName: null,
      avatarUrl: null,
      role: "admin",
    });
  }
  return res.status(401).json({ error: "Not authenticated" });
});

// ─── Legacy password login ────────────────────────────────────────────────────
router.post("/admin/login", (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (username === LEGACY_ADMIN_USERNAME && password === LEGACY_ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    req.session.adminUsername = username;
    return res.json({ ok: true, username, role: "admin" });
  }
  return res.status(401).json({ error: "Invalid credentials" });
});

router.post("/admin/logout", (req, res) => {
  req.session.isAdmin = undefined as unknown as boolean;
  req.session.adminUsername = undefined as unknown as string;
  // If using Discord role, destroy the whole session so they log out fully.
  if (!req.session.isAdmin && req.session.userId) {
    req.session.destroy(() => undefined);
  }
  res.json({ ok: true });
});

// ─── requireAdmin middleware ──────────────────────────────────────────────────
// Accepts either:
//   • A Discord-authenticated session whose player row has role 'admin'|'owner'
//   • The legacy password-based isAdmin session flag
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const discordAdmin =
    !!req.session.userId &&
    (req.session.role === "admin" || req.session.role === "owner");
  if (discordAdmin || req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: "Admin authentication required" });
}

// ─── requireOwner middleware ──────────────────────────────────────────────────
function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.session.role === "owner") return next();
  return res.status(403).json({ error: "Owner privileges required" });
}

router.use("/admin", requireAdmin);

// ─── Role management (owner only) ────────────────────────────────────────────
// List all registered players with their roles so the owner can see who is
// an admin and grant or revoke the role.
router.get("/admin/users", requireOwner, async (_req, res) => {
  const rows = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      discordId: playersTable.discordId,
      role: playersTable.role,
    })
    .from(playersTable)
    .orderBy(desc(playersTable.id));
  return res.json(rows);
});

// Grant or revoke admin role for a player.  The owner's own row can never be
// downgraded through this endpoint.
router.patch("/admin/users/:id/role", requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body as { role?: string };

  if (!role || !["player", "admin"].includes(role)) {
    return res.status(400).json({ error: "role must be 'player' or 'admin'" });
  }

  // Protect the owner row from accidental demotion.
  const [target] = await db.select({ role: playersTable.role }).from(playersTable).where(eq(playersTable.id, id));
  if (!target) return res.status(404).json({ error: "Player not found" });
  if (target.role === "owner") {
    return res.status(403).json({ error: "Cannot change the owner's role" });
  }

  const [updated] = await db
    .update(playersTable)
    .set({ role })
    .where(eq(playersTable.id, id))
    .returning({
      id: playersTable.id,
      username: playersTable.username,
      role: playersTable.role,
    });

  return res.json(updated);
});

// ─── Generic CRUD entity routes ───────────────────────────────────────────────
function registerEntityRoutes(path: string, table: PgTable & { id: AnyColumn }) {
  router.get(`/admin/${path}`, async (_req, res) => {
    const rows = await db.select().from(table).orderBy(desc(table.id));
    res.json(rows);
  });

  router.get(`/admin/${path}/:id`, async (req, res) => {
    const id = Number(req.params.id);
    const rows = await db.select().from(table).where(eq(table.id, id));
    if (!rows[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(rows[0]);
  });

  router.post(`/admin/${path}`, async (req, res) => {
    try {
      const body = { ...req.body };
      // Drizzle requires Date objects for timestamp columns, not ISO strings
      if (typeof body.publishedAt === "string") body.publishedAt = new Date(body.publishedAt);
      if (typeof body.scheduledAt === "string") body.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
      if (typeof body.createdAt === "string") body.createdAt = new Date(body.createdAt);
      const rows = await db.insert(table).values(body).returning();
      res.status(201).json(rows[0]);
    } catch (err) {
      req.log.error({ err }, `Failed to create ${path}`);
      res.status(400).json({ error: `Failed to create ${path}` });
    }
  });

  router.patch(`/admin/${path}/:id`, async (req, res) => {
    const id = Number(req.params.id);
    try {
      // Coerce any ISO string timestamp fields to Date objects for Drizzle
      const body = { ...req.body };

      // ── Strip auto-computed fields from player updates ────────────────────
      if (path === "players") {
        delete body.matchesWon;
        delete body.matchesLost;
        delete body.matchesPlayed;
        delete body.winRate;
        delete body.lossRate;
        delete body.tournamentWins;
        delete body.points;
      }
      if (typeof body.scheduledAt === "string") body.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
      if (typeof body.createdAt === "string") body.createdAt = new Date(body.createdAt);
      if (typeof body.updatedAt === "string") body.updatedAt = new Date(body.updatedAt);
      const rows = await db.update(table).set(body).where(eq(table.id, id)).returning();
      if (!rows[0]) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      // ── Sync player stats + XP when a match is completed ────────────────
      if (path === "matches") {
        const match = rows[0] as typeof matchesTable.$inferSelect;
        if (match.status === "completed") {
          // Skip player-stats sync for team-tournament matches:
          // participant1Id/participant2Id are *team* IDs there, not player IDs,
          // so running the sync would corrupt player rows whose IDs happen to
          // collide with a team ID.
          const [tournament] = match.tournamentId
            ? await db.select({ tournamentType: tournamentsTable.tournamentType })
                .from(tournamentsTable)
                .where(eq(tournamentsTable.id, match.tournamentId))
            : [null];
          const isTeamMatch = tournament?.tournamentType === "team";

          // participant1Id / participant2Id are player IDs directly (solo tournaments only)
          const playerIds = isTeamMatch
            ? []
            : [match.participant1Id, match.participant2Id].filter((x): x is number => x != null);
          if (playerIds.length > 0) {
            // Fetch all completed matches once
            const completedMatches = await db
              .select({
                participant1Id: matchesTable.participant1Id,
                participant2Id: matchesTable.participant2Id,
                participant1Score: matchesTable.participant1Score,
                participant2Score: matchesTable.participant2Score,
                winnerId: matchesTable.winnerId,
                manOfTheMatchId: matchesTable.manOfTheMatchId,
                participant1YellowCards: matchesTable.participant1YellowCards,
                participant1RedCards: matchesTable.participant1RedCards,
                participant2YellowCards: matchesTable.participant2YellowCards,
                participant2RedCards: matchesTable.participant2RedCards,
              })
              .from(matchesTable)
              .where(eq(matchesTable.status, "completed"));

            for (const playerId of playerIds) {
              // Tally stats from all completed matches
              let matchesPlayed = 0;
              let matchesWon = 0;
              let cleanSheets = 0;
              let goalsScored = 0;
              let goalsConceded = 0;
              let draws = 0;
              let manOfTheMatch = 0;
              let yellowCards = 0;
              let redCards = 0;

              for (const m of completedMatches) {
                const asP1 = m.participant1Id === playerId;
                const asP2 = m.participant2Id === playerId;
                if (!asP1 && !asP2) continue;

                matchesPlayed++;
                const myScore  = asP1 ? (m.participant1Score ?? 0) : (m.participant2Score ?? 0);
                const oppScore = asP1 ? (m.participant2Score ?? 0) : (m.participant1Score ?? 0);

                goalsScored   += myScore;
                goalsConceded += oppScore;

                // Clean sheet: opponent scored 0
                if (oppScore === 0) cleanSheets++;

                // Man of the Match: credited when this player's participant slot is the MOTM
                if (m.manOfTheMatchId != null) {
                  if ((asP1 && m.manOfTheMatchId === m.participant1Id) ||
                      (asP2 && m.manOfTheMatchId === m.participant2Id)) {
                    manOfTheMatch++;
                  }
                }

                // Cards
                if (asP1) {
                  yellowCards += m.participant1YellowCards ?? 0;
                  redCards    += m.participant1RedCards    ?? 0;
                } else {
                  yellowCards += m.participant2YellowCards ?? 0;
                  redCards    += m.participant2RedCards    ?? 0;
                }

                // Draw
                if (myScore === oppScore) { draws++; continue; }

                // Win: derive from scores (winnerId may be null)
                const s1 = m.participant1Score ?? 0;
                const s2 = m.participant2Score ?? 0;
                const winnerPlayerId = m.winnerId != null
                  ? m.winnerId
                  : s1 > s2 ? m.participant1Id
                  : s2 > s1 ? m.participant2Id
                  : null;
                if (winnerPlayerId === playerId) matchesWon++;
              }

              // Tournament wins (preserved, set by tournament sync below)
              const [player] = await db
                .select({ tournamentWins: playersTable.tournamentWins })
                .from(playersTable)
                .where(eq(playersTable.id, playerId));
              const tournamentWins = player?.tournamentWins ?? 0;

              const matchesLost = matchesPlayed - matchesWon;
              const winRate = matchesWon * 0.4;
              const lossRate = matchesLost * 0.4;
              // Points: 3 per win only
              const points = matchesWon * 3;

              await db.update(playersTable).set({
                points,
                matchesPlayed,
                matchesWon,
                matchesLost,
                winRate,
                lossRate,
                cleanSheets,
                goalsScored,
                goalsConceded,
                draws,
                manOfTheMatch,
                yellowCards,
                redCards,
              }).where(eq(playersTable.id, playerId));
            }

            // ── Re-rank ALL players by points after every completed match ──
            const allPlayers = await db
              .select({ id: playersTable.id, points: playersTable.points, rank: playersTable.rank })
              .from(playersTable)
              .orderBy(desc(playersTable.points));

            await Promise.all(
              allPlayers.map((p, i) =>
                db.update(playersTable).set({
                  previousRank: p.rank > 0 && p.rank < 9999 ? p.rank : i + 1,
                  rank: i + 1,
                }).where(eq(playersTable.id, p.id))
              )
            );
          }
        }
      }

      // ── Sync tournament win XP when a tournament gets a winner ───────────
      if (path === "tournaments") {
        const tournament = rows[0] as typeof tournamentsTable.$inferSelect;
        if (tournament.winnerId) {
          // winnerId here is a tournamentParticipantsTable id
          const [participation] = await db
            .select({ playerId: tournamentParticipantsTable.playerId })
            .from(tournamentParticipantsTable)
            .where(eq(tournamentParticipantsTable.id, tournament.winnerId));

          if (participation?.playerId) {
            const playerId = participation.playerId;

            // Count how many tournaments this player has won
            const wonTournaments = await db
              .select({ id: tournamentsTable.id })
              .from(tournamentsTable)
              .where(eq(tournamentsTable.winnerId, tournament.winnerId));
            const tournamentWins = wonTournaments.length;

            // Re-fetch current match-based stats for this player
            const completedMatches = await db
              .select({
                participant1Id: matchesTable.participant1Id,
                participant2Id: matchesTable.participant2Id,
                participant1Score: matchesTable.participant1Score,
                participant2Score: matchesTable.participant2Score,
              })
              .from(matchesTable)
              .where(eq(matchesTable.status, "completed"));

            let matchesPlayed = 0;
            for (const m of completedMatches) {
              const asP1 = m.participant1Id === playerId;
              const asP2 = m.participant2Id === playerId;
              if (!asP1 && !asP2) continue;
              matchesPlayed++;
            }

            await db.update(playersTable).set({ tournamentWins }).where(eq(playersTable.id, playerId));
          }
        }
      }

      res.json(rows[0]);
    } catch (err) {
      req.log.error({ err }, `Failed to update ${path}`);
      res.status(400).json({ error: `Failed to update ${path}` });
    }
  });

  router.delete(`/admin/${path}/:id`, async (req, res) => {
    const id = Number(req.params.id);
    await db.delete(table).where(eq(table.id, id));
    res.json({ ok: true });
  });
}

registerEntityRoutes("players", playersTable);

// ── Override generic team DELETE — also clears all members ───────────────────
// Must be registered BEFORE registerEntityRoutes("teams") so it wins the match.
router.delete("/admin/teams/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  // Clear all players that belong to this team
  await db.update(playersTable).set({ teamId: null }).where(eq(playersTable.teamId, id));
  await db.delete(teamsTable).where(eq(teamsTable.id, id));
  return res.json({ ok: true });
});

// ── Admin: remove a single player from a team ─────────────────────────────────
router.delete("/admin/teams/:id/members/:playerId", async (req, res) => {
  const teamId   = Number(req.params.id);
  const playerId = Number(req.params.playerId);
  if (isNaN(teamId) || isNaN(playerId)) return res.status(400).json({ error: "Invalid id" });

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) return res.status(404).json({ error: "Team not found" });

  if (playerId === team.captainId) {
    return res.status(400).json({ error: "Cannot remove the captain. Change the captain first." });
  }

  await db.update(playersTable).set({ teamId: null }).where(
    and(eq(playersTable.id, playerId), eq(playersTable.teamId, teamId))
  );
  return res.json({ ok: true });
});

// ── Admin: ban a player ───────────────────────────────────────────────────────
router.post("/admin/players/:id/ban", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { duration, reason } = req.body as { duration?: string; reason?: string };
  const allowed = ["1d", "5d", "1w", "1m"];
  if (!duration || !allowed.includes(duration)) {
    return res.status(400).json({ error: "duration must be one of: 1d, 5d, 1w, 1m" });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: "A ban reason is required" });
  }

  const durationMs: Record<string, number> = {
    "1d": 1 * 24 * 60 * 60 * 1000,
    "5d": 5 * 24 * 60 * 60 * 1000,
    "1w": 7 * 24 * 60 * 60 * 1000,
    "1m": 30 * 24 * 60 * 60 * 1000,
  };
  const bannedUntil = new Date(Date.now() + durationMs[duration]);

  // Resolve the acting admin's name from their session
  const bannedBy =
    req.session.displayName ??
    req.session.username ??
    req.session.adminUsername ??
    "Admin";

  const [updated] = await db
    .update(playersTable)
    .set({ bannedUntil, banReason: reason.trim(), bannedBy })
    .where(eq(playersTable.id, id))
    .returning({
      id: playersTable.id,
      username: playersTable.username,
      bannedUntil: playersTable.bannedUntil,
      banReason: playersTable.banReason,
      bannedBy: playersTable.bannedBy,
    });

  if (!updated) return res.status(404).json({ error: "Player not found" });
  return res.json(updated);
});

// ── Admin: unban a player ─────────────────────────────────────────────────────
router.delete("/admin/players/:id/ban", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [updated] = await db
    .update(playersTable)
    .set({ bannedUntil: null, banReason: null, bannedBy: null })
    .where(eq(playersTable.id, id))
    .returning({ id: playersTable.id, username: playersTable.username, bannedUntil: playersTable.bannedUntil });

  if (!updated) return res.status(404).json({ error: "Player not found" });
  return res.json(updated);
});

registerEntityRoutes("teams", teamsTable);

// ── Seasons CRUD ──────────────────────────────────────────────────────────────
router.get("/admin/seasons", requireAdmin, async (_req, res) => {
  const seasons = await db.select().from(seasonsTable).orderBy(desc(seasonsTable.createdAt));
  return res.json(seasons);
});

router.post("/admin/seasons", requireAdmin, async (req, res) => {
  const { name, isCurrent } = req.body as { name?: string; isCurrent?: boolean };
  if (!name?.trim()) return res.status(400).json({ error: "Season name is required" });
  try {
    if (isCurrent) {
      // Unset any existing current season
      await db.update(seasonsTable).set({ isCurrent: false });
    }
    const [season] = await db.insert(seasonsTable).values({
      name: name.trim(),
      isCurrent: isCurrent ?? false,
    }).returning();
    return res.status(201).json(season);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "A season with that name already exists" });
    req.log.error({ err }, "Failed to create season");
    return res.status(500).json({ error: "Failed to create season" });
  }
});

router.patch("/admin/seasons/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, isCurrent } = req.body as { name?: string; isCurrent?: boolean };
  try {
    if (isCurrent) {
      await db.update(seasonsTable).set({ isCurrent: false });
    }
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (isCurrent !== undefined) updates.isCurrent = isCurrent;
    const [season] = await db.update(seasonsTable).set(updates).where(eq(seasonsTable.id, id)).returning();
    if (!season) return res.status(404).json({ error: "Season not found" });
    return res.json(season);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "A season with that name already exists" });
    return res.status(500).json({ error: "Failed to update season" });
  }
});

router.delete("/admin/seasons/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(seasonsTable).where(eq(seasonsTable.id, id));
  return res.json({ ok: true });
});

// ── POST /admin/tournaments — custom create with team auto-enroll ─────────────
router.post("/admin/tournaments", requireAdmin, async (req, res) => {
  try {
    const {
      name, description, status, format, game, maxParticipants,
      prizePool, startDate, endDate, rules, streamUrl, logoUrl,
      hostedBy, tournamentType = "solo", seasonId,
    } = req.body as Record<string, string | number | undefined>;

    if (!name) return res.status(400).json({ error: "Name is required" });
    if (!startDate) return res.status(400).json({ error: "startDate is required" });

    // 1. Create the tournament
    const [tournament] = await db.insert(tournamentsTable).values({
      name: String(name),
      description: description ? String(description) : undefined,
      status: String(status ?? "upcoming"),
      // Team tournaments use round-robin (league) and are unlimited in size
      format: String(tournamentType) === "team" ? "round-robin" : String(format ?? "single-elimination"),
      game: String(game ?? "eFootball"),
      maxParticipants: String(tournamentType) === "team" ? 9999 : Number(maxParticipants ?? 16),
      prizePool: String(prizePool ?? "$0"),
      startDate: String(startDate),
      endDate: endDate ? String(endDate) : undefined,
      rules: rules ? String(rules) : undefined,
      streamUrl: streamUrl ? String(streamUrl) : undefined,
      logoUrl: logoUrl ? String(logoUrl) : undefined,
      hostedBy: hostedBy ? String(hostedBy) : undefined,
      tournamentType: String(tournamentType),
      seasonId: seasonId ? Number(seasonId) : undefined,
      createdBy: req.session.userId ?? undefined,
    }).returning();

    // 2. If team tournament, auto-enroll all registered teams
    if (String(tournamentType) === "team") {
      const teams = await db.select({ id: teamsTable.id, name: teamsTable.name }).from(teamsTable);
      if (teams.length > 0) {
        await db.insert(tournamentParticipantsTable).values(
          teams.map((t) => ({
            tournamentId: tournament.id,
            type: "team" as const,
            teamId: t.id,
            playerId: null,
          }))
        );
        await db.update(tournamentsTable)
          .set({ currentParticipants: teams.length })
          .where(eq(tournamentsTable.id, tournament.id));
        tournament.currentParticipants = teams.length;
      }
    }

    if (req.session.userId) {
      await db.insert(tournamentAdminsTable).values({
        tournamentId: tournament.id,
        playerId: req.session.userId,
        role: "owner",
      }).onConflictDoNothing();
    }

    return res.status(201).json({ ...tournament, createdAt: tournament.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to create tournament");
    return res.status(400).json({ error: "Failed to create tournament" });
  }
});

registerEntityRoutes("tournaments", tournamentsTable);
registerEntityRoutes("matches", matchesTable);
registerEntityRoutes("news", newsTable);
registerEntityRoutes("media", mediaTable);
registerEntityRoutes("hall-of-fame", hallOfFameTable);

// ─── Match generation helpers ─────────────────────────────────────────────────

interface Participant { id: number; playerId: number; name: string }

function nextPow2(n: number) {
  let p = 1; while (p < n) p <<= 1; return p;
}

function eliminationRoundName(remaining: number): string {
  if (remaining === 2) return "Final";
  if (remaining === 4) return "Semi Finals";
  if (remaining === 8) return "Quarter Finals";
  return `Round of ${remaining}`;
}

function generateSingleElim(participants: Participant[], tournamentId: number) {
  const seeded = [...participants];
  const bracket = nextPow2(seeded.length);
  // pad with BYEs
  while (seeded.length < bracket) seeded.push({ id: 0, playerId: 0, name: "BYE" });

  const matches: Array<typeof matchesTable.$inferInsert> = [];
  let round = 1;
  let slots = seeded.length;

  // Round 1 — seed pairings: 1v16, 2v15, …
  for (let i = 0; i < slots / 2; i++) {
    const p1 = seeded[i];
    const p2 = seeded[slots - 1 - i];
    matches.push({
      tournamentId,
      round,
      roundName: eliminationRoundName(slots),
      status: "scheduled",
      participant1Id: p1.playerId || null,
      participant1Name: p1.name === "BYE" ? "BYE" : p1.name,
      participant2Id: p2.playerId || null,
      participant2Name: p2.name === "BYE" ? "BYE" : p2.name,
    });
  }

  // Subsequent rounds — TBD placeholders
  slots /= 2; round++;
  while (slots >= 1) {
    for (let i = 0; i < Math.max(1, slots / 2); i++) {
      matches.push({ tournamentId, round, roundName: eliminationRoundName(slots), status: "scheduled" });
    }
    if (slots === 1) break;
    slots /= 2; round++;
  }
  return matches;
}

function generateDoubleElim(participants: Participant[], tournamentId: number) {
  const winnerMatches = generateSingleElim(participants, tournamentId);
  const maxRound = Math.max(...winnerMatches.map((m) => m.round as number));
  // Loser bracket: one loser match per winner round (simplified)
  const loserMatches: Array<typeof matchesTable.$inferInsert> = [];
  const loserRounds = maxRound - 1;
  for (let r = 1; r <= loserRounds; r++) {
    loserMatches.push({
      tournamentId,
      round: maxRound + r,
      roundName: `Loser Bracket R${r}`,
      status: "scheduled",
    });
  }
  // Grand Final
  loserMatches.push({ tournamentId, round: maxRound + loserRounds + 1, roundName: "Grand Final", status: "scheduled" });
  return [...winnerMatches, ...loserMatches];
}

function generateRoundRobin(participants: Participant[], tournamentId: number) {
  const n = participants.length;
  const list = n % 2 === 0 ? [...participants] : [...participants, { id: 0, playerId: 0, name: "BYE" }];
  const total = list.length;
  const matches: Array<typeof matchesTable.$inferInsert> = [];

  for (let round = 0; round < total - 1; round++) {
    for (let i = 0; i < total / 2; i++) {
      const p1 = list[i];
      const p2 = list[total - 1 - i];
      if (p1.name === "BYE" || p2.name === "BYE") continue;
      matches.push({
        tournamentId,
        round: round + 1,
        roundName: `Round ${round + 1}`,
        status: "scheduled",
        participant1Id: p1.playerId || null,
        participant1Name: p1.name,
        participant2Id: p2.playerId || null,
        participant2Name: p2.name,
      });
    }
    // rotate (fix first element, rotate rest)
    list.splice(1, 0, list.pop()!);
  }
  return matches;
}

function generateGroupStage(participants: Participant[], tournamentId: number, groupCount: number) {
  const groups: Participant[][] = Array.from({ length: groupCount }, () => []);
  participants.forEach((p, i) => groups[i % groupCount].push(p));

  const matches: Array<typeof matchesTable.$inferInsert> = [];
  let globalRound = 1;

  groups.forEach((group, gi) => {
    const letter = String.fromCharCode(65 + gi); // A, B, C…
    const n = group.length;
    const list = n % 2 === 0 ? [...group] : [...group, { id: 0, playerId: 0, name: "BYE" }];
    const total = list.length;

    for (let round = 0; round < total - 1; round++) {
      for (let i = 0; i < total / 2; i++) {
        const p1 = list[i];
        const p2 = list[total - 1 - i];
        if (p1.name === "BYE" || p2.name === "BYE") continue;
        matches.push({
          tournamentId,
          round: globalRound + round,
          roundName: `Group ${letter}`,
          status: "scheduled",
          participant1Id: p1.playerId || null,
          participant1Name: p1.name,
          participant2Id: p2.playerId || null,
          participant2Name: p2.name,
        });
      }
      list.splice(1, 0, list.pop()!);
    }
    globalRound += Math.max(1, list.length - 1);
  });
  return matches;
}

// POST /admin/tournaments/:id/generate-matches
router.post("/admin/tournaments/:id/generate-matches", requireAdmin, async (req, res) => {
  const tournamentId = Number(req.params.id);
  const { clearExisting = true, groupCount = 4, formatOverride } = req.body as { clearExisting?: boolean; groupCount?: number; formatOverride?: string };

  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
  if (!tournament) return res.status(404).json({ error: "Tournament not found" });

  // Fetch registered participants with names
  const isTeamTournament = tournament.tournamentType === "team";

  const raw = await db
    .select({
      participantId: tournamentParticipantsTable.id,
      playerId: tournamentParticipantsTable.playerId,
      teamId: tournamentParticipantsTable.teamId,
      playerName: playersTable.username,
      playerDisplay: playersTable.displayName,
      teamName: teamsTable.name,
    })
    .from(tournamentParticipantsTable)
    .leftJoin(playersTable, eq(tournamentParticipantsTable.playerId, playersTable.id))
    .leftJoin(teamsTable, eq(tournamentParticipantsTable.teamId, teamsTable.id))
    .where(eq(tournamentParticipantsTable.tournamentId, tournamentId));

  const participants: Participant[] = raw.map((r) => ({
    id: r.participantId,
    // For team tournaments use teamId as the entity ID; fall back to playerId
    playerId: isTeamTournament ? (r.teamId ?? 0) : (r.playerId ?? 0),
    name: isTeamTournament
      ? (r.teamName ?? `Team ${r.teamId}`)
      : (r.playerDisplay ?? r.playerName ?? `Participant ${r.participantId}`),
  }));

  if (participants.length < 2) {
    return res.status(400).json({ error: "Need at least 2 registered participants to generate matches" });
  }

  if (clearExisting) {
    await db.delete(matchesTable).where(eq(matchesTable.tournamentId, tournamentId));
  }

  let toInsert: Array<typeof matchesTable.$inferInsert>;
  // Team tournaments always use round-robin (Premier League style)
  const fmt = isTeamTournament ? "round-robin" : (formatOverride ?? tournament.format);

  if (fmt === "single-elimination") {
    toInsert = generateSingleElim(participants, tournamentId);
  } else if (fmt === "double-elimination") {
    toInsert = generateDoubleElim(participants, tournamentId);
  } else if (fmt === "round-robin") {
    toInsert = generateRoundRobin(participants, tournamentId);
  } else { // group-stage (default fallback)
    const safeGroupCount = Math.max(2, Math.min(groupCount, Math.floor(participants.length / 2)));
    toInsert = generateGroupStage(participants, tournamentId, safeGroupCount);
  }

  const inserted = await db.insert(matchesTable).values(toInsert).returning();
  return res.json({ generated: inserted.length, format: fmt, matches: inserted });
});

// Participants list for a tournament — used by the group-stage / league preview
router.get("/admin/tournaments/:id/participants", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select({
      id: tournamentParticipantsTable.id,
      playerId: tournamentParticipantsTable.playerId,
      teamId: tournamentParticipantsTable.teamId,
      seed: tournamentParticipantsTable.seed,
      username: playersTable.username,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      teamName: teamsTable.name,
      teamLogoUrl: teamsTable.logoUrl,
    })
    .from(tournamentParticipantsTable)
    .leftJoin(playersTable, eq(tournamentParticipantsTable.playerId, playersTable.id))
    .leftJoin(teamsTable, eq(tournamentParticipantsTable.teamId, teamsTable.id))
    .where(eq(tournamentParticipantsTable.tournamentId, id))
    .orderBy(tournamentParticipantsTable.id);
  res.json(rows);
});

// Matches filtered by tournament — used by the admin match editor
router.get("/admin/tournaments/:id/matches", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.tournamentId, id))
    .orderBy(matchesTable.round, matchesTable.id);
  res.json(rows);
});

// ─── Player Games (individual matchups inside a team match) ───────────────────

// Helper: recalculate team match score from child player games
async function recalculateTeamScore(matchId: number) {
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
  if (!match) return;

  const games = await db
    .select()
    .from(matchPlayerGamesTable)
    .where(eq(matchPlayerGamesTable.matchId, matchId));

  if (games.length === 0) return;

  let homeWins = 0;
  let awayWins = 0;
  let allDone = true;

  for (const g of games) {
    if (g.homeScore === null || g.awayScore === null) { allDone = false; continue; }
    if (g.homeScore > g.awayScore) homeWins++;
    else if (g.awayScore > g.homeScore) awayWins++;
  }

  let winnerId: number | null = null;
  let winnerName: string | null = null;
  let newStatus = match.status;

  if (allDone) {
    newStatus = "completed";
    if (homeWins > awayWins) {
      winnerId = match.participant1Id;
      winnerName = match.participant1Name;
    } else if (awayWins > homeWins) {
      winnerId = match.participant2Id;
      winnerName = match.participant2Name;
    }
  } else if (games.some((g) => g.homeScore !== null || g.awayScore !== null)) {
    newStatus = "live";
  }

  await db
    .update(matchesTable)
    .set({ participant1Score: homeWins, participant2Score: awayWins, winnerId, winnerName, status: newStatus })
    .where(eq(matchesTable.id, matchId));
}

// GET player games for a match
router.get("/admin/matches/:id/player-games", requireAdmin, async (req, res) => {
  const matchId = Number(req.params.id);
  if (isNaN(matchId)) return res.status(400).json({ error: "Invalid id" });
  const games = await db
    .select()
    .from(matchPlayerGamesTable)
    .where(eq(matchPlayerGamesTable.matchId, matchId))
    .orderBy(matchPlayerGamesTable.id);
  return res.json(games);
});

// POST generate player pairings from team rosters
router.post("/admin/matches/:id/player-games/generate", requireAdmin, async (req, res) => {
  const matchId = Number(req.params.id);
  if (isNaN(matchId)) return res.status(400).json({ error: "Invalid id" });

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
  if (!match) return res.status(404).json({ error: "Match not found" });

  const homeTeamId = match.participant1Id;
  const awayTeamId = match.participant2Id;
  if (!homeTeamId || !awayTeamId) return res.status(400).json({ error: "Match has no team participants" });

  const [homePlayers, awayPlayers] = await Promise.all([
    db.select({ id: playersTable.id, displayName: playersTable.displayName, username: playersTable.username })
      .from(playersTable).where(eq(playersTable.teamId, homeTeamId)),
    db.select({ id: playersTable.id, displayName: playersTable.displayName, username: playersTable.username })
      .from(playersTable).where(eq(playersTable.teamId, awayTeamId)),
  ]);

  if (homePlayers.length === 0 || awayPlayers.length === 0) {
    return res.status(400).json({ error: "One or both teams have no registered players" });
  }

  await db.delete(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.matchId, matchId));

  const count = Math.min(homePlayers.length, awayPlayers.length);
  const toInsert = Array.from({ length: count }, (_, i) => ({
    matchId,
    homePlayerId: homePlayers[i].id,
    homePlayerName: homePlayers[i].displayName ?? homePlayers[i].username ?? `Player ${homePlayers[i].id}`,
    awayPlayerId: awayPlayers[i].id,
    awayPlayerName: awayPlayers[i].displayName ?? awayPlayers[i].username ?? `Player ${awayPlayers[i].id}`,
  }));

  const inserted = await db.insert(matchPlayerGamesTable).values(toInsert).returning();
  return res.json(inserted);
});

// POST add a single player pairing manually
router.post("/admin/matches/:id/player-games", requireAdmin, async (req, res) => {
  const matchId = Number(req.params.id);
  if (isNaN(matchId)) return res.status(400).json({ error: "Invalid id" });
  const { homePlayerName, awayPlayerName, homePlayerId, awayPlayerId } = req.body as Record<string, unknown>;
  const [inserted] = await db
    .insert(matchPlayerGamesTable)
    .values({ matchId, homePlayerName: String(homePlayerName ?? ""), awayPlayerName: String(awayPlayerName ?? ""), homePlayerId: homePlayerId ? Number(homePlayerId) : null, awayPlayerId: awayPlayerId ? Number(awayPlayerId) : null })
    .returning();
  return res.json(inserted);
});

// PATCH update a player game result
router.patch("/admin/player-games/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { homeScore, awayScore, homePlayerName, awayPlayerName, status } = req.body as Record<string, unknown>;

  const updateData: Record<string, unknown> = {};
  if (homeScore !== undefined) updateData.homeScore = homeScore === "" || homeScore === null ? null : Number(homeScore);
  if (awayScore !== undefined) updateData.awayScore = awayScore === "" || awayScore === null ? null : Number(awayScore);
  if (homePlayerName !== undefined) updateData.homePlayerName = String(homePlayerName);
  if (awayPlayerName !== undefined) updateData.awayPlayerName = String(awayPlayerName);
  if (status !== undefined) updateData.status = String(status);

  const [updated] = await db
    .update(matchPlayerGamesTable)
    .set(updateData)
    .where(eq(matchPlayerGamesTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Player game not found" });
  await recalculateTeamScore(updated.matchId);
  return res.json(updated);
});

// DELETE a player game
router.delete("/admin/player-games/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [deleted] = await db.delete(matchPlayerGamesTable).where(eq(matchPlayerGamesTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Not found" });
  await recalculateTeamScore(deleted.matchId);
  return res.json({ ok: true });
});

router.get("/admin/stats", async (_req, res) => {
  const [players, teams, tournaments, matches, news, media] = await Promise.all([
    db.$count(playersTable),
    db.$count(teamsTable),
    db.$count(tournamentsTable),
    db.$count(matchesTable),
    db.$count(newsTable),
    db.$count(mediaTable),
  ]);
  res.json({ players, teams, tournaments, matches, news, media });
});

export default router;
