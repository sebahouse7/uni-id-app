import { Router } from "express";
import type { Request, Response } from "express";
import { queryOne } from "../lib/db";

const router = Router();

// ─── GET /identity/:globalId — perfil público de identidad (sin auth) ─────────
// URL que aparece en el QR: https://expressjs-production-8bfc.up.railway.app/api/identity/did:uniid:<uuid>
router.get("/:globalId", async (req: Request, res: Response) => {
  const globalId = String(req.params["globalId"] ?? "");

  if (!globalId || !globalId.startsWith("did:uniid:")) {
    res.status(400).json({ error: "Formato de identidad inválido. Se esperaba did:uniid:<uuid>" });
    return;
  }

  const user = await queryOne<{
    name: string;
    bio: string | null;
    global_id: string;
    created_at: string;
    network_plan: string;
  }>(
    `SELECT name, bio, global_id, created_at, network_plan
     FROM uni_users
     WHERE global_id = $1`,
    [globalId]
  );

  if (!user) {
    res.status(404).json({ error: "Identidad no encontrada en la red uni.id" });
    return;
  }

  res.json({
    globalId: user.global_id,
    name: user.name,
    bio: user.bio ?? undefined,
    networkPlan: user.network_plan,
    network: "uni.id Global Identity Network",
    verified: true,
    verifiedAt: user.created_at,
    issuer: "human.id labs S.A.S.",
  });
});

export default router;
