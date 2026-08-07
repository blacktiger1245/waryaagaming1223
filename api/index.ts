/**
 * Vercel serverless function entry point.
 *
 * Vercel routes all /api/* requests here (see vercel.json rewrites).
 * The Express app mounts everything under API_BASE_PATH (defaults to "/api"),
 * so paths like /api/players, /api/auth/discord, etc. are handled correctly.
 *
 * Required environment variables on Vercel:
 *   DATABASE_URL          — PostgreSQL connection string
 *   SESSION_SECRET        — Secret for signing session cookies
 *   DISCORD_CLIENT_ID     — Discord OAuth application ID
 *   DISCORD_CLIENT_SECRET — Discord OAuth application secret
 *   BASE_URL              — Your Vercel deployment URL, e.g. https://your-app.vercel.app
 *
 * Optional environment variables:
 *   R2_ENDPOINT           — Cloudflare R2 endpoint URL (if using object storage)
 *   R2_ACCESS_KEY_ID      — R2 access key ID
 *   R2_SECRET_ACCESS_KEY  — R2 secret access key
 *   R2_BUCKET_NAME        — R2 bucket name
 *   PUBLIC_OBJECT_SEARCH_PATHS — Comma-separated public R2 path prefixes
 *   LOG_LEVEL             — Pino log level (default: "info")
 */
import app from "../artifacts/api-server/src/app.js";

export default app;
