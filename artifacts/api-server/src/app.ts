import express, { type Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { createReadStream, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app: Express = express();

// ─── CORS — DEBE ir PRIMERO, antes que Helmet y rate limiting ─────────────────
const corsOptions: cors.CorsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "X-Device-Name", "X-Device-Platform"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options("/{*path}", cors(corsOptions));

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.set("trust proxy", 1);

// ─── Rate limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intentá en unos minutos." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Demasiados intentos de autenticación." },
});

app.use(globalLimiter);
app.use("/api/auth", authLimiter);

// ─── Logging ──────────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);

// ─── Body parsing ─────────────────────────────────────────────────────────────
// Raw body for webhook signature verification (must come before express.json)
app.use("/api/subscriptions/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// ─── Root healthcheck — Railway/proxy require HTTP 200 on "/" ─────────────────
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "uni.id API", version: "1.1.0" });
});

// ─── Temp: serve compiled files for Railway bootstrap ───────────────────────
function serveDeployFile(relPath: string, contentType: string) {
  return (_req: Request, res: Response) => {
    const abs = join("/home/runner/workspace/deploy/railway-api", relPath);
    try {
      const stat = statSync(abs);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", stat.size);
      res.setHeader("Cache-Control", "no-cache");
      createReadStream(abs).pipe(res);
    } catch {
      res.status(404).json({ error: "file not found", path: relPath });
    }
  };
}
app.get("/api/dist-server/index.mjs", serveDeployFile("dist/index.mjs", "application/javascript"));
app.get("/api/dist-server/migrate.mjs", serveDeployFile("migrate.mjs", "application/javascript"));
app.get("/api/dist-server/schema.sql", serveDeployFile("schema.sql", "text/plain"));
app.get("/api/dist-server/package.json", serveDeployFile("package.json", "application/json"));

// ─── APK download — public direct link ───────────────────────────────────────
app.get("/api/download/uni-id.apk", (_req: Request, res: Response) => {
  const candidates = [
    join(resolve(__dirname, "../../public"), "uni-id-latest.apk"),
    join(resolve(__dirname, "../../public"), "uni-id-latest.zip"),
    join("/home/runner/workspace/artifacts/api-server/public", "uni-id-latest.apk"),
    join("/home/runner/workspace/artifacts/api-server/public", "uni-id-latest.zip"),
  ];
  for (const p of candidates) {
    try {
      statSync(p);
      const isZip = p.endsWith(".zip");
      res.sendFile(p, {
        headers: {
          "Content-Type": isZip ? "application/zip" : "application/vnd.android.package-archive",
          "Content-Disposition": isZip
            ? 'attachment; filename="uni-id-latest.zip"'
            : 'attachment; filename="uni-id-latest.apk"',
          "Connection": "close",
        },
      });
      return;
    } catch {
      continue;
    }
  }
  res.status(404).json({ error: "APK not available — run a new build to generate it" });
});

// ─── Web frontend (static build) ─────────────────────────────────────────────
const webDistPath = join(resolve(__dirname, "../../.."), "artifacts/uni-web/dist/public");
app.use("/uni-web", express.static(webDistPath, { maxAge: "1h", etag: true }));
app.get("/uni-web/{*path}", (_req: Request, res: Response) => {
  res.sendFile(join(webDistPath, "index.html"));
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api", router);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Error interno del servidor" });
});

export default app;
