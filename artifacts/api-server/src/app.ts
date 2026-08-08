import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import router from "./routes";
import authRouter from "./routes/auth";
import adminRouter from "./routes/admin";
import { logger } from "./lib/logger";
import { banCheck } from "./middleware/ban-check";

const PgStore = connectPgSimple(session);

const app: Express = express();

app.set("trust proxy", 1);

const configuredFrontendOrigins = (process.env["FRONTEND_ORIGINS"] ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

function requestOrigin(req: import("express").Request): string | null {
  const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined)
    ?.split(",")[0]?.trim();
  const protocol = forwardedProto ?? req.protocol;
  const host = req.get("host");
  return host ? `${protocol}://${host}` : null;
}

function isTrustedOrigin(req: import("express").Request, origin?: string): boolean {
  if (!origin) return true;
  return configuredFrontendOrigins.includes(origin) || origin === requestOrigin(req);
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use((req, res, next) => {
  const origin = req.get("origin");
  // No Origin header is normal for same-origin navigations, server-to-server
  // calls, and health checks. Any browser request with an Origin header must
  // be explicitly trusted before it receives credentialed CORS headers.
  if (origin && !isTrustedOrigin(req, origin)) {
    return res.status(403).json({ error: "Untrusted request origin" });
  }

  return cors({
    origin: origin || false,
    credentials: true,
  })(req, res, next);
});

// Keep image bodies as Buffers for the direct upload endpoint. JSON requests
// continue through the normal parser below.
app.use(express.raw({ type: ["image/*", "application/octet-stream"], limit: "10mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new PgStore({
      conString: process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"],
      tableName: "user_sessions",
      createTableIfMissing: false,
    }),
    secret: process.env["SESSION_SECRET"] ?? "wg-dev-secret",
    name: "wg.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production" || process.env["COOKIE_SAME_SITE"] === "none",
      sameSite: (process.env["COOKIE_SAME_SITE"] as "lax" | "strict" | "none" | undefined) ?? "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

// The API prefix this server is proxied under. On Replit, path-based routing
// exposes this service at /api (see artifact.toml `paths`), so it defaults to
// "/api" and the frontend calls `/api/...`. Other hosts (Vercel/Railway/
// Render/VPS) can set API_BASE_PATH="" to serve everything at the domain root.
const API_PREFIX = (process.env["API_BASE_PATH"] ?? "/api").replace(/\/$/, "");

// Reject mutations from banned accounts (runs before all route handlers)
app.use(API_PREFIX, banCheck);

app.use(API_PREFIX, authRouter);
app.use(API_PREFIX, adminRouter);
app.use(API_PREFIX, router);

// Also expose the plain (unprefixed) /auth/discord, /auth/discord/callback,
// and /logout routes at the domain root, matching the literal route names
// most OAuth setups expect. On Replit these aren't reachable through the
// proxy (only API_PREFIX is routed there), but they work out of the box on
// any host that doesn't use path-based service routing.
if (API_PREFIX !== "") {
  app.use(authRouter);
}

export default app;
