import { Router, Request, Response } from "express";
import { param, validationResult } from "express-validator";
import { requireAuth } from "../middlewares/auth";
import { getActiveSessions, revokeSession, raiseSecurityEvent } from "../lib/monitor";
import { revokeAllUserTokens } from "../lib/jwt";
import { log } from "../lib/audit";

const router = Router();
router.use(requireAuth);

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return false; }
  return true;
};

// GET all active sessions for current user
router.get("/", async (req: Request, res: Response) => {
  const sessions = await getActiveSessions(req.user!.sub);
  res.json({ sessions });
});

// DELETE a specific session (revoke by ID)
router.delete(
  "/:id",
  [param("id").isUUID()],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const userId = req.user!.sub;
    const ok = await revokeSession(req.params.id, userId);
    if (!ok) { res.status(404).json({ error: "Sesión no encontrada" }); return; }
    await log({ userId, event: "session.revoked", ip: req.ip, metadata: { sessionId: req.params.id } });
    res.json({ ok: true });
  }
);

// DELETE all sessions (logout everywhere)
router.delete("/", async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  await revokeAllUserTokens(userId);
  await log({ userId, event: "session.revoked_all", ip: req.ip, severity: "warn" });
  await raiseSecurityEvent({ eventType: "all_sessions_revoked", severity: "warn", userId, ip: req.ip });
  res.json({ ok: true, message: "Todas las sesiones cerradas" });
});

export default router;
