import { Router, Request, Response } from "express";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import Stripe from "stripe";
import { body, validationResult } from "express-validator";
import { requireAuth } from "../middlewares/auth";
import { query } from "../lib/db";
import { log } from "../lib/audit";
import { verifyMercadoPagoSignature } from "../lib/crypto";
import { createHash, createHmac } from "crypto";

const router = Router();

const MP_TOKEN = process.env["MP_ACCESS_TOKEN"];
const STRIPE_KEY = process.env["STRIPE_SECRET_KEY"];
const STRIPE_PK = process.env["STRIPE_PUBLIC_KEY"];
const STRIPE_WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"] ?? "";

const PLANS: Record<string, { name: string; usd: number; ars: number }> = {
  basic: { name: "uni.id Conexión Básica", usd: 4.99, ars: 4990 },
  pro:   { name: "uni.id Conexión Pro",    usd: 12.99, ars: 12990 },
};

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return false; }
  return true;
};

// ─── Status ───────────────────────────────────────────────────────────────────
router.get("/status", (_req: Request, res: Response) => {
  res.json({ mercadopago: !!MP_TOKEN, stripe: !!STRIPE_KEY });
});

// ─── MercadoPago checkout ─────────────────────────────────────────────────────
router.post(
  "/mercadopago/create",
  requireAuth,
  [
    body("planId").isIn(["basic", "pro"]),
    body("backUrl").isURL(),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    if (!MP_TOKEN) { res.status(503).json({ error: "MercadoPago no configurado" }); return; }

    const { planId, backUrl } = req.body as { planId: "basic" | "pro"; backUrl: string };
    const plan = PLANS[planId];
    const userId = req.user!.sub;

    try {
      const mp = new MercadoPagoConfig({ accessToken: MP_TOKEN });
      const preference = new Preference(mp);

      const result = await preference.create({
        body: {
          items: [{ id: planId, title: plan.name, quantity: 1, unit_price: plan.ars, currency_id: "ARS" }],
          metadata: { userId, planId },
          back_urls: {
            success: backUrl + "?status=success&plan=" + planId,
            failure: backUrl + "?status=failure",
            pending: backUrl + "?status=pending",
          },
          auto_return: "approved",
          statement_descriptor: "uni.id",
        },
      });

      await query(
        `INSERT INTO uni_subscriptions (user_id, plan, status, provider, amount, currency)
         VALUES ($1,$2,'pending','mercadopago',$3,'ARS')`,
        [userId, planId, plan.ars]
      );

      await log({ userId, event: "subscription.checkout_created", ip: req.ip, metadata: { planId, provider: "mercadopago" } });

      res.json({ initPoint: result.init_point, sandboxInitPoint: result.sandbox_init_point, preferenceId: result.id });
    } catch (err: any) {
      await log({ userId, event: "subscription.checkout_error", severity: "warn", ip: req.ip, metadata: { error: err.message } });
      res.status(500).json({ error: "Error al crear preferencia de pago" });
    }
  }
);

// ─── Stripe checkout ──────────────────────────────────────────────────────────
router.post(
  "/stripe/create",
  requireAuth,
  [body("planId").isIn(["basic", "pro"])],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    if (!STRIPE_KEY) { res.status(503).json({ error: "Stripe no configurado" }); return; }

    const { planId } = req.body as { planId: "basic" | "pro" };
    const plan = PLANS[planId];
    const userId = req.user!.sub;

    try {
      const stripe = new Stripe(STRIPE_KEY);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: plan.name },
              unit_amount: Math.round(plan.usd * 100),
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
        ],
        metadata: { userId, planId },
        success_url: `https://uni.id/success?plan=${planId}`,
        cancel_url: `https://uni.id/cancel`,
      });

      await query(
        `INSERT INTO uni_subscriptions (user_id, plan, status, provider, amount, currency, provider_payment_id)
         VALUES ($1,$2,'pending','stripe',$3,'USD',$4)`,
        [userId, planId, plan.usd, session.id]
      );

      await log({ userId, event: "subscription.checkout_created", ip: req.ip, metadata: { planId, provider: "stripe" } });
      res.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      res.status(500).json({ error: "Error al crear sesión de pago" });
    }
  }
);

