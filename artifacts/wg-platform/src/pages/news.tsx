import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useListNews } from "@workspace/api-client-react";

type Category = "tournament" | "community" | "esports" | "federation" | undefined;

const catColors: Record<string, string> = {
  tournament: "bg-primary/10 text-primary border-primary/30",
  community: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  esports: "bg-orange-500/10 text-orange-400 border-orange-500/30",
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
    { label: "Esports", value: "esports" },
    { label: "Federation", value: "federation" },
  ];

  return (
    <div className="container mx-auto px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-10">
          <p className="text-primary text-xs font-bold uppercase tracking-widest mb-2">Updates</p>
          <h1 className="text-5xl font-black uppercase tracking-tight">News</h1>
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-border pb-4">
          {cats.map((c) => (
            <button
              key={c.label}
              onClick={() => setCategory(c.value)}
              className={`px-4 py-2 text-sm font-bold uppercase tracking-wider rounded-md transition-all duration-200
                ${category === c.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
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
                <div className="rounded-xl border border-primary/30 bg-card p-8 mb-8 hover:border-primary/60 transition-all duration-300 cursor-pointer group">
                  <Badge className={`mb-4 text-[10px] uppercase tracking-widest ${catColors[featured.category] ?? ""}`}>
                    Featured — {featured.category}
                  </Badge>
                  <h2 className="text-3xl font-black group-hover:text-primary transition-colors mb-3">{featured.title}</h2>
                  {featured.excerpt && <p className="text-muted-foreground text-lg">{featured.excerpt}</p>}
                  <p className="text-xs text-muted-foreground mt-4">
                    {featured.authorName && `By ${featured.authorName} — `}
                    {new Date(featured.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </Link>
            )}

            {/* Article grid */}
            <div className="grid md:grid-cols-3 gap-4">
              {(rest ?? news ?? []).map((article, i) => (
                <motion.div key={article.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Link href={`/news/${article.id}`}>
                    <div className="rounded-xl border border-border bg-card p-6 hover:border-primary/40 transition-all duration-300 cursor-pointer h-full flex flex-col gap-3 group">
                      <Badge className={`self-start text-[10px] uppercase tracking-widest ${catColors[article.category] ?? ""}`}>
                        {article.category}
                      </Badge>
                      <h3 className="font-black text-lg leading-tight group-hover:text-primary transition-colors flex-1">
                        {article.title}
                      </h3>
                      {article.excerpt && (
                        <p className="text-muted-foreground text-sm line-clamp-2">{article.excerpt}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(article.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
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
