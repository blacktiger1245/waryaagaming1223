package com.waryaa.gaming;

import android.content.Context;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;

import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Native WebRTC broadcaster. It publishes the MediaProjection screen track to
 * each viewer that joins, using the EXACT same signaling protocol as the web
 * broadcaster in lib/live.ts (start → pub-inbox poll → signal ↔ heartbeat →
 * stop) so website viewers can watch a phone broadcast without any server or
 * site change.
 */
public class WebRTCBroadcaster {

    private static final String TAG = "WaryaBroadcaster";
    private static final long POLL_MS = 1200;
    private static final long HEARTBEAT_MS = 5000;

    private final Context context;
    private final int matchId;
    private final String origin;
    private final ScreenCapturer capturer;

    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicLong since = new AtomicLong(0);
    private volatile String broadcastId = "";

    private PeerConnectionFactory factory;
    private VideoSource videoSource;
    private VideoTrack videoTrack;
    private final Map<String, PeerConnection> peers = new ConcurrentHashMap<>();

    private HandlerThread controlThread;
    private Handler controlHandler;
    private final Runnable heartbeatRunnable = this::heartbeat;

    public WebRTCBroadcaster(Context context, int matchId, String origin, ScreenCapturer capturer) {
        this.context = context.getApplicationContext();
        this.matchId = matchId;
        this.origin = origin;
        this.capturer = capturer;
    }

    /** Start capture + signaling on a dedicated thread. */
    public void start() {
        if (!running.compareAndSet(false, true)) return;
        controlThread = new HandlerThread("warya-webrtc");
        controlThread.start();
        controlHandler = new Handler(controlThread.getLooper());
        controlHandler.post(this::boot);
    }

    public boolean isRunning() {
        return running.get();
    }

    public String getBroadcastId() {
        return broadcastId;
    }
// ── lifecycle ─────────────────────────────────────────────────────────────

    private void boot() {
        try {
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(context)
                    .setEnableInternalTracer(false)
                    .createInitializationOptions());
            factory = PeerConnectionFactory.builder().createPeerConnectionFactory();

            videoSource = factory.createVideoSource(true /* isScreencast */);
            capturer.attach(videoSource.getCapturerObserver());
            videoTrack = factory.createVideoTrack("screen0", videoSource);
            capturer.start();

            JSONObject started = SignalingHttp.start(origin, matchId);
            broadcastId = started.getString("id");
            ScreenCastService.setBroadcastId(broadcastId);

            controlHandler.postDelayed(heartbeatRunnable, HEARTBEAT_MS);
            pollLoop();
        } catch (Exception e) {
            Log.e(TAG, "boot failed", e);
            terminate(false);
        }
    }

    private void pollLoop() {
        if (!running.get()) return;
        try {
            JSONObject json = SignalingHttp.pollPubInbox(origin, broadcastId, since.get());
            SignalingHttp.PubInbox inbox = SignalingHttp.parsePubInbox(json);
            since.set(inbox.seq);
            handleMessages(inbox.messages);
        } catch (Exception e) {
            Log.w(TAG, "pub-inbox error, terminating: " + e.getMessage());
            terminate(false);
            return;
        }
        if (running.get()) controlHandler.postDelayed(this::pollLoop, POLL_MS);
    }

    private void heartbeat() {
        if (!running.get()) return;
        try {
            SignalingHttp.heartbeat(origin, broadcastId);
        } catch (Exception e) {
            Log.w(TAG, "heartbeat error, terminating: " + e.getMessage());
            terminate(false);
            return;
        }
        if (running.get()) controlHandler.postDelayed(heartbeatRunnable, HEARTBEAT_MS);
    }

    private void handleMessages(JSONArray messages) throws Exception {
        for (int i = 0; i < messages.length(); i++) {
            JSONObject msg = messages.getJSONObject(i);
            String type = msg.optString("type");
            String from = msg.optString("from");
            JSONObject data = msg.optJSONObject("data");

            switch (type) {
                case "viewer-joined": {
                    String key = data != null && data.has("viewerId") ? data.optString("viewerId") : from;
                    if (!key.isEmpty() && !peers.containsKey(key)) createPeer(key);
                    ScreenCastService.setViewerCount(peers.size());
                    break;
                }
                case "viewer-left": {
                    String key = data != null && data.has("viewerId") ? data.optString("viewerId") : from;
                    PeerConnection pc = peers.remove(key);
                    if (pc != null) close(pc);
                    ScreenCastService.setViewerCount(peers.size());
                    break;
                }
                case "answer": {
                    PeerConnection pc = peers.get(from);
                    if (pc != null && data != null && data.has("sdp")) {
                        SessionDescription answer =
                            new SessionDescription(SessionDescription.Type.ANSWER, data.optString("sdp"));
                        pc.setRemoteDescription(noopSdpObserver(), answer);
                    }
                    break;
                }
                case "candidate": {
                    PeerConnection pc = peers.get(from);
                    if (pc != null && data != null && data.has("candidate")) {
                        JSONObject c = data.getJSONObject("candidate");
                        IceCandidate cand = new IceCandidate(
                            c.optString("sdpMid", null),
                            c.optInt("sdpMLineIndex", 0),
                            c.optString("candidate"));
                        pc.addIceCandidate(cand);
                    }
                    break;
                }
                case "ended": {
                    terminate(false);
                    return;
                }
                default:
                    break;
            }
        }
    }
