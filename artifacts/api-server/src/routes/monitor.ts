import { Router, Request, Response } from "express";
import { query as dbQuery } from "express-validator";
import { requireAuth } from "../middlewares/auth";
import { getSecuritySummary, cleanExpiredAttempts } from "../lib/monitor";
import { query, queryOne } from "../lib/db";

const router = Router();

// ─── Health check (public) ────────────────────────────────────────────────────
router.get("/health", async (_req, res: Response) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok", db: "connected", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected", timestamp: new Date().toISOString() });
  }
});

// ─── Security dashboard (authenticated) ──────────────────────────────────────
router.get("/security", requireAuth, async (_req, res: Response) => {
  const summary = await getSecuritySummary();
  res.json(summary);
});

// ─── My activity log with filters (authenticated) ────────────────────────────
router.get("/my-activity", requireAuth, async (req: any, res: Response) => {
  const userId = req.user!.sub;
  const { severity, event, from, to, limit = "50" } = req.query as Record<string, string>;
  const maxLimit = Math.min(parseInt(limit, 10) || 50, 200);

  const conditions = ["user_id = $1"];
  const params: any[] = [userId];
  let idx = 2;

  if (severity) { conditions.push(`severity = $${idx++}`); params.push(severity); }
  if (event) { conditions.push(`event ILIKE $${idx++}`); params.push(`%${event}%`); }
  if (from) { conditions.push(`created_at >= $${idx++}`); params.push(new Date(from)); }
  if (to) { conditions.push(`created_at <= $${idx++}`); params.push(new Date(to)); }

  const logs = await query(
    `SELECT event, severity, ip_address, metadata, created_at
     FROM uni_audit_logs
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT $${idx}`,
    [...params, maxLimit]
  );

  res.json({ logs, count: logs.length, filters: { severity, event, from, to } });
});

// ─── Security events (authenticated) ─────────────────────────────────────────
router.get("/security-events", requireAuth, async (req: any, res: Response) => {
  const userId = req.user!.sub;
  const { severity, resolved, limit = "50" } = req.query as Record<string, string>;
  const maxLimit = Math.min(parseInt(limit, 10) || 50, 200);

  const conditions = ["user_id = $1"];
  const params: any[] = [userId];
  let idx = 2;

  if (severity) { conditions.push(`severity = $${idx++}`); params.push(severity); }
  if (resolved !== undefined) { conditions.push(`resolved = $${idx++}`); params.push(resolved === "true"); }

  const events = await query(
    `SELECT event_type, severity, ip_address, metadata, resolved, created_at
     FROM uni_security_events
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT $${idx}`,
    [...params, maxLimit]
  );

  res.json({ events, count: events.length });
});

// ─── Resolve a security event (authenticated) ─────────────────────────────────
router.patch("/security-events/:id/resolve", requireAuth, async (req: any, res: Response) => {
  const userId = req.user!.sub;
  const result = await query(
    `UPDATE uni_security_events SET resolved = TRUE
     WHERE id = $1 AND user_id = $2 RETURNING id`,
    [req.params.id, userId]
  );
  if (!result.length) { res.status(404).json({ error: "Evento no encontrado" }); return; }
  res.json({ ok: true });
});

// ─── Key management status (authenticated) ────────────────────────────────────
router.get("/keys", requireAuth, async (req: any, res: Response) => {
  const userId = req.user!.sub;
  const keyInfo = await queryOne(
    `SELECT key_version, created_at, rotated_at FROM uni_user_keys WHERE user_id = $1`,
    [userId]
  );
  const docCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM uni_documents WHERE user_id = $1`,
    [userId]
  );
  res.json({
    keyExists: !!keyInfo,
    keyVersion: keyInfo?.key_version ?? 0,
    keyCreated: keyInfo?.created_at,
    lastRotated: keyInfo?.rotated_at,
    encryptedDocuments: parseInt(docCount?.count ?? "0", 10),
  });
});

// ─── Cleanup maintenance (internal) ──────────────────────────────────────────
router.post("/cleanup", async (req, res: Response) => {
  const apiKey = req.headers["x-internal-key"];
  if (apiKey !== process.env["INTERNAL_API_KEY"]) {
    res.status(403).json({ error: "Acceso denegado" });
    return;
  }
  await cleanExpiredAttempts();
  await query(`DELETE FROM uni_refresh_tokens WHERE expires_at < NOW() - INTERVAL '1 day' AND revoked = TRUE`);
  await query(`UPDATE uni_recovery_codes SET used = TRUE WHERE expires_at < NOW() AND used = FALSE`);
  res.json({ ok: true, cleaned_at: new Date().toISOString() });
});

export default router;
