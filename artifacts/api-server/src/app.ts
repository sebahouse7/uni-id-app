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

// ─── Términos de Servicio y Privacidad (público) ─────────────────────────────
const LEGAL_HTML = (title: string, body: string) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — uni.iD</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0A0F1E;color:#E2E8F0;padding:40px 20px;max-width:760px;margin:0 auto}
  h1{font-size:2rem;font-weight:700;background:linear-gradient(135deg,#1A6FE8,#7C3AED);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
  .sub{color:#94A3B8;font-size:.9rem;margin-bottom:40px}
  h2{font-size:1.1rem;font-weight:600;color:#CBD5E1;margin:28px 0 10px}
  p,li{color:#94A3B8;font-size:.95rem;line-height:1.7;margin-bottom:8px}
  ul{padding-left:20px}
  a{color:#1A6FE8;text-decoration:none}
  .logo{display:flex;align-items:center;gap:8px;margin-bottom:32px}
  .dot{width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,#1A6FE8,#7C3AED)}
  footer{margin-top:60px;padding-top:20px;border-top:1px solid #1E293B;color:#475569;font-size:.8rem}
</style></head><body>
<div class="logo"><div class="dot"></div><strong style="color:#E2E8F0;font-size:1.1rem">uni.iD</strong></div>
<h1>${title}</h1>
<p class="sub">human.id labs S.A.S. · Última actualización: abril 2026</p>
${body}
<footer>© 2026 human.id labs S.A.S. · <a href="/terms">Términos</a> · <a href="/privacy">Privacidad</a> · <a href="mailto:legal@uni-id.app">legal@uni-id.app</a></footer>
</body></html>`;

app.get("/terms", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(LEGAL_HTML("Términos de Servicio", `
<h2>1. Aceptación</h2>
<p>Al utilizar uni.iD (la "App"), operada por human.id labs S.A.S. ("nosotros"), aceptás estos Términos de Servicio. Si no estás de acuerdo, no uses la App.</p>
<h2>2. Descripción del servicio</h2>
<p>uni.iD es una billetera de identidad digital que permite almacenar, cifrar y compartir documentos de identidad personales y empresariales mediante tecnología criptográfica.</p>
<h2>3. Uso aceptable</h2>
<ul>
  <li>Debés ser mayor de 18 años para usar el servicio.</li>
  <li>No podés usar la App para actividades fraudulentas, ilegales o que violen derechos de terceros.</li>
  <li>Sos responsable de mantener la confidencialidad de tu PIN y credenciales biométricas.</li>
</ul>
<h2>4. Verificación de identidad</h2>
<p>Los documentos marcados como "Verificado" pasaron por un proceso de verificación biométrica. Los documentos "Sin verificar" son cargados por el usuario y no han sido validados por nosotros.</p>
<h2>5. Seguridad y cifrado</h2>
<p>Todos los documentos se almacenan cifrados con AES-256-GCM en el dispositivo del usuario. No tenemos acceso a los archivos cifrados ni a las claves de descifrado.</p>
<h2>6. Suscripciones</h2>
<p>El Plan Empresa requiere una suscripción de pago procesada mediante PayPal. Los documentos personales son gratuitos para todos los usuarios. Las suscripciones pueden cancelarse en cualquier momento.</p>
<h2>7. Limitación de responsabilidad</h2>
<p>La App se provee "tal cual". No garantizamos disponibilidad ininterrumpida. No somos responsables por pérdidas derivadas del uso indebido de credenciales o acceso no autorizado al dispositivo.</p>
<h2>8. Modificaciones</h2>
<p>Podemos modificar estos términos con 30 días de aviso previo. El uso continuado implica aceptación de los cambios.</p>
<h2>9. Jurisdicción</h2>
<p>Estos términos se rigen por las leyes de la República Argentina. Cualquier disputa se someterá a los tribunales ordinarios de la Ciudad Autónoma de Buenos Aires.</p>
<h2>10. Contacto</h2>
<p>Consultas legales: <a href="mailto:legal@uni-id.app">legal@uni-id.app</a></p>
`));
});

app.get("/privacy", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(LEGAL_HTML("Política de Privacidad", `
<h2>1. Responsable del tratamiento</h2>
<p>human.id labs S.A.S., operador de uni.iD. Contacto: <a href="mailto:privacy@uni-id.app">privacy@uni-id.app</a></p>
<h2>2. Datos que recopilamos</h2>
<ul>
  <li><strong>Datos de cuenta:</strong> nombre, email, fecha de registro.</li>
  <li><strong>Documentos:</strong> almacenados cifrados en tu dispositivo. No los procesamos ni almacenamos en nuestros servidores.</li>
  <li><strong>Datos de verificación KYC:</strong> procesados por Didit (didit.me) bajo sus propias políticas de privacidad.</li>
  <li><strong>Registros de actividad:</strong> timestamps de accesos y compartición de identidad (sin contenido de documentos).</li>
</ul>
<h2>3. Finalidad del tratamiento</h2>
<ul>
  <li>Proveer el servicio de billetera de identidad digital.</li>
  <li>Verificar la identidad de usuarios que soliciten verificación de documentos.</li>
  <li>Gestionar suscripciones y pagos.</li>
  <li>Garantizar la seguridad de la plataforma.</li>
</ul>
<h2>4. Base legal</h2>
<p>El tratamiento se basa en el consentimiento del usuario (Ley 25.326 de Protección de Datos Personales, Argentina) y en la ejecución del contrato de servicio.</p>
<h2>5. Compartición de datos</h2>
<p>No vendemos datos personales. Compartimos datos únicamente con: Didit (verificación KYC), PayPal (procesamiento de pagos) y proveedores de infraestructura (Railway, bajo acuerdos de confidencialidad).</p>
<h2>6. Tus derechos</h2>
<p>Podés acceder, rectificar, eliminar o portar tus datos escribiendo a <a href="mailto:privacy@uni-id.app">privacy@uni-id.app</a>. Respondemos en un plazo máximo de 30 días hábiles.</p>
<h2>7. Retención de datos</h2>
<p>Los datos de cuenta se retienen mientras la cuenta esté activa. Al eliminar la cuenta, los datos se borran en un plazo de 30 días, excepto los requeridos por obligaciones legales.</p>
<h2>8. Seguridad</h2>
<p>Utilizamos cifrado AES-256-GCM para documentos, TLS 1.3 en todas las comunicaciones y autenticación biométrica o PIN para acceso local.</p>
`));
});

// ─── Web frontend (static build) ─────────────────────────────────────────────
// On Railway: __dirname = /app/dist → web files at /app/web
const webDistPath = join(__dirname, "../web");
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
