import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import { requireAuth } from "../middlewares/auth";
import { query, queryOne } from "../lib/db";
import { log, detectAndLogAnomaly } from "../lib/audit";
import { requestAccessLimiter, createQrLimiter } from "../middlewares/rateLimit";

const router = Router();

const TOKEN_REGEX = /^[0-9a-f]{48}$/;

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

function isValidToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_REGEX.test(token);
}

// ─── POST /share/create-qr ────────────────────────────────────────────────────
router.post("/create-qr", requireAuth, createQrLimiter, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const {
    permissions = { name: true, globalId: true, bio: false, networkPlan: false },
    expiresInMinutes = 3,
    label,
  } = req.body as {
    permissions?: { name?: boolean; globalId?: boolean; bio?: boolean; networkPlan?: boolean };
    expiresInMinutes?: number;
    label?: string;
  };

  const mins = Math.min(Math.max(Number(expiresInMinutes) || 3, 1), 5);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + mins * 60 * 1000);

  await query(
    `INSERT INTO uni_share_tokens (id, user_id, document_ids, label, expires_at, allow_file_view)
     VALUES ($1, $2, $3, $4, $5, false)`,
    [token, userId, [], label ?? null, expiresAt]
  );

  await query(
    `INSERT INTO uni_access_requests (share_token_id, owner_user_id, permissions, status)
     VALUES ($1, $2, $3, 'awaiting_scan')`,
    [token, userId, JSON.stringify(permissions)]
  );

  await log({
    userId,
    event: "share.qr_created",
    ip: req.ip,
    metadata: {
      token: token.slice(0, 8) + "...",
      expiresInMinutes: mins,
      permissions,
      result: "success",
    },
  });

  res.json({
    token,
    qrContent: `uniid://access?token=${token}`,
    expiresAt: expiresAt.toISOString(),
    expiresInMinutes: mins,
    permissions,
  });
});

