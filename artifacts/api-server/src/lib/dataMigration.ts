/**
 * Progressive field-level encryption migration.
 *
 * Runs on server startup (after schema migration).
 * For every user where name_enc IS NULL, encrypts their plaintext
 * name and bio into the encrypted columns using their DEK.
 * Idempotent — safe to run multiple times.
 */
import { query } from "./db";
import { encryptFieldAsync } from "./keyManager";
import { logger } from "./logger";

export async function runFieldEncryptionMigration(): Promise<void> {
  try {
    const users = await query<{ id: string; name: string; bio: string | null }>(
      `SELECT id, name, bio FROM uni_users WHERE name_enc IS NULL AND name IS NOT NULL LIMIT 500`
    );

    if (users.length === 0) return;

    logger.info(`🔐 Migrando ${users.length} usuarios a campos cifrados...`);

    let migrated = 0;
    for (const user of users) {
      try {
        const nameEnc = await encryptFieldAsync(user.name, user.id);
        const bioEnc = user.bio ? await encryptFieldAsync(user.bio, user.id) : null;
        await query(
          `UPDATE uni_users SET name_enc = $1, bio_enc = $2 WHERE id = $3`,
          [nameEnc, bioEnc, user.id]
        );
        migrated++;
      } catch (err: any) {
        logger.warn({ userId: user.id, err: err.message }, "⚠️  No se pudo migrar usuario");
      }
    }

    logger.info(`✅ Migración de campos cifrados completa: ${migrated}/${users.length} usuarios`);
  } catch (err: any) {
    logger.warn({ err: err.message }, "⚠️  runFieldEncryptionMigration: error no fatal");
  }
}
