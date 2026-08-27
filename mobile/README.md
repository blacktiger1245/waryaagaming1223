# Waryaa Gaming — Android app (Capacitor)

Android phone → Waryaa Android APK → Go Live → **Share entire phone screen**
(MediaProjection) → existing Waryaa Live/WebRTC infrastructure → viewers watch
from the existing website.

---

## ⚠️ Validation status (read first)

This workspace has **no internet and no Android SDK**, so an APK could not be
compiled or validated here. Everything in this folder is the project setup and
integration plan, and the website change is a tiny additive no-op branch.
**Nothing here is a claim that the app works end-to-end.** The steps below must
be run on a machine with internet + Android Studio/SDK, and the native code
must be compiled and tested there. I am explicitly NOT claiming steps 2–9 of
the task are validated.

---

## What is reused (zero rebuild)

| Piece | Reused from | Status |
|---|---|---|
| Server signaling relay | `artifacts/api-server/src/routes/live.ts` (`/api/live/broadcast/*`) | unchanged |
| Live page / viewer list | `artifacts/wg-platform/src/pages/live.tsx` | unchanged |
| Watch page (viewer WebRTC) | `artifacts/wg-platform/src/pages/watch.tsx` + `lib/live.ts` | unchanged |
| Desktop broadcaster | `lib/live.ts` `publishScreen()` | unchanged |
| Auth / sessions | existing Discord auth + `wg.sid` cookie (WebView shares it) | unchanged |
| Fixtures + Go Live UI | `artifacts/wg-platform/src/pages/fixtures.tsx` | + 1 additive branch |

The signaling contract any publisher must speak (already implemented by the web
publisher and by the Android publisher to be added):

```
POST /live/broadcast/start            { matchId }          -> { id, ... }
## Design

- The app is a **separate Capacitor project** (`mobile/`) that does NOT touch
  the website's hosting. Its WebView loads the **deployed site** via
  `capacitor.config.ts -> server.url`, so auth, fixtures, live list and watch
  are identical to the website.
- A Capacitor native plugin (`ScreenCast`) requests **MediaProjection**
  permission → shows the Android system "start recording / cast" dialog → runs
  a foreground service → captures the screen (VirtualDisplay + ImageReader) →
  a native **WebRTC publisher** (using `org.webrtc`) speaks the exact protocol
  above, so the phone appears as a normal broadcaster the website can watch.
- The site's Go Live button checks `window.WaryaaNative` first (added branch in
  `fixtures.tsx`); on normal browsers that is undefined and desktop screen
  share works exactly as before.

## Native implementation required (Android only)

Create these in `mobile/android/` after `npx cap add android`:

1. `ScreenCastPlugin` (Capacitor `@CapacitorPlugin("ScreenCast")`):
   `start{matchId}`, `stop`, `status`. `start` uses
   `MediaProjectionManager.createScreenCaptureIntent()` +
   `registerForActivityResult`, then hands the result to the service.
2. `ScreenCastService` (foreground, `FOREGROUND_SERVICE_MEDIA_PROJECTION`):
   owns the `MediaProjection`, the `VirtualDisplay`/`ImageReader` capturer, and
   the `WebRTCPublisher`.
3. **WebRTC publisher** (`org.webrtc.*`): `PeerConnectionFactory`,
   VideoSink from capturer → `VideoTrack`, and a signaling loop that:
   - POSTs start, polls `pub-inbox` every 1.2s, heartbeats every 5s,
   - on `viewer-joined` creates a peer, adds the screen track, sends an
     `offer` via `signal`, relays `candidate`,
   - on `answer`/`candidate` from the poll applies them, sends its own ICE
     candidates,
### AndroidManifest additions
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
<!-- POST_NOTIFICATIONS on API 33+ so the foreground "sharing" notification shows -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<service
    android:name="com.waryaa.gaming.ScreenCastService"
    android:foregroundServiceType="mediaProjection"
    android:exported="false" />
```

---

## Build the APK (run on YOUR machine — needs internet + Android Studio)

From the repo root (`waryaagaming1223-main/`):

```bash
cd mobile
npm install                 # requires internet (installs @capacitor/*)
npx cap add android         # generates android/ + gradle wrapper
# ...add the native code above (plugin/service/publisher/manifest/gradle)...
VITE_SITE_URL="https://p01--waryaagaming1223--w5kk4bgjlsdp.code.run" npx cap sync android
cd android
./gradlew assembleDebug     # Linux/macOS   (Windows: gradlew.bat assembleDebug)
```

**Expected APK location** (this is the exact path you download/install):

```
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Install on your Android phone

1. Copy `app-debug.apk` to the phone (USB / Drive / `adb install`).
2. First time, allow unknown sources:
   `Settings → Security → Install unknown apps → Files/Chrome → Allow`.
3. Open the APK in Files → **Install**.

## Test "Go Live" (screen sharing)

1. Open **Waryaa Gaming** app → sign in with Discord.
2. Go to **Fixtures** → pick a match → **Go Live**.
3. The Android system shows the **"Start recording / screen cast"** permission
   dialog → tap **Start now / Allow** (this is MediaProjection — it is NOT a
   camera prompt).
4. Your **entire phone screen** starts being broadcast.
5. On a PC or another phone's browser open the existing website → **Live** →
   find the match → **Watch Now** → you see the phone's screen live.
6. Tap **Close Live / End Broadcast** in the app → the broadcast ends, viewers
   see "Broadcast ended", and the match drops off the Live list.

## Permissions & limitations

- `FOREGROUND_SERVICE_MEDIA_PROJECTION` + a foreground notification are required
  by Android to keep screen capture alive.
- MediaProjection requires **Android 5.0+ (API 21)**; the service type
  `mediaProjection` requires **API 29+** (use it conditionally below).
- Immersive/DRM content (Netflix-style) may appear black in the capture —
  Android system behavior, not fixable by the app.
- iOS is out of scope (Android-only APK per the task); iOS would need ReplayKit.
- The APK is a signed **debug** build — fine for sideload testing; Play Store
  signing/publishing is not part of this task.

## Coexistence guarantee

The website (`artifacts/wg-platform`, `artifacts/api-server`) is unchanged
except one additive branch in `fixtures.tsx` that only activates when
`window.WaryaaNative` exists. Desktop screen share, viewers, watch, auth, and
hosting are untouched.
   - on `ended` or `stop`, closes peers and POSTs `/live/broadcast/stop`.
   - Sends the `wg.sid` cookie (read via `CookieManager`) on every request so
     the server recognizes the broadcaster session.

Dependency (add to `mobile/android/app/build.gradle.kts`):
```kotlin
implementation("io.github.webrtc-sdk:android:<latest>") // or org.webrtc:google-webrtc
```
You also need the RGBA→I420 conversion for the ImageReader frames (standard
WebRTC example code).
GET  /live/broadcast/:id/pub-inbox    ?since=<seq>         -> { seq, messages[] }
POST /live/broadcast/:id/signal       { to:"viewer:<id>", message:{from:"pub",type,data} }
POST /live/broadcast/:id/heartbeat
POST /live/broadcast/stop             { id }
```

Viewers never change: they receive offers via the relay and stream peer-to-peer.