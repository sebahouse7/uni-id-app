-- ═══════════════════════════════════════════════════════════
-- uni.id — Schema completo de la base de datos PostgreSQL
-- Ejecutá con: psql tu_database_url < database/schema.sql
-- ═══════════════════════════════════════════════════════════

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

-- ─── Usuarios ────────────────────────────────────────────────
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

-- ─── Claves de cifrado por usuario ───────────────────────────
CREATE TABLE IF NOT EXISTS public.uni_user_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE REFERENCES public.uni_users(id) ON DELETE CASCADE,
    wrapped_dek text NOT NULL,
    key_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    rotated_at timestamp with time zone
);

-- ─── Documentos personales ────────────────────────────────────
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

-- ─── Empresas / Negocios ─────────────────────────────────────
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

-- ─── Documentos de empresas ──────────────────────────────────
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

-- ─── Tokens de compartir ─────────────────────────────────────
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

-- ─── Refresh tokens ──────────────────────────────────────────
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

-- ─── Códigos de recuperación ─────────────────────────────────
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

-- ─── Suscripciones ────────────────────────────────────────────
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

-- ─── Logs de auditoría ────────────────────────────────────────
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

-- ─── Intentos fallidos (rate limiting) ───────────────────────
CREATE TABLE IF NOT EXISTS public.uni_failed_attempts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ip_address text NOT NULL,
    endpoint text NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_failed_attempts_ip ON public.uni_failed_attempts USING btree (ip_address, attempted_at DESC);

-- ─── Eventos de seguridad ────────────────────────────────────
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

-- ─── Índices adicionales ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email_hash ON public.uni_users USING btree (recovery_email_hash);
CREATE INDEX IF NOT EXISTS idx_user_keys_user ON public.uni_user_keys USING btree (user_id);
