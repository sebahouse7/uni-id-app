/**
 * Key Management — hybrid key wrapping system
 *
 * Architecture:
 *   Master Key (server env var, 256-bit)
 *     └─ wraps → DEK (Data Encryption Key, per user, 256-bit random)
 *                 └─ encrypts → document fields (AES-256-GCM)
 *
 * Benefits:
 *   - Key rotation: just re-wrap DEK with new master key, no re-encryption of documents
 *   - Recovery: DEK lives on server, account recovery restores full access
 *   - Zero exposure: DEK and master key never leave the server
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { query, queryOne } from "./db";

const ALGORITHM = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 16;
const TAG_LEN = 16;

function getMasterKey(): Buffer {
  const raw = process.env["ENCRYPTION_MASTER_KEY"];
  if (raw && raw.length >= 64) return Buffer.from(raw.slice(0, 64), "hex");
  // Fallback: derive from JWT_SECRET so documents work without manual setup
  const jwt = process.env["JWT_SECRET"] ?? "uniid_default_fallback_key_change_in_production_2024";
  return createHash("sha256")
    .update("uniid::dek::master::" + jwt + "::v1")
    .digest();
}

function wrapKey(dek: Buffer, masterKey: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function unwrapKey(wrapped: string, masterKey: Buffer): Buffer {
  const buf = Buffer.from(wrapped, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

/** Get or create the DEK for a user. Returns the raw DEK buffer. */
export async function getUserDEK(userId: string): Promise<Buffer> {
  const master = getMasterKey();
  const row = await queryOne<{ wrapped_dek: string }>(
    `SELECT wrapped_dek FROM uni_user_keys WHERE user_id = $1`,
    [userId]
  );
  if (row) return unwrapKey(row.wrapped_dek, master);

  // First time — generate a new DEK and store it wrapped
  const dek = randomBytes(KEY_LEN);
  const wrapped = wrapKey(dek, master);
  await query(
    `INSERT INTO uni_user_keys (user_id, wrapped_dek, key_version) VALUES ($1, $2, 1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, wrapped]
  );
  return dek;
}

/** Rotate master key: re-wrap all DEKs with a new master key. */
export async function rotateMasterKey(newMasterHex: string): Promise<number> {
  const oldMaster = getMasterKey();
  const newMaster = Buffer.from(newMasterHex, "hex");
  const rows = await query<{ user_id: string; wrapped_dek: string }>(
    `SELECT user_id, wrapped_dek FROM uni_user_keys`
  );
  let rotated = 0;
  for (const row of rows) {
    const dek = unwrapKey(row.wrapped_dek, oldMaster);
    const rewrapped = wrapKey(dek, newMaster);
    await query(
      `UPDATE uni_user_keys SET wrapped_dek = $1, rotated_at = NOW(), key_version = key_version + 1
       WHERE user_id = $2`,
      [rewrapped, row.user_id]
    );
    rotated++;
  }
  return rotated;
}

/** Encrypt a field using the user's DEK. */
export async function encryptFieldAsync(plaintext: string, userId: string): Promise<string> {
  const dek = await getUserDEK(userId);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, dek, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** Decrypt a field using the user's DEK. */
export async function decryptFieldAsync(ciphertext: string, userId: string): Promise<string> {
  const dek = await getUserDEK(userId);
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Hash an email for lookup without storing it in plaintext. */
export function hashEmail(email: string): string {
  return createHash("sha256")
    .update(email.toLowerCase().trim())
    .digest("hex");
}
