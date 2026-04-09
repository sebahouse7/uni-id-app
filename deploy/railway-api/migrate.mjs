/**
 * uni.id — Railway schema migration
 * Schema SQL is embedded directly — no external file dependency.
 * Runs automatically on every deploy before starting the server.
 * Uses IF NOT EXISTS on all tables so re-runs are safe.
 */
import pkg from "pg";
const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn("⚠️  DATABASE_URL not set — skipping migration. Server will start but DB endpoints will fail.");
  process.exit(0);
}

// Detect SSL mode from DATABASE_URL — disable SSL for internal Railway networking
const sslDisabled = DATABASE_URL.includes("sslmode=disable") || DATABASE_URL.includes("railway.internal");
const sslConfig = sslDisabled ? false : { rejectUnauthorized: false };

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig,
  connectionTimeoutMillis: 15000,
});

// Schema embedded directly — no file I/O needed
const SCHEMA_SQL = `
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

CREATE TABLE IF NOT EXISTS public.uni_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    device_id text NOT NULL UNIQUE,
    name text NOT NULL,
    bio text,
    network_plan text DEFAULT 'free'::text NOT NULL,
    plan_expires_at timestamp with time zone,
    recovery_email_enc text,
    recovery_email_hash text,
    key_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.uni_user_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE REFERENCES public.uni_users(id) ON DELETE CASCADE,
    wrapped_dek text NOT NULL,
    key_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    rotated_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.uni_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,
    title text NOT NULL,
    category text NOT NULL,
    description_enc text,
    file_uri_enc text,
    file_name_enc text,
    tags text[],
    key_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.uni_documents USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.uni_businesses (
    id text NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,
    name text NOT NULL,
    legal_name text,
    tax_id text,
    tax_id_enc text,
    business_type text DEFAULT 'SAS'::text,
    industry text,
    founded_date text,
    address text,
    city text,
    country text DEFAULT 'Argentina'::text,
    website text,
    email text,
    phone text,
    description text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_businesses_user ON public.uni_businesses USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.uni_business_documents (
    id text NOT NULL PRIMARY KEY,
    business_id text NOT NULL REFERENCES public.uni_businesses(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    doc_type text DEFAULT 'other'::text,
    file_uri text,
    file_name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_docs_business ON public.uni_business_documents USING btree (business_id);

CREATE TABLE IF NOT EXISTS public.uni_share_tokens (
    id text NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,
    document_ids text[] DEFAULT '{}'::text[] NOT NULL,
    label character varying(200),
    expires_at timestamp with time zone NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    access_count integer DEFAULT 0 NOT NULL,
    last_accessed_at timestamp with time zone,
    allow_file_view boolean DEFAULT false,
    allow_file_download boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_share_tokens_user ON public.uni_share_tokens USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.uni_refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamp with time zone NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    device_name text,
    device_platform text,
    device_ip text,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON public.uni_refresh_tokens USING btree (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active ON public.uni_refresh_tokens USING btree (user_id, revoked, expires_at);

CREATE TABLE IF NOT EXISTS public.uni_recovery_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,
    code_hash text NOT NULL,
    purpose text DEFAULT 'account_recovery'::text NOT NULL,
    used boolean DEFAULT false NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON public.uni_recovery_codes USING btree (user_id, expires_at);

CREATE TABLE IF NOT EXISTS public.uni_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,
    plan text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider text NOT NULL,
    provider_payment_id text,
    amount numeric(10,2),
    currency text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.uni_subscriptions USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.uni_audit_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid REFERENCES public.uni_users(id) ON DELETE SET NULL,
    event text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    ip_address text,
    user_agent text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.uni_audit_logs USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.uni_audit_logs USING btree (created_at DESC);

CREATE TABLE IF NOT EXISTS public.uni_failed_attempts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ip_address text NOT NULL,
    endpoint text NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_failed_attempts_ip ON public.uni_failed_attempts USING btree (ip_address, attempted_at DESC);

CREATE TABLE IF NOT EXISTS public.uni_security_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_type text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    ip_address text,
    user_id uuid REFERENCES public.uni_users(id) ON DELETE SET NULL,
    metadata jsonb,
    resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON public.uni_security_events USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.uni_security_events USING btree (severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_email_hash ON public.uni_users USING btree (recovery_email_hash);
CREATE INDEX IF NOT EXISTS idx_user_keys_user ON public.uni_user_keys USING btree (user_id);

-- Add global_id column if missing (safe to re-run)
ALTER TABLE public.uni_users ADD COLUMN IF NOT EXISTS global_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_global_id ON public.uni_users (global_id) WHERE global_id IS NOT NULL;

-- Assign a real did:uniid UUID to every existing user that doesn't have one
UPDATE public.uni_users SET global_id = 'did:uniid:' || gen_random_uuid()::text WHERE global_id IS NULL OR global_id = '';

-- Secure identity access requests table (new QR flow)
CREATE TABLE IF NOT EXISTS public.uni_access_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    share_token_id text NOT NULL REFERENCES public.uni_share_tokens(id) ON DELETE CASCADE,
    owner_user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,
    status text DEFAULT 'awaiting_scan' NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb,
    requester_ip text,
    requester_device text,
    response_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_access_requests_token ON public.uni_access_requests USING btree (share_token_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_owner ON public.uni_access_requests USING btree (owner_user_id, status);

-- Extend uni_access_requests for consent, shared data, and revocation tracking
ALTER TABLE public.uni_access_requests ADD COLUMN IF NOT EXISTS consented_at timestamptz;
ALTER TABLE public.uni_access_requests ADD COLUMN IF NOT EXISTS shared_data jsonb;
ALTER TABLE public.uni_access_requests ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- Extend uni_user_keys for DEK rotation tracking
ALTER TABLE public.uni_user_keys ADD COLUMN IF NOT EXISTS key_version int NOT NULL DEFAULT 1;
ALTER TABLE public.uni_user_keys ADD COLUMN IF NOT EXISTS rotated_at timestamptz;
`;

