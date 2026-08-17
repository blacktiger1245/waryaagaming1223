import { useEffect } from "react";

const WELCOME_AUDIO_URL = "https://h.top4top.io/m_3881coisr1.mp3";

/**
 * Plays a welcome voice-over once per page load.
 *
 * Module-scoped flag ensures it only plays ONCE:
 *  - While browsing the SPA (client-side navigation) it does NOT replay.
 *  - On a full page refresh, or closing & reopening the tab (a new page
 *    load), the module reloads and it plays again.
 *
 * Because browsers block autoplay-with-sound until the user has interacted
 * with the page, we attempt to play immediately and, if the browser blocks
 * it, fall back to playing on the first user interaction.
 */
let welcomeHasPlayed = false;

export function WelcomeAudio() {
  useEffect(() => {
    if (welcomeHasPlayed) return;
    welcomeHasPlayed = true;

    const audio = new Audio(WELCOME_AUDIO_URL);
    audio.preload = "auto";

    let cancelled = false;

    const cleanup = () => {
      cancelled = true;
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
      window.removeEventListener("touchstart", onFirstInteraction);
      audio.pause();
      audio.src = "";
    };

    const onFirstInteraction = () => {
      if (cancelled) return;
      audio.play().catch(() => {});
      cleanup();
    };

    // Try to autoplay immediately.
    const autoplayAttempt = audio.play();
    if (autoplayAttempt !== undefined) {
      autoplayAttempt.catch(() => {
        if (cancelled) return;
        // Autoplay blocked → play on the first real user gesture.
        window.addEventListener("pointerdown", onFirstInteraction);
        window.addEventListener("keydown", onFirstInteraction);
        window.addEventListener("touchstart", onFirstInteraction);
      });
    }

    return cleanup;
  }, []);

  // Renders nothing; it's purely a side-effect component.
  return null;
}
