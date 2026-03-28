import { Router, Request, Response } from "express";
import { MercadoPagoConfig, Preference, PreApprovalPlan, PreApproval } from "mercadopago";
import Stripe from "stripe";

const router = Router();

const MP_TOKEN = process.env["MP_ACCESS_TOKEN"];
const STRIPE_KEY = process.env["STRIPE_SECRET_KEY"];
const STRIPE_PK = process.env["STRIPE_PUBLIC_KEY"];

const PLANS = {
  basic: { name: "uni.id Conexión Básica", price: 4.99, currency_id: "ARS", ars_price: 4990 },
  pro:   { name: "uni.id Conexión Pro",    price: 12.99, currency_id: "ARS", ars_price: 12990 },
};

// ─── MercadoPago ─────────────────────────────────────────────────────────────

router.post("/mercadopago/create", async (req: Request, res: Response) => {
  if (!MP_TOKEN) {
    res.status(503).json({ error: "MercadoPago not configured" });
    return;
  }
  const { planId, userId, backUrl } = req.body as {
    planId: "basic" | "pro";
    userId: string;
    backUrl: string;
  };
  const plan = PLANS[planId];
  if (!plan) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }

  try {
    const mp = new MercadoPagoConfig({ accessToken: MP_TOKEN });
    const preference = new Preference(mp);

    const result = await preference.create({
      body: {
        items: [
          {
            id: planId,
            title: plan.name,
            quantity: 1,
            unit_price: plan.ars_price,
            currency_id: "ARS",
          },
        ],
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

    res.json({
      initPoint: result.init_point,
      sandboxInitPoint: result.sandbox_init_point,
      preferenceId: result.id,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stripe ──────────────────────────────────────────────────────────────────

router.post("/stripe/create", async (req: Request, res: Response) => {
  if (!STRIPE_KEY) {
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }
  const { planId, userId } = req.body as { planId: "basic" | "pro"; userId: string };
  const plan = PLANS[planId];
  if (!plan) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }

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
            unit_amount: Math.round(plan.price * 100),
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      metadata: { userId, planId },
      success_url: `https://uni.id/success?plan=${planId}`,
      cancel_url: `https://uni.id/cancel`,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Status ───────────────────────────────────────────────────────────────────

router.get("/status", (_req: Request, res: Response) => {
  res.json({
    mercadopago: !!MP_TOKEN,
    stripe: !!STRIPE_KEY && !!STRIPE_PK,
  });
});

// ─── Webhooks ─────────────────────────────────────────────────────────────────

router.post("/webhook/mercadopago", async (req: Request, res: Response) => {
  const { type, data } = req.body;
  if (type === "payment" && data?.id) {
    // Log the event — real subscription activation would update a DB here
    console.log("[MP Webhook] Payment received:", data.id);
  }
  res.sendStatus(200);
});

router.post("/webhook/stripe", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];
  if (STRIPE_KEY && sig) {
    console.log("[Stripe Webhook] Event received");
  }
  res.sendStatus(200);
});

export default router;
