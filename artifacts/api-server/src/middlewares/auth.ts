import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, JwtPayload } from "../lib/jwt";
import { log } from "../lib/audit";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token requerido" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err: any) {
    const ip = req.ip ?? "unknown";
    log({
      event: "auth.token_invalid",
      severity: "warn",
      ip,
      userAgent: req.headers["user-agent"],
      metadata: { reason: err.message },
    });
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}
