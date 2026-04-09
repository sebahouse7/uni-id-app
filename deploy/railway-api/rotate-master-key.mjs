/**
 * rotate-master-key.mjs
 *
 * One-time migration: re-wraps all user DEKs from the old master key
 * (derived from JWT_SECRET) to a new dedicated ENCRYPTION_MASTER_KEY.
 *
 * SAFE: does NOT touch any document data — only re-wraps the DEK
 * wrappers stored in uni_user_keys. Documents remain unmodified.
 *
 * Usage:
 *   NEW_MASTER_KEY=<64-hex-chars> node rotate-master-key.mjs
 */

import pg from "pg";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { readFileSync } from "fs";

const ALGORITHM = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 16;
const TAG_LEN = 16;

// ─── Derive old master key (same logic as keyManager.ts fallback) ─────────────
function deriveOldMasterKey(jwtSecret) {
  return createHash("sha256")
    .update("uniid::dek::master::" + jwtSecret + "::v1")
    .digest();
}

// ─── Unwrap DEK with old master ───────────────────────────────────────────────
function unwrapDEK(wrapped, masterKey) {
  const buf = Buffer.from(wrapped, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

// ─── Re-wrap DEK with new master ──────────────────────────────────────────────
function wrapDEK(dek, masterKey) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

async function rotate() {
  const newMasterHex = process.env.NEW_MASTER_KEY;
  const jwtSecret = process.env.JWT_SECRET;
  const dbUrl = process.env.DATABASE_URL;

  if (!newMasterHex || newMasterHex.length < 64) {
    console.error("❌  NEW_MASTER_KEY must be set (64 hex chars)");
    process.exit(1);
  }
  if (!jwtSecret) {
    console.error("❌  JWT_SECRET must be set");
    process.exit(1);
  }
  if (!dbUrl) {
    console.error("❌  DATABASE_URL must be set");
    process.exit(1);
  }

  const oldMaster = deriveOldMasterKey(jwtSecret);
  const newMaster = Buffer.from(newMasterHex.slice(0, 64), "hex");

  console.log("🔗  Connecting to database...");
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT user_id, wrapped_dek, key_version FROM uni_user_keys`
    );
    console.log(`🔑  Found ${rows.length} DEK(s) to rotate`);

    let rotated = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        // 1. Unwrap with old master
        const dek = unwrapDEK(row.wrapped_dek, oldMaster);

        // 2. Verify it's 32 bytes
        if (dek.length !== KEY_LEN) {
          throw new Error(`DEK length ${dek.length} != 32`);
        }

        // 3. Re-wrap with new master
        const newWrapped = wrapDEK(dek, newMaster);

        // 4. Update DB
        await client.query(
          `UPDATE uni_user_keys
           SET wrapped_dek = $1, rotated_at = NOW(), key_version = key_version + 1
           WHERE user_id = $2`,
          [newWrapped, row.user_id]
        );

        rotated++;
        console.log(`  ✓  user ${row.user_id.slice(0, 8)}... (version ${row.key_version} → ${row.key_version + 1})`);
      } catch (err) {
        failed++;
        console.error(`  ✗  user ${row.user_id.slice(0, 8)}... FAILED: ${err.message}`);
      }
    }

    console.log("");
    if (failed === 0) {
      console.log(`✅  Rotation complete: ${rotated}/${rows.length} DEKs re-wrapped successfully`);
      console.log("📌  Next step: set ENCRYPTION_MASTER_KEY=" + newMasterHex + " in Railway");
    } else {
      console.error(`⚠️   Partial rotation: ${rotated} OK, ${failed} FAILED`);
      console.error("    Do NOT set ENCRYPTION_MASTER_KEY until all DEKs rotate successfully.");
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

rotate().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
