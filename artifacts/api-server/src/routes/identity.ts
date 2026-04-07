import { Router } from "express";
import type { Request, Response } from "express";
import { queryOne } from "../lib/db";

const router = Router();

async function lookupIdentity(identifier: string): Promise<any | null> {
  let sql: string;
  let param: string;

  if (identifier.startsWith("did:uniid:")) {
    sql = `SELECT id, name, bio, global_id, created_at, network_plan, plan_expires_at
           FROM uni_users WHERE global_id = $1`;
    param = identifier;
  } else {
    const clean = identifier.replace(/^#/, "").toUpperCase();
    sql = `SELECT id, name, bio, global_id, created_at, network_plan, plan_expires_at
           FROM uni_users
           WHERE UPPER(REPLACE(REPLACE(global_id, 'did:uniid:', ''), '-', '')) LIKE $1 || '%'
           LIMIT 1`;
    param = clean;
  }

  return queryOne<{
    id: string;
    name: string;
    bio: string | null;
    global_id: string;
    created_at: string;
    network_plan: string;
    plan_expires_at: string | null;
  }>(sql, [param]);
}

function buildPublicProfile(user: any) {
  const isPro = user.network_plan !== "free";
  const shortId = user.global_id
    ? `#${user.global_id.replace("did:uniid:", "").replace(/-/g, "").slice(0, 9).toUpperCase()}`
    : null;

  return {
    globalId: user.global_id,
    shortId,
    name: user.name,
    bio: user.bio ?? undefined,
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
  };
}

// ─── GET /identity/:globalId — lookup por DID completo ───────────────────────
router.get("/:globalId", async (req: Request, res: Response) => {
  const globalId = String(req.params["globalId"] ?? "");

  if (!globalId || !globalId.startsWith("did:uniid:")) {
    res.status(400).json({ error: "Formato inválido. Se esperaba did:uniid:<uuid>" });
    return;
  }

  const user = await lookupIdentity(globalId);
  if (!user) {
    res.status(404).json({ error: "Identidad no encontrada en la red uni.id" });
    return;
  }

  res.json(buildPublicProfile(user));
});

export default router;
