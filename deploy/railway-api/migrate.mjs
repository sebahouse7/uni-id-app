/**
 * uni.id — Railway schema migration
 * Runs automatically on every deploy before starting the server.
 * Uses IF NOT EXISTS on all tables so re-runs are safe.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Cannot run migrations.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("🔄 Running schema migration...");
    const sql = readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
    await client.query(sql);
    console.log("✅ Schema migration complete.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

await migrate();
