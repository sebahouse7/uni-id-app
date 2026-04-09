// ─── Carga automática de .env — DEBE ser el primer import ───────────────────
import "dotenv/config";

import app from "./app";
import { logger } from "./lib/logger";
import { checkSmtpOnStartup } from "./lib/email";
import { runMigration } from "./lib/db";
import { runFieldEncryptionMigration } from "./lib/dataMigration";
import { retryPendingTsaRequests } from "./lib/tsa";
import { computeStartupAnchors } from "./lib/dailyAnchor";
import { startAutonomousNode } from "./lib/autonomousNode";

// Puerto: usa PORT del .env o 8080 como default
const port = Math.abs(Number(process.env["PORT"] ?? 8080)) || 8080;

// Run DB schema migration, then progressive field-encryption migration
if (process.env["DATABASE_URL"]) {
  runMigration()
    .then(() => runFieldEncryptionMigration())
    .then(() => {
      // Non-blocking background tasks after migrations
      setImmediate(() => {
        retryPendingTsaRequests().catch((err) =>
          logger.warn({ err }, "[TSA] Startup retry failed")
        );
        computeStartupAnchors().catch((err) =>
          logger.warn({ err }, "[Anchor] Startup anchor failed")
        );
        startAutonomousNode().catch((err) =>
          logger.warn({ err }, "[AutonomousNode] Startup failed")
        );
      });
    })
    .catch((err) => {
      logger.error({ err }, "❌ Migration failed — server starting anyway, DB endpoints may fail");
    });
}

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening");
  logger.info(`\n✅  uni.id API corriendo en http://0.0.0.0:${port}\n   Health: http://0.0.0.0:${port}/`);

  // Validaciones no-bloqueantes — el servidor ya está listo para recibir requests
  if (!process.env["DATABASE_URL"]) {
    logger.warn("⚠️  DATABASE_URL no configurado — endpoints de datos fallarán");
  }
  if (!process.env["JWT_SECRET"]) {
    logger.warn("⚠️  JWT_SECRET no definido — usando valor por defecto (solo desarrollo)");
  }
  if (!process.env["MP_ACCESS_TOKEN"]) {
    logger.warn("MP_ACCESS_TOKEN not set — MercadoPago payments disabled");
  }
  if (!process.env["MP_WEBHOOK_SECRET"]) {
    logger.warn("MP_WEBHOOK_SECRET not set — webhook verification disabled");
  }
  if (!process.env["STRIPE_SECRET_KEY"]) {
    logger.warn("STRIPE_SECRET_KEY not set — Stripe payments disabled");
  }

  // SMTP check en background — no bloquea el startup
  checkSmtpOnStartup().catch((err) => {
    logger.warn({ err }, "SMTP check failed (non-critical)");
  });
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
