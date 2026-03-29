# uni.id

**Billetera de identidad digital** · Desarrollado por human.id labs S.A.S.

Guardá, gestioná y compartí tus documentos personales y empresariales con cifrado AES-256, autenticación biométrica/PIN, códigos QR dinámicos y planes de suscripción con MercadoPago.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Expo React Native (iOS / Android / Web) |
| Backend | Node.js + Express 5 + TypeScript |
| Base de datos | PostgreSQL |
| Autenticación | JWT (access + refresh tokens) |
| Cifrado | AES-256-GCM |
| Pagos | MercadoPago (+ Stripe opcional) |
| Email | Nodemailer (SMTP) |

---

## Instalación local

### Requisitos previos

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/uni-id.git
cd uni-id
```

### 2. Instalar dependencias

```bash
pnpm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
# Editá .env con tus valores reales
```

### 4. Crear la base de datos

```bash
psql -U postgres -c "CREATE DATABASE uni_id;"
psql -U postgres uni_id < artifacts/api-server/schema.sql
```

O conectate con tu DATABASE_URL y ejecutá las migraciones manualmente (ver sección Base de datos más abajo).

### 5. Correr en modo desarrollo

**Backend (API Server):**
```bash
cd artifacts/api-server
pnpm run dev
# Corre en http://localhost:8080
```

**Frontend (Expo):**
```bash
cd artifacts/uni-ud
EXPO_PUBLIC_API_URL=http://localhost:8080/api pnpm run dev
# Web: http://localhost:8081
# Móvil: escanear QR con Expo Go
```

---

## Estructura del proyecto

```
uni-id/
├── artifacts/
│   ├── api-server/          # Backend Express (Node.js + TypeScript)
│   │   ├── src/
│   │   │   ├── index.ts     # Entry point
│   │   │   ├── app.ts       # Express setup
│   │   │   ├── routes/      # Rutas API
│   │   │   ├── lib/         # Utilidades (JWT, cifrado, DB, email)
│   │   │   └── middlewares/ # Auth, rate limiting
│   │   └── package.json
│   └── uni-ud/              # Frontend Expo React Native
│       ├── app/             # Pantallas (expo-router)
│       │   ├── (tabs)/      # Tabs principales
│       │   ├── onboarding.tsx
│       │   ├── share.tsx
│       │   └── shared/[token].tsx
│       ├── context/         # Estado global (Auth, Identity, Language)
│       ├── lib/             # API client
│       └── package.json
├── .env.example             # Variables de entorno documentadas
└── README.md
```

---

## Variables de entorno

Ver `.env.example` para la lista completa con descripción de cada variable.

### Variables requeridas para producción

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Connection string de PostgreSQL |
| `JWT_SECRET` | Clave para firmar access tokens (32+ chars) |
| `JWT_REFRESH_SECRET` | Clave para firmar refresh tokens (32+ chars) |
| `MASTER_KEY_HEX` | Clave AES-256 (64 chars hex). Generá con `openssl rand -hex 32` |
| `EXPO_PUBLIC_API_URL` | URL pública del backend (ej: `https://api.uni.id/api`) |
| `EXPO_PUBLIC_DOMAIN` | Dominio público del frontend |

---

## Base de datos

El proyecto usa PostgreSQL. Las tablas se crean automáticamente al ejecutar las migraciones SQL que están en `artifacts/api-server/src/lib/db.ts` o vía el script de setup.

### Tablas principales

| Tabla | Descripción |
|-------|-------------|
| `uni_users` | Usuarios y perfiles |
| `uni_documents` | Documentos personales cifrados |
| `uni_businesses` | Empresas del usuario |
| `uni_business_documents` | Documentos empresariales |
| `uni_refresh_tokens` | Refresh tokens activos |
| `uni_share_tokens` | Tokens QR de compartir identidad |
| `uni_audit_log` | Registro de auditoría de seguridad |
| `uni_subscriptions` | Historial de pagos y suscripciones |

### Conexión externa

En producción, usá una base de datos PostgreSQL gestionada:
- **Railway**: PostgreSQL incluido en el plan
- **Render**: PostgreSQL managed database
- **Supabase**: PostgreSQL gratuito con hasta 500MB
- **Neon**: PostgreSQL serverless (recomendado para producción)

Simplemente configurá `DATABASE_URL` con el connection string correspondiente.

---

## Deploy en Railway

Railway es la opción más simple para desplegar ambos servicios.

### Backend (API Server)

