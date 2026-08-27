import { apiUrl } from "./api";

/**
 * Client-side helpers for the live screen-share feature.
 *
 * The broadcaster captures their screen with `getDisplayMedia` and pushes it
 * straight to each viewer over WebRTC (peer-to-peer). This module talks to the
 * API server only to exchange signaling messages (SDP offers/answers + ICE
 * candidates), which the server relays between the broadcaster and each viewer.
 */

export interface LiveBroadcastInfo {
  id: string;
  matchId: number;
  broadcasterName: string;
  participant1Name: string | null;
  participant2Name: string | null;
  tournamentName: string | null;
  roundName: string | null;
  startedAt: number;
  viewers: number;
}

type SignalType = "offer" | "answer" | "candidate" | "ended" | "viewer-joined" | "viewer-left";

interface SignalMessage {
  seq: number;
  from: string;
  type: SignalType;
  data?: {
    sdp?: string;
    candidate?: RTCIceCandidateInit;
    viewerId?: string;
    reason?: string;
  };
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const POLL_MS = 1200;
const HEARTBEAT_MS = 5000;

async function json<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(url), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data;
}

/** Ask the browser for screen access and start broadcasting a match. */
export async function startBroadcast(matchId: number): Promise<{ id: string }> {
  return json<{ id: string }>("/api/live/broadcast/start", {
    method: "POST",
    body: JSON.stringify({ matchId }),
  });
}

export function requestScreenStream(includeAudio = true): Promise<MediaStream> {
  return navigator.mediaDevices
    .getDisplayMedia({ video: true, audio: includeAudio })
    .catch(() => navigator.mediaDevices.getDisplayMedia({ video: true }));
}

export interface PublishHandle {
  id: string;
  close: () => void;
}
// ── Broadcaster (publish) ────────────────────────────────────────────────────

/**
 * Publish a captured screen stream and keep signaling with viewers until
 * `close()` is called (or the broadcast ends server-side).
 */
