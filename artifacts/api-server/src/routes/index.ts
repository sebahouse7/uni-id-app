import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import documentsRouter from "./documents";
import subscriptionsRouter from "./subscriptions";
import sessionsRouter from "./sessions";
import monitorRouter from "./monitor";
import backupRouter from "./backup";
import recoveryRouter from "./recovery";
import shareRouter from "./share";
import businessRouter from "./business";
import identityRouter from "./identity";
import signaturesRouter from "./signatures";
import { generalLimiter } from "../middlewares/rateLimit";
import { queryOne } from "../lib/db";
import { decryptFieldAsync } from "../lib/keyManager";

const router: IRouter = Router();

router.use(generalLimiter);

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/recovery", recoveryRouter);
router.use("/documents", documentsRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/sessions", sessionsRouter);
router.use("/monitor", monitorRouter);
router.use("/backup", backupRouter);
router.use("/share", shareRouter);
router.use("/businesses", businessRouter);
router.use("/identity", identityRouter);
router.use("/signatures", signaturesRouter);

// ─── GET /verify/:id — verificación pública de identidad (sin auth) ───────────
// Acepta: did:uniid:<uuid>, short ID (#ABC123456 o ABC123456)
router.get("/verify/:id", async (req: Request, res: Response) => {
  const rawId = decodeURIComponent(String(req.params["id"] ?? "")).trim();
  if (!rawId) {
    res.status(400).json({ error: "ID requerido" });
    return;
  }

  let user: any = null;

  if (rawId.startsWith("did:uniid:")) {
    user = await queryOne(
      `SELECT id, name, bio, name_enc, bio_enc, global_id, created_at, network_plan, plan_expires_at
       FROM uni_users WHERE global_id = $1`,
      [rawId]
    );
  } else {
    const clean = rawId.replace(/^#/, "").toUpperCase().slice(0, 9);
    user = await queryOne(
      `SELECT id, name, bio, name_enc, bio_enc, global_id, created_at, network_plan, plan_expires_at
       FROM uni_users
       WHERE UPPER(REPLACE(REPLACE(global_id, 'did:uniid:', ''), '-', '')) LIKE $1 || '%'
       LIMIT 1`,
      [clean]
    );
  }

  if (!user) {
    res.status(404).json({ error: "Identidad no encontrada en la red uni.id" });
    return;
  }

  // Decrypt name/bio (fall back to plaintext for pre-migration rows)
  try {
    if (user.name_enc) user.name = await decryptFieldAsync(user.name_enc, user.id);
    if (user.bio_enc) user.bio = await decryptFieldAsync(user.bio_enc, user.id);
  } catch {}

  const isPro = user.network_plan !== "free";
  const shortId = user.global_id
    ? `#${user.global_id.replace("did:uniid:", "").replace(/-/g, "").slice(0, 9).toUpperCase()}`
    : null;

  res.json({
    globalId: user.global_id,
    shortId,
    name: user.name,
    bio: isPro ? (user.bio ?? undefined) : undefined,
    status: "verified",
    verificationLevel: isPro ? 80 : 40,
    networkPlan: user.network_plan,
    planActive: isPro,
    network: "uni.id Global Identity Network",
    issuer: "human.id labs S.A.S.",
    memberSince: user.created_at,
    allowedData: isPro
      ? ["name", "globalId", "shortId", "bio", "networkPlan", "memberSince"]
      : ["name", "globalId", "shortId"],
  });
});

export default router;
