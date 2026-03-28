/**
 * Ownership verification middleware
 * Ensures every user can ONLY access their own data.
 * Applied at the DB query level — not just at the route level.
 */
import { Request, Response, NextFunction } from "express";
import { queryOne } from "../lib/db";
import { log } from "../lib/audit";
import { raiseSecurityEvent } from "../lib/monitor";

type ResourceTable = "uni_documents" | "uni_subscriptions" | "uni_recovery_codes";

export function verifyOwnership(table: ResourceTable, paramName = "id") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const resourceId = req.params[paramName];
    const userId = req.user?.sub;

    if (!userId) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }

    if (!resourceId) {
      next();
      return;
    }

    const row = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM ${table} WHERE id = $1`,
      [resourceId]
    );

    if (!row) {
      res.status(404).json({ error: "Recurso no encontrado" });
      return;
    }

    if (row.user_id !== userId) {
      // This should never happen in normal usage — log as critical
      await log({
        userId,
        event: "security.unauthorized_access_attempt",
        severity: "critical",
        ip: req.ip,
        metadata: { table, resourceId, resourceOwner: row.user_id },
      });
      await raiseSecurityEvent({
        eventType: "unauthorized_resource_access",
        severity: "critical",
        userId,
        ip: req.ip,
        metadata: { table, resourceId },
      });
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }

    next();
  };
}

/**
 * Middleware that injects the authenticated user_id into DB queries automatically.
 * Use `req.safeUserId` in routes that need it.
 */
export function injectUserId(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.sub) {
    (req as any).safeUserId = req.user.sub;
  }
  next();
}