// ─── POST /share/request-access (público) ────────────────────────────────────
router.post("/request-access", requestAccessLimiter, async (req: Request, res: Response) => {
  const { token, requesterDevice } = req.body as {
    token: string;
    requesterDevice?: string;
  };

  const ip = req.ip ?? "unknown";

  if (!isValidToken(token)) {
    await log({
      event: "share.access_invalid_token",
      severity: "warn",
      ip,
      metadata: { reason: "invalid_format", result: "rejected" },
    });
    await detectAndLogAnomaly({
      ip,
      eventPattern: "share.access_invalid%",
      anomalyEvent: "security.token_scan_detected",
      threshold: 3,
      windowMinutes: 5,
      metadata: { type: "invalid_token_format" },
    });
    res.status(400).json({ error: "Token inválido" });
    return;
  }

  const shareRow = await queryOne<{
    id: string; user_id: string; expires_at: string; revoked: boolean;
  }>(
    `SELECT id, user_id, expires_at, revoked FROM uni_share_tokens WHERE id = $1`,
    [token]
  );

  if (!shareRow) {
    await log({
      event: "share.access_invalid_token",
      severity: "warn",
      ip,
      metadata: { reason: "not_found", token: token.slice(0, 8) + "...", result: "rejected" },
    });
    await detectAndLogAnomaly({
      ip,
      eventPattern: "share.access_invalid%",
      anomalyEvent: "security.token_enumeration_detected",
      threshold: 3,
      windowMinutes: 5,
      metadata: { type: "token_not_found" },
    });
    res.status(404).json({ error: "Token inválido o no encontrado" });
    return;
  }

  if (shareRow.revoked) {
    await log({
      event: "share.access_denied",
      severity: "warn",
      ip,
      metadata: { reason: "revoked", token: token.slice(0, 8) + "...", result: "rejected" },
    });
    res.status(410).json({ error: "Este token fue revocado" });
    return;
  }

  if (new Date(shareRow.expires_at) < new Date()) {
    await log({
      event: "share.access_denied",
      severity: "warn",
      ip,
      metadata: { reason: "expired", token: token.slice(0, 8) + "...", result: "rejected" },
    });
    res.status(410).json({ error: "Este token expiró" });
    return;
  }

  const existingRequest = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM uni_access_requests WHERE share_token_id = $1`,
    [token]
  );

  if (!existingRequest) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }

  if (existingRequest.status === "approved") {
    await log({
      event: "share.access_denied",
      severity: "warn",
      ip,
      metadata: { reason: "already_used", token: token.slice(0, 8) + "...", result: "rejected" },
    });
    res.status(409).json({ error: "Token ya fue usado" });
    return;
  }

  if (existingRequest.status === "rejected" || existingRequest.status === "revoked") {
    res.status(403).json({ error: "Acceso denegado" });
    return;
  }

  await query(
    `UPDATE uni_access_requests
     SET status = 'pending', requester_ip = $2, requester_device = $3, updated_at = NOW()
     WHERE id = $1`,
    [existingRequest.id, ip, requesterDevice ?? "Dispositivo desconocido"]
  );

  await log({
    event: "share.access_requested",
    ip,
    metadata: {
      token: token.slice(0, 8) + "...",
      requestId: existingRequest.id,
      ownerUserId: shareRow.user_id,
      requesterDevice: requesterDevice ?? "unknown",
      result: "success",
    },
  });

  res.json({
    requestId: existingRequest.id,
    status: "pending",
    message: "Solicitud enviada. Esperando aprobación del usuario.",
  });
});

// ─── GET /share/pending ───────────────────────────────────────────────────────
router.get("/pending", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;

  const requests = await query(
    `SELECT r.id, r.share_token_id, r.status, r.requester_ip, r.requester_device,
            r.permissions, r.created_at, r.updated_at, t.expires_at, t.label
     FROM uni_access_requests r
     JOIN uni_share_tokens t ON t.id = r.share_token_id
     WHERE r.owner_user_id = $1
       AND r.status = 'pending'
       AND t.expires_at > NOW()
       AND t.revoked = false
     ORDER BY r.updated_at DESC`,
    [userId]
  );

  res.json(requests);
});

// ─── POST /share/approve/:id — con consentimiento explícito ──────────────────
router.post("/approve/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const { id } = req.params;
  const { consentConfirmed = false } = req.body as { consentConfirmed?: boolean };

  if (!consentConfirmed) {
    res.status(400).json({ error: "Se requiere consentimiento explícito para compartir datos" });
    return;
  }

  const request = await queryOne<{
    id: string; share_token_id: string; owner_user_id: string;
    status: string; permissions: any;
  }>(
    `SELECT r.id, r.share_token_id, r.owner_user_id, r.status, r.permissions
     FROM uni_access_requests r
     JOIN uni_share_tokens t ON t.id = r.share_token_id
     WHERE r.id = $1 AND r.owner_user_id = $2
       AND t.expires_at > NOW() AND t.revoked = false`,
    [id, userId]
  );

  if (!request) {
    res.status(404).json({ error: "Solicitud no encontrada o expirada" });
    return;
  }
  if (request.status !== "pending") {
    res.status(409).json({ error: "Esta solicitud ya fue procesada" });
    return;
  }

  const owner = await queryOne<{
    id: string; name: string; bio: string | null;
    global_id: string | null; network_plan: string; created_at: string;
  }>(
    `SELECT id, name, bio, global_id, network_plan, created_at FROM uni_users WHERE id = $1`,
    [userId]
  );

  if (!owner) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

  const perms = typeof request.permissions === "string"
    ? JSON.parse(request.permissions)
    : (request.permissions ?? {});

  const shortId = owner.global_id
    ? `#${owner.global_id.replace("did:uniid:", "").replace(/-/g, "").slice(0, 9).toUpperCase()}`
    : null;

  const responseData: Record<string, any> = { verified: true, issuer: "uni.id" };
  if (perms.name !== false) responseData.name = owner.name;
  if (perms.globalId !== false && owner.global_id) {
    responseData.globalId = owner.global_id;
    responseData.shortId = shortId;
  }
  if (perms.bio && owner.bio) responseData.bio = owner.bio;
  if (perms.networkPlan) responseData.networkPlan = owner.network_plan;

  const consentedAt = new Date().toISOString();

  await query(
    `UPDATE uni_access_requests
     SET status = 'approved', response_data = $2, shared_data = $3,
         consented_at = $4, updated_at = NOW()
     WHERE id = $1`,
    [id, JSON.stringify(responseData), JSON.stringify(responseData), consentedAt]
  );

  await query(`UPDATE uni_share_tokens SET revoked = true WHERE id = $1`, [request.share_token_id]);

  await log({
    userId,
    event: "share.approved",
    severity: "info",
    ip: req.ip,
    metadata: {
      requestId: id,
      token: request.share_token_id.slice(0, 8) + "...",
      permissionsGranted: Object.keys(responseData).filter((k) => !["verified", "issuer"].includes(k)),
      sharedData: Object.keys(responseData).filter((k) => !["verified", "issuer"].includes(k)),
      consentConfirmed: true,
      consentedAt,
      result: "success",
    },
  });

  res.json({ ok: true, data: responseData });
});

