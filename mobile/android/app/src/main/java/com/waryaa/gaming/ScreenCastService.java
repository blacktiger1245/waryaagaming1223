package com.waryaa.gaming;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

/**
 * Foreground service that owns the MediaProjection while the app broadcasts
 * the phone screen. It wires the captured frames into WebRTCBroadcaster, which
 * reuses the existing /api/live/broadcast/* signaling so website viewers can
 * watch the phone's live screen.
 *
 * Android requires a foreground service to keep MediaProjection alive, and on
 * API 29+ the service type must be FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION.
 */
public class ScreenCastService extends Service {

    private static final String TAG = "WaryaScreenCastSvc";

    public static final String EXTRA_MATCH_ID = "matchId";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";
    public static final String EXTRA_API_ORIGIN = "apiOrigin";

    private static final String CHANNEL_ID = "screen_cast";
    private static final int NOTIFICATION_ID = 42;

    private MediaProjection projection;
    private ScreenCapturer capturer;
    private WebRTCBroadcaster broadcaster;

    private static Context appContext = null;
    private static boolean running = false;
    private static String broadcastId = null;
    private static int viewerCount = 0;

    // ── statics (read by the JS bridge via the plugin) ────────────────────────

    public static synchronized boolean isRunning() { return running; }
    public static synchronized String getBroadcastId() { return broadcastId; }
    public static synchronized int getViewerCount() { return viewerCount; }
    public static synchronized void setBroadcastId(String id) { broadcastId = id; }
    public static synchronized void setViewerCount(int n) { viewerCount = n; }

    /** Called by the broadcaster when the stream ends server-side or fails. */
    public static void broadcastTerminated() {
        Context app = appContext;
        if (app != null) {
            try {
                app.stopService(new Intent(app, ScreenCastService.class));
            } catch (Throwable ignore) { }
        }
    }

    // ── lifecycle ─────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        appContext = getApplicationContext();
        createChannel();
        startServiceForeground();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        int matchId = intent == null ? -1 : intent.getIntExtra(EXTRA_MATCH_ID, -1);
        int resultCode = intent == null ? -1 : intent.getIntExtra(EXTRA_RESULT_CODE, -1);
        Intent resultData = null;
        if (intent != null) {
            if (Build.VERSION.SDK_INT >= 33) {
                resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent.class);
            } else {
                resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
            }
        }
        String origin = intent == null ? null : intent.getStringExtra(EXTRA_API_ORIGIN);
        if (origin == null || origin.isEmpty()) origin = "https://p01--waryaagaming1223--w5kk4bgjlsdp.code.run";

        if (matchId <= 0 || resultCode != Activity.RESULT_OK || resultData == null) {
            Log.e(TAG, "invalid extras, stopping");
            stopSelf();
            return START_NOT_STICKY;
        }

        startBroadcast(matchId, resultCode, resultData, origin);
        return START_NOT_STICKY;
    }

    private void startBroadcast(int matchId, int resultCode, Intent resultData, String origin) {
        tearDown();

        MediaProjectionManager mpm =
            (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        projection = mpm.getMediaProjection(resultCode, resultData);
        capturer = new ScreenCapturer(this, projection);
        broadcaster = new WebRTCBroadcaster(this, matchId, origin, capturer);
        broadcaster.start();

        synchronized (ScreenCastService.class) {
            running = true;
            broadcastId = null;
            viewerCount = 0;
        }
    }
// ── teardown / notification ────────────────────────────────────────────────

    @Override
    public void onDestroy() {
        tearDown();
        synchronized (ScreenCastService.class) {
            running = false;
            broadcastId = null;
            viewerCount = 0;
        }
        super.onDestroy();
    }

    private void tearDown() {
        if (broadcaster != null) { try { broadcaster.stop(); } catch (Throwable ignore) { } }
        if (capturer != null) { try { capturer.stop(); } catch (Throwable ignore) { } }
        if (projection != null) {
            try {
                projection.stop();
            } catch (Throwable ignore) { }
        }
        broadcaster = null;
        capturer = null;
        projection = null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Screen share", NotificationManager.IMPORTANCE_LOW);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private void startServiceForeground() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
                return;
            } catch (Exception e) {
                Log.w(TAG, "mediaProjection foreground type failed: " + e.getMessage());
            }
        }
        startForeground(NOTIFICATION_ID, notification);
    }

    private Notification buildNotification() {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        return b
            .setContentTitle("Waryaa Gaming")
            .setContentText("Sharing your screen")
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setOngoing(true)
            .build();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}