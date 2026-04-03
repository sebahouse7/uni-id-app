# Despliegue en Railway — uni.id API

## ⚠️ CAUSA RAÍZ DEL PROBLEMA

El `.gitignore` del monorepo excluye `dist/` — Railway CLI respeta `.gitignore`.  
El snapshot subido anteriormente **NO incluye** `deploy/railway-api/dist/index.mjs`.  
**Solución**: subir `deploy/railway-api/` con `--path-as-root` (ignora el `.gitignore` del monorepo).

## Método correcto para subir

### Opción 1 — Desde terminal local (con `railway login`)

```bash
# 1. Login (abre el navegador)
railway login

# 2. Subir SOLO deploy/railway-api/ como raíz
railway up ./deploy/railway-api \
  --path-as-root \
  --service ece20428-adbb-4a7e-a64e-c1f11f772de6 \
  --project a58781bd-0545-4878-8ae1-21416fe56bfd \
  --environment 7bf8d483-40bb-4b58-8990-651dfa1b57aa
```

### Opción 2 — Desde el shell de Replit (con token personal)

1. Ir a https://railway.app/account/tokens
2. Crear un **Personal Access Token** (no project token)
3. Agregarlo como secreto `RAILWAY_USER_TOKEN` en Replit
4. Ejecutar en el shell de Replit:
```bash
RAILWAY_TOKEN=$RAILWAY_USER_TOKEN railway up ./deploy/railway-api \
  --path-as-root \
  --service ece20428-adbb-4a7e-a64e-c1f11f772de6 \
  --project a58781bd-0545-4878-8ae1-21416fe56bfd
```

### Opción 3 — Desde dentro de `deploy/railway-api/` (si tenés sesión activa)

```bash
cd deploy/railway-api
railway up
```

---

## Qué contiene `deploy/railway-api/` (autosuficiente)

```
deploy/railway-api/
├── dist/
│   ├── index.mjs          ← servidor completo compilado (esbuild, 3.5MB)
│   ├── pino-*.mjs         ← workers de logging
│   └── *.mjs.map          ← source maps
├── migrate.mjs            ← migración de schema (graceful si no hay DATABASE_URL)
├── package.json           ← solo pg + nodemailer (sin pnpm, sin workspaces)
├── railway.toml           ← buildCommand, startCommand, healthcheck
└── schema.sql             ← definición completa de la base de datos
```

## Configuración de Railway (ya aplicada)

- **Build**: `npm install --omit=dev --ignore-scripts`
- **Start**: `node migrate.mjs && node dist/index.mjs`
- **Healthcheck**: `GET /` → `{"status":"ok"}`
- **Timeout**: 120 segundos

## Variables de entorno (agregar en Railway dashboard)

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL de Neon.tech |
| `JWT_SECRET` | Secret aleatorio para JWT |
| `SMTP_HOST` | smtp.gmail.com |
| `SMTP_PORT` | 587 |
| `SMTP_USER` | tu@gmail.com |
| `SMTP_PASS` | contraseña de app de Gmail |
| `SMTP_FROM` | soporte.uniid@gmail.com |
| `MP_ACCESS_TOKEN` | Token de MercadoPago |
| `MP_WEBHOOK_SECRET` | Secret de webhook MP |

## IDs de Railway

- **Project**: `a58781bd-0545-4878-8ae1-21416fe56bfd`
- **Service**: `ece20428-adbb-4a7e-a64e-c1f11f772de6`
- **Environment**: `7bf8d483-40bb-4b58-8990-651dfa1b57aa`
- **URL**: `https://expressjs-production-8bfc.up.railway.app`
