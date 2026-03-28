import { query } from "./db";

export type AuditSeverity = "info" | "warn" | "critical";

export interface AuditEvent {
  userId?: string;
  event: string;
  severity?: AuditSeverity;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export async function log(ev: AuditEvent): Promise<void> {
  try {
    await query(
      `INSERT INTO uni_audit_logs (user_id, event, severity, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        ev.userId ?? null,
        ev.event,
        ev.severity ?? "info",
        ev.ip ?? null,
        ev.userAgent ?? null,
        ev.metadata ? JSON.stringify(ev.metadata) : null,
      ]
    );
  } catch (err) {
    console.error("[AUDIT] Failed to write log:", err);
  }
}

export async function getAuditLogs(userId: string, limit = 50) {
  return query(
    `SELECT event, severity, ip_address, metadata, created_at
     FROM uni_audit_logs WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
}
