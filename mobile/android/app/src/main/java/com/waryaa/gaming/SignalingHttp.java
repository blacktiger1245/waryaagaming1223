package com.waryaa.gaming;

import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Minimal HTTP client for the EXISTING Waryaa signaling API
 * (/api/live/broadcast/*). It attaches the session cookie (wg.sid) exactly as
 * a browser would so the server recognises the broadcaster's account.
 */
public final class SignalingHttp {

    private static final String COOKIE_NAME = "wg.sid";

    private final String origin;

    public SignalingHttp(String origin) {
        this.origin = origin.replaceAll("/+$", "");
    }

    public static JSONObject start(String origin, int matchId) throws Exception {
        JSONObject body = new JSONObject().put("matchId", matchId);
        return post(origin + "/api/live/broadcast/start", body, origin);
    }

    public static JSONObject stop(String origin, String broadcastId) throws Exception {
        JSONObject body = new JSONObject().put("id", broadcastId);
        return post(origin + "/api/live/broadcast/stop", body, origin);
    }

    public static void heartbeat(String origin, String broadcastId) throws Exception {
        post(origin + "/api/live/broadcast/" + broadcastId + "/heartbeat", null, origin);
    }

    public static JSONObject pollPubInbox(String origin, String broadcastId, long since) throws Exception {
        URL url = new URL(origin + "/api/live/broadcast/" + broadcastId + "/pub-inbox?since=" + since);
        return get(url, origin);
    }

    public static void signal(String origin, String broadcastId, String to, String from, String type, JSONObject data) throws Exception {
        JSONObject message = new JSONObject();
        message.put("from", from);
        message.put("type", type);
        if (data != null) message.put("data", data);

        JSONObject body = new JSONObject();
        body.put("to", to);
        body.put("message", message);

        post(origin + "/api/live/broadcast/" + broadcastId + "/signal", body, origin);
    }

    // ── low-level helpers ─────────────────────────────────────────────────────

    private static JSONObject post(String url, JSONObject body, String origin) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "application/json");
        attachCookie(conn, origin);
        conn.setDoOutput(true);
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);
        if (body != null) {
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(bytes);
            }
        }
        return read(conn);
    }

    private static JSONObject get(URL url, String origin) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Accept", "application/json");
        attachCookie(conn, origin);
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);
        return read(conn);
    }

    private static void attachCookie(HttpURLConnection conn, String origin) {
        try {
            String cookie = CookieManager.getInstance().getCookie(origin);
            if (cookie != null && !cookie.isEmpty()) {
                // Pass the whole cookie jar through; the server reads its own.
                conn.setRequestProperty("Cookie", cookie);
            }
        } catch (Throwable ignore) { }
    }

    private static JSONObject read(HttpURLConnection conn) throws Exception {
        int code = conn.getResponseCode();
        InputStream stream = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
        String raw = "";
        if (stream != null) {
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
            }
            raw = sb.toString();
        }
        JSONObject json = raw.isEmpty() ? new JSONObject() : new JSONObject(raw);
        if (code < 200 || code >= 300) {
            String msg = json.optString("error", "HTTP " + code);
            throw new IllegalStateException(msg);
        }
        return json;
    }

    /** Ingests the pub-inbox payload into a simple structure the publisher uses. */
    public static final class PubInbox {
        public final long seq;
        public final JSONArray messages;
        PubInbox(long seq, JSONArray messages) {
            this.seq = seq;
            this.messages = messages;
        }
    }

    public static PubInbox parsePubInbox(JSONObject json) {
        long seq = json.optLong("seq", 0);
        JSONArray arr = json.optJSONArray("messages");
        if (arr == null) arr = new JSONArray();
        return new PubInbox(seq, arr);
    }
}