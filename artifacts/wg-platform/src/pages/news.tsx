import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useListNews } from "@workspace/api-client-react";

type Category = "tournament" | "community" | "federation" | undefined;

const catColors: Record<string, string> = {
  tournament: "bg-primary/10 text-primary border-primary/30",
  community: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  federation: "bg-purple-500/10 text-purple-400 border-purple-500/30",
};

export default function NewsPage() {
  const [category, setCategory] = useState<Category>(undefined);
  const { data: news, isLoading } = useListNews(category ? { category, limit: 20 } : { limit: 20 });

  const featured = news?.find((a) => a.isFeatured);
  const rest = news?.filter((a) => !a.isFeatured || !featured);

  const cats: { label: string; value: Category }[] = [
    { label: "All", value: undefined },
    { label: "Tournament", value: "tournament" },
    { label: "Community", value: "community" },
    { label: "Federation", value: "federation" },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="wg-hero px-6 py-9 mb-8">
          <span className="wg-eyebrow inline-flex items-center gap-2"><Newspaper className="h-4 w-4" /> Updates</span>
          <h1 className="wg-hero-title text-4xl mt-4">News</h1>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mt-3 max-w-xl">
            The official pulse of Waryaa Gaming — tournament headlines, community stories and federation updates.
          </p>
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Editorial · Filter</span>
          {cats.map((c) => (
            <button
              key={c.label}
              onClick={() => setCategory(c.value)}
              className={`wg-chip transition-all duration-200 ${category === c.value ? "wg-chip-solid" : ""}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : news?.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground border border-border rounded-xl">
            <Newspaper className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-bold">No news found</p>
          </div>
        ) : (
          <>
            {/* Featured */}
            {featured && (
              <Link href={`/news/${featured.id}`}>
                <div className="wg-card wg-lift wg-sheen rounded-xl border border-border bg-card mb-8 overflow-hidden cursor-pointer group">
                  {featured.imageUrl ? (
                    <div className="w-full h-64 overflow-hidden relative">
                      <img src={featured.imageUrl} alt={featured.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-card via-black/30 to-transparent" />
                    </div>
                  ) : (
                    <div className="w-full h-64 bg-muted/30 flex items-center justify-center">
                      <Newspaper className="w-10 h-10 opacity-30" />
                    </div>
                  )}
                  <div className="p-8">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Badge className={`text-[10px] uppercase tracking-widest ${catColors[featured.category] ?? ""}`}>
                        Headline
                      </Badge>
                      <span className="wg-chip">{featured.category}</span>
                    </div>
                    <h2 className="text-3xl font-black group-hover:text-white transition-colors mb-3">{featured.title}</h2>
                    {featured.excerpt && <p className="text-muted-foreground text-lg">{featured.excerpt}</p>}
                    <p className="text-xs text-muted-foreground mt-4">
                      {featured.authorName && <span className="font-semibold mr-1">{featured.authorName}</span>}
                      {featured.authorName && <span className="mr-1">·</span>}
                      {new Date(featured.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
              </Link>
            )}

            {/* Article grid */}
            <div className="grid md:grid-cols-3 gap-4">
              {(rest ?? news ?? []).map((article, i) => (
                <motion.div key={article.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Link href={`/news/${article.id}`}>
                    <div className="wg-card wg-lift wg-sheen rounded-xl border border-border bg-card cursor-pointer h-full flex flex-col group overflow-hidden">
                      {article.imageUrl ? (
                        <div className="w-full h-40 overflow-hidden">
                          <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        </div>
                      ) : (
                        <div className="w-full h-40 bg-muted/30 flex items-center justify-center">
                          <Newspaper className="w-8 h-8 opacity-30" />
                        </div>
                      )}
                      <div className="p-5 flex flex-col gap-2 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <Badge className={`self-start text-[10px] uppercase tracking-widest ${catColors[article.category] ?? ""}`}>
                            {article.category}
                          </Badge>
                        </div>
                        <h3 className="font-black text-lg leading-tight group-hover:text-white transition-colors flex-1">
                          {article.title}
                        </h3>
                        {article.excerpt && (
                          <p className="text-muted-foreground text-sm line-clamp-2">{article.excerpt}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(article.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