export function publishScreen(
  id: string,
  stream: MediaStream,
  onViewerChange?: (count: number) => void,
): PublishHandle {
  const peers = new Map<string, RTCPeerConnection>();
  // ICE candidates that arrived before a viewer's answer was processed.
  const pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  let seq = 0;
  let stopped = false;
  let viewerCount = 0;

  const heartbeat = setInterval(() => {
    json(`/api/live/broadcast/${id}/heartbeat`, { method: "POST" }).catch(() => undefined);
  }, HEARTBEAT_MS);

  function sendToViewer(viewerId: string, type: string, data?: unknown) {
    return json(`/api/live/broadcast/${id}/signal`, {
      method: "POST",
      body: JSON.stringify({ to: `viewer:${viewerId}`, message: { from: "pub", type, data } }),
    }).catch(() => undefined);
  }

  function createPeerConnection(viewerId: string) {
    if (stopped) return;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peers.set(viewerId, pc);

    let offerSent = false;
    pc.onicecandidate = (e) => {
      if (!e.candidate || !offerSent) return;
      sendToViewer(viewerId, "candidate", { candidate: e.candidate.toJSON() });
    };

    stream.getTracks().forEach((t) => {
      try {
        if (!t.enabled || t.readyState === "ended") return;
        pc.addTrack(t, stream);
      } catch {
        /* detached track */
      }
    });

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        offerSent = true;
        return sendToViewer(viewerId, "offer", { sdp: pc.localDescription?.sdp });
      })
      .catch(() => {
        peers.delete(viewerId);
        try {
          pc.close();
        } catch {
          /* ignore */
        }
      });

    return pc;
  }

  async function handle(msg: SignalMessage) {
    if (msg.type === "viewer-joined") {
      const viewerId = msg.data?.viewerId;
      if (!viewerId || peers.has(viewerId)) return;
      viewerCount++;
      onViewerChange?.(viewerCount);
      createPeerConnection(viewerId);
      return;
    }
    if (msg.type === "viewer-left") {
      const viewerId = msg.data?.viewerId;
      const pc = peers.get(viewerId!);
      if (pc) {
        try {
          pc.close();
        } catch {
          /* ignore */
        }
        peers.delete(viewerId!);
        pendingCandidates.delete(viewerId!);
        viewerCount = Math.max(0, viewerCount - 1);
        onViewerChange?.(viewerCount);
      }
      return;
    }
    if (msg.type === "ended") {
      stop();
      return;
    }

    // A message from a specific viewer (answer or ICE candidate).
    const pc = peers.get(msg.from);
    if (!pc) return;
    if (msg.type === "answer") {
      try {
        await pc.setRemoteDescription({ type: "answer", sdp: msg.data?.sdp });
        // Flush any ICE candidates that arrived before the answer did.
        const pending = pendingCandidates.get(msg.from);
        if (pending) {
          pendingCandidates.delete(msg.from);
          for (const c of pending.splice(0)) {
            try {
              await pc.addIceCandidate(c);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }
    } else if (msg.type === "candidate") {
      if (!msg.data?.candidate) return;
      if (pc.remoteDescription) {
        try {
          await pc.addIceCandidate(msg.data.candidate);
        } catch {
          /* ignore */
        }
      } else {
        // The answer has not been processed yet — queue the candidate.
        let queue = pendingCandidates.get(msg.from);
        if (!queue) {
          queue = [];
          pendingCandidates.set(msg.from, queue);
        }
        queue.push(msg.data.candidate);
      }
    }
  }

  let pollFailures = 0;
  async function poll() {
    if (stopped) return;
    try {
      const res = await json<{ seq: number; messages: SignalMessage[] }>(
        `/api/live/broadcast/${id}/pub-inbox?since=${seq}`,
      );
      pollFailures = 0;
      seq = res.seq;
      for (const m of res.messages) {
        await handle(m);
      }
    } catch {
      // A single failed poll (network hiccup) should not kill the broadcast —
      // give up only after several consecutive failures (~10s).
      pollFailures++;
      if (pollFailures >= 8) {
        stop();
        return;
      }
    }
    if (stopped) return;
    setTimeout(poll, POLL_MS);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    for (const pc of peers.values()) {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    }
    peers.clear();
    const track = stream.getTracks().find((t) => t.readyState !== "ended");
    if (track) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
    }
    json(`/api/live/broadcast/${id}/stop`, { method: "POST", body: JSON.stringify({ id }) }).catch(() => undefined);
  }

  poll();
  return { id, close: stop };
}

// ── Viewer (watch) ───────────────────────────────────────────────────────────

export interface WatchHandle {
  viewerId: string;
  close: () => void;
}
/**
 * Attach a live broadcast to a <video> element. `onStatus` notifies about
 * connection state and when the stream ends.
 */
export function watchBroadcast(
  id: string,
  video: HTMLVideoElement,
  onStatus?: (status: "connecting" | "live" | "ended" | "error", error?: string) => void,
): WatchHandle {
  const viewerId = crypto.randomUUID();
  const pc = new RTCPeerConnection(ICE_SERVERS);
  let seq = 0;
  let ended = false;
  let peerConnected = false;
  // ICE candidates that arrived before the broadcaster's offer was processed.
  let pendingCandidates: RTCIceCandidateInit[] = [];
  // If no media arrives within this window, surface an error instead of an
  // endless spinner.
  const connectTimeout = setTimeout(() => {
    if (!peerConnected && !ended) {
      onStatus?.(
        "error",
        "Timed out connecting to the broadcaster. Make sure they are still sharing their screen, then try again.",
      );
      void close();
    }
  }, 30000);

  pc.ontrack = (e) => {
    peerConnected = true;
    clearTimeout(connectTimeout);
    try {
      video.srcObject = e.streams[0];
    } catch {
      /* ignore */
    }
    onStatus?.("live");
  };

  pc.onconnectionstatechange = () => {
    if ((pc.connectionState === "failed" || pc.connectionState === "disconnected") && !peerConnected) {
      ended = true;
      clearTimeout(connectTimeout);
      onStatus?.("error", "Could not reach the broadcaster. Check they are still sharing their screen.");
    }
  };

  function sendToPub(type: string, data?: unknown) {
    return json(`/api/live/broadcast/${id}/signal`, {
      method: "POST",
      body: JSON.stringify({ to: "pub", message: { from: viewerId, type, data } }),
    }).catch(() => undefined);
  }

  pc.onicecandidate = (e) => {
    if (e.candidate && pc.localDescription) {
      sendToPub("candidate", { candidate: e.candidate.toJSON() });
    }
  };

  async function handle(msg: SignalMessage) {
    if (msg.type === "offer") {
      if (!msg.data?.sdp) return;
      await pc.setRemoteDescription({ type: "offer", sdp: msg.data.sdp });
      // Flush ICE candidates that arrived before the offer.
      const pending = pendingCandidates.splice(0);
      for (const c of pending) {
        try {
          await pc.addIceCandidate(c);
        } catch {
          /* ignore */
        }
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendToPub("answer", { sdp: answer.sdp });
    } else if (msg.type === "candidate") {
      if (!msg.data?.candidate) return;
      if (pc.remoteDescription) {
        try {
          await pc.addIceCandidate(msg.data.candidate);
        } catch {
          /* ignore */
        }
      } else {
        // The offer has not been processed yet — queue the candidate.
        pendingCandidates.push(msg.data.candidate);
      }
    } else if (msg.type === "ended") {
      ended = true;
      clearTimeout(connectTimeout);
      onStatus?.("ended");
    }
  }

  let pollFailures = 0;
  async function poll() {
    if (ended) return;
    try {
      const res = await json<{ seq: number; messages: SignalMessage[] }>(
        `/api/live/broadcast/${id}/viewer-inbox?viewerId=${encodeURIComponent(viewerId)}&since=${seq}`,
      );
      pollFailures = 0;
      seq = res.seq;
      for (const m of res.messages) {
        await handle(m);
      }
    } catch {
      // Tolerate transient failures instead of instantly ending the stream.
      pollFailures++;
      if (pollFailures >= 8) {
        ended = true;
        clearTimeout(connectTimeout);
        onStatus?.("ended");
        return;
      }
    }
    if (ended) return;
    setTimeout(poll, POLL_MS);
  }

  // Register as a viewer and start listening for the broadcaster's offer.
  json<{ ok: boolean }>(`/api/live/broadcast/${id}/watch/start`, {
    method: "POST",
    body: JSON.stringify({ viewerId }),
  })
    .then(() => {
      if (ended) return;
      onStatus?.("connecting");
      poll();
    })
    .catch(() => {
      ended = true;
      clearTimeout(connectTimeout);
      onStatus?.("error", "This broadcast is no longer available.");
    });

  async function close() {
    if (ended) return; // idempotent
    ended = true;
    clearTimeout(connectTimeout);
    try {
      await json(`/api/live/broadcast/${id}/watch/stop`, {
        method: "POST",
        body: JSON.stringify({ viewerId }),
      });
    } catch {
      /* ignore */
    }
    try {
      pc.close();
    } catch {
      /* ignore */
    }
    if (video.srcObject) {
      try {
        (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      video.srcObject = null;
    }
  }

  return { viewerId, close };
}

export async function fetchLiveBroadcasts(): Promise<LiveBroadcastInfo[]> {
  return json<LiveBroadcastInfo[]>("/api/live/broadcasts");
}

export async function fetchBroadcast(id: string): Promise<LiveBroadcastInfo> {
  return json<LiveBroadcastInfo>(`/api/live/broadcast/${id}`);
}