import { Pool } from "pg";

// Schema SQL embedded — runs on every startup (IF NOT EXISTS = safe to repeat)
const SCHEMA_SQL = `
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
CREATE TABLE IF NOT EXISTS public.uni_users (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,device_id text NOT NULL UNIQUE,name text NOT NULL,bio text,network_plan text DEFAULT 'free'::text NOT NULL,plan_expires_at timestamp with time zone,recovery_email_enc text,recovery_email_hash text,key_version integer DEFAULT 1 NOT NULL,created_at timestamp with time zone DEFAULT now() NOT NULL,updated_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.uni_users ADD COLUMN IF NOT EXISTS global_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_global_id ON public.uni_users (global_id) WHERE global_id IS NOT NULL;
UPDATE public.uni_users SET global_id = 'did:uniid:' || gen_random_uuid()::text WHERE global_id IS NULL;
CREATE TABLE IF NOT EXISTS public.identity_nodes (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,global_id text NOT NULL UNIQUE,public_key text,trust_level integer DEFAULT 0 NOT NULL,verified boolean DEFAULT false NOT NULL,metadata jsonb,created_at timestamp with time zone DEFAULT now() NOT NULL,updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_identity_nodes_user ON public.identity_nodes USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_identity_nodes_global_id ON public.identity_nodes USING btree (global_id);
CREATE TABLE IF NOT EXISTS public.uni_user_keys (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,user_id uuid NOT NULL UNIQUE REFERENCES public.uni_users(id) ON DELETE CASCADE,wrapped_dek text NOT NULL,key_version integer DEFAULT 1 NOT NULL,created_at timestamp with time zone DEFAULT now() NOT NULL,rotated_at timestamp with time zone);
CREATE TABLE IF NOT EXISTS public.uni_documents (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,title text NOT NULL,category text NOT NULL,description_enc text,file_uri_enc text,file_name_enc text,tags text[],key_version integer DEFAULT 1 NOT NULL,created_at timestamp with time zone DEFAULT now() NOT NULL,updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.uni_documents USING btree (user_id);
CREATE TABLE IF NOT EXISTS public.uni_businesses (id text NOT NULL PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,name text NOT NULL,legal_name text,tax_id text,tax_id_enc text,business_type text DEFAULT 'SAS'::text,industry text,founded_date text,address text,city text,country text DEFAULT 'Argentina'::text,website text,email text,phone text,description text,logo_uri text,created_at timestamp with time zone DEFAULT now(),updated_at timestamp with time zone DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_businesses_user ON public.uni_businesses USING btree (user_id);
CREATE TABLE IF NOT EXISTS public.uni_business_documents (id text NOT NULL PRIMARY KEY,business_id text NOT NULL REFERENCES public.uni_businesses(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,title text NOT NULL,description text,doc_type text DEFAULT 'other'::text,file_uri text,file_name text,created_at timestamp with time zone DEFAULT now(),updated_at timestamp with time zone DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_business_docs_business ON public.uni_business_documents USING btree (business_id);
CREATE TABLE IF NOT EXISTS public.uni_share_tokens (id text NOT NULL PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,document_ids text[] DEFAULT '{}' NOT NULL,label character varying(200),expires_at timestamp with time zone NOT NULL,revoked boolean DEFAULT false NOT NULL,access_count integer DEFAULT 0 NOT NULL,last_accessed_at timestamp with time zone,allow_file_view boolean DEFAULT false,allow_file_download boolean DEFAULT false,created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_share_tokens_user ON public.uni_share_tokens USING btree (user_id);
CREATE TABLE IF NOT EXISTS public.uni_refresh_tokens (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,token_hash text NOT NULL UNIQUE,expires_at timestamp with time zone NOT NULL,revoked boolean DEFAULT false NOT NULL,device_name text,device_platform text,device_ip text,last_used_at timestamp with time zone,created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON public.uni_refresh_tokens USING btree (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active ON public.uni_refresh_tokens USING btree (user_id, revoked, expires_at);
CREATE TABLE IF NOT EXISTS public.uni_recovery_codes (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,code_hash text NOT NULL,purpose text DEFAULT 'account_recovery'::text NOT NULL,used boolean DEFAULT false NOT NULL,attempts integer DEFAULT 0 NOT NULL,expires_at timestamp with time zone NOT NULL,created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON public.uni_recovery_codes USING btree (user_id, expires_at);
CREATE TABLE IF NOT EXISTS public.uni_subscriptions (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,plan text NOT NULL,status text DEFAULT 'pending'::text NOT NULL,provider text NOT NULL,provider_payment_id text,amount numeric(10,2),currency text,created_at timestamp with time zone DEFAULT now() NOT NULL,updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.uni_subscriptions USING btree (user_id);
CREATE TABLE IF NOT EXISTS public.uni_audit_logs (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid REFERENCES public.uni_users(id) ON DELETE SET NULL,event text NOT NULL,severity text DEFAULT 'info'::text NOT NULL,ip_address text,user_agent text,metadata jsonb,created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.uni_audit_logs USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.uni_audit_logs USING btree (created_at DESC);
CREATE TABLE IF NOT EXISTS public.uni_failed_attempts (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,ip_address text NOT NULL,endpoint text NOT NULL,attempted_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_failed_attempts_ip ON public.uni_failed_attempts USING btree (ip_address, attempted_at DESC);
CREATE TABLE IF NOT EXISTS public.uni_security_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,event_type text NOT NULL,severity text DEFAULT 'info'::text NOT NULL,ip_address text,user_id uuid REFERENCES public.uni_users(id) ON DELETE SET NULL,metadata jsonb,resolved boolean DEFAULT false NOT NULL,created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON public.uni_security_events USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.uni_security_events USING btree (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email_hash ON public.uni_users USING btree (recovery_email_hash);
CREATE INDEX IF NOT EXISTS idx_user_keys_user ON public.uni_user_keys USING btree (user_id);
ALTER TABLE public.uni_users ADD COLUMN IF NOT EXISTS name_enc text;
ALTER TABLE public.uni_users ADD COLUMN IF NOT EXISTS bio_enc text;
CREATE TABLE IF NOT EXISTS public.uni_document_signatures (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,document_id uuid REFERENCES public.uni_documents(id) ON DELETE SET NULL,document_hash text NOT NULL,signature text NOT NULL,algorithm text DEFAULT 'HMAC-SHA256' NOT NULL,signer_global_id text,ip_address text,device_id text,consented boolean DEFAULT true NOT NULL,metadata jsonb,created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_doc_sigs_user ON public.uni_document_signatures USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_doc_sigs_hash ON public.uni_document_signatures USING btree (document_hash);
CREATE INDEX IF NOT EXISTS idx_doc_sigs_doc ON public.uni_document_signatures USING btree (document_id);
ALTER TABLE public.uni_users ADD COLUMN IF NOT EXISTS signing_public_key text;
ALTER TABLE public.uni_document_signatures ADD COLUMN IF NOT EXISTS signature_type text DEFAULT 'hmac';
ALTER TABLE public.uni_document_signatures ADD COLUMN IF NOT EXISTS public_key_snapshot text;
CREATE INDEX IF NOT EXISTS idx_doc_sigs_type ON public.uni_document_signatures USING btree (signature_type);
ALTER TABLE public.identity_nodes ADD COLUMN IF NOT EXISTS node_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_nodes_node_id ON public.identity_nodes (node_id) WHERE node_id IS NOT NULL;
ALTER TABLE public.identity_nodes ADD COLUMN IF NOT EXISTS node_reputation double precision DEFAULT 1.0;
ALTER TABLE public.identity_nodes ADD COLUMN IF NOT EXISTS last_verified_at timestamp with time zone;
ALTER TABLE public.identity_nodes ADD COLUMN IF NOT EXISTS stake double precision DEFAULT 0 NOT NULL;
CREATE TABLE IF NOT EXISTS public.node_endorsements (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,from_node_id text NOT NULL,to_node_id text NOT NULL,from_user_id uuid REFERENCES public.uni_users(id) ON DELETE CASCADE,to_user_id uuid REFERENCES public.uni_users(id) ON DELETE CASCADE,signature text NOT NULL,canonical_payload text NOT NULL,reputation_applied double precision DEFAULT 0 NOT NULL,created_at timestamp with time zone DEFAULT now() NOT NULL,CONSTRAINT node_endorsements_unique UNIQUE (from_node_id, to_node_id));
CREATE INDEX IF NOT EXISTS idx_endorsements_to ON public.node_endorsements USING btree (to_node_id);
CREATE INDEX IF NOT EXISTS idx_endorsements_from ON public.node_endorsements USING btree (from_node_id);
CREATE TABLE IF NOT EXISTS public.agent_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,node_id text,event_type text NOT NULL,event_hash text,payload_preview text,signature text,signature_valid boolean,reputation_delta double precision DEFAULT 0,ip_address text,metadata jsonb,created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_agent_events_user ON public.agent_events USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_node ON public.agent_events USING btree (node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_type ON public.agent_events USING btree (event_type, created_at DESC);
CREATE TABLE IF NOT EXISTS public.verification_votes (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  node_id text NOT NULL,
  target_hash text NOT NULL,
  result text NOT NULL CHECK (result IN ('valid','invalid')),
  signature text NOT NULL,
  canonical_payload text NOT NULL,
  weight double precision DEFAULT 0 NOT NULL,
  penalty_applied boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  timestamp_ms bigint DEFAULT 0 NOT NULL,
  CONSTRAINT verification_votes_unique UNIQUE (node_id, target_hash)
);
CREATE INDEX IF NOT EXISTS idx_verification_votes_hash ON public.verification_votes USING btree (target_hash);
CREATE INDEX IF NOT EXISTS idx_verification_votes_node ON public.verification_votes USING btree (node_id);
ALTER TABLE public.verification_votes ADD COLUMN IF NOT EXISTS timestamp_ms bigint DEFAULT 0 NOT NULL;
ALTER TABLE public.verification_votes ADD COLUMN IF NOT EXISTS nonce text DEFAULT '' NOT NULL;
CREATE TABLE IF NOT EXISTS public.used_nonces (
  node_id text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (node_id, nonce)
);
CREATE INDEX IF NOT EXISTS idx_used_nonces_expires ON public.used_nonces USING btree (expires_at);
CREATE TABLE IF NOT EXISTS public.stake_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,
  node_id text,
  type text NOT NULL CHECK (type IN ('add','withdraw','reward','slash')),
  amount double precision NOT NULL,
  balance_after double precision NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stake_txn_user ON public.stake_transactions USING btree (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.system_config (key text NOT NULL PRIMARY KEY,value text NOT NULL,created_at timestamp with time zone DEFAULT now() NOT NULL,updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE IF NOT EXISTS public.pending_verifications (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,file_hash text NOT NULL UNIQUE,submitter_ip text,status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','consensus_reached','no_consensus')),consensus_result text,confidence double precision,votes_collected integer DEFAULT 0,created_at timestamp with time zone DEFAULT now() NOT NULL,updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pending_verifications_status ON public.pending_verifications USING btree (status, created_at ASC);
CREATE TABLE IF NOT EXISTS public.node_memory (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,node_id text NOT NULL,target_hash text NOT NULL,decision text NOT NULL CHECK (decision IN ('valid','invalid','skipped')),confidence double precision NOT NULL,was_correct boolean,created_at timestamp with time zone DEFAULT now() NOT NULL,CONSTRAINT node_memory_unique UNIQUE (node_id, target_hash));
CREATE INDEX IF NOT EXISTS idx_node_memory_node ON public.node_memory USING btree (node_id, created_at DESC);
ALTER TABLE public.uni_document_signatures ADD COLUMN IF NOT EXISTS tsa_token text;
ALTER TABLE public.uni_document_signatures ADD COLUMN IF NOT EXISTS tsa_timestamp timestamp with time zone;
ALTER TABLE public.uni_document_signatures ADD COLUMN IF NOT EXISTS tsa_status text DEFAULT 'none';
ALTER TABLE public.uni_document_signatures ADD COLUMN IF NOT EXISTS tsa_endpoint text;
CREATE INDEX IF NOT EXISTS idx_doc_sigs_tsa_status ON public.uni_document_signatures USING btree (tsa_status);
CREATE TABLE IF NOT EXISTS public.daily_anchor (date date NOT NULL PRIMARY KEY,merkle_root text NOT NULL,signature_count integer DEFAULT 0 NOT NULL,computed_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_daily_anchor_date ON public.daily_anchor USING btree (date DESC);
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.uni_users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  context text,
  target text,
  data_shared jsonb,
  hash text,
  signature text,
  result text DEFAULT 'success' NOT NULL,
  trust_level text,
  ip text,
  device text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON public.activity_logs USING btree (action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_context ON public.activity_logs USING btree (context, created_at DESC);
`;

export async function runMigration(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.warn("⚠️  DATABASE_URL no configurado — saltando migración");
    return;
  }
  const sslDisabled = url.includes("sslmode=disable") || url.includes("railway.internal");
  const sslConfig = sslDisabled ? false : (process.env["NODE_ENV"] === "production" ? { rejectUnauthorized: false } : false);
  const migPool = new Pool({ connectionString: url, ssl: sslConfig as any, connectionTimeoutMillis: 20000 });
  const client = await migPool.connect();
  try {
    console.log("🔄 Running schema migration...");
    await client.query(SCHEMA_SQL);
    console.log("✅ Schema migration complete.");
  } catch (err: any) {
    console.error("❌ Migration error:", err.message);
    throw err;
  } finally {
    client.release();
    await migPool.end().catch(() => {});
  }
}

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
      ssl: (() => {
        const sslDisabled = url.includes("sslmode=disable") || url.includes("railway.internal");
        if (sslDisabled) return false;
        return process.env["NODE_ENV"] === "production" ? { rejectUnauthorized: false } : false;
      })(),
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
