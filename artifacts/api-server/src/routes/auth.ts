import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import { playersTable, discordTokensTable, type Player } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const DISCORD_CLIENT_ID = process.env["DISCORD_CLIENT_ID"]!;
const DISCORD_CLIENT_SECRET = process.env["DISCORD_CLIENT_SECRET"]!;

// Permanent owner Discord ID — this account always gets the "owner" role
// regardless of database state. Hardcoded so it survives fresh databases
// and any hosting environment.
const OWNER_DISCORD_ID = "1285615841773092941";

// The API prefix this router is mounted under (see app.ts). Configurable so
// the same code works whether the API is served under /api (this project's
// path-based routing on Replit) or at the domain root on other hosts.
const API_PREFIX = (process.env["API_BASE_PATH"] ?? "/api").replace(/\/$/, "");

// Minimum time between silent Discord re-syncs for the same player. Keeps
// every `/auth/me` call (fired on page load / tab focus) fresh without
// hammering Discord's API on rapid repeated requests.
const SYNC_THROTTLE_MS = 60_000;

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  global_name: string | null;
  email: string | null;
}

interface DiscordTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * Resolve the public base URL (protocol + host, no trailing slash) used to
 * build the OAuth redirect URI. Works across hosting providers:
 * - Explicit `BASE_URL` env var (recommended for Vercel/Railway/Render/VPS).
 * - Replit's `REPLIT_DOMAINS` (used automatically in the Replit dev/prod env).
 * - Falls back to the incoming request's protocol + host as a last resort.
 */
function getBaseUrl(req: import("express").Request): string {
  const explicit = process.env["BASE_URL"];
  if (explicit) return explicit.replace(/\/$/, "");

  const replitDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
  if (replitDomain) return `https://${replitDomain}`;

  return `${req.protocol}://${req.get("host")}`;
}

function getRedirectUri(req: import("express").Request) {
  return `${getBaseUrl(req)}${API_PREFIX}/auth/discord/callback`;
}

/**
 * Pick the `players.username` value that should represent this Discord
 * account right now. Prefers Discord's current handle verbatim (sanitized to
 * this column's allowed charset) so a Discord username change is mirrored
 * here too. Only falls back to a discordId-suffixed variant when the plain
 * handle already belongs to a *different* player.
 */
async function resolveUsername(rawDiscordUsername: string, discordId: string, excludePlayerId?: number): Promise<string> {
  const safe = rawDiscordUsername.replace(/[^a-zA-Z0-9_]/g, "_") || "player";

  const [existing] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(eq(playersTable.username, safe));

  if (!existing || existing.id === excludePlayerId) return safe;

  // Someone else already has this exact handle — disambiguate with a
  // stable suffix derived from the Discord id so it's deterministic across
  // logins for the same account.
  return `${safe}_${discordId.slice(-4)}`;
}

/**
 * Create or update the player row tied to this Discord account so it
 * matches the given Discord profile, and persist/refresh the OAuth tokens
 * used to silently re-sync it later (see `syncPlayerFromDiscord`). The
 * player's `discordId` is the permanent link — it is set once at creation
 * and never changed, so the same account is reused forever regardless of
 * username/display name/avatar changes on Discord.
 */
async function upsertPlayerFromDiscord(discordUser: DiscordUser, tokens: DiscordTokenResponse): Promise<Player> {
  const displayName = discordUser.global_name ?? discordUser.username;
  const avatarUrl = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
    : null;
  const email = discordUser.email ?? null;

  let [player] = await db.select().from(playersTable).where(eq(playersTable.discordId, discordUser.id));

  const desiredUsername = await resolveUsername(discordUser.username, discordUser.id, player?.id);

  const isOwner = discordUser.id === OWNER_DISCORD_ID;

  if (!player) {
    const count = await db.$count(playersTable);
    const [newPlayer] = await db
      .insert(playersTable)
      .values({
        username: desiredUsername,
        displayName,
        discordId: discordUser.id,
        avatarUrl,
        email,
        rank: count + 1,
        ...(isOwner ? { role: "owner" } : {}),
      })
      .returning();
    player = newPlayer!;
  } else {
    const needsProfileUpdate =
      avatarUrl !== player.avatarUrl ||
      displayName !== player.displayName ||
      email !== player.email ||
      desiredUsername !== player.username;
    // Always re-enforce owner role in DB for the hardcoded owner Discord ID,
    // even if it was accidentally changed. Other players' roles are never
    // touched here — they are managed through the admin panel only.
    const needsRoleUpdate = isOwner && player.role !== "owner";

    if (needsProfileUpdate || needsRoleUpdate) {
      const [updated] = await db
        .update(playersTable)
        .set({
          ...(needsProfileUpdate ? { avatarUrl, displayName, email, username: desiredUsername } : {}),
          ...(needsRoleUpdate ? { role: "owner" } : {}),
        })
        .where(eq(playersTable.id, player.id))
        .returning();
      player = updated!;
    }
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await db
    .insert(discordTokensTable)
    .values({
      playerId: player.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: discordTokensTable.playerId,
      set: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        lastSyncedAt: new Date(),
      },
    });

  return player;
}

