import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { matchesTable, tournamentsTable, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// In-memory live screen-share broadcasting.
//
// When a player with the `sharescreen` role presses "Go Live" on a fixture they
// are asked (by the browser) to share their screen. That stream is then made
// available to every other user listed in the "Live" section, which streams it
// back via WebRTC (peer-to-peer). The API server is only used as a lightweight
// signaling relay — it never touches the audio/video data itself, so it requires
// no transcoding sockets or extra dependencies.
//
// Signaling protocol
//   * The broadcaster publishes media straight to each viewer over WebRTC.
//   * The server keeps a small inbox per broadcaster and per viewer and
//     delivers SDP offers/answers + ICE candidates between them using short
//     polling (GET .../inbox?since=<seq>).
//   * Broadcaster messages:   offer / answer / candidate / ended
//   * Server→broadcaster:     viewer-joined / viewer-left
//   * Broadcasts expire after BROADCAST_TTL if the publisher stops heartbeating
//     (for example the page was closed without pressing "Close Live").
// ─────────────────────────────────────────────────────────────────────────────

interface SignalMessage {
  seq: number;
  from: "pub" | "server" | string; // who originated it
  type: string;
  data?: unknown;
}

interface Broadcast {
  id: string;
  matchId: number;
  broadcasterId: number;
  broadcasterName: string;
  originalStatus: string;
  startedAt: number;
  lastSeen: number;
  seq: number;
  pubInbox: SignalMessage[];
  /** viewerId → inbox + lastSeen (viewers idle for VIEWER_TTL_MS are dropped). */
  viewerInbox: Map<string, { inbox: SignalMessage[]; lastSeen: number }>;
  info: {
    participant1Name: string | null;
    participant2Name: string | null;
    tournamentName: string | null;
    roundName: string | null;
  };
}

const broadcasts = new Map<string, Broadcast>();
const BROADCAST_TTL_MS = 20_000; // no heartbeat for this long → treat as ended

/** Express 5 types route params as `string | string[]` — normalize to a string. */
function paramId(req: Request): string {
  const raw = req.params.id;
  return (Array.isArray(raw) ? raw[0] : raw) ?? "";
}

/** Roles that are allowed to go live. */
function canShareScreen(role: string | undefined): boolean {
  return role === "sharescreen" || role === "admin" || role === "owner";
}

function push(entry: Broadcast, inbox: SignalMessage[], type: string, from: string, data?: unknown) {
  const seq = ++entry.seq;
  inbox.push({ seq, from, type, data });
  return seq;
}

/** Public shape of a live broadcast (what the Live page renders). */
export function serializeBroadcast(b: Broadcast) {
  return {
    id: b.id,
    matchId: b.matchId,
    broadcasterName: b.broadcasterName,
    startedAt: b.startedAt,
    viewers: b.viewerInbox.size,
    ...b.info,
  };
}

/** Viewers that stop polling (closed the page, lost signal) are dropped. */
const VIEWER_TTL_MS = 30_000;

function cleanupExpired() {
  const now = Date.now();
  for (const [id, b] of broadcasts) {
    if (now - b.lastSeen > BROADCAST_TTL_MS) {
      // Expired broadcasts must restore the match status too — deleting the
      // entry alone left matches stuck as "live" in the database forever,
      // which kept showing "Watch Live Now" on fixtures after the stream ended.
      endBroadcast(b);
      continue;
    }
    // Drop viewer sessions that stopped polling so the viewer count and the
    // broadcaster's peer connections don't linger forever.
    for (const [viewerId, v] of b.viewerInbox) {
      if (now - v.lastSeen > VIEWER_TTL_MS) {
        b.viewerInbox.delete(viewerId);
        push(b, b.pubInbox, "viewer-left", "server", { viewerId });
      }
    }
  }
}

function endBroadcast(b: Broadcast) {
  broadcasts.delete(b.id);
  // Restore the match status if we were the ones that marked it live.
  if (b.originalStatus !== "live") {
    db.update(matchesTable).set({ status: b.originalStatus }).where(eq(matchesTable.id, b.matchId)).catch(() => undefined);
  }
  // Notify every connected viewer that the stream ended.
  for (const entry of b.viewerInbox.values()) {
    push(b, entry.inbox, "ended", "server", { reason: "broadcaster-ended" });
  }
  // Stop the publisher's poll loop by posting an ended control to its inbox.
  push(b, b.pubInbox, "ended", "server", { reason: "broadcaster" });
}

// Sweep expired broadcasts whenever a broadcast-related request comes in.
router.use((_req, _res, next) => {
  try {
    cleanupExpired();
  } catch {
    /* ignore */
  }
  next();
});

// ── Start / stop ─────────────────────────────────────────────────────────────

// Start a live screen-share broadcast for a fixture.
router.post("/live/broadcast/start", async (req: Request, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Please log in first" });
  if (!canShareScreen(req.session?.role)) {
    return res.status(403).json({ error: "Your account is not allowed to go live. An admin must grant you the screen-share role." });
  }

  const matchId = Number((req.body as { matchId?: unknown } | undefined)?.matchId);
  if (!Number.isInteger(matchId)) return res.status(400).json({ error: "A valid matchId is required" });

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.status === "completed" || match.status === "cancelled") {
    return res.status(400).json({ error: "A finished match cannot be broadcast" });
  }

  // Only one live broadcast per match at a time.
  for (const b of broadcasts.values()) {
    if (b.matchId === matchId) {
      return res.status(409).json({ error: "Another broadcast is already live for this match" });
    }
  }

  const [player] = await db
    .select({ username: playersTable.username, displayName: playersTable.displayName })
    .from(playersTable)
    .where(eq(playersTable.id, userId));
  const broadcasterName = player?.displayName ?? player?.username ?? "A player";

  const [tournament] = match.tournamentId
    ? await db.select({ name: tournamentsTable.name }).from(tournamentsTable).where(eq(tournamentsTable.id, match.tournamentId))
    : [];

  const id = randomUUID();
  const broadcast: Broadcast = {
    id,
    matchId,
    broadcasterId: userId,
    broadcasterName,
    originalStatus: match.status,
    startedAt: Date.now(),
    lastSeen: Date.now(),
    seq: 0,
    pubInbox: [],
    viewerInbox: new Map(),
    info: {
      participant1Name: match.participant1Name,
      participant2Name: match.participant2Name,
      tournamentName: tournament?.name ?? null,
      roundName: match.roundName,
    },
  };
  broadcasts.set(id, broadcast);

  // Mark the match as live so it shows up in the Fixtures "Live" filter while
  // the broadcast is running.
  if (match.status !== "live") {
    await db.update(matchesTable).set({ status: "live" }).where(eq(matchesTable.id, matchId)).catch(() => undefined);
  }

  return res.json(serializeBroadcast(broadcast));
});