// ── peer management ───────────────────────────────────────────────────────

    private void createPeer(final String viewerId) {
        try {
            PeerConnection pc = factory.createPeerConnection(config(), observerOf(viewerId));
            if (pc == null) return;
            pc.addTrack(videoTrack, Collections.<String>emptyList());
            peers.put(viewerId, pc);
            pc.createOffer(offerObserver(viewerId, pc), new MediaConstraints());
        } catch (Exception e) {
            Log.e(TAG, "createPeer failed: " + e.getMessage(), e);
        }
    }

    private PeerConnection.RTCConfiguration config() {
        PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(
            Collections.unmodifiableList(Arrays.asList(
                new PeerConnection.IceServer("stun:stun.l.google.com:19302"),
                new PeerConnection.IceServer("stun:stun1.l.google.com:19302"),
                new PeerConnection.IceServer("stun:stun.cloudflare.com:3478"),
                new PeerConnection.IceServer("turn:openrelay.metered.ca:80",
                    "openrelayproject", "openrelayproject"),
                new PeerConnection.IceServer("turn:openrelay.metered.ca:443",
                    "openrelayproject", "openrelayproject"),
                new PeerConnection.IceServer("turn:openrelay.metered.ca:443?transport=tcp",
                    "openrelayproject", "openrelayproject"),
                new PeerConnection.IceServer("turns:openrelay.metered.ca:443?transport=tcp",
                    "openrelayproject", "openrelayproject"))));
        config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
        return config;
    }

    private PeerConnection.Observer observerOf(final String viewerId) {
        return new PeerConnection.Observer() {
            @Override public void onSignalingChange(PeerConnection.SignalingState s) { }
            @Override public void onIceConnectionChange(PeerConnection.IceConnectionState s) {
                if (s == PeerConnection.IceConnectionState.FAILED
                        || s == PeerConnection.IceConnectionState.CLOSED) {
                    peers.remove(viewerId);
                    ScreenCastService.setViewerCount(peers.size());
                }
            }
            @Override public void onIceConnectionReceivingChange(boolean b) { }
            @Override public void onIceGatheringChange(PeerConnection.IceGatheringState s) { }
            @Override public void onIceCandidate(IceCandidate c) {
                sendCandidate(viewerId, c);
            }
            @Override public void onIceCandidatesRemoved(IceCandidate[] c) { }
            @Override public void onAddStream(org.webrtc.MediaStream s) { }
            @Override public void onRemoveStream(org.webrtc.MediaStream s) { }
            @Override public void onDataChannel(org.webrtc.DataChannel d) { }
            @Override public void onRenegotiationNeeded() { }
            @Override public void onAddTrack(org.webrtc.RtpReceiver r, org.webrtc.MediaStream[] m) { }
        };
    }

    private SdpObserver offerObserver(final String viewerId, final PeerConnection pc) {
        return new SdpObserver() {
            @Override public void onCreateSuccess(SessionDescription sdp) {
                pc.setLocalDescription(noopSdpObserver(), sdp);
                try {
                    SignalingHttp.signal(origin, broadcastId, "viewer:" + viewerId, "pub", "offer",
                        new JSONObject().put("sdp", sdp.description));
                } catch (Exception e) {
                    Log.w(TAG, "offer send failed", e);
                }
            }
            @Override public void onSetSuccess() { }
            @Override public void onCreateFailure(String reason) { }
            @Override public void onSetFailure(String reason) { }
        };
    }

    private void sendCandidate(String viewerId, IceCandidate c) {
        try {
            JSONObject cand = new JSONObject();
            cand.put("candidate", c.sdp);
            cand.put("sdpMid", c.sdpMid);
            cand.put("sdpMLineIndex", c.sdpMLineIndex);
            SignalingHttp.signal(origin, broadcastId, "viewer:" + viewerId, "pub", "candidate",
                new JSONObject().put("candidate", cand));
        } catch (Exception e) {
            Log.w(TAG, "candidate send failed", e);
        }
    }

    private SdpObserver noopSdpObserver() {
        return new SdpObserver() {
            @Override public void onCreateSuccess(SessionDescription sdp) { }
            @Override public void onSetSuccess() { }
            @Override public void onCreateFailure(String reason) { }
            @Override public void onSetFailure(String reason) { }
        };
    }

    private void close(PeerConnection pc) {
        try {
            pc.close();
        } catch (Throwable ignore) { }
    }

    /** Stop publishing and clean up (called by the service on destroy). */
    public void stop() {
        terminate(true);
    }

    private void terminate(boolean notifyServer) {
        if (!running.compareAndSet(true, false)) return;
        if (controlHandler != null) controlHandler.removeCallbacksAndMessages(null);

        if (notifyServer && broadcastId != null && !broadcastId.isEmpty()) {
            try {
                SignalingHttp.stop(origin, broadcastId);
            } catch (Exception ignore) { }
        }

        for (PeerConnection pc : peers.values()) close(pc);
        peers.clear();

        try { capturer.stop(); } catch (Throwable ignore) { }
        try { if (videoSource != null) videoSource.dispose(); } catch (Throwable ignore) { }
        try { if (factory != null) factory.dispose(); } catch (Throwable ignore) { }
        videoSource = null;
        videoTrack = null;
        factory = null;

        // If the stream died on its own (server "ended", heartbeat/poll failure),
        // make sure the foreground service is stopped so a new Go Live can start.
        if (notifyServer) {
            // intentional: stop() is called from the service teardown path already
        } else {
            ScreenCastService.broadcastTerminated();
        }

        if (controlThread != null) {
            controlThread.quitSafely();
            controlThread = null;
        }
    }
}