/**
 * Re-fetch this player's live Discord profile using their stored OAuth
 * tokens (refreshing the access token first if it has expired) and update
 * the `players` row if anything changed. Used so the site stays current
 * even when the user never explicitly logs in again — just opening the
 * site while an existing session is active triggers this (throttled).
 *
 * Never fails the caller: on any error (revoked access, network issue,
 * missing tokens) it logs and returns the player's last known DB state, so
 * a Discord hiccup never forces a re-registration or logs the user out.
 */
async function syncPlayerFromDiscord(player: Player, log: { warn: (obj: unknown, msg?: string) => void }): Promise<Player> {
  try {
    const [tokens] = await db.select().from(discordTokensTable).where(eq(discordTokensTable.playerId, player.id));
    if (!tokens) return player; // Never linked via OAuth (e.g. admin-seeded row) — nothing to sync.

    if (Date.now() - tokens.lastSyncedAt.getTime() < SYNC_THROTTLE_MS) {
      return player;
    }

    let accessToken = tokens.accessToken;

    if (Date.now() >= tokens.expiresAt.getTime() - 30_000) {
      const refreshRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: tokens.refreshToken,
        }),
      });

      if (!refreshRes.ok) {
        log.warn({ playerId: player.id, status: refreshRes.status }, "Discord token refresh failed");
        return player;
      }

      const refreshed = (await refreshRes.json()) as DiscordTokenResponse;
      accessToken = refreshed.access_token;
      await db
        .update(discordTokensTable)
        .set({
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        })
        .where(eq(discordTokensTable.playerId, player.id));
    }

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      log.warn({ playerId: player.id, status: userRes.status }, "Discord profile refresh fetch failed");
      // Still bump lastSyncedAt so a persistently failing account doesn't
      // retry on every single page load.
      await db.update(discordTokensTable).set({ lastSyncedAt: new Date() }).where(eq(discordTokensTable.playerId, player.id));
      return player;
    }

    const discordUser = (await userRes.json()) as DiscordUser;

    const displayName = discordUser.global_name ?? discordUser.username;
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;
    const email = discordUser.email ?? null;
    const desiredUsername = await resolveUsername(discordUser.username, discordUser.id, player.id);

    let updatedPlayer = player;
    if (
      avatarUrl !== player.avatarUrl ||
      displayName !== player.displayName ||
      email !== player.email ||
      desiredUsername !== player.username
    ) {
      const [updated] = await db
        .update(playersTable)
        .set({ avatarUrl, displayName, email, username: desiredUsername })
        .where(eq(playersTable.id, player.id))
        .returning();
      updatedPlayer = updated!;
    }

    await db.update(discordTokensTable).set({ lastSyncedAt: new Date() }).where(eq(discordTokensTable.playerId, player.id));

    return updatedPlayer;
  } catch (err) {
    log.warn({ err, playerId: player.id }, "Discord profile sync error");
    return player;
  }
}

router.get("/auth/discord", (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    req.log.error("Discord OAuth is not configured (missing DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET)");
    return res.redirect("/login?error=oauth_not_configured");
  }

  // CSRF protection: generate a random per-login nonce, bind it to the
  // user's session, and require Discord to echo it back unchanged on the
  // callback. Prevents login CSRF / session-swap attacks.
  const state = randomBytes(32).toString("hex");
  req.session.oauthState = state;

  req.session.save((err) => {
    if (err) {
      req.log.error({ err }, "Failed to persist OAuth state");
      return res.redirect("/login?error=session_failed");
    }

    const redirectUri = getRedirectUri(req);
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify email",
      state,
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });
});