// ─── DEK rotation helpers ─────────────────────────────────────────────────────

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const AES_ALGO = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;
const KEY_LEN = 32;

function deriveKeyFromJwtSecret(jwtSecret) {
  return createHash("sha256")
    .update("uniid::dek::master::" + jwtSecret + "::v1")
    .digest();
}

function tryUnwrapDEK(wrapped, masterKey) {
  try {
    const buf = Buffer.from(wrapped, "base64");
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(AES_ALGO, masterKey, iv);
    decipher.setAuthTag(tag);
    const dek = Buffer.concat([decipher.update(enc), decipher.final()]);
    if (dek.length !== KEY_LEN) return null;
    return dek;
  } catch {
    return null;
  }
}

function wrapDEK(dek, masterKey) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(AES_ALGO, masterKey, iv);
  const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

async function rotateDEKsIfNeeded(client) {
  const newMasterHex = process.env.ENCRYPTION_MASTER_KEY;
  if (!newMasterHex || newMasterHex.length < 64) {
    console.log("ℹ️  ENCRYPTION_MASTER_KEY not set — skipping DEK rotation.");
    console.log("   ⚠️  Documents are encrypted with JWT_SECRET-derived key (less secure).");
    return;
  }

  const newMaster = Buffer.from(newMasterHex.slice(0, 64), "hex");
  const jwtSecret = process.env.JWT_SECRET ?? "uniid_default_fallback_key_change_in_production_2024";
  const oldMaster = deriveKeyFromJwtSecret(jwtSecret);

  const { rows } = await client.query(
    `SELECT user_id, wrapped_dek, key_version FROM uni_user_keys`
  );

  if (rows.length === 0) {
    console.log("ℹ️  No DEKs found — skipping rotation.");
    return;
  }

  let alreadyRotated = 0;
  let rotated = 0;
  let failed = 0;

  for (const row of rows) {
    // Try new master first — if it works, already rotated
    const dekWithNew = tryUnwrapDEK(row.wrapped_dek, newMaster);
    if (dekWithNew) {
      alreadyRotated++;
      continue;
    }

    // Try old master (JWT_SECRET-derived)
    const dekWithOld = tryUnwrapDEK(row.wrapped_dek, oldMaster);
    if (!dekWithOld) {
      failed++;
      console.error(`   ✗ user ${row.user_id.slice(0, 8)}... DEK unreadable with both keys — SKIPPED`);
      continue;
    }

    // Re-wrap with new master
    const newWrapped = wrapDEK(dekWithOld, newMaster);
    await client.query(
      `UPDATE uni_user_keys
       SET wrapped_dek = $1, rotated_at = NOW(), key_version = key_version + 1
       WHERE user_id = $2`,
      [newWrapped, row.user_id]
    );
    rotated++;
  }

  if (rotated > 0 || alreadyRotated > 0) {
    console.log(`🔑 DEK rotation: ${rotated} rotated, ${alreadyRotated} already up-to-date${failed > 0 ? `, ${failed} failed` : ""}.`);
  }
  if (failed > 0) {
    console.warn(`   ⚠️  ${failed} DEK(s) could not be rotated.`);
  }
}

// ─── Main migration ───────────────────────────────────────────────────────────

async function migrate() {
  let client;
  try {
    console.log("🔗 Connecting to database...");
    client = await pool.connect();
    console.log("🔄 Running schema migration...");
    await client.query(SCHEMA_SQL);
    console.log("✅ Schema migration complete.");
    await rotateDEKsIfNeeded(client);
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    console.error("   Full error:", err);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end().catch(() => {});
  }
}

await migrate();
