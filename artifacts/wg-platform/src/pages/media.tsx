import { useState } from "react";
import { motion } from "framer-motion";
import { PlaySquare, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useListMedia } from "@workspace/api-client-react";

type Platform = "youtube" | "tiktok" | "facebook" | "instagram" | undefined;

const platformColors: Record<string, string> = {
  youtube: "bg-red-500/10 text-red-400 border-red-500/30",
  tiktok: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  facebook: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  instagram: "bg-pink-500/10 text-pink-400 border-pink-500/30",
};

const platformIcons: Record<string, string> = {
  youtube: "YT",
  tiktok: "TK",
  facebook: "FB",
  instagram: "IG",
};

export default function MediaPage() {
  const [platform, setPlatform] = useState<Platform>(undefined);
  const { data: media, isLoading } = useListMedia(platform ? { platform, limit: 20 } : { limit: 20 });

  const platforms: { label: string; value: Platform }[] = [
    { label: "All", value: undefined },
    { label: "YouTube", value: "youtube" },
    { label: "TikTok", value: "tiktok" },
    { label: "Facebook", value: "facebook" },
    { label: "Instagram", value: "instagram" },
  ];

  return (
    <div className="container mx-auto px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-10">
          <p className="text-primary text-xs font-bold uppercase tracking-widest mb-2">Watch</p>
          <h1 className="text-5xl font-black uppercase tracking-tight">Media Hub</h1>
        </div>

        {/* Platform filter */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-border pb-4">
          {platforms.map((p) => (
            <button
              key={p.label}
              onClick={() => setPlatform(p.value)}
              className={`px-4 py-2 text-sm font-bold uppercase tracking-wider rounded-md transition-all duration-200
                ${platform === p.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : media?.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground border border-border rounded-xl">
            <PlaySquare className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-bold">No media found</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {media?.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                {item.platform === "youtube" ? (
                  <div className="rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 transition-all duration-300 group">
                    <div className="relative" style={{ paddingBottom: "56.25%" }}>
                      <iframe
                        src={item.embedUrl}
                        className="absolute inset-0 w-full h-full"
                        title={item.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                    <div className="p-4">
                      <Badge className={`mb-2 text-[10px] uppercase tracking-widest ${platformColors[item.platform]}`}>
                        {platformIcons[item.platform]} YouTube
                      </Badge>
                      <h3 className="font-bold text-sm line-clamp-2 group-hover:text-primary transition-colors">{item.title}</h3>
                    </div>
                  </div>
                ) : (
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    <div className="rounded-xl border border-border bg-card p-6 hover:border-primary/40 transition-all duration-300 cursor-pointer group h-full flex flex-col gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg"
                        style={{
                          background: item.platform === "tiktok" ? "rgba(139,92,246,0.1)" : item.platform === "facebook" ? "rgba(59,130,246,0.1)" : "rgba(236,72,153,0.1)"
                        }}>
                        <span className={platformColors[item.platform]?.split(" ")[1]}>
                          {platformIcons[item.platform]}
                        </span>
                      </div>

                      <Badge className={`self-start text-[10px] uppercase tracking-widest ${platformColors[item.platform] ?? ""}`}>
                        {item.platform}
                      </Badge>

                      <h3 className="font-bold leading-tight group-hover:text-primary transition-colors flex-1">{item.title}</h3>

                      {item.description && (
                        <p className="text-muted-foreground text-sm line-clamp-2">{item.description}</p>
                      )}

                      <div className="flex items-center gap-1 text-xs text-primary mt-auto">
                        <ExternalLink className="w-3 h-3" />
                        View on {item.platform}
                      </div>
                    </div>
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
