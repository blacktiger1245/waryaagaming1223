import { useEffect, useRef, useState } from "react";

const WELCOME_AUDIO_URL = "https://h.top4top.io/m_3881coisr1.mp3";

/**
 * Plays a welcome voice-over once per page load.
 *
 * Module-scoped flag ensures it only plays ONCE:
 *  - While browsing the SPA (client-side navigation) it does NOT replay.
 *  - On a full page refresh, or closing & reopening the tab (a new page
 *    load), the module reloads and it plays again.
 *
 * Browser autoplay policies: modern browsers block autoplay-with-sound on a
 * fresh visit until the user has interacted with the page. To guarantee the
 * visitor always hears the voice we do three things:
 *  1. Try to autoplay immediately (works once the browser trusts the site).
 *  2. If the browser blocks it, play on the very first click/tap/keystroke.
 *  3. If it is blocked, also show a small floating button so the visitor
 *     knows a welcome message exists and can trigger it with one tap.
 */
let welcomeHasPlayed = false;

export function WelcomeAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (welcomeHasPlayed) return;
    welcomeHasPlayed = true;

    const audio = new Audio(WELCOME_AUDIO_URL);
    audio.preload = "auto";
    audioRef.current = audio;

    let cancelled = false;
    let played = false;

    const markPlayed = () => {
      if (played) return;
      played = true;
      setShowPrompt(false);
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
      window.removeEventListener("touchstart", onFirstInteraction);
    };

    const onFirstInteraction = () => {
      if (cancelled) return;
      audio.play().then(markPlayed).catch(() => {});
    };

    const cleanup = () => {
      cancelled = true;
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
      window.removeEventListener("touchstart", onFirstInteraction);
      audio.pause();
      audio.src = "";
    };

    // 1) Try to autoplay immediately.
    const autoplayAttempt = audio.play();
    if (autoplayAttempt !== undefined) {
      autoplayAttempt.then(markPlayed).catch(() => {
        if (cancelled) return;
        // 2) Autoplay blocked → play on the first real user gesture.
        window.addEventListener("pointerdown", onFirstInteraction);
        window.addEventListener("keydown", onFirstInteraction);
        window.addEventListener("touchstart", onFirstInteraction);
        // 3) And surface a tap-to-play button so it is never a mystery.
        setShowPrompt(true);
      });
    }

    return cleanup;
  }, []);

  if (!showPrompt) return null;

  return (
    <button
      type="button"
      onClick={() => {
        // The click itself is a user gesture, so playback is allowed now.
        const audio = audioRef.current ?? new Audio(WELCOME_AUDIO_URL);
        audioRef.current = audio;
        audio.play().catch(() => {});
        setShowPrompt(false);
      }}
      className="fixed bottom-4 right-4 z-[9999] flex animate-pulse items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur transition-colors hover:bg-black/90"
    >
      <span className="text-base leading-none" aria-hidden="true">🔊</span>
      Tap to hear the welcome message
    </button>
  );
}