// ─── POST /share/reject/:id ───────────────────────────────────────────────────
router.post("/reject/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const { id } = req.params;

  const request = await queryOne<{ id: string; share_token_id: string; status: string }>(
    `SELECT r.id, r.share_token_id, r.status FROM uni_access_requests r
     WHERE r.id = $1 AND r.owner_user_id = $2`,
    [id, userId]
  );

  if (!request) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  if (request.status !== "pending") { res.status(409).json({ error: "Solicitud ya procesada" }); return; }

  await query(
    `UPDATE uni_access_requests SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
    [id]
  );
  await query(`UPDATE uni_share_tokens SET revoked = true WHERE id = $1`, [request.share_token_id]);

  await log({
    userId,
    event: "share.rejected",
    ip: req.ip,
    metadata: { requestId: id, token: request.share_token_id.slice(0, 8) + "...", result: "success" },
  });

  res.json({ ok: true });
});

// ─── POST /share/revoke-access/:id — revocar un acceso ya aprobado ────────────
router.post("/revoke-access/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const { id } = req.params;

  const request = await queryOne<{
    id: string; share_token_id: string; status: string; owner_user_id: string;
  }>(
    `SELECT id, share_token_id, status, owner_user_id FROM uni_access_requests WHERE id = $1`,
    [id]
  );

  if (!request) { res.status(404).json({ error: "Registro no encontrado" }); return; }
  if (request.owner_user_id !== userId) { res.status(403).json({ error: "Sin permiso" }); return; }
  if (request.status === "revoked") { res.status(409).json({ error: "Ya fue revocado" }); return; }

  await query(
    `UPDATE uni_access_requests
     SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [id]
  );

  await query(`UPDATE uni_share_tokens SET revoked = true WHERE id = $1`, [request.share_token_id]);

  await log({
    userId,
    event: "share.access_revoked",
    severity: "warn",
    ip: req.ip,
    metadata: {
      requestId: id,
      token: request.share_token_id.slice(0, 8) + "...",
      previousStatus: request.status,
      result: "success",
    },
  });

  res.json({ ok: true });
});

// ─── GET /share/access-log — historial completo de accesos ───────────────────
router.get("/access-log", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;

  const records = await query(
    `SELECT r.id, r.status, r.requester_ip, r.requester_device,
            r.permissions, r.shared_data, r.consented_at,
            r.revoked_at, r.created_at, r.updated_at,
            t.expires_at, t.label, t.created_at as token_created_at
     FROM uni_access_requests r
     JOIN uni_share_tokens t ON t.id = r.share_token_id
     WHERE r.owner_user_id = $1
       AND r.status IN ('approved', 'rejected', 'revoked')
     ORDER BY r.updated_at DESC
     LIMIT 50`,
    [userId]
  );

  res.json(records);
});

// ─── GET /share/result/:id — escáner consulta resultado ──────────────────────
router.get("/result/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  const request = await queryOne<{
    status: string; response_data: any; updated_at: string;
  }>(
    `SELECT r.status, r.response_data, r.updated_at
     FROM uni_access_requests r
     JOIN uni_share_tokens t ON t.id = r.share_token_id
     WHERE r.id = $1`,
    [id]
  );

  if (!request) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }

  if (request.status === "pending" || request.status === "awaiting_scan") {
    res.json({ status: "pending", message: "Esperando aprobación del usuario" }); return;
  }
  if (request.status === "rejected") {
    res.json({ status: "rejected", message: "El usuario rechazó el acceso" }); return;
  }
  if (request.status === "revoked") {
    res.json({ status: "revoked", message: "El acceso fue revocado" }); return;
  }
  if (request.status === "approved") {
    res.json({ status: "approved", data: request.response_data }); return;
  }

  res.json({ status: request.status });
});

// ─── GET /share/history ───────────────────────────────────────────────────────
router.get("/history", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const tokens = await query(
    `SELECT t.id, t.label, t.expires_at, t.revoked, t.created_at,
            r.id as request_id, r.status as request_status,
            r.requester_device, r.updated_at as request_updated_at
     FROM uni_share_tokens t
     LEFT JOIN uni_access_requests r ON r.share_token_id = t.id
     WHERE t.user_id = $1
     ORDER BY t.created_at DESC
     LIMIT 50`,
    [userId]
  );
  res.json(tokens);
});

// ─── DELETE /share/:token — revocar token ────────────────────────────────────
router.delete("/:token", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const { token } = req.params;

  const row = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM uni_share_tokens WHERE id = $1`,
    [token]
  );

  if (!row) { res.status(404).json({ error: "Token no encontrado" }); return; }
  if (row.user_id !== userId) { res.status(403).json({ error: "Sin permiso" }); return; }

  await query(`UPDATE uni_share_tokens SET revoked = true WHERE id = $1`, [token]);
  await query(
    `UPDATE uni_access_requests SET status = 'rejected', updated_at = NOW()
     WHERE share_token_id = $1 AND status = 'pending'`,
    [token]
  );
  await log({ userId, event: "share.revoked", ip: req.ip, metadata: { token } });
  res.json({ ok: true });
});

// ─── GET /share/web/:token — navegador web ────────────────────────────────────
router.get("/web/:token", async (req: Request, res: Response) => {
  const { token } = req.params;

  const row = await queryOne<{ expires_at: string; revoked: boolean }>(
    `SELECT expires_at, revoked FROM uni_share_tokens WHERE id = $1`,
    [token]
  );

  if (!row || row.revoked || new Date(row.expires_at) < new Date()) {
    res.status(410).json({
      status: "expired",
      message: "Este token expiró o fue revocado",
    });
    return;
  }

  res.json({
    status: "requires_app",
    message: "Esta identidad requiere autorización del usuario. Abrí uni.id para continuar.",
    deepLink: `uniid://access?token=${token}`,
  });
});

export default router;
