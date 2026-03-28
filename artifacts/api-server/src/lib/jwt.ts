import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import { query, queryOne } from "./db";
import { generateSecureToken } from "./crypto";

const ACCESS_SECRET = process.env["JWT_ACCESS_SECRET"] ?? "changeme-access";
const REFRESH_SECRET = process.env["JWT_REFRESH_SECRET"] ?? "changeme-refresh";
const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES_DAYS = 30;

export interface JwtPayload {
  sub: string;
  deviceId: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(userId: string, deviceId: string): string {
  return jwt.sign({ sub: userId, deviceId }, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES,
  });
}

export async function signRefreshToken(
  userId: string,
  deviceMeta?: { deviceName?: string; devicePlatform?: string; deviceIp?: string }
): Promise<string> {
  const raw = generateSecureToken(48);
  const hash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 86400 * 1000);

  await query(
    `INSERT INTO uni_refresh_tokens (user_id, token_hash, expires_at, device_name, device_platform, device_ip, last_used_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      userId,
      hash,
      expiresAt,
      deviceMeta?.deviceName ?? null,
      deviceMeta?.devicePlatform ?? null,
      deviceMeta?.deviceIp ?? null,
    ]
  );
  return raw;
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export async function rotateRefreshToken(
  rawToken: string,
  deviceMeta?: { deviceName?: string; devicePlatform?: string; deviceIp?: string }
): Promise<{ userId: string; newRefresh: string; accessToken: string; deviceId: string } | null> {
  const hash = createHash("sha256").update(rawToken).digest("hex");
  const row = await queryOne<{
    id: string;
    user_id: string;
    expires_at: Date;
    revoked: boolean;
  }>(
    `SELECT id, user_id, expires_at, revoked FROM uni_refresh_tokens WHERE token_hash = $1`,
    [hash]
  );

  if (!row || row.revoked || row.expires_at < new Date()) return null;

  // Revoke old token
  await query(
    `UPDATE uni_refresh_tokens SET revoked = TRUE WHERE token_hash = $1`,
    [hash]
  );

  const user = await queryOne<{ id: string; device_id: string }>(
    `SELECT id, device_id FROM uni_users WHERE id = $1`,
    [row.user_id]
  );
  if (!user) return null;

  const newRefresh = await signRefreshToken(user.id, deviceMeta);
  const accessToken = signAccessToken(user.id, user.device_id);
  return { userId: user.id, newRefresh, accessToken, deviceId: user.device_id };
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await query(
    `UPDATE uni_refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE`,
    [userId]
  );
}

export async function updateTokenLastUsed(tokenHash: string): Promise<void> {
  await query(
    `UPDATE uni_refresh_tokens SET last_used_at = NOW() WHERE token_hash = $1`,
    [tokenHash]
  );
}
