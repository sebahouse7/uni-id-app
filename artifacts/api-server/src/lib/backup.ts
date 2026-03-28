import { query } from "./db";
import { decryptFieldAsync } from "./keyManager";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const BACKUP_ALGORITHM = "aes-256-gcm";

export async function generateEncryptedBackup(
  userId: string,
  userPin: string
): Promise<string> {
  const docs = await query(
    `SELECT id, title, category, description_enc, file_uri_enc, file_name_enc, tags, created_at, updated_at
     FROM uni_documents WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );

  const user = await query(
    `SELECT name, bio, network_plan, created_at FROM uni_users WHERE id = $1`,
    [userId]
  );

  // Decrypt each field using the user's DEK (async, parallel per doc)
  const decryptedDocs = await Promise.all(
    docs.map(async (doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      description: doc.description_enc
        ? await decryptFieldAsync(doc.description_enc, userId).catch(() => null)
        : null,
      fileUri: doc.file_uri_enc
        ? await decryptFieldAsync(doc.file_uri_enc, userId).catch(() => null)
        : null,
      fileName: doc.file_name_enc
        ? await decryptFieldAsync(doc.file_name_enc, userId).catch(() => null)
        : null,
      tags: doc.tags,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    }))
  );

  const payload = JSON.stringify({
    version: "2.0",
    userId,
    user: user[0],
    documents: decryptedDocs,
    exportedAt: new Date().toISOString(),
    documentCount: decryptedDocs.length,
  });

  // Encrypt the backup payload with the user-provided PIN (scrypt KDF)
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const key = scryptSync(userPin, salt, 32);
  const cipher = createCipheriv(BACKUP_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
}

export async function decryptBackup(
  encryptedBase64: string,
  userPin: string
): Promise<any> {
  const combined = Buffer.from(encryptedBase64, "base64");
  const salt = combined.subarray(0, 32);
  const iv = combined.subarray(32, 48);
  const tag = combined.subarray(48, 64);
  const encrypted = combined.subarray(64);

  const key = scryptSync(userPin, salt, 32);
  const decipher = createDecipheriv(BACKUP_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}
