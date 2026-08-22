import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetNews } from "@workspace/api-client-react";

const catColors: Record<string, string> = {
  tournament: "bg-primary/10 text-primary border-primary/30",
  community: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  esports: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  federation: "bg-purple-500/10 text-purple-400 border-purple-500/30",
};

export default function NewsDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: article, isLoading } = useGetNews(id);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Skeleton className="h-8 w-32 mb-8" />
        <Skeleton className="h-12 w-full mb-4" />
        <Skeleton className="h-4 w-48 mb-8" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground">Article not found</p>
        <Button variant="ghost" className="mt-4" asChild><Link href="/news">Back</Link></Button>
      </div>
    );
  }

  const hasCover = (article as any).imageUrl;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Button variant="ghost" size="sm" className="mb-4 gap-2 text-muted-foreground" asChild>
          <Link href="/news"><ArrowLeft className="w-4 h-4" /> News</Link>
        </Button>

        <div className="wg-hero px-6 py-8 mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge className={`text-[10px] uppercase tracking-widest ${catColors[article.category] ?? ""}`}>
              {article.category}
            </Badge>
            <span className="wg-chip">Story</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black leading-tight mb-3">{article.title}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {article.authorName && <span>By <strong className="text-foreground">{article.authorName}</strong></span>}
            <span>•</span>
            <span>{new Date(article.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
          </div>
        </div>

        {hasCover && (
          <div className="mb-6 overflow-hidden rounded-2xl border border-border">
            <img src={(article as any).imageUrl} alt={article.title} className="w-full max-h-80 object-cover" />
          </div>
        )}

        <article className="rounded-2xl border border-border bg-card/50 p-6 md:p-8">
          {article.excerpt && (
            <p className="text-xl text-muted-foreground mb-6 font-medium leading-relaxed border-l-2 border-[var(--acc)] pl-4">
              {article.excerpt}
            </p>
          )}

          <div className="prose prose-invert prose-lg max-w-none">
            {article.content.split("\n").map((para, i) => (
              para.trim() ? <p key={i} className="text-foreground/80 leading-relaxed mb-4">{para}</p> : null
            ))}
          </div>
        </article>
      </motion.div>
    </div>
  );
}
