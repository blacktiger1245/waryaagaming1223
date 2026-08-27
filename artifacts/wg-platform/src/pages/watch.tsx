import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { motion } from "framer-motion";
import { Radio, Play, Loader2, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { fetchBroadcast, watchBroadcast, type WatchHandle } from "@/lib/live";

type WatchStatus = "idle" | "connecting" | "live" | "ended" | "error";

export default function WatchPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";

  const { data: broadcast, isLoading } = useQuery({
    queryKey: ["live-broadcast", id],
    queryFn: () => fetchBroadcast(id),
    staleTime: 10_000,
    retry: false,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const watchRef = useRef<WatchHandle | null>(null);
  const [status, setStatus] = useState<WatchStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      watchRef.current?.close();
      watchRef.current = null;
    };
  }, []);

  function startWatching() {
    const video = videoRef.current;
    if (!video || !broadcast) return;
    setStatus("connecting");
    setError(null);
    const handle = watchBroadcast(broadcast.id, video, (s, e) => {
      if (s === "live") {
        setStatus("live");
        void video.play().catch(() => undefined);
      } else if (s === "ended") {
        setStatus("ended");
        watchRef.current = null;
      } else if (s === "error") {
        setStatus("error");
        setError(e ?? "Failed to watch this broadcast.");
        watchRef.current = null;
      } else {
        setStatus("connecting");
      }
    });
    watchRef.current = handle;
  }

  function stopWatching() {
    watchRef.current?.close();
    watchRef.current = null;
    setStatus("idle");
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {
        /* ignore */
      }
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Finding live stream…
        </div>
      </div>
    );
  }

  if (!broadcast) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Radio className="w-14 h-14 mx-auto text-zinc-600 mb-4" />
        <h1 className="text-2xl font-black text-white mb-2">Stream Not Found</h1>
        <p className="text-muted-foreground text-sm mb-6">This broadcast has ended or is no longer available.</p>
        <Button asChild>
          <Link href="/live">Back to Live</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 live-pulse" />
            <span className="text-red-400 text-xs font-black uppercase tracking-widest">Live</span>
            <h1 className="text-xl font-black text-white">Match Sheet</h1>
            {broadcast.tournamentName && <span className="text-sm text-muted-foreground">· {broadcast.tournamentName}</span>}
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/live">All Live</Link>
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Video column */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl overflow-hidden border border-red-500/30 bg-black aspect-video relative">
              <video ref={videoRef} autoPlay playsInline controls muted className="w-full h-full object-contain" />
{status === "idle" || status === "connecting" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
                  {status === "connecting" ? (
                    <>
                      <Loader2 className="w-10 h-10 text-red-400 animate-spin mb-3" />
                      <p className="text-white font-bold">Connecting to broadcaster…</p>
                      <p className="text-zinc-400 text-sm mt-1">This can take a few seconds.</p>
                    </>
                  ) : (
                    <>
                      <MonitorPlay className="w-12 h-12 text-zinc-500 mb-4" />
                      <h2 className="text-xl font-black text-white mb-2 text-center">
                        {broadcast.participant1Name ?? "Team A"} vs {broadcast.participant2Name ?? "Team B"}
                      </h2>
                      <p className="text-zinc-400 text-sm mb-6 max-w-sm text-center">
                        Streaming live by <span className="text-red-400 font-bold">{broadcast.broadcasterName}</span>. Click
                        Watch Now to view their shared screen.
                      </p>
                      <Button onClick={startWatching} className="gap-2 px-8 py-3 text-base">
                        <Play className="w-5 h-5" /> Watch Now
                      </Button>
                    </>
                  )}
                </div>
              ) : null}

              {status === "ended" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                  <Radio className="w-12 h-12 text-zinc-600 mb-3" />
                  <p className="text-white font-bold">Broadcast ended</p>
                  <p className="text-zinc-400 text-sm mt-1">The broadcaster closed their stream.</p>
                </div>
              )}

              {status === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-6">
                  <p className="text-white font-bold mb-1">Could not connect</p>
                  <p className="text-zinc-400 text-sm text-center">{error}</p>
                </div>
              )}
            </div>

            {status !== "idle" && (
              <div className="flex justify-end mt-4">
                <Button variant="outline" size="sm" onClick={stopWatching} className="gap-2 border-red-500/30 text-red-400 hover:border-red-500">
                  <Radio className="w-4 h-4" /> Leave Stream
                </Button>
              </div>
            )}
          </div>

          {/* Details column */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Live Match Guide</p>
              <div className="flex items-center justify-between mb-4">
                <p className="text-lg font-black text-right flex-1">{broadcast.participant1Name ?? "TBD"}</p>
                <span className="text-lg font-black text-muted-foreground px-3">VS</span>
                <p className="text-lg font-black flex-1">{broadcast.participant2Name ?? "TBD"}</p>
              </div>
              <div className="border-t border-border pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Broadcaster</span>
                  <span className="font-bold text-red-400 flex items-center gap-1">
                    <Radio className="w-3.5 h-3.5" /> {broadcast.broadcasterName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Round</span>
                  <span className="font-bold">{broadcast.roundName ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tournament</span>
                  <span className="font-bold text-right">{broadcast.tournamentName ?? "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}