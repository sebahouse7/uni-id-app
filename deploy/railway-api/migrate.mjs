/**
 * uni.id — Railway schema migration
 * Runs automatically on every deploy before starting the server.
 * Uses IF NOT EXISTS on all tables so re-runs are safe.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pkg from "pg";
const { Pool } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn("⚠️  DATABASE_URL not set — skipping migration. Server will start but DB endpoints will fail.");
  process.exit(0);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

async function migrate() {
  let client;
  try {
    client = await pool.connect();
    console.log("🔄 Running schema migration...");
    const sql = readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
    await client.query(sql);
    console.log("✅ Schema migration complete.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    console.warn("⚠️  Server will start but DB may be in inconsistent state.");
    // Don't exit(1) — let the server start anyway
  } finally {
    if (client) client.release();
    await pool.end().catch(() => {});
  }
}

await migrate();
