import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const configuredOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ALLOWED_ORIGINS ?? "").split(","),
]
  .map(value => value?.trim())
  .filter((value): value is string => Boolean(value))
  .map(normalizeOrigin)
  .filter((value): value is string => Boolean(value));
const allowedOrigins = new Set(configuredOrigins);

if (process.env.NODE_ENV === "production" && allowedOrigins.size === 0) {
  logger.warn("FRONTEND_URL ou CORS_ALLOWED_ORIGINS não configurado; requisições cross-origin serão bloqueadas");
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
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) { callback(null, true); return; }
    const normalized = normalizeOrigin(origin);
    const isLocalDevelopment = process.env.NODE_ENV !== "production"
      && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    callback(null, Boolean(normalized && (allowedOrigins.has(normalized) || isLocalDevelopment)));
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Health check — used by Uptime Robot and the Render keep-alive ping.
// Returns 200 so monitoring tools don't report the service as down.
app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

export default app;
