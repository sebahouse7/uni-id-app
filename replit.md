# uni.id — Workspace

## App: uni.id (artifacts/uni-ud)
Mobile identity wallet app built with Expo React Native.

### UI Design System (v2 — Fintech Style)
- **Design tokens**: `constants/design.ts` — Spacing, Radii, Shadows, Typography
- **Reusable components**: `components/ui/AnimatedPressable.tsx` — spring physics press feedback
- **Color palette**: Navy dark (#060B18 bg), Electric blue (#1A6FE8 primary), Cyan (#00D4FF) accent
- **Font**: Inter (400/500/600/700) via `@expo-google-fonts/inter`
- **Gradients**: `expo-linear-gradient` used on hero cards, buttons, lock screen
- **Animations**: `Animated` API (spring physics) for mount-in effects + micro-interactions
- **Dark mode**: Automatic (follows system) with dedicated color tokens in `constants/colors.ts`

### Screens Redesigned
- `app/(tabs)/index.tsx` — Dashboard: gradient hero card, animated mount, 2-col category grid, shows 6 recent docs
- `app/(tabs)/documents.tsx` — Premium search bar, chip filters with counts, share button
- `app/(tabs)/profile.tsx` — Gradient hero section, plan badges, category breakdown
- `app/(tabs)/network.tsx` — Gradient plan cards, MercadoPago/Stripe working checkout
- `app/(tabs)/security.tsx` — Live viz, trust score card, credentials count, animated threat bar
- `app/(tabs)/_layout.tsx` — Cleaner tab bar with iOS SF Symbols / Feather icons
- `app/onboarding.tsx` — Gradient slide icons, animated scale transitions, trust badge
- `components/LockScreen.tsx` — Gradient logo icon, premium keypad UI, auto-trigger bio on mount

### Security (FASE 1 + 5 — Complete)
- **PIN hashing**: SHA-256 via expo-crypto, salt: `uni.id::secure::pin::v1::2024` — stored as hash, never plaintext
- **Biometric**: `disableDeviceFallback: true` on Android (only real fingerprint/face, no device PIN as fallback)
- **Double execution guard**: `biometricInProgressRef` + `initDoneRef` prevent double bio prompts
- **LockScreen fallback**: `canUseBiometrics = hasBiometrics && biometricsEnabled` — bio only if user explicitly opted in; then PIN; then set PIN if none
- **PIN key**: `uni_id_pin_v1`; biometrics key: `uni_id_biometrics_enabled_v1` (must be string `"true"` to activate)
- **JWT refresh tokens + rate limiting**: authLimiter (20/15min), strictAuthLimiter (8/15min), generalLimiter in place
- **changePIN / checkPINSet**: added to authService.ts; PIN change modal in security tab

### Documents (FASE 2 — Complete)
- **Loading infinito fixed**: `handleSave` in `add-document.tsx` wrapped in try/catch/finally
- **Error messages**: Alert shown on success (`✅ Guardado`) and failure with server message
- **Offline fallback**: Documents saved locally if offline, synced on next connection

### Digital Identity (FASE 6 — Complete)
- `context/IdentityContext.tsx` exposes `digitalIdentity: DigitalIdentity` with:
  - `userId`, `deviceId`, `credentials[]`, `trustScore` (30+5/doc+20/40 for plan), `connectedNodes`
- Trust score visible in Security tab with credential count and node count
- `VerifiableCredential` interface for future verifiable identity expansion

### Railway Backend Notes
- **IMPORTANT**: `MP_ACCESS_TOKEN` must be set manually in Railway dashboard → API service → Variables
  (Replit RAILWAY_TOKEN expired/unauthorized for API operations)
- Railway URL: `https://expressjs-production-8bfc.up.railway.app/api`
- All 10 tables confirmed in Railway PostgreSQL

### QR Share system
- Backend: `routes/share.ts` — POST /share/create, GET /share/:token (public), DELETE /share/:token (revoke), GET /share/history
- DB table: `uni_share_tokens` (id TEXT, user_id UUID, document_ids TEXT[], expires_at, revoked, access_count)
- Frontend: `app/share.tsx` — select docs, pick expiry (5min/1h/24h/7d), generate QR, copy/share link, history
- Frontend: `app/shared/[token].tsx` — public branded identity view (no auth required)
- QR generation: `react-native-qrcode-svg`

### Session persistence (web + native)
- `lib/apiClient.ts` — tokens in localStorage (web) / SecureStore (native)
- `context/IdentityContext.tsx` — device ID persisted in localStorage on web; session validation on startup clears cache on expiry

### Payments
- `lib/payments.ts` — MercadoPago + Stripe checkout via authenticated API calls
- Backend: full webhook handling for MP + Stripe (activate/reject/refund → email notification)

# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

### `artifacts/uni-ud` (`@workspace/uni-ud`)

Expo React Native mobile app — **uni.id** by human.id labs S.A.S. (Sebastián Maximiliano Monteleón, DNI 32.725.461).

**Security architecture (fintech-grade):**
- `lib/apiClient.ts` — Authenticated HTTP client with JWT auto-refresh, SecureStore for tokens
- `context/AuthContext.tsx` — Biometric (Face ID/fingerprint) + 6-digit PIN, auto-lock 3 min
- `context/SecureStorage.ts` — AES-GCM encrypted local storage via expo-secure-store (iOS Keychain / Android Keystore)
- `context/IdentityContext.tsx` — Document management with backend sync
- `context/LanguageContext.tsx` — Multi-language ES/EN/PT, device locale auto-detection
- `components/LockScreen.tsx` — Security lock screen

**Backend security (api-server):**
- `src/lib/crypto.ts` — AES-256-GCM encryption with per-user derived keys (HMAC-SHA256), MercadoPago signature verification
- `src/lib/jwt.ts` — JWT access tokens (15 min) + rotating refresh tokens (30 days), stored hashed in DB
- `src/lib/audit.ts` — Full audit log of all security events in `uni_audit_logs` table
- `src/lib/db.ts` — PostgreSQL connection pool with connection limits
- `src/middlewares/auth.ts` — JWT Bearer token middleware
- `src/routes/auth.ts` — Register/login by device ID, refresh, logout, profile
- `src/routes/documents.ts` — CRUD with AES-256 encryption per field, auth required
- `src/routes/subscriptions.ts` — MercadoPago + Stripe with webhook signature verification, DB activation

**Database tables:** `uni_users`, `uni_documents`, `uni_audit_logs`, `uni_subscriptions`, `uni_refresh_tokens`

**Env vars required:** `ENCRYPTION_MASTER_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `MP_ACCESS_TOKEN` (optional), `STRIPE_SECRET_KEY` (optional)

**Security middleware:** Helmet (security headers), express-rate-limit (300 req/15min global, 20 req/15min auth), express-validator (all inputs), raw body for webhook signature verification

**Recovery system:** `/api/recovery/request` (OTP via email) + `/api/recovery/verify` (verify OTP → new tokens). Email stored encrypted (AES-256) + hashed (SHA-256) for lookup. OTPs stored as bcrypt hash, single-use, 10-min expiry, 3 max attempts. Anti-enumeration (generic responses).

**Key wrapping (DEK system):** `src/lib/keyManager.ts` — each user has a random 256-bit DEK (Data Encryption Key). DEK stored wrapped (AES-256-GCM encrypted) by server master key in `uni_user_keys`. Documents encrypted with DEK. Key rotation = re-wrap DEK only, no document re-encryption. Recovery doesn't break encryption because keys are server-side.

**Ownership middleware:** `src/middlewares/ownershipCheck.ts` — `verifyOwnership(table)` applied to every resource route. Cross-user access attempts trigger a `critical` audit event + `critical` security event in DB.

**Persistent security logs:** `uni_audit_logs` (all operations), `uni_security_events` (security incidents). Both queryable via `/api/monitor/my-activity` and `/api/monitor/security-events` with filters (severity, event, from, to, limit).

**Vulnerability status:** 0 critical, 0 high, 1 moderate (esbuild in drizzle-kit dev tool only, not in production path)
