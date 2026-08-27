package com.waryaa.gaming;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor plugin that exposes native MediaProjection screen-capture
 * broadcasting to the website page running inside this app's WebView.
 *
 * The site's "Go Live" flow calls Capacitor.Plugins.ScreenCast.start({matchId})
 * when it detects the native bridge. This triggers the Android screen-capture
 * permission dialog, then hands the granted projection to ScreenCastService
 * (a foreground service) which captures the FULL phone screen and publishes it
 * into the EXISTING /api/live/broadcast/* WebRTC-signaling infrastructure —
 * so website viewers watch it like any other broadcast.
 */
@CapacitorPlugin(name = "ScreenCast")
public class ScreenCastPlugin extends Plugin {

    private static final int REQ_SCREEN_CAPTURE = 9001;
    private static final String DEFAULT_ORIGIN =
        "https://p01--waryaagaming1223--w5kk4bgjlsdp.code.run";

    // The pending call across the activity-result boundary.
    private PluginCall pending;
    private int pendingMatchId;
    private String pendingOrigin;

    @PluginMethod
    public void start(PluginCall call) {
        Integer matchId = call.getInt("matchId");
        if (matchId == null || matchId <= 0) {
            call.reject("A valid matchId is required");
            return;
        }
        String origin = call.getString("apiOrigin");
        if (origin == null || origin.trim().isEmpty()) origin = DEFAULT_ORIGIN;

        if (ScreenCastService.isRunning()) {
            call.resolve(status());
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity available");
            return;
        }

        pending = call;
        pendingMatchId = matchId;
        pendingOrigin = origin;

        MediaProjectionManager mpm =
            (MediaProjectionManager) activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        Intent intent = mpm.createScreenCaptureIntent();
        startActivityForResult(call, intent, "onScreenCaptureResult");
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        if (context != null) {
            context.stopService(new Intent(context, ScreenCastService.class));
        }
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(status());
    }

    @ActivityCallback
    private void onScreenCaptureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        int resultCode = result.getResultCode();
        Intent data = result.getData();

        if (resultCode != Activity.RESULT_OK || data == null) {
            call.reject("SCREEN_CAPTURE_DENIED", "Screen sharing permission was not granted");
            return;
        }

        Intent svc = new Intent(getContext(), ScreenCastService.class);
        svc.putExtra(ScreenCastService.EXTRA_MATCH_ID, pendingMatchId);
        svc.putExtra(ScreenCastService.EXTRA_RESULT_CODE, resultCode);
        svc.putExtra(ScreenCastService.EXTRA_RESULT_DATA, data);
        svc.putExtra(ScreenCastService.EXTRA_API_ORIGIN, pendingOrigin);

        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= 26) {
            ctx.startForegroundService(svc);
        } else {
            ctx.startService(svc);
        }
        call.resolve(status());
    }

    private JSObject status() {
        JSObject o = new JSObject();
        o.put("running", ScreenCastService.isRunning());
        o.put("broadcastId", ScreenCastService.getBroadcastId());
        o.put("viewers", ScreenCastService.getViewerCount());
        return o;
    }
}