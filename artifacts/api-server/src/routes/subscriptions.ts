import { Router, Request, Response } from "express";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import Stripe from "stripe";
import { body, validationResult } from "express-validator";
import { requireAuth } from "../middlewares/auth";
import { requirePlan, hasActivePlan } from "../middlewares/premium";
import { query, queryOne } from "../lib/db";
import { log } from "../lib/audit";
import { raiseSecurityEvent } from "../lib/monitor";
import { verifyMercadoPagoSignature } from "../lib/crypto";
import { sendEmail } from "../lib/email";

const router = Router();

const MP_TOKEN = process.env["MP_ACCESS_TOKEN"];
const MP_WEBHOOK_SECRET = process.env["MP_WEBHOOK_SECRET"];
const STRIPE_KEY = process.env["STRIPE_SECRET_KEY"];
const STRIPE_WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"] ?? "";

const PLANS: Record<string, { name: string; usd: number; ars: number; features: string[] }> = {
  basic: {
    name: "uni.id Conexión Básica",
    usd: 4.99,
    ars: 4990,
    features: [
      "Documentos ilimitados",
      "Todas las categorías (DNI, salud, licencia, propiedad, mascotas)",
      "Backup cifrado",
      "Recuperación de cuenta",
      "Soporte por email",
    ],
  },
  pro: {
    name: "uni.id Conexión Pro",
    usd: 12.99,
    ars: 12990,
    features: [
      "Todo lo de Conexión Básica",
      "Verificación de identidad en red",
      "Firma digital de documentos",
      "Historial de auditoría completo",
      "Soporte prioritario 24/7",
      "Exportación en múltiples formatos",
    ],
  },
};

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return false; }
  return true;
};

// ─── Status de proveedores ────────────────────────────────────────────────────
router.get("/status", (_req: Request, res: Response) => {
  res.json({
    mercadopago: !!MP_TOKEN,
    stripe: !!STRIPE_KEY,
    plans: PLANS,
  });
});

// ─── Features disponibles por plan ───────────────────────────────────────────
router.get("/features", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const isPremium = await hasActivePlan(userId, "basic");
  const isPro = await hasActivePlan(userId, "pro");

  res.json({
    currentPlan: isPro ? "pro" : isPremium ? "basic" : "free",
    features: {
      unlimitedDocuments: isPremium,
      allCategories: isPremium,
      encryptedBackup: isPremium,
      identityNetwork: isPro,
      digitalSignature: isPro,
      fullAuditHistory: isPro,
      prioritySupport: isPro,
    },
    plans: PLANS,
  });
});

// ─── Suscripción actual del usuario ──────────────────────────────────────────
router.get("/my", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;

  const user = await queryOne<{ network_plan: string | null; plan_expires_at: string | null }>(
    `SELECT network_plan, plan_expires_at FROM uni_users WHERE id = $1`,
    [userId]
  );

  const plan = user?.network_plan ?? "free";
  const expiresAt = user?.plan_expires_at ? new Date(user.plan_expires_at) : null;
  const isExpired = expiresAt !== null && expiresAt < new Date();

  if (isExpired && plan !== "free") {
    await query(`UPDATE uni_users SET network_plan = 'free', updated_at = NOW() WHERE id = $1`, [userId]);
    await log({ userId, event: "subscription.auto_downgraded", severity: "warn", ip: req.ip, metadata: { reason: "expired_on_check" } });
  }

  const subs = await query(
    `SELECT plan, status, provider, amount, currency, provider_payment_id, created_at, updated_at
     FROM uni_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );

  res.json({
    current: {
      plan: isExpired ? "free" : plan,
      expiresAt: expiresAt?.toISOString() ?? null,
      isActive: !isExpired && plan !== "free",
      daysRemaining: expiresAt && !isExpired
        ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)
        : null,
    },
    history: subs,
  });
});

// ─── MercadoPago checkout ─────────────────────────────────────────────────────
router.post(
  "/mercadopago/create",
  requireAuth,
  [
    body("planId").isIn(["basic", "pro"]),
    body("backUrl").isURL({ require_protocol: true }),
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
          items: [{
            id: planId,
            title: plan.name,
            quantity: 1,
            unit_price: plan.ars,
            currency_id: "ARS",
          }],
          metadata: { user_id: userId, plan_id: planId },
          back_urls: {
            success: `${backUrl}?status=success&plan=${planId}`,
            failure: `${backUrl}?status=failure&plan=${planId}`,
            pending: `${backUrl}?status=pending&plan=${planId}`,
          },
          auto_return: "approved",
          statement_descriptor: "uni.id",
          notification_url: process.env["API_BASE_URL"]
            ? `${process.env["API_BASE_URL"]}/api/subscriptions/webhook/mercadopago`
            : undefined,
        },
      });

      await query(
        `INSERT INTO uni_subscriptions (user_id, plan, status, provider, amount, currency)
         VALUES ($1,$2,'pending','mercadopago',$3,'ARS')
         ON CONFLICT DO NOTHING`,
        [userId, planId, plan.ars]
      );

      await log({
        userId,
        event: "subscription.checkout_created",
        ip: req.ip,
        metadata: { planId, provider: "mercadopago", preferenceId: result.id },
      });

      res.json({
        initPoint: result.init_point,
        sandboxInitPoint: result.sandbox_init_point,
        preferenceId: result.id,
        plan: { id: planId, ...plan },
      });
    } catch (err: any) {
      await log({ userId, event: "subscription.checkout_error", severity: "warn", ip: req.ip, metadata: { error: err.message } });
      res.status(500).json({ error: "Error al crear preferencia de pago. Intentá nuevamente." });
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
      const baseUrl = process.env["API_BASE_URL"] ?? "https://uni.id";
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: plan.name, description: plan.features.join(" · ") },
            unit_amount: Math.round(plan.usd * 100),
            recurring: { interval: "month" },
          },
          quantity: 1,
        }],
        metadata: { userId, planId },
        success_url: `${baseUrl}/success?plan=${planId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/cancel`,
        subscription_data: {
          metadata: { userId, planId },
        },
      });

      await query(
        `INSERT INTO uni_subscriptions (user_id, plan, status, provider, amount, currency, provider_payment_id)
         VALUES ($1,$2,'pending','stripe',$3,'USD',$4)`,
        [userId, planId, plan.usd, session.id]
      );

      await log({ userId, event: "subscription.checkout_created", ip: req.ip, metadata: { planId, provider: "stripe" } });
      res.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      res.status(500).json({ error: "Error al crear sesión de pago." });
    }
  }
);

// ─── MercadoPago webhook ───────────────────────────────────────────────────────
// Registrar en: https://www.mercadopago.com.ar/developers/panel/app → Webhooks
// URL: https://<tu-dominio>/api/subscriptions/webhook/mercadopago
router.post("/webhook/mercadopago", async (req: Request, res: Response) => {
  const xSignature = req.headers["x-signature"] as string ?? "";
  const xRequestId = req.headers["x-request-id"] as string ?? "";

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const dataId = body?.data?.id?.toString() ?? "";

  // Verificar firma si el webhook secret está configurado
  if (MP_WEBHOOK_SECRET && xSignature && dataId) {
    const valid = verifyMercadoPagoSignature(dataId, xSignature, xRequestId, MP_WEBHOOK_SECRET);
    if (!valid) {
      await raiseSecurityEvent({
        eventType: "webhook.mp_invalid_signature",
        severity: "critical",
        ip: req.ip,
        metadata: { dataId, xRequestId },
      });
      await log({ event: "webhook.mp_invalid_signature", severity: "critical", ip: req.ip });
      res.status(401).json({ error: "Firma inválida" });
      return;
    }
  }

  const { type } = body;

  if (type === "payment" && dataId && MP_TOKEN) {
    try {
      const mp = new MercadoPagoConfig({ accessToken: MP_TOKEN });
      const paymentApi = new Payment(mp);
      const paymentData = await paymentApi.get({ id: dataId });

      const payStatus = paymentData.status;
      const userId = paymentData.metadata?.user_id;
      const planId = paymentData.metadata?.plan_id;

      if (!userId || !planId) {
        await log({ event: "webhook.mp_missing_metadata", severity: "warn", metadata: { dataId, payStatus } });
        res.sendStatus(200);
        return;
      }

      if (payStatus === "approved") {
        // Activar suscripción
        await query(
          `UPDATE uni_subscriptions
           SET status='active', provider_payment_id=$1, updated_at=NOW()
           WHERE user_id=$2 AND plan=$3 AND provider='mercadopago' AND status='pending'`,
          [dataId, userId, planId]
        );
        await query(
          `UPDATE uni_users
           SET network_plan=$1, plan_expires_at=NOW() + INTERVAL '1 month', updated_at=NOW()
           WHERE id=$2`,
          [planId, userId]
        );
        await log({
          userId,
          event: "subscription.activated",
          severity: "info",
          metadata: { planId, provider: "mercadopago", paymentId: dataId },
        });

        // Notificar al usuario por email si tiene uno configurado
        await sendSubscriptionEmail(userId, planId, "activated");

      } else if (["rejected", "cancelled"].includes(payStatus ?? "")) {
        await query(
          `UPDATE uni_subscriptions SET status=$1, provider_payment_id=$2, updated_at=NOW()
           WHERE user_id=$3 AND plan=$4 AND provider='mercadopago' AND status='pending'`,
          [payStatus, dataId, userId, planId]
        );
        await log({
          userId,
          event: "subscription.payment_failed",
          severity: "warn",
          metadata: { planId, provider: "mercadopago", status: payStatus, paymentId: dataId },
        });

      } else if (payStatus === "refunded") {
        await query(
          `UPDATE uni_subscriptions SET status='refunded', updated_at=NOW()
           WHERE user_id=$1 AND provider_payment_id=$2`,
          [userId, dataId]
        );
        await query(
          `UPDATE uni_users SET network_plan='free', plan_expires_at=NULL, updated_at=NOW()
           WHERE id=$1`,
          [userId]
        );
        await log({
          userId,
          event: "subscription.refunded",
          severity: "warn",
          metadata: { planId, provider: "mercadopago", paymentId: dataId },
        });
      }

    } catch (err: any) {
      await log({
        event: "webhook.mp_processing_error",
        severity: "warn",
        metadata: { error: err.message, dataId },
      });
    }
  }

  // Siempre devolver 200 a MP para que no reintente
  res.sendStatus(200);
});

// ─── Stripe webhook ────────────────────────────────────────────────────────────
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
      await sendSubscriptionEmail(userId, planId, "activated");
    }
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as any;
    const userId = invoice.subscription_details?.metadata?.userId ?? invoice.metadata?.userId;
    if (userId) {
      await query(
        `UPDATE uni_users SET network_plan='free', plan_expires_at=NULL, updated_at=NOW()
         WHERE id=$1`,
        [userId]
      );
      await log({ userId, event: "subscription.payment_failed", severity: "warn", metadata: { provider: "stripe" } });
    }
  }

  res.sendStatus(200);
});

// ─── Helper: enviar email de suscripción ─────────────────────────────────────
async function sendSubscriptionEmail(
  userId: string,
  planId: string,
  action: "activated" | "cancelled" | "refunded"
): Promise<void> {
  try {
    const { queryOne: qOne } = await import("../lib/db");
    const { decryptFieldAsync } = await import("../lib/keyManager");

    const user = await qOne<{ name: string; recovery_email_enc: string | null }>(
      `SELECT name, recovery_email_enc FROM uni_users WHERE id = $1`,
      [userId]
    );
    if (!user?.recovery_email_enc) return;

    const email = await decryptFieldAsync(user.recovery_email_enc, userId);
    const planName = PLANS[planId]?.name ?? planId;

    const templates: Record<string, { subject: string; body: string }> = {
      activated: {
        subject: `✅ Plan ${planName} activado — uni.id`,
        body: `Hola ${user.name}, tu plan <strong>${planName}</strong> está activo. Tenés acceso completo durante 30 días.`,
      },
      cancelled: {
        subject: `❌ Pago rechazado — uni.id`,
        body: `Hola ${user.name}, el pago de tu plan <strong>${planName}</strong> fue rechazado. Podés intentar nuevamente desde la app.`,
      },
      refunded: {
        subject: `↩ Reembolso procesado — uni.id`,
        body: `Hola ${user.name}, procesamos el reembolso de tu plan <strong>${planName}</strong>. Tu cuenta volvió al plan gratuito.`,
      },
    };

    const t = templates[action];
    await sendEmail({
      to: email,
      subject: t.subject,
      text: t.body.replace(/<[^>]+>/g, ""),
      html: `
<!DOCTYPE html><html><body style="font-family:sans-serif;background:#060B18;color:#fff;padding:40px">
<div style="max-width:480px;margin:auto;background:#0D1525;border-radius:16px;padding:32px;border:1px solid #1A6FE8">
  <h1 style="color:#00D4FF;margin-top:0">uni.id</h1>
  <p style="font-size:16px">${t.body}</p>
  <hr style="border-color:#1A2540;margin:24px 0"/>
  <p style="color:#8899BB;font-size:12px">human.id labs S.A.S. · Sebastián Maximiliano Monteleón</p>
</div></body></html>`,
    });
  } catch { /* Non-critical — don't fail the webhook */ }
}

export default router;