1. Creá una cuenta en [railway.app](https://railway.app)
2. Creá un nuevo proyecto → "Deploy from GitHub repo"
3. Seleccioná tu repositorio
4. Configurá el servicio:
   - **Root Directory**: `artifacts/api-server`
   - **Build Command**: `pnpm install && pnpm run build`
   - **Start Command**: `pnpm run start`
5. Agregá las variables de entorno (copiá de `.env.example`)
6. Railway genera una URL automáticamente (ej: `https://uni-id-api.up.railway.app`)

### Base de datos en Railway

1. En tu proyecto de Railway → "Add service" → "PostgreSQL"
2. Copiá `DATABASE_URL` desde la pestaña "Variables" del servicio PostgreSQL
3. Pegala como variable de entorno en tu servicio de API

### Frontend (Expo Web)

1. Agregá otro servicio en Railway → "Deploy from GitHub repo"
2. Mismo repo, pero:
   - **Root Directory**: `artifacts/uni-ud`
   - **Build Command**: `pnpm install && pnpm exec expo export --platform web`
   - **Start Command**: `pnpm exec serve dist --port $PORT`
3. Variables de entorno:
   ```
   EXPO_PUBLIC_API_URL=https://tu-api.up.railway.app/api
   EXPO_PUBLIC_DOMAIN=https://tu-frontend.up.railway.app
   ```

---

## Deploy en Render

### Backend (API Server)

1. Creá una cuenta en [render.com](https://render.com)
2. "New" → "Web Service" → conectá tu repositorio de GitHub
3. Configurá:
   - **Name**: `uni-id-api`
   - **Root Directory**: `artifacts/api-server`
   - **Runtime**: Node
   - **Build Command**: `pnpm install && pnpm run build`
   - **Start Command**: `pnpm run start`
   - **Instance Type**: Free (o Starter para producción)
4. En "Environment Variables", cargá todos los valores de `.env.example`

### Base de datos en Render

1. "New" → "PostgreSQL"
2. Copiá el "Internal Database URL" y usalo como `DATABASE_URL` en el servicio de API

### Frontend (Expo Web) en Render

1. "New" → "Static Site" → conectá tu repo
2. Configurá:
   - **Root Directory**: `artifacts/uni-ud`
   - **Build Command**: `pnpm install && pnpm exec expo export --platform web`
   - **Publish Directory**: `artifacts/uni-ud/dist`
3. Variables de entorno:
   ```
   EXPO_PUBLIC_API_URL=https://uni-id-api.onrender.com/api
   EXPO_PUBLIC_DOMAIN=https://uni-id-frontend.onrender.com
   ```

---

## Endpoints API principales

```
POST   /api/auth/register          Registro / login con device ID
POST   /api/auth/refresh           Renovar access token
POST   /api/auth/logout            Cerrar sesión
GET    /api/auth/me                Perfil del usuario
PATCH  /api/auth/me                Actualizar perfil
GET    /api/auth/audit-logs        Historial de auditoría

GET    /api/documents              Listar documentos
POST   /api/documents              Crear documento
PATCH  /api/documents/:id          Actualizar documento
DELETE /api/documents/:id          Eliminar documento

GET    /api/businesses             Listar empresas
POST   /api/businesses             Crear empresa
PATCH  /api/businesses/:id         Actualizar empresa
DELETE /api/businesses/:id         Eliminar empresa
GET    /api/businesses/:id/documents       Documentos de empresa
POST   /api/businesses/:id/documents      Agregar documento

POST   /api/share/create           Generar QR de identidad
GET    /api/share/:token           Ver identidad compartida (público)
DELETE /api/share/:token           Revocar QR

GET    /api/sessions               Sesiones activas
DELETE /api/sessions/:id           Revocar sesión
DELETE /api/sessions               Cerrar todas las sesiones

POST   /api/subscriptions/mercadopago/checkout   Iniciar pago MP
GET    /api/subscriptions/status                  Estado del plan
```

---

## Seguridad

- **Cifrado**: AES-256-GCM para documentos en reposo
- **Autenticación**: JWT (access 15min) + refresh tokens rotativos
- **Rate limiting**: 20 req/15min en auth, 200 req/min general
- **Biometría**: Face ID / huella dactilar vía expo-local-authentication
- **PIN**: Bloqueo tras 5 intentos fallidos (30 segundos)
- **Auditoría**: Log completo de eventos de seguridad
- **HTTPS**: Requerido en producción (Railway y Render lo proveen)

---

## Soporte

**human.id labs S.A.S.**  
Desarrollado por Sebastián Maximiliano Monteleón  
DNI 32.725.461  

---

## Licencia

Propietario — human.id labs S.A.S. © 2026. Todos los derechos reservados.