// Stop a broadcast (only its publisher).
router.post("/live/broadcast/stop", async (req: Request, res: Response) => {
  const id = String((req.body as { id?: unknown } | undefined)?.id ?? "");
  const b = broadcasts.get(id);
  if (!b) return res.status(404).json({ error: "Broadcast not found or already ended" });
  if (b.broadcasterId !== req.session?.userId) {
    return res.status(403).json({ error: "Only the broadcaster can stop this stream" });
  }
  endBroadcast(b);
  return res.json({ ok: true });
});

// Broadcaster keeps the broadcast alive (called every few seconds).
router.post("/live/broadcast/:id/heartbeat", async (req: Request, res: Response) => {
  const b = broadcasts.get(paramId(req));
  if (!b) return res.status(404).json({ error: "Broadcast not found" });
  if (b.broadcasterId !== req.session?.userId) {
    return res.status(403).json({ error: "Only the broadcaster can heartbeat" });
  }
  b.lastSeen = Date.now();
  return res.json({ ok: true });
});


// ── Signaling relay ──────────────────────────────────────────────────────────

// Register a viewer so the server can route messages to them. The broadcaster
// is notified so it opens a peer connection for this viewer.
router.post("/live/broadcast/:id/watch/start", async (req: Request, res: Response) => {
  const b = broadcasts.get(paramId(req));
  if (!b) return res.status(404).json({ error: "Broadcast not found" });
  const viewerId = String((req.body as { viewerId?: unknown } | undefined)?.viewerId ?? "");
  if (!viewerId) return res.status(400).json({ error: "A viewerId is required" });

  if (!b.viewerInbox.has(viewerId)) {
    b.viewerInbox.set(viewerId, { inbox: [], lastSeen: Date.now() });
    push(b, b.pubInbox, "viewer-joined", "server", { viewerId });
  } else {
    b.viewerInbox.get(viewerId)!.lastSeen = Date.now();
  }
  return res.json({ ok: true });
});

