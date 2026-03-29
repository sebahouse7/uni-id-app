import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import { requireAuth } from "../middlewares/auth";
import { query, queryOne } from "../lib/db";
import { log } from "../lib/audit";

const router = Router();

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// ─── POST /share/create — crear link compartido ───────────────────────────────
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const { documentIds, label, expiresInMinutes = 60 } = req.body as {
    documentIds: string[];
    label?: string;
    expiresInMinutes?: number;
  };

  const allowFileView = Boolean(req.body.allowFileView ?? false);

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    res.status(400).json({ error: "Seleccioná al menos un documento" });
    return;
  }

  const mins = Number(expiresInMinutes);
  if (!mins || mins < 1 || mins > 10080) {
    res.status(400).json({ error: "Expiración inválida (1 min – 7 días)" });
    return;
  }

  // Verificar que todos los documentos pertenecen al usuario
  const owned = await query<{ id: string }>(
    `SELECT id FROM uni_documents WHERE id = ANY($1) AND user_id = $2`,
    [documentIds, userId]
  );

  if (owned.length !== documentIds.length) {
    res.status(403).json({ error: "Algunos documentos no te pertenecen" });
    return;
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + mins * 60 * 1000);

  await query(
    `INSERT INTO uni_share_tokens (id, user_id, document_ids, label, expires_at, allow_file_view)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [token, userId, documentIds, label ?? null, expiresAt, allowFileView]
  );

  await log({
    userId,
    event: "share.created",
    ip: req.ip,
    metadata: { documentCount: documentIds.length, expiresInMinutes: mins },
  });

  const baseUrl = process.env["API_BASE_URL"] ?? "";
  res.json({
    token,
    url: `${baseUrl}/shared/${token}`,
    expiresAt: expiresAt.toISOString(),
  });
});

// ─── GET /share/history — historial del usuario ───────────────────────────────
router.get("/history", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const tokens = await query(
    `SELECT id, document_ids, label, expires_at, revoked, access_count, last_accessed_at, created_at
     FROM uni_share_tokens
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  );
  res.json(tokens);
});

// ─── DELETE /share/:token — revocar ──────────────────────────────────────────
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
  await log({ userId, event: "share.revoked", ip: req.ip, metadata: { token } });
  res.json({ ok: true });
});

// ─── GET /share/:token — vista pública (sin auth) ────────────────────────────
router.get("/:token", async (req: Request, res: Response) => {
  const { token } = req.params;

  const row = await queryOne<{
    id: string;
    user_id: string;
    document_ids: string[];
    label: string | null;
    expires_at: string;
    revoked: boolean;
    access_count: number;
    allow_file_view: boolean;
  }>(
    `SELECT id, user_id, document_ids, label, expires_at, revoked, access_count, allow_file_view
     FROM uni_share_tokens WHERE id = $1`,
    [token]
  );

  if (!row) { res.status(404).json({ error: "Enlace no encontrado" }); return; }
  if (row.revoked) { res.status(410).json({ error: "Este enlace fue revocado" }); return; }
  if (new Date(row.expires_at) < new Date()) {
    res.status(410).json({ error: "Este enlace expiró" });
    return;
  }

  // Registrar acceso
  await query(
    `UPDATE uni_share_tokens SET access_count = access_count + 1, last_accessed_at = NOW() WHERE id = $1`,
    [token]
  );

  const owner = await queryOne<{ name: string }>(
    `SELECT name FROM uni_users WHERE id = $1`,
    [row.user_id]
  );

  const docFields = row.allow_file_view
    ? "id, title, category, description, tags, file_name, file_type, file_size, created_at, updated_at"
    : "id, title, category, description, tags, created_at, updated_at";

  const docs = await query<{
    id: string;
    title: string;
    category: string;
    description: string | null;
    tags: string[] | null;
    file_name?: string | null;
    file_type?: string | null;
    file_size?: number | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT ${docFields} FROM uni_documents WHERE id = ANY($1) AND user_id = $2`,
    [row.document_ids, row.user_id]
  );

  await log({
    event: "share.accessed",
    ip: req.ip,
    metadata: { token: token.slice(0, 8) + "...", documentCount: docs.length },
  });

  const watermark = {
    ownerName: owner?.name ?? "Usuario",
    sharedAt: new Date().toISOString(),
    tokenId: token.slice(0, 8),
  };

  res.json({
    label: row.label,
    owner: { name: owner?.name ?? "Usuario" },
    documents: docs,
    expiresAt: row.expires_at,
    accessCount: row.access_count + 1,
    allowFileView: row.allow_file_view,
    watermark,
  });
});

export default router;
