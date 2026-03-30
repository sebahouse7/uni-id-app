# uni.id — Sistema completo de identidad digital

## Estado actual

| Componente | Estado | URL |
|-----------|--------|-----|
| Backend API | ✅ FUNCIONANDO | https://2b3f24cc-d863-4c5f-b402-4c62471fd42f-00-21k5g1p7ujf67.picard.replit.dev/api |
| Base de datos | ✅ PostgreSQL activo | Conectado (15 tablas) |
| App móvil | ✅ Lista para escanear | Expo Go |

---

## INICIO RÁPIDO (en celular, ahora mismo)

### Opción A — Sin instalar nada local

1. Instalá **Expo Go** en tu celular (App Store / Google Play)
2. En la terminal (de este proyecto):
   ```bash
   cd artifacts/uni-ud
   pnpm start
   ```
3. Escaneá el QR que aparece con Expo Go
4. **La app se conecta automáticamente al backend** (URL ya configurada)

---

## Instalación local completa

### Requisitos

| Herramienta | Versión | Descarga |
|------------|---------|---------|
| Node.js | 20+ | https://nodejs.org |
| pnpm | 9+ | `npm install -g pnpm` |
| Expo Go (celular) | última | App Store / Play |

### Pasos

```bash
# 1. Descomprimir y entrar
tar -xzf uni-id-completo.tar.gz && cd workspace

# 2. Instalar dependencias
pnpm install

# 3. Iniciar frontend (el backend ya está online en Replit)
cd artifacts/uni-ud
pnpm start
# → presioná 'w' para web, o escaneá QR con Expo Go
```

---

## Backend propio (opcional)

Si querés correr el backend en tu PC:

```bash
# 1. Crear base de datos PostgreSQL (gratis en https://neon.tech)
# 2. Ejecutar el schema
psql "tu_connection_string" < database/schema.sql

# 3. Configurar variables
cp artifacts/api-server/.env.example artifacts/api-server/.env
# → Editar .env con tu DATABASE_URL y las claves JWT

# 4. Iniciar backend
cd artifacts/api-server
pnpm dev
# → Corre en http://0.0.0.0:8080

# 5. Actualizar URL en el frontend
# → Editar artifacts/uni-ud/.env con la IP o URL de tu backend
```

---

## API — Endpoints disponibles

### Autenticación
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/register` | Registrar usuario con device ID |
| POST | `/api/auth/login` | Alias de register (mismo flujo) |
| POST | `/api/auth/refresh` | Renovar access token |
| GET | `/api/auth/me` | Perfil del usuario autenticado |
| POST | `/api/auth/logout` | Cerrar sesión |
| PATCH | `/api/auth/me` | Actualizar perfil |

### Documentos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/documents` | Listar documentos |
| POST | `/api/documents` | Crear documento |
| GET | `/api/documents/:id` | Ver documento |
| PATCH | `/api/documents/:id` | Actualizar |
| DELETE | `/api/documents/:id` | Eliminar |

### Empresa
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/business` | Listar empresas |
| POST | `/api/business` | Crear empresa |
| PATCH | `/api/business/:id` | Actualizar |
| DELETE | `/api/business/:id` | Eliminar |

### Compartir identidad
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/share` | Crear token de compartir |
| GET | `/api/share` | Ver tokens activos |
| GET | `/api/share/view/:token` | Vista pública (sin auth) |
| DELETE | `/api/share/:id` | Revocar acceso |

### Sistema
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/healthz` | Estado del servidor |

---

## Seguridad implementada

- **Autenticación**: JWT (access 15min + refresh 30 días)
- **Cifrado**: AES-256-GCM para datos sensibles
- **Contraseñas**: bcrypt
- **Rate limiting**: 20 req/15min en auth, 300 req/15min general
- **CORS**: Configurado para producción
- **Headers**: Helmet.js con headers de seguridad
- **Auditoría**: Log de todos los eventos por usuario

---

## Deploy permanente (para URL definitiva)

El backend actualmente corre en Replit (URL temporal).
Para una URL permanente:

### Opción 1 — Replit Deploy (recomendado)
1. En Replit, hacé clic en el botón **Deploy**
2. Replit genera `https://xxx.replit.app` automáticamente
3. Actualizá `EXPO_PUBLIC_API_URL` en `artifacts/uni-ud/.env`

### Opción 2 — Railway
```bash
# Instalá Railway CLI
npm install -g @railway/cli
railway login
railway up --service api-server
```
Ver `README.md` para instrucciones completas de Railway.

---

## Estructura del proyecto

```
workspace/
├── artifacts/
│   ├── api-server/          ← Backend Express TypeScript
│   │   ├── src/
│   │   │   ├── index.ts     ← Entrada (0.0.0.0:8080 + dotenv)
│   │   │   ├── app.ts       ← Express + CORS + middlewares
│   │   │   ├── routes/      ← auth, documents, business, share...
│   │   │   ├── middlewares/ ← auth, rateLimit
│   │   │   └── lib/         ← db, jwt, crypto, email, audit
│   │   └── .env             ← Variables de entorno
│   └── uni-ud/              ← App Expo React Native
│       ├── app/(tabs)/      ← Pantallas principales
│       ├── components/      ← SplashScreen, LockScreen, UI
│       ├── context/         ← Auth, Identity, Language (ES/EN/PT)
│       ├── lib/apiClient.ts ← Cliente HTTP conectado al backend
│       └── .env             ← EXPO_PUBLIC_API_URL configurada
├── database/
│   └── schema.sql           ← Schema PostgreSQL completo (15 tablas)
├── start-backend.sh / .bat  ← Scripts de inicio Mac/Win
└── INSTRUCCIONES.md         ← Este archivo
```

---

## Créditos

**uni.id** — Sistema de identidad digital  
**human.id labs S.A.S.**  
Sebastián Maximiliano Monteleón · DNI 32.725.461