router.get("/auth/discord/callback", async (req, res) => {
  const code = req.query["code"] as string | undefined;
  const oauthError = req.query["error"] as string | undefined;
  const returnedState = req.query["state"] as string | undefined;
  const expectedState = req.session.oauthState;

  // Always clear the one-time state, whether or not this attempt succeeds.
  delete req.session.oauthState;

  if (oauthError) {
    req.log.warn({ oauthError }, "Discord OAuth denied by user");
    return res.redirect("/login?error=access_denied");
  }

  if (!expectedState || !returnedState || returnedState !== expectedState) {
    req.log.warn("Discord OAuth state mismatch — possible CSRF attempt");
    return res.redirect("/login?error=invalid_state");
  }

  if (!code) return res.redirect("/login?error=no_code");

  const redirectUri = getRedirectUri(req);

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      req.log.error({ status: tokenRes.status }, "Discord token exchange failed");
      return res.redirect("/login?error=token_failed");
    }

    const tokens = (await tokenRes.json()) as DiscordTokenResponse;

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      req.log.error({ status: userRes.status }, "Discord user fetch failed");
      return res.redirect("/login?error=user_failed");
    }

    const discordUser = (await userRes.json()) as DiscordUser;

    // Looks up the existing player by discordId (permanent link) if one
    // exists, or creates a new one — then stores/refreshes the OAuth
    // tokens used for silent background re-sync.
    const player = await upsertPlayerFromDiscord(discordUser, tokens);

    // Regenerate the session on login to prevent session fixation, then
    // store the authenticated user's identity.
    req.session.regenerate((err) => {
      if (err) {
        req.log.error({ err }, "Session regenerate error");
        return res.redirect("/login?error=session_failed");
      }

      req.session.userId = player.id;
      req.session.discordId = discordUser.id;
      req.session.username = player.username;
      req.session.displayName = player.displayName;
      req.session.avatarUrl = player.avatarUrl;
      req.session.role = player.role;
      // Admin/owner players automatically get admin-session access so they
      // can use all admin routes without a separate password login.
      if (player.role === "admin" || player.role === "owner") {
        req.session.isAdmin = true;
      }

      req.session.save((saveErr) => {
        if (saveErr) {
          req.log.error({ err: saveErr }, "Session save error");
          return res.redirect("/login?error=session_failed");
        }
        return res.redirect(player.profileComplete ? "/dashboard" : "/onboarding");
      });
    });
  } catch (err) {
    req.log.error({ err }, "Discord auth error");
    return res.redirect("/login?error=auth_failed");
  }
});

router.get("/auth/me", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, req.session.userId));
  if (!player) {
    // Player was deleted server-side; drop the stale session.
    req.session.destroy(() => undefined);
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Opportunistically re-sync from Discord (throttled) every time the site
  // checks who's logged in — i.e. on every page load / tab focus — so a
  // Discord username/display name/avatar change shows up without the user
  // ever needing to log in again.
  const freshPlayer = await syncPlayerFromDiscord(player, req.log);

  req.session.username = freshPlayer.username;
  req.session.displayName = freshPlayer.displayName;
  req.session.avatarUrl = freshPlayer.avatarUrl;
  req.session.role = freshPlayer.role;
  if (freshPlayer.role === "admin" || freshPlayer.role === "owner") {
    req.session.isAdmin = true;
  }

  return res.json({
    id: freshPlayer.id,
    username: freshPlayer.username,
    displayName: freshPlayer.displayName,
    avatarUrl: freshPlayer.avatarUrl,
    discordId: freshPlayer.discordId,
    role: freshPlayer.role,
    profileComplete: freshPlayer.profileComplete,
  });
});

// ── Onboarding ────────────────────────────────────────────────────────────────
// Called once after first Discord login to collect device, Konami ID, etc.
router.post("/auth/onboarding", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { gamingDevice, deviceName, konamiId, bloodGroup, country } = req.body as {
    gamingDevice?: string;
    deviceName?: string;
    konamiId?: string;
    bloodGroup?: string;
    country?: string;
  };

  if (!gamingDevice || !["mobile", "pc"].includes(gamingDevice)) {
    return res.status(400).json({ error: "gamingDevice must be 'mobile' or 'pc'" });
  }

  await db
    .update(playersTable)
    .set({
      gamingDevice,
      deviceName: deviceName ?? null,
      konamiId: konamiId ?? null,
      bloodGroup: bloodGroup ?? null,
      country: country ?? null,
      profileComplete: true,
    })
    .where(eq(playersTable.id, req.session.userId));

  return res.json({ ok: true });
});

function doLogout(req: import("express").Request, res: import("express").Response, redirectTo?: string) {
  req.session.destroy((err) => {
    if (err) req.log.error({ err }, "Session destroy error");
    res.clearCookie("wg.sid");
    if (redirectTo) return res.redirect(redirectTo);
    return res.json({ ok: true });
  });
}

// JSON-friendly logout for the SPA (fetch with credentials).
router.post("/auth/logout", (req, res) => doLogout(req, res));

// Plain-link logout (e.g. <a href="/logout">) that redirects back to /login.
router.get("/logout", (req, res) => doLogout(req, res, "/login"));

export default router;
