import { query, queryOne } from "./db";
import { checkAndAlert } from "./alerting";

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

/**
 * Checks whether an IP address has exceeded a threshold of matching events
 * within a given time window — used for anomaly detection.
 *
 * @param ip             The IP address to check.
 * @param eventPattern   SQL LIKE pattern (e.g. "share.access%" or "auth.%fail%").
 * @param threshold      Number of events before triggering abuse flag.
 * @param windowMinutes  Time window in minutes to look back.
 * @returns              { isAbuse, count }
 */
export async function checkIpAbuse(
  ip: string,
  eventPattern: string,
  threshold: number = 5,
  windowMinutes: number = 5
): Promise<{ isAbuse: boolean; count: number }> {
  try {
    if (!ip || ip === "unknown") return { isAbuse: false, count: 0 };
    const row = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
       FROM uni_audit_logs
       WHERE ip_address = $1
         AND event LIKE $2
         AND created_at > NOW() - ($3 * INTERVAL '1 minute')`,
      [ip, eventPattern, windowMinutes]
    );
    const count = parseInt(row?.cnt ?? "0", 10);
    return { isAbuse: count >= threshold, count };
  } catch {
    return { isAbuse: false, count: 0 };
  }
}

/**
 * Convenience: log an anomaly event and return the abuse check result.
 * Logs at "critical" severity if abuse threshold is exceeded.
 */
export async function detectAndLogAnomaly(opts: {
  ip: string;
  eventPattern: string;
  anomalyEvent: string;
  threshold?: number;
  windowMinutes?: number;
  metadata?: Record<string, any>;
}): Promise<boolean> {
  const { isAbuse, count } = await checkIpAbuse(
    opts.ip,
    opts.eventPattern,
    opts.threshold ?? 5,
    opts.windowMinutes ?? 5
  );
  if (isAbuse) {
    await log({
      event: opts.anomalyEvent,
      severity: "critical",
      ip: opts.ip,
      metadata: { count, windowMinutes: opts.windowMinutes ?? 5, ...opts.metadata },
    });
    // Fire real-time alert if threshold exceeded (non-blocking)
    checkAndAlert(opts.anomalyEvent, opts.ip).catch(() => {});
  }
  return isAbuse;
}
