import { Router, Request, Response } from "express";
import { requireAuth } from "../middlewares/auth";
import { getSecuritySummary, cleanExpiredAttempts } from "../lib/monitor";
import { getAuditLogs } from "../lib/audit";
import { query } from "../lib/db";

const router = Router();

// Internal health + security status (public endpoint for uptime checks)
router.get("/health", async (_req: Request, res: Response) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok", db: "connected", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected", timestamp: new Date().toISOString() });
  }
});

// Security dashboard (authenticated)
router.get("/security", requireAuth, async (req: Request, res: Response) => {
  const summary = await getSecuritySummary();
  res.json(summary);
});

// My audit log (authenticated)
router.get("/my-activity", requireAuth, async (req: Request, res: Response) => {
  const logs = await getAuditLogs(req.user!.sub, 100);
  res.json({ logs });
});

// Maintenance: clean expired data (internal use)
router.post("/cleanup", async (req: Request, res: Response) => {
  const apiKey = req.headers["x-internal-key"];
  if (apiKey !== process.env["INTERNAL_API_KEY"]) {
    res.status(403).json({ error: "Acceso denegado" });
    return;
  }
  await cleanExpiredAttempts();
  await query(`DELETE FROM uni_refresh_tokens WHERE expires_at < NOW() - INTERVAL '1 day' AND revoked = TRUE`);
  res.json({ ok: true, cleaned_at: new Date().toISOString() });
});

export default router;
