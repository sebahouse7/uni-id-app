import { Router, Request, Response } from "express";
import { requireAuth } from "../middlewares/auth";
import { getSecuritySummary, cleanExpiredAttempts } from "../lib/monitor";
import { query, queryOne } from "../lib/db";
import { testSmtpConnection, sendEmail, buildRecoveryEmail } from "../lib/email";

const router = Router();

// ─── Health check (public) ────────────────────────────────────────────────────
router.get("/health", async (_req, res: Response) => {
  try {
    await query("SELECT 1");
    res.json({
      status: "ok",
      db: "connected",
      timestamp: new Date().toISOString(),
      services: {
        mercadopago: !!process.env["MP_ACCESS_TOKEN"],
        stripe: !!process.env["STRIPE_SECRET_KEY"],
        smtp: !!(process.env["SMTP_HOST"] && process.env["SMTP_USER"] && process.env["SMTP_PASS"]),
        webhookSignature: !!process.env["MP_WEBHOOK_SECRET"],
      },
    });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected", timestamp: new Date().toISOString() });
  }
});

// ─── Email configuration test (authenticated) ─────────────────────────────────
router.get("/email-test", requireAuth, async (req: any, res: Response) => {
  const result = await testSmtpConnection();
  res.json({
    smtp: result,
    configured: result.configured,
    recommendation: result.configured
      ? result.ok
        ? "SMTP listo para producción"
        : `SMTP configurado pero la conexión falló: ${result.error}`
      : "Configura SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM para envío real de emails",
  });
});

// ─── Send a test email (authenticated, dev only) ──────────────────────────────
router.post("/email-test", requireAuth, async (req: any, res: Response) => {
  if (process.env["NODE_ENV"] === "production") {
    res.status(403).json({ error: "No disponible en producción" });
    return;
  }
  const userId = req.user!.sub;
  const user = await queryOne<{ name: string }>(
    `SELECT name FROM uni_users WHERE id = $1`, [userId]
  );
  const target = req.body?.email ?? req.body?.to;
  if (!target) { res.status(400).json({ error: "Campo 'email' requerido" }); return; }

  const content = buildRecoveryEmail("123456", req.body?.lang ?? "es", {
    ip: req.ip ?? "192.168.1.1",
    device: "Samsung Galaxy S24 (Android)",
  });
  const result = await sendEmail({ to: target, ...content });

  res.json({
    sent: result.sent,
    target,
    smtpConfigured: result.sent || !result.previewCode,
    devCode: result.previewCode ? "123456" : undefined,
    error: result.error,
  });
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

// ─── Admin security dashboard (internal — requires x-internal-key) ───────────
router.get("/admin/security-dashboard", async (req, res: Response) => {
  const apiKey = req.headers["x-internal-key"];
  if (apiKey !== process.env["INTERNAL_API_KEY"]) {
    res.status(403).json({ error: "Acceso denegado" });
    return;
  }

  const [suspiciousIps, recentCritical, severityCounts, rateLimitHits, totalUsers, totalDocs] = await Promise.all([
    // Top 10 IPs with most security events in last 24h
    query<{ ip_address: string; event_count: string; last_seen: string }>(
      `SELECT ip_address, COUNT(*) AS event_count, MAX(created_at) AS last_seen
       FROM uni_security_events
       WHERE created_at >= NOW() - INTERVAL '24 hours'
         AND ip_address IS NOT NULL
       GROUP BY ip_address
       ORDER BY event_count DESC
       LIMIT 10`
    ),
    // Last 50 critical/high events
    query<{ event_type: string; severity: string; ip_address: string; metadata: any; created_at: string }>(
      `SELECT event_type, severity, ip_address, metadata, created_at
       FROM uni_security_events
       WHERE severity IN ('critical','high')
         AND created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT 50`
    ),
    // Event counts by severity in last 24h
    query<{ severity: string; count: string }>(
      `SELECT severity, COUNT(*) AS count
       FROM uni_audit_logs
       WHERE created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY severity`
    ),
    // Rate limit related failures (4xx from failed attempts)
    query<{ endpoint: string; count: string }>(
      `SELECT endpoint, COUNT(*) AS count
       FROM uni_failed_attempts
       WHERE attempted_at >= NOW() - INTERVAL '24 hours'
       GROUP BY endpoint
       ORDER BY count DESC
       LIMIT 10`
    ),
    // Platform stats
    queryOne<{ count: string }>(`SELECT COUNT(*) AS count FROM uni_users`),
    queryOne<{ count: string }>(`SELECT COUNT(*) AS count FROM uni_documents`),
  ]);

  res.json({
    generatedAt: new Date().toISOString(),
    platform: {
      totalUsers: parseInt(totalUsers?.count ?? "0", 10),
      totalDocuments: parseInt(totalDocs?.count ?? "0", 10),
    },
    suspiciousIps: suspiciousIps.map((r) => ({
      ip: r.ip_address,
      events: parseInt(r.event_count, 10),
      lastSeen: r.last_seen,
    })),
    recentCriticalEvents: recentCritical,
    severityMetrics: Object.fromEntries(severityCounts.map((r) => [r.severity, parseInt(r.count, 10)])),
    rateLimitHits: rateLimitHits.map((r) => ({
      endpoint: r.endpoint,
      failures: parseInt(r.count, 10),
    })),
    alertThreshold: {
      criticalEventsPerIpIn5Min: 10,
      description: "Email de alerta se dispara cuando una IP supera este umbral",
    },
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
