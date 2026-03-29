# uni.id — Instrucciones de instalación local

## Requisitos previos

| Herramienta | Versión mínima | Descarga |
|------------|---------------|---------|
| Node.js | 20+ | https://nodejs.org |
| pnpm | 9+ | `npm install -g pnpm` |
| Git | cualquiera | https://git-scm.com |
| Expo Go (celular) | última | App Store / Google Play |

---

## Paso 1 — Descomprimir el proyecto

```bash
tar -xzf uni-id-completo.tar.gz
cd workspace
```

---

## Paso 2 — Instalar dependencias

```bash
pnpm install
```

---

## Paso 3 — Crear la base de datos

Necesitás una base de datos PostgreSQL. Opciones gratuitas:

### Opción A — Neon (recomendada, sin instalar nada)
1. Entrá a https://neon.tech y creá una cuenta gratis
2. Creá un nuevo proyecto
3. Copiá el **Connection String** (empieza con `postgresql://...`)
4. Ejecutá el schema:
   ```bash
   psql "tu_connection_string" < database/schema.sql
   ```

### Opción B — PostgreSQL local
1. Instalá PostgreSQL desde https://www.postgresql.org/download/
2. Creá la base de datos:
   ```bash
   psql -U postgres -c "CREATE DATABASE uni_id;"
   psql -U postgres -d uni_id < database/schema.sql
   ```
3. Tu connection string será: `postgresql://postgres:TU_PASSWORD@localhost:5432/uni_id`

---

## Paso 4 — Configurar el backend

```bash
cp artifacts/api-server/.env.example artifacts/api-server/.env
```

Abrí `artifacts/api-server/.env` en cualquier editor y completá:

```env
DATABASE_URL=postgresql://...  ← tu connection string del paso 3
JWT_SECRET=genera_uno_random   ← corré: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_REFRESH_SECRET=otro_random ← corré el mismo comando otra vez
MASTER_KEY_HEX=32bytes_hex     ← corré: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

El resto de las variables (email, MercadoPago, Stripe) son opcionales para desarrollo.

---

## Paso 5 — Iniciar el backend

### Mac / Linux:
```bash
chmod +x start-backend.sh
./start-backend.sh
```

### Windows:
Hacé doble clic en `start-backend.bat`

### Manual:
```bash
cd artifacts/api-server
pnpm dev
```

El servidor queda corriendo en **http://localhost:8080**  
Verificá que funciona: http://localhost:8080/api/health

---

## Paso 6 — Configurar el frontend (Expo)

```bash
cp artifacts/uni-ud/.env.local.example artifacts/uni-ud/.env.local
```

Si querés usar la app desde el **celular** (con Expo Go):
1. Averiguá tu IP local:
   - Windows: `ipconfig` → buscar "IPv4 Address"
   - Mac/Linux: `ifconfig` → buscar `inet` en `en0`
2. Editá `artifacts/uni-ud/.env.local` y descomentá:
   ```env
   EXPO_PUBLIC_API_URL=http://192.168.1.50:8080/api  ← tu IP
   ```

---

## Paso 7 — Iniciar el frontend

### Mac / Linux:
```bash
chmod +x start-frontend.sh
./start-frontend.sh
```

### Windows:
Hacé doble clic en `start-frontend.bat`

### Manual:
```bash
cd artifacts/uni-ud
pnpm start
```

Opciones:
- Presioná **`w`** → abre en el navegador web
- Escaneá el **QR** con Expo Go (misma red WiFi)
- Presioná **`a`** → abre en emulador Android
- Presioná **`i`** → abre en simulador iOS (solo Mac)

---

## Estructura del proyecto

```
workspace/
├── artifacts/
│   ├── api-server/        ← Backend Express/TypeScript
│   │   ├── src/
│   │   │   ├── index.ts   ← Punto de entrada
│   │   │   ├── app.ts     ← Express app + middlewares
│   │   │   ├── routes/    ← Endpoints de la API
│   │   │   └── lib/       ← DB, JWT, email, etc.
│   │   └── .env           ← Variables de entorno (creás vos)
│   └── uni-ud/            ← App móvil Expo React Native
│       ├── app/
│       │   └── (tabs)/    ← Pantallas principales
│       ├── context/       ← Estado global (Identity, Language)
│       ├── lib/           ← Cliente API, utilidades
│       └── .env.local     ← Variables de entorno (creás vos)
└── database/
    └── schema.sql         ← Schema completo de la base de datos
```

---

## Endpoints de la API

| Método | URL | Descripción |
|--------|-----|-------------|
| GET | `/api/health` | Estado del servidor |
| POST | `/api/auth/register` | Registrar usuario |
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/refresh` | Renovar token |
| GET | `/api/documents` | Listar documentos |
| POST | `/api/documents` | Crear documento |
| PUT | `/api/documents/:id` | Actualizar documento |
| DELETE | `/api/documents/:id` | Eliminar documento |
| GET | `/api/business` | Listar empresas |
| POST | `/api/business` | Crear empresa |
| GET | `/api/share/:token` | Vista pública de QR |
| POST | `/api/payments/mercadopago` | Crear pago MP |

---

## Problemas comunes

### "Cannot connect to database"
→ Verificá que `DATABASE_URL` en `.env` sea correcto y que la base de datos esté corriendo.

### "Module not found" al iniciar
→ Corré `pnpm install` desde la raíz del proyecto.

### El celular no puede conectarse a la API
→ Configurá `EXPO_PUBLIC_API_URL=http://TU_IP_LOCAL:8080/api` en `artifacts/uni-ud/.env.local`

### Puerto 8080 ya en uso
→ Cambiá `PORT=8081` en `artifacts/api-server/.env` y actualizá `EXPO_PUBLIC_API_URL` en consecuencia.

---

## Despliegue en producción

Ver `README.md` para instrucciones completas de Railway + Render.

---

## Créditos

**uni.id** — human.id labs S.A.S.  
Sebastián Maximiliano Monteleón · DNI 32.725.461
