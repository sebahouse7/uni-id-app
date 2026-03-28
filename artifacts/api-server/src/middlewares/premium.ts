import { Request, Response, NextFunction } from "express";
import { queryOne } from "../lib/db";
import { query } from "../lib/db";
import { log } from "../lib/audit";

export type PlanTier = "free" | "basic" | "pro";

const PLAN_RANK: Record<string, number> = { free: 0, basic: 1, pro: 2 };

/**
 * requirePlan("basic") — requires basic OR pro plan (any paid tier)
 * requirePlan("pro")   — requires pro plan specifically
 * requirePlan("basic", "pro") — same as requirePlan("basic")
 */
export function requirePlan(...minPlans: PlanTier[]) {
  const minRank = Math.min(...minPlans.map((p) => PLAN_RANK[p] ?? 99));

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }

    const user = await queryOne<{ network_plan: string | null; plan_expires_at: string | null }>(
      `SELECT network_plan, plan_expires_at FROM uni_users WHERE id = $1`,
      [userId]
    );

    if (!user) {
      res.status(401).json({ error: "Usuario no encontrado" });
      return;
    }

    const plan = user.network_plan ?? "free";
    const expiresAt = user.plan_expires_at ? new Date(user.plan_expires_at) : null;
    const isExpired = expiresAt !== null && expiresAt < new Date();

    if (isExpired && plan !== "free") {
      await query(
        `UPDATE uni_users SET network_plan = 'free', updated_at = NOW() WHERE id = $1`,
        [userId]
      );
      await log({
        userId,
        event: "subscription.auto_downgraded",
        severity: "warn",
        ip: req.ip,
        metadata: { previousPlan: plan, reason: "expired" },
      });
      res.status(402).json({
        error: "Tu suscripción venció. Renová tu plan para continuar usando esta función.",
        code: "SUBSCRIPTION_EXPIRED",
        expiredAt: expiresAt?.toISOString(),
        renewUrl: "/subscriptions/status",
      });
      return;
    }

    const userRank = PLAN_RANK[plan] ?? 0;
    if (userRank < minRank) {
      const required = minPlans[0];
      res.status(402).json({
        error: `Esta función requiere el plan ${required === "basic" ? "Conexión Básica" : "Conexión Pro"} o superior.`,
        code: "PREMIUM_REQUIRED",
        currentPlan: plan,
        requiredPlan: required,
        upgradeUrl: "/subscriptions/status",
      });
      return;
    }

    next();
  };
}

/** Quick inline check — returns true if the user has an active paid plan */
export async function hasActivePlan(userId: string, minPlan: PlanTier = "basic"): Promise<boolean> {
  const user = await queryOne<{ network_plan: string | null; plan_expires_at: string | null }>(
    `SELECT network_plan, plan_expires_at FROM uni_users WHERE id = $1`,
    [userId]
  );
  if (!user) return false;
  const plan = user.network_plan ?? "free";
  const expiresAt = user.plan_expires_at ? new Date(user.plan_expires_at) : null;
  const isExpired = expiresAt !== null && expiresAt < new Date();
  const rank = PLAN_RANK[plan] ?? 0;
  return !isExpired && rank >= (PLAN_RANK[minPlan] ?? 1);
}
