/**
 * Real-time security alerting system.
 *
 * Checks whether critical security events from a given IP have exceeded
 * a threshold within a rolling time window. If they have, sends an email
 * alert to the configured SMTP admin address. Deduplicates alerts so the
 * same IP does not trigger repeated emails in the same window.
 */
import { query } from "./db";
import { sendEmail } from "./email";
import { logger } from "./logger";

const ALERT_WINDOW_MINUTES = 5;
const ALERT_THRESHOLD = 10;

/** In-memory dedup: IP → last alert timestamp */
const alertCooldown = new Map<string, number>();
const COOLDOWN_MS = ALERT_WINDOW_MINUTES * 60 * 1000;

export async function checkAndAlert(eventType: string, ip: string | null | undefined): Promise<void> {
  if (!ip) return;

  const now = Date.now();
  const lastAlert = alertCooldown.get(ip) ?? 0;
  if (now - lastAlert < COOLDOWN_MS) return; // already alerted recently

  try {
    const rows = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM uni_security_events
       WHERE ip_address = $1
         AND severity IN ('critical','high')
         AND created_at >= NOW() - INTERVAL '${ALERT_WINDOW_MINUTES} minutes'`,
      [ip]
    );
    const count = parseInt(rows[0]?.count ?? "0", 10);
    if (count < ALERT_THRESHOLD) return;

    // Mark cooldown before sending to prevent race
    alertCooldown.set(ip, now);

    logger.warn({ ip, count, eventType }, `🚨 ALERTA: ${count} eventos críticos en ${ALERT_WINDOW_MINUTES}min desde ${ip}`);

    const adminEmail = process.env["SMTP_FROM"] ?? process.env["SMTP_USER"];
    if (!adminEmail) return;

    await sendEmail({
      to: adminEmail,
      subject: `🚨 uni.id — Alerta de seguridad: ${count} eventos críticos desde ${ip}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#dc2626">⚠️ Alerta de Seguridad — uni.id</h2>
          <p>Se detectaron <strong>${count} eventos críticos</strong> en los últimos <strong>${ALERT_WINDOW_MINUTES} minutos</strong>
             desde la IP <code style="background:#f3f4f6;padding:2px 6px;border-radius:3px">${ip}</code>.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr style="background:#fef2f2">
              <td style="padding:8px;border:1px solid #fca5a5"><strong>Tipo de evento</strong></td>
              <td style="padding:8px;border:1px solid #fca5a5">${eventType}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb"><strong>IP</strong></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${ip}</td>
            </tr>
            <tr style="background:#f9fafb">
              <td style="padding:8px;border:1px solid #e5e7eb"><strong>Eventos críticos</strong></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${count}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb"><strong>Ventana</strong></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${ALERT_WINDOW_MINUTES} minutos</td>
            </tr>
            <tr style="background:#f9fafb">
              <td style="padding:8px;border:1px solid #e5e7eb"><strong>Timestamp</strong></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${new Date().toISOString()}</td>
            </tr>
          </table>
          <p style="color:#6b7280;font-size:14px">
            Revisá el panel de seguridad en <code>/admin/security-dashboard</code> para más detalles.
            <br>Este es un mensaje automático del sistema uni.id — human.id labs S.A.S.
          </p>
        </div>
      `,
      text: `ALERTA uni.id: ${count} eventos críticos desde IP ${ip} en los últimos ${ALERT_WINDOW_MINUTES} minutos. Evento: ${eventType}. Revisá /admin/security-dashboard.`,
    });

    logger.info({ ip, adminEmail }, "✅ Email de alerta de seguridad enviado");
  } catch (err: any) {
    logger.warn({ err: err.message }, "checkAndAlert: error no fatal");
  }
}
