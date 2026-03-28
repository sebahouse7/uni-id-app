import app from "./app";
import { logger } from "./lib/logger";
import { checkSmtpOnStartup } from "./lib/email";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async () => {
  logger.info({ port }, "Server listening");

  await checkSmtpOnStartup();

  if (!process.env["MP_ACCESS_TOKEN"]) {
    logger.warn("MP_ACCESS_TOKEN not set — MercadoPago payments disabled");
  }
  if (!process.env["MP_WEBHOOK_SECRET"]) {
    logger.warn("MP_WEBHOOK_SECRET not set — webhook signature verification disabled (menos seguro)");
  }
  if (!process.env["STRIPE_SECRET_KEY"]) {
    logger.warn("STRIPE_SECRET_KEY not set — Stripe payments disabled");
  }
});
