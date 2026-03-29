import { Pool } from "pg";

let pool: Pool | null = null;

export function getDb(): Pool {
  if (!pool) {
    const url = process.env["DATABASE_URL"];
    if (!url) {
      throw new Error(
        "\n\n❌  DATABASE_URL no está configurado.\n" +
        "   1. Copiá artifacts/api-server/.env.example → artifacts/api-server/.env\n" +
        "   2. Completá DATABASE_URL con tu connection string de PostgreSQL\n" +
        "   3. Podés crear una base gratuita en https://neon.tech o https://supabase.com\n" +
        "   4. Reiniciá el servidor con: pnpm dev\n"
      );
    }
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env["NODE_ENV"] === "production" ? { rejectUnauthorized: false } : false,
    });
    pool.on("error", (err) => {
      console.error("[DB] Unexpected pool error:", err);
    });
  }
  return pool;
}

export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const db = getDb();
  const { rows } = await db.query(sql, params);
  return rows as T[];
}

export async function queryOne<T = any>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