router.post("/live/broadcast/:id/watch/stop", async (req: Request, res: Response) => {
  const b = broadcasts.get(paramId(req));
  if (b) {
    const viewerId = String((req.body as { viewerId?: unknown } | undefined)?.viewerId ?? "");
    if (viewerId && b.viewerInbox.delete(viewerId)) {
      push(b, b.pubInbox, "viewer-left", "server", { viewerId });
    }
  }
  return res.json({ ok: true });
});

// Route a signaling message to a viewer's inbox (`to` begins with "viewer:")
// or to the broadcaster's inbox (`to` === "pub").
router.post("/live/broadcast/:id/signal", async (req: Request, res: Response) => {
  const b = broadcasts.get(paramId(req));
  if (!b) return res.status(404).json({ error: "Broadcast not found" });

  const { to } = req.body as { to?: string };
  const message = (req.body as { message?: { from?: string; type?: string; data?: unknown } })?.message ?? {};
  const from = message.from ?? "viewer";
  const type = message.type;
  const data = message.data;

  if (to === "pub") {
    // Messages routed to the broadcaster's inbox are viewer answers and ICE
    // candidates. Accept them from any viewer registered on this broadcast
    // (see watch/start). Requiring the broadcaster's own session here would
    // reject exactly the messages the broadcaster is waiting for.
    if (!b.viewerInbox.has(from)) {
      return res.status(403).json({ error: "Only viewers of this broadcast can signal the broadcaster" });
    }
    if (!type) return res.status(400).json({ error: "Missing message.type" });
    push(b, b.pubInbox, type, from, data);
    return res.json({ ok: true });
  }

  if (typeof to === "string" && to.startsWith("viewer:")) {
    const viewerId = to.slice("viewer:".length);
    const entry = b.viewerInbox.get(viewerId);
    if (!entry) {
      // Viewer already left — silently drop the signal.
      return res.json({ ok: true });
    }
    if (!type) return res.status(400).json({ error: "Missing message.type" });
    push(b, entry.inbox, type, from, data);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: "`to` must be `pub` or `viewer:<id>`" });
});

// Broadcaster polls its inbox for viewer-joined / answer / candidate messages.
router.get("/live/broadcast/:id/pub-inbox", async (req: Request, res: Response) => {
  const b = broadcasts.get(paramId(req));
  if (!b) return res.status(404).json({ error: "Broadcast not found" });
  if (b.broadcasterId !== req.session?.userId) {
    return res.status(403).json({ error: "Only the broadcaster can fetch publisher messages" });
  }
  const since = Number(req.query.since ?? 0) || 0;
  const messages = b.pubInbox.filter((m) => m.seq > since);
  return res.json({ seq: b.seq, messages });
});

// Viewer polls their inbox for offers / candidates.
router.get("/live/broadcast/:id/viewer-inbox", async (req: Request, res: Response) => {
  const b = broadcasts.get(paramId(req));
  if (!b) return res.status(404).json({ error: "Broadcast not found" });
  const viewerId = String(req.query.viewerId ?? "");
  if (!viewerId) return res.status(400).json({ error: "A viewerId is required" });
  const entry = b.viewerInbox.get(viewerId);
  if (!entry) return res.status(404).json({ error: "Viewer session not found" });
  entry.lastSeen = Date.now(); // polling keeps the viewer session alive
  const since = Number(req.query.since ?? 0) || 0;
  const messages = entry.inbox.filter((m) => m.seq > since);
  return res.json({ seq: b.seq, messages });
});

// Public: list all currently-live screen-share broadcasts.
router.get("/live/broadcasts", async (_req: Request, res: Response) => {
  const list = Array.from(broadcasts.values()).map(serializeBroadcast);
  return res.json(list);
});

// Public: single broadcast details (used by the watch page).
router.get("/live/broadcast/:id", async (req: Request, res: Response) => {
  const b = broadcasts.get(paramId(req));
  if (!b) return res.status(404).json({ error: "Broadcast not found or already ended" });
  return res.json(serializeBroadcast(b));
});

// The broadcast registry is in-memory only: if the server restarted while a
// match was live, that match would stay "live" in the database forever. Only
// this module ever sets status "live", so reset any leftovers on boot.
void db
  .update(matchesTable)
  .set({ status: "scheduled" })
  .where(eq(matchesTable.status, "live"))
  .catch(() => undefined);

export default router;

