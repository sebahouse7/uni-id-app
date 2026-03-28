import { query, queryOne } from "./db";

const BRUTE_FORCE_THRESHOLD = 10;
const BRUTE_FORCE_WINDOW_MINUTES = 15;
const ALERT_CRITICAL_THRESHOLD = 5;

export async function recordFailedAttempt(ip: string, endpoint: string): Promise<void> {
  await query(
    `INSERT INTO uni_failed_attempts (ip_address, endpoint) VALUES ($1, $2)`,
    [ip, endpoint]
  );
  await checkBruteForce(ip, endpoint);
}

export async function checkBruteForce(ip: string, endpoint: string): Promise<void> {
  const result = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM uni_failed_attempts
     WHERE ip_address = $1
       AND attempted_at > NOW() - INTERVAL '${BRUTE_FORCE_WINDOW_MINUTES} minutes'`,
    [ip]
  );
  const count = parseInt(result?.count ?? "0", 10);
  if (count >= BRUTE_FORCE_THRESHOLD) {
    await raiseSecurityEvent({
      eventType: "brute_force_detected",
      severity: "critical",
      ip,
      metadata: { count, endpoint, window_minutes: BRUTE_FORCE_WINDOW_MINUTES },
    });
  }
}

export async function raiseSecurityEvent(ev: {
  eventType: string;
  severity: "info" | "warn" | "critical";
  ip?: string;
  userId?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  await query(
    `INSERT INTO uni_security_events (event_type, severity, ip_address, user_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [ev.eventType, ev.severity, ev.ip ?? null, ev.userId ?? null, ev.metadata ? JSON.stringify(ev.metadata) : null]
  );
}

export async function getSecuritySummary() {
  const [criticalCount] = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM uni_security_events
     WHERE severity = 'critical' AND resolved = FALSE AND created_at > NOW() - INTERVAL '24 hours'`
  );
  const [warnCount] = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM uni_security_events
     WHERE severity = 'warn' AND resolved = FALSE AND created_at > NOW() - INTERVAL '24 hours'`
  );
  const recentEvents = await query(
    `SELECT event_type, severity, ip_address, metadata, created_at
     FROM uni_security_events
     ORDER BY created_at DESC LIMIT 20`
  );
  const [activeUsers] = await query<{ count: string }>(
    `SELECT COUNT(DISTINCT user_id) as count FROM uni_refresh_tokens
     WHERE revoked = FALSE AND expires_at > NOW() AND last_used_at > NOW() - INTERVAL '7 days'`
  );
  const [totalDocs] = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM uni_documents`
  );
  const [totalUsers] = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM uni_users`
  );

  return {
    status: parseInt(criticalCount?.count ?? "0") > 0 ? "alert" : "healthy",
    unresolved: {
      critical: parseInt(criticalCount?.count ?? "0"),
      warn: parseInt(warnCount?.count ?? "0"),
    },
    stats: {
      total_users: parseInt(totalUsers?.count ?? "0"),
      active_sessions: parseInt(activeUsers?.count ?? "0"),
      total_documents: parseInt(totalDocs?.count ?? "0"),
    },
    recent_events: recentEvents,
    generated_at: new Date().toISOString(),
  };
}

export async function getActiveSessions(userId: string) {
  return query(
    `SELECT id, device_name, device_platform, device_ip, last_used_at, expires_at, created_at
     FROM uni_refresh_tokens
     WHERE user_id = $1 AND revoked = FALSE AND expires_at > NOW()
     ORDER BY last_used_at DESC NULLS LAST`,
    [userId]
  );
}

export async function revokeSession(sessionId: string, userId: string): Promise<boolean> {
  const result = await query(
    `UPDATE uni_refresh_tokens SET revoked = TRUE
     WHERE id = $1 AND user_id = $2 AND revoked = FALSE
     RETURNING id`,
    [sessionId, userId]
  );
  return result.length > 0;
}

export async function cleanExpiredAttempts(): Promise<void> {
  await query(
    `DELETE FROM uni_failed_attempts WHERE attempted_at < NOW() - INTERVAL '24 hours'`
  );
}
