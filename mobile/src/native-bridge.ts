/**
 * Typings for the native screen-cast bridge that the Capacitor Android app
 * registers on the GLobal object. On a normal browser this is undefined, so
 * the website behaves exactly as before. The app's native side (MediaProjection
 * + WebRTC publisher, see mobile/README.md) implements it.
 */

export interface NativeCastStatus {
  running: boolean;
  broadcastId: string | null;
  viewers: number;
}

/** Shape of `window.Capacitor.Plugins.ScreenCast` (available only in the app). */
export interface WaryaaNative {
  start(call: { matchId: number })
  stop()
  status(): Promise<{ value: NativeCastStatus }>
}

declare global {
  interface Window {
    WaryaaNative?: {
      start: (matchId: number) => Promise<{ broadcastId: string } | { rejected: string }>;
      stop: () => Promise<unknown>;
      status: () => Promise<NativeCastStatus>;
    };
  }
}

/** True when running inside the Waryaa Android app with the native bridge. */
export function isNativeScreenCastAvailable(): boolean {
  return typeof window !== "undefined" && !!window.WaryaaNative;
}