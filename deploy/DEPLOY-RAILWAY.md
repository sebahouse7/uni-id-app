# Desplegar código real a Railway

## El problema
Railway actualmente corre el template "Hello world". Para que la app uni.id funcione completamente,
necesitás subir el código real con todos los endpoints (/api/auth, /api/documents, etc.)

## Solución: 3 comandos locales

Desde tu computadora local (Mac/Windows/Linux):

### Paso 1: Instalar Railway CLI
```bash
npm install -g @railway/cli
```

### Paso 2: Login con tu cuenta Railway
```bash
railway login
```
(Abre el browser, autenticás con tu cuenta Railway)

### Paso 3: Deployar el código
```bash
cd deploy/railway-api
railway up --service ece20428-adbb-4a7e-a64e-c1f11f772de6
```

## Variables de entorno necesarias en Railway
Asegurate de que Railway tenga estas variables (en tu dashboard):
- `DATABASE_URL` = tu URL de PostgreSQL (Neon.tech recomendado)
- `JWT_ACCESS_SECRET` = string aleatorio largo
- `JWT_REFRESH_SECRET` = string aleatorio largo  
- `JWT_SECRET` = string aleatorio largo
- `MP_ACCESS_TOKEN` = tu token de MercadoPago
- `MP_WEBHOOK_SECRET` = tu webhook secret de MercadoPago
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` = config email

## Qué incluye el deploy
El directorio `deploy/railway-api/` contiene:
- `dist/index.mjs` — servidor compilado (Express + todos los endpoints)
- `migrate.mjs` — ejecuta migraciones de DB automáticamente al arrancar
- `schema.sql` — esquema completo de la base de datos
- `package.json` — dependencias mínimas (pg, nodemailer)
- `railway.toml` — configuración con healthcheck en "/"
