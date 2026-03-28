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

export async function signRefreshToken(userId: string): Promise<string> {
  const raw = generateSecureToken(48);
  const hash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 86400 * 1000);
  await query(
    `INSERT INTO uni_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt]
  );
  return raw;
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export async function rotateRefreshToken(
  rawToken: string
): Promise<{ userId: string; newRefresh: string; accessToken: string; deviceId: string } | null> {
  const hash = createHash("sha256").update(rawToken).digest("hex");
  const row = await queryOne<{ user_id: string; expires_at: Date; revoked: boolean }>(
    `SELECT user_id, expires_at, revoked FROM uni_refresh_tokens WHERE token_hash = $1`,
    [hash]
  );
  if (!row || row.revoked || row.expires_at < new Date()) return null;
  await query(`UPDATE uni_refresh_tokens SET revoked = TRUE WHERE token_hash = $1`, [hash]);
  const user = await queryOne<{ id: string; device_id: string }>(
    `SELECT id, device_id FROM uni_users WHERE id = $1`,
    [row.user_id]
  );
  if (!user) return null;
  const newRefresh = await signRefreshToken(user.id);
  const accessToken = signAccessToken(user.id, user.device_id);
  return { userId: user.id, newRefresh, accessToken, deviceId: user.device_id };
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await query(
    `UPDATE uni_refresh_tokens SET revoked = TRUE WHERE user_id = $1`,
    [userId]
  );
}
