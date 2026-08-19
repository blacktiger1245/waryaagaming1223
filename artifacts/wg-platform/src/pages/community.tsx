import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, MessageCircle, Trash2, Send, Users2, X, Loader2, Image, Video,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { storageUrl } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Post {
  id: number;
  authorId: number;
  content: string;
  imageUrl: string | null;
  videoUrl?: string | null;
  createdAt: string;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  authorVerified?: boolean;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

interface Comment {
  id: number;
  postId: number;
  authorId: number;
  content: string;
  createdAt: string;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  authorVerified?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string) => `${BASE}${path}`;
const VERIFIED_SRC = `${BASE}/verified.png`;

async function uploadCommunityFile(file: File) {
  // Upload through the API (server→R2) rather than a browser→R2 presigned PUT.
  // This avoids R2 bucket-CORS blocks that surface as "Failed to fetch".
  const res = await fetch(api("/api/storage/uploads/community-media/direct"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const data: { objectPath?: string; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.objectPath !== "string" || !data.objectPath) {
    throw new Error(data.error ?? "Failed to upload media");
  }
  return data.objectPath; // e.g. "/objects/<uuid>"
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${Math.max(s, 1)}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Avatar({ url, name, size = "sm" }: { url?: string | null; name?: string | null; size?: "sm" | "md" }) {
  const dims = size === "md" ? "w-10 h-10" : "w-8 h-8";
  const textSize = size === "md" ? "text-sm" : "text-xs";
  const initial = (name ?? "?")[0]?.toUpperCase() ?? "?";
  return (
    <div className={`${dims} rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center flex-shrink-0`}>
      {url
        ? <img src={url} alt={name ?? ""} className="w-full h-full object-cover" />
        : <span className={`${textSize} font-black text-zinc-400`}>{initial}</span>}
    </div>
  );
}

// ── Post Composer ─────────────────────────────────────────────────────────────

function PostComposer({ onPost }: { onPost: (post: Post) => void }) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  function setMedia(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.type.startsWith("image/") && !imageFile) {
        setImageFile(f);
        setImagePreview(URL.createObjectURL(f));
      } else if (f.type.startsWith("video/") && !videoFile) {
        setVideoFile(f);
        setVideoPreview(URL.createObjectURL(f));
      }
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      setUploading(true);
      try {
        const [imageUrl, videoUrl] = await Promise.all([
          imageFile ? uploadCommunityFile(imageFile) : Promise.resolve(null),
          videoFile ? uploadCommunityFile(videoFile) : Promise.resolve(null),
        ]);
        const r = await fetch(api("/api/community/posts"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, imageUrl, videoUrl }),
        });
        if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Failed to post"); }
        return r.json() as Promise<Post>;
      } finally {
        setUploading(false);
      }
    },
    onSuccess: (post) => {
      setContent(""); setError("");
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      setImageFile(null); setImagePreview("");
      setVideoFile(null); setVideoPreview("");
      onPost(post);
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex gap-3">
        <Avatar url={user?.avatarUrl} name={user?.displayName ?? user?.username} size="md" />
        <div className="flex-1 min-w-0">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share something with the community…"
            rows={3}
            maxLength={2000}
            className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 resize-none transition-colors"
          />
          <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); setMedia(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className={`mt-2 flex cursor-pointer flex-wrap items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 transition-colors ${dragging ? "border-primary bg-primary/10" : "border-zinc-700 hover:border-primary/50"}`}
            >
              <Image className="h-5 w-5 text-zinc-500" />
              <Video className="h-5 w-5 text-zinc-500" />
              <span className="text-xs text-zinc-400">Drag &amp; drop an image or video, or click to browse</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => setMedia(e.target.files)}
            />
            {(imagePreview || videoPreview) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {imagePreview && (
                  <div className="relative">
                    <img src={imagePreview} alt="attachment" className="h-24 w-24 rounded-xl object-cover border border-zinc-700" />
                    <button
                      onClick={() => { setImageFile(null); setImagePreview(""); }}
                      className="absolute -right-2 -top-2 rounded-full bg-red-500/90 p-0.5 text-white"
                      title="Remove image"
                      type="button"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {videoPreview && (
                  <div className="relative">
                    <video src={videoPreview} muted className="h-24 w-24 rounded-xl object-cover border border-zinc-700" />
                    <button
                      onClick={() => { setVideoFile(null); setVideoPreview(""); }}
                      className="absolute -right-2 -top-2 rounded-full bg-red-500/90 p-0.5 text-white"
                      title="Remove video"
                      type="button"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          {error && (
            <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
              <X className="w-3 h-3" /> {error}
            </p>
          )}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-zinc-600 tabular-nums">{content.length}/2000</span>
            </div>
            <button
              onClick={() => mutation.mutate()}
              disabled={!content.trim() || mutation.isPending || uploading}
              className="flex items-center gap-1.5 text-xs font-black text-black bg-primary hover:bg-primary/90 px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
            >
              {mutation.isPending || uploading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Posting…</>
                : <><Send className="w-3.5 h-3.5" /> Post</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Comment Section ───────────────────────────────────────────────────────────

function CommentSection({
  post, canInteract, isAdmin, viewerUserId,
}: {
  post: Post; canInteract: boolean; isAdmin: boolean; viewerUserId: number | null;
}) {
  const [text, setText] = useState("");
  const qc = useQueryClient();

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ["community-comments", post.id],
    queryFn: async () => {
      const r = await fetch(api(`/api/community/posts/${post.id}/comments`), { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      const r = await fetch(api(`/api/community/posts/${post.id}/comments`), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
      return r.json();
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["community-comments", post.id] });
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: number) => {
      await fetch(api(`/api/community/posts/${post.id}/comments/${commentId}`), {
        method: "DELETE", credentials: "include",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-comments", post.id] });
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
  });

  return (
    <div className="mt-3 pt-3 border-t border-zinc-800/60 space-y-3">
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-zinc-600 py-2 text-center">No comments yet</p>
      ) : (
        <div className="space-y-2.5">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2.5 group">
              <Avatar url={c.authorAvatarUrl} name={c.authorDisplayName ?? c.authorUsername} />
              <div className="flex-1 min-w-0">
                <div className="bg-zinc-800/60 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-black text-white truncate">
                      {c.authorDisplayName ?? c.authorUsername ?? "Unknown"}
                    </span>
                    {c.authorVerified && <img src={VERIFIED_SRC} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" draggable={false} />}
                    <span className="text-[10px] text-zinc-500 shrink-0">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-zinc-300 break-words leading-relaxed">{c.content}</p>
                </div>
              </div>
              {(isAdmin || c.authorId === viewerUserId) && (
                <button
                  onClick={() => deleteComment.mutate(c.id)}
                  disabled={deleteComment.isPending}
                  className="opacity-0 group-hover:opacity-100 self-center p-1 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-all disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canInteract && (
        <div className="flex gap-2.5">
          <div className="w-8 flex-shrink-0" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && text.trim()) { e.preventDefault(); addComment.mutate(); }
            }}
            placeholder="Add a comment…"
            maxLength={1000}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 transition-colors"
          />
          <button
            onClick={() => { if (text.trim()) addComment.mutate(); }}
            disabled={!text.trim() || addComment.isPending}
            className="p-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-colors disabled:opacity-40"
          >
            {addComment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Post Card ─────────────────────────────────────────────────────────────────

function PostCard({
  post, isAdmin, viewerUserId, canInteract,
}: {
  post: Post; isAdmin: boolean; viewerUserId: number | null; canInteract: boolean;
}) {
  const [showComments, setShowComments] = useState(false);
  const qc = useQueryClient();

  const toggleLike = useMutation({
    mutationFn: async () => {
      const r = await fetch(api(`/api/community/posts/${post.id}/likes`), { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<{ liked: boolean }>;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["community-posts"] });
      const prev = qc.getQueryData<Post[]>(["community-posts"]);
      qc.setQueryData<Post[]>(["community-posts"], (old) =>
        old?.map((p) => p.id === post.id
          ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likedByMe ? p.likeCount - 1 : p.likeCount + 1 }
          : p),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["community-posts"], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["community-posts"] }),
  });

  const deletePost = useMutation({
    mutationFn: async () => {
      await fetch(api(`/api/community/posts/${post.id}`), { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-posts"] }),
  });

  const displayName = post.authorDisplayName ?? post.authorUsername ?? "Unknown";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22 }}
      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5"
    >
      <div className="flex items-start gap-3 mb-3">
        <Avatar url={post.authorAvatarUrl} name={displayName} size="md" />
        <div className="flex-1 min-w-0">
          <p className="flex items-center gap-1 text-sm font-black text-white leading-tight">
            <span className="truncate">{displayName}</span>
            {post.authorVerified && <img src={VERIFIED_SRC} alt="" className="h-4 w-4 shrink-0 object-contain" draggable={false} />}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">{timeAgo(post.createdAt)}</p>
        </div>
        {(isAdmin || post.authorId === viewerUserId) && (
          <button
            onClick={() => deletePost.mutate()}
            disabled={deletePost.isPending}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-all disabled:opacity-40"
            title="Delete post"
          >
            {deletePost.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      <p className="text-sm text-zinc-200 whitespace-pre-wrap break-words leading-relaxed mb-3">
        {post.content}
      </p>

      {post.videoUrl && (
        <div className="mb-3 rounded-xl overflow-hidden border border-zinc-800 bg-black">
          <video
            src={storageUrl(post.videoUrl)}
            poster={storageUrl(post.imageUrl) ?? undefined}
            controls
            preload="metadata"
            className="w-full max-h-[480px] object-contain"
          />
        </div>
      )}
      {post.imageUrl && !post.videoUrl && (
        <div className="mb-3 rounded-xl overflow-hidden border border-zinc-800">
          <img src={storageUrl(post.imageUrl) ?? post.imageUrl} alt="Post attachment" className="w-full max-h-[480px] object-cover" loading="lazy" />
        </div>
      )}

      <div className="flex items-center gap-5 pt-2.5 border-t border-zinc-800/60">
        <button
          onClick={() => { if (canInteract) toggleLike.mutate(); }}
          disabled={!canInteract || toggleLike.isPending}
          className={`flex items-center gap-1.5 text-xs font-bold transition-colors
            ${!canInteract ? "cursor-default" : ""}
            ${post.likedByMe ? "text-red-400" : "text-zinc-500 hover:text-red-400"}`}
          title={canInteract ? (post.likedByMe ? "Unlike" : "Like") : "Sign in to like"}
        >
          <Heart className={`w-4 h-4 transition-all ${post.likedByMe ? "fill-red-400 scale-110" : ""}`} />
          <span>{post.likeCount}</span>
        </button>
        <button
          onClick={() => setShowComments((v) => !v)}
          className={`flex items-center gap-1.5 text-xs font-bold transition-colors
            ${showComments ? "text-primary" : "text-zinc-500 hover:text-primary"}`}
        >
          <MessageCircle className="w-4 h-4" />
          <span>{post.commentCount}</span>
        </button>
      </div>

      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <CommentSection post={post} canInteract={canInteract} isAdmin={isAdmin} viewerUserId={viewerUserId} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CommunityPage() {
  const { user, isLoggedIn, isAdmin, loginWithDiscord } = useAuth();
  const qc = useQueryClient();

  const { data: posts = [], isLoading } = useQuery<Post[]>({
    queryKey: ["community-posts"],
    queryFn: async () => {
      const r = await fetch(api("/api/community/posts"), { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load posts");
      return r.json();
    },
  });

  const handleNewPost = useCallback(
    (post: Post) => qc.setQueryData<Post[]>(["community-posts"], (old = []) => [post, ...old]),
    [qc],
  );

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-10">
          <p className="text-primary text-xs font-bold uppercase tracking-widest mb-2">Social</p>
          <h1 className="text-5xl font-black uppercase tracking-tight">Community</h1>
          <p className="text-muted-foreground mt-2 text-sm">What's happening in the Waryaa Gaming community</p>
        </div>

        <div className="mb-6">
          {isLoggedIn ? (
            <PostComposer onPost={handleNewPost} />
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
              <Users2 className="w-10 h-10 mx-auto text-zinc-600 mb-3" />
              <p className="text-sm font-bold text-zinc-300 mb-1">Join the conversation</p>
              <p className="text-xs text-zinc-500 mb-5">Sign in with Discord to post, like, and comment</p>
              <button
                onClick={loginWithDiscord}
                className="inline-flex items-center gap-2 text-sm font-black text-white bg-[#5865F2] hover:bg-[#4752C4] px-5 py-2.5 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.085.118 18.11.136 18.126a19.888 19.888 0 0 0 5.994 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.995a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                </svg>
                Sign in with Discord
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
                <div className="flex gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="space-y-1.5 flex-1 pt-0.5">
                    <Skeleton className="h-3 w-28 rounded" />
                    <Skeleton className="h-2.5 w-16 rounded" />
                  </div>
                </div>
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-2/3 rounded" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 border border-zinc-800 rounded-2xl">
            <MessageCircle className="w-12 h-12 mx-auto opacity-20 mb-3" />
            <p className="font-bold text-zinc-400">No posts yet</p>
            <p className="text-xs text-zinc-600 mt-1">Be the first to share something</p>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="popLayout" initial={false}>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  isAdmin={isAdmin}
                  viewerUserId={user?.id ?? null}
                  canInteract={isLoggedIn}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );
}
