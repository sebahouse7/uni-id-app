// ─── Carga automática de .env — DEBE ser el primer import ───────────────────
import "dotenv/config";

import app from "./app";
import { logger } from "./lib/logger";
import { checkSmtpOnStartup } from "./lib/email";

// Puerto: usa PORT del .env o 8080 como default
const port = Math.abs(Number(process.env["PORT"] ?? 8080)) || 8080;

app.listen(port, "0.0.0.0", async () => {
  logger.info({ port }, "Server listening");

  // Validaciones de variables de entorno (advertencias, no crashes)
  if (!process.env["DATABASE_URL"]) {
    logger.error(
      "❌  DATABASE_URL no está definido en .env\n" +
      "   Creá el archivo artifacts/api-server/.env con DATABASE_URL=postgresql://...\n" +
      "   Ver artifacts/api-server/.env.example para referencia."
    );
  }

  if (!process.env["JWT_SECRET"]) {
    logger.warn("⚠️  JWT_SECRET no definido — se usa valor por defecto de desarrollo (inseguro para producción)");
  }

  await checkSmtpOnStartup();

  if (!process.env["MP_ACCESS_TOKEN"]) {
    logger.warn("MP_ACCESS_TOKEN not set — MercadoPago payments disabled");
  }
  if (!process.env["MP_WEBHOOK_SECRET"]) {
    logger.warn("MP_WEBHOOK_SECRET not set — webhook signature verification disabled");
  }
  if (!process.env["STRIPE_SECRET_KEY"]) {
    logger.warn("STRIPE_SECRET_KEY not set — Stripe payments disabled");
  }

  logger.info(`\n✅  API corriendo en http://localhost:${port}\n   Documentación: http://localhost:${port}/api/health`);
});
