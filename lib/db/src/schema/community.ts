import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const communityPostsTable = pgTable("community_posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const communityPostLikesTable = pgTable(
  "community_post_likes",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id").notNull(),
    userId: integer("user_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("community_post_likes_post_user").on(t.postId, t.userId)],
);

export const communityPostCommentsTable = pgTable("community_post_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  authorId: integer("author_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CommunityPost = typeof communityPostsTable.$inferSelect;
export type CommunityPostLike = typeof communityPostLikesTable.$inferSelect;
export type CommunityPostComment = typeof communityPostCommentsTable.$inferSelect;