// ─── MercadoPago webhook (firma verificada) ────────────────────────────────────
router.post("/webhook/mercadopago", async (req: Request, res: Response) => {
  const xSignature = req.headers["x-signature"] as string ?? "";
  const xRequestId = req.headers["x-request-id"] as string ?? "";
  const rawBody = req.body?.toString?.() ?? JSON.stringify(req.body);

  if (MP_TOKEN && xSignature) {
    const valid = verifyMercadoPagoSignature(rawBody, xSignature, xRequestId, MP_TOKEN);
    if (!valid) {
      await log({ event: "webhook.mp_invalid_signature", severity: "critical", ip: req.ip });
      res.status(401).json({ error: "Firma inválida" });
      return;
    }
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const { type, data } = body;

  if (type === "payment" && data?.id && MP_TOKEN) {
    try {
      const mp = new MercadoPagoConfig({ accessToken: MP_TOKEN });
      const payment = new Payment(mp);
      const paymentData = await payment.get({ id: data.id });

      const status = paymentData.status;
      const userId = paymentData.metadata?.user_id;
      const planId = paymentData.metadata?.plan_id;

      if (status === "approved" && userId && planId) {
        await query(
          `UPDATE uni_subscriptions SET status='active', provider_payment_id=$1, updated_at=NOW()
           WHERE user_id=$2 AND plan=$3 AND provider='mercadopago' AND status='pending'`,
          [String(data.id), userId, planId]
        );
        const months = planId === "pro" ? 1 : 1;
        await query(
          `UPDATE uni_users SET network_plan=$1, plan_expires_at=NOW() + INTERVAL '1 month', updated_at=NOW()
           WHERE id=$2`,
          [planId, userId]
        );
        await log({ userId, event: "subscription.activated", metadata: { planId, provider: "mercadopago" } });
      }
    } catch (err: any) {
      await log({ event: "webhook.mp_processing_error", severity: "warn", metadata: { error: err.message } });
    }
  }

  res.sendStatus(200);
});

// ─── Stripe webhook (firma verificada) ────────────────────────────────────────
router.post("/webhook/stripe", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  if (!STRIPE_KEY || !sig || !STRIPE_WEBHOOK_SECRET) {
    res.sendStatus(200);
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(STRIPE_KEY);
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    await log({ event: "webhook.stripe_invalid_signature", severity: "critical", ip: req.ip });
    res.status(400).json({ error: "Firma inválida" });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    if (userId && planId) {
      await query(
        `UPDATE uni_subscriptions SET status='active', provider_payment_id=$1, updated_at=NOW()
         WHERE user_id=$2 AND plan=$3 AND provider='stripe' AND status='pending'`,
        [session.id, userId, planId]
      );
      await query(
        `UPDATE uni_users SET network_plan=$1, plan_expires_at=NOW() + INTERVAL '1 month', updated_at=NOW()
         WHERE id=$2`,
        [planId, userId]
      );
      await log({ userId, event: "subscription.activated", metadata: { planId, provider: "stripe" } });
    }
  }

  res.sendStatus(200);
});

// ─── Get subscription status (authenticated) ──────────────────────────────────
router.get("/my", requireAuth, async (req: Request, res: Response) => {
  const subs = await query(
    `SELECT plan, status, provider, amount, currency, created_at, updated_at
     FROM uni_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
    [req.user!.sub]
  );
  const user = await query(
    `SELECT network_plan, plan_expires_at FROM uni_users WHERE id = $1`,
    [req.user!.sub]
  );
  res.json({ current: user[0], history: subs });
});

export default router;
