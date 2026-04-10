/**
 * activityLog.ts
 *
 * Registro de actividad de identidad — capa de auditoría orientada al usuario.
 * NO almacena datos sensibles: solo tipos de datos, no valores.
 *
 * Diferencia con uni_audit_logs (técnico/interno):
 *   - activity_logs: orientado al usuario final, se muestra en la app
 *   - uni_audit_logs: técnico, para monitoreo de seguridad interno
 */

import { query } from "./db";

// ── Types ──────────────────────────────────────────────────────────────────

export type ActionType =
  | "share"     // compartir identidad online
  | "verify"    // verificar identidad de otro
  | "receive"   // recibir solicitud de verificación
  | "sign"      // firmar documento
  | "login"     // inicio de sesión
  | "payment"   // pago / suscripción
  | "offline";  // paquete offline generado

export type ActivityResult  = "success" | "rejected" | "pending";
export type ActivityTrust   = "high" | "medium" | "low";

export interface ActivityLogEntry {
  userId: string;
  actionType: ActionType;
  context?: string;        // banco, gobierno, hospital, inmobiliaria, empresa…
  target?: string;         // nombre de la entidad/persona destino
  dataShared?: string[];   // ["nombre","dni","bio"] — NUNCA valores, solo tipos
  hash?: string;           // hash del paquete compartido
  signature?: string;      // firma involucrada (truncada)
  result?: ActivityResult;
  trustLevel?: ActivityTrust;
  ip?: string;
  device?: string;
}

// ── Core function ──────────────────────────────────────────────────────────

/**
 * Registra una acción de identidad en activity_logs.
 * Fire-and-forget — no lanza excepciones para no bloquear el flujo principal.
 */
export function logActivity(entry: ActivityLogEntry): void {
  const {
    userId,
    actionType,
    context,
    target,
    dataShared,
    hash,
    signature,
    result = "success",
    trustLevel,
    ip,
    device,
  } = entry;

  // Validación mínima: data_shared solo puede contener tipos (strings cortos, sin ":"), no valores
  const safeDataShared = dataShared
    ? dataShared.filter((d) => typeof d === "string" && d.length < 40 && !d.includes(":"))
    : null;

  query(
    `INSERT INTO activity_logs
       (user_id, action_type, context, target, data_shared, hash, signature,
        result, trust_level, ip, device)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      userId,
      actionType,
      context ?? null,
      target ?? null,
      safeDataShared ? JSON.stringify(safeDataShared) : null,
      hash ?? null,
      signature ? signature.slice(0, 64) : null, // nunca la firma completa
      result,
      trustLevel ?? null,
      ip ?? null,
      device ?? null,
    ]
  ).catch((err) => {
    console.error("[ACTIVITY] Failed to write activity log:", err?.message);
  });
}

// ── Query helpers ──────────────────────────────────────────────────────────

export interface ActivityFilter {
  type?: ActionType;
  context?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export async function getActivityLogs(
  userId: string,
  filter: ActivityFilter = {}
): Promise<any[]> {
  const { type, context, from, to, limit = 50, offset = 0 } = filter;

  const conditions: string[] = ["user_id = $1"];
  const params: any[] = [userId];
  let idx = 2;

  if (type) { conditions.push(`action_type = $${idx++}`); params.push(type); }
  if (context) { conditions.push(`context ILIKE $${idx++}`); params.push(`%${context}%`); }
  if (from) { conditions.push(`created_at >= $${idx++}`); params.push(from); }
  if (to) { conditions.push(`created_at <= $${idx++}`); params.push(to); }

  const where = conditions.join(" AND ");

  return query(
    `SELECT id, action_type, context, target, data_shared, hash,
            result, trust_level, ip, device, created_at
     FROM activity_logs
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );
}

export async function getActivityDetail(
  userId: string,
  id: string
): Promise<any | null> {
  const rows = await query(
    `SELECT id, action_type, context, target, data_shared, hash, signature,
            result, trust_level, ip, device, created_at
     FROM activity_logs
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] ?? null;
}

export async function countActivity(userId: string): Promise<number> {
  const rows = await query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM activity_logs WHERE user_id = $1`,
    [userId]
  );
  return parseInt(rows[0]?.cnt ?? "0", 10);
}
