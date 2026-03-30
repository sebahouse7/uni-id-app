#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
#  uni.id — Script de configuración automática del servidor Hetzner
#  Ejecutar UNA SOLA VEZ en el servidor como root:
#  curl -sL https://raw.githubusercontent.com/.../01-setup-server.sh | bash
#  O subir el archivo y ejecutar: bash 01-setup-server.sh
# ═══════════════════════════════════════════════════════════════════════
set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   uni.id — Setup automático v1.0    ║"
echo "║   human.id labs S.A.S.               ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── Variables — EDITAR ANTES DE EJECUTAR ────────────────────────────
APP_DOMAIN=""           # Tu dominio, ej: api.uni-id.com (dejar vacío si no tenés dominio todavía)
DB_PASSWORD="$(openssl rand -base64 32 | tr -d '/+=' | head -c 24)"
APP_USER="uniid"
APP_DIR="/opt/uniid"
NODE_VERSION="22"
# ─────────────────────────────────────────────────────────────────────

echo "▶ Actualizando sistema..."
apt-get update -qq && apt-get upgrade -y -qq

echo "▶ Instalando dependencias base..."
apt-get install -y -qq curl wget git nginx certbot python3-certbot-nginx \
  postgresql postgresql-contrib ufw fail2ban build-essential

# ─── Node.js ─────────────────────────────────────────────────────────
echo "▶ Instalando Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y -qq nodejs
npm install -g pnpm

echo "✅ Node $(node -v) | pnpm $(pnpm -v)"

# ─── PostgreSQL ───────────────────────────────────────────────────────
echo "▶ Configurando PostgreSQL..."
systemctl enable postgresql --now

sudo -u postgres psql << SQL
CREATE USER ${APP_USER} WITH PASSWORD '${DB_PASSWORD}';
CREATE DATABASE uniid OWNER ${APP_USER};
GRANT ALL PRIVILEGES ON DATABASE uniid TO ${APP_USER};
SQL

DATABASE_URL="postgresql://${APP_USER}:${DB_PASSWORD}@localhost:5432/uniid"
echo "✅ PostgreSQL configurado"

# ─── Usuario de sistema ───────────────────────────────────────────────
echo "▶ Creando usuario $APP_USER..."
useradd --system --shell /bin/bash --home $APP_DIR $APP_USER 2>/dev/null || true
mkdir -p $APP_DIR
chown $APP_USER:$APP_USER $APP_DIR

# ─── Estructura del proyecto ──────────────────────────────────────────
echo "▶ Creando estructura de directorios..."
mkdir -p $APP_DIR/{api,backups,logs}
chown -R $APP_USER:$APP_USER $APP_DIR

# ─── Variables de entorno del backend ────────────────────────────────
echo "▶ Generando claves de seguridad..."
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
MASTER_KEY=$(openssl rand -hex 32)

cat > $APP_DIR/.env << ENV
# ── uni.id Backend — Variables de entorno ──────────────────────────────
NODE_ENV=production
PORT=3001

# Base de datos (generada automáticamente)
DATABASE_URL=${DATABASE_URL}

# JWT — Claves generadas automáticamente (NO compartir)
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

# Cifrado AES-256 — Clave generada automáticamente (NO compartir)
MASTER_KEY_HEX=${MASTER_KEY}

# Email SMTP (opcional — completar para recuperación de cuenta)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=tu@gmail.com
# SMTP_PASS=tu_app_password
# SMTP_FROM=uni.id <tu@gmail.com>

# MercadoPago (opcional)
# MP_ACCESS_TOKEN=
# MP_WEBHOOK_SECRET=

# Stripe (opcional)
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=
ENV

chown $APP_USER:$APP_USER $APP_DIR/.env
chmod 600 $APP_DIR/.env
echo "✅ Variables de entorno generadas"

# ─── Systemd service ─────────────────────────────────────────────────
echo "▶ Configurando servicio systemd..."
cat > /etc/systemd/system/uniid-api.service << SERVICE
[Unit]
Description=uni.id API Server
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}/api
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node --enable-source-maps dist/index.mjs
Restart=always
RestartSec=5
StandardOutput=append:${APP_DIR}/logs/api.log
StandardError=append:${APP_DIR}/logs/api-error.log

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload

# ─── Nginx ───────────────────────────────────────────────────────────
echo "▶ Configurando Nginx..."
cat > /etc/nginx/sites-available/uniid-api << NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${APP_DOMAIN:-_};

    # Seguridad
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer" always;

    # Limitar tamaño de body
    client_max_body_size 10M;

    # Rate limiting básico en nginx
    limit_req_zone \$binary_remote_addr zone=api:10m rate=30r/m;

    location /api {
        limit_req zone=api burst=10 nodelay;

        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
    }

    location / {
        return 404;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/uniid-api /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ─── Firewall ─────────────────────────────────────────────────────────
echo "▶ Configurando firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
echo "✅ Firewall configurado"

# ─── Fail2ban ────────────────────────────────────────────────────────
echo "▶ Configurando Fail2ban..."
cat > /etc/fail2ban/jail.local << F2B
[sshd]
enabled = true
maxretry = 5
bantime = 3600

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
action = iptables-multiport[name=nginx, port="http,https"]
logpath = /var/log/nginx/error.log
maxretry = 10
bantime = 600
F2B

systemctl enable fail2ban --now

# ─── Backups automáticos ──────────────────────────────────────────────
echo "▶ Configurando backups automáticos..."
cat > /opt/uniid-backup.sh << 'BACKUP'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/uniid/backups
mkdir -p $BACKUP_DIR
pg_dump -U uniid uniid | gzip > $BACKUP_DIR/db_$DATE.sql.gz
# Eliminar backups de más de 30 días
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
BACKUP

chmod +x /opt/uniid-backup.sh
echo "0 3 * * * root /opt/uniid-backup.sh" >> /etc/cron.d/uniid-backup
echo "✅ Backup diario configurado (3am)"

# ─── Schema de la base de datos ──────────────────────────────────────
echo "▶ Creando schema de la base de datos..."
# El schema se aplica en el paso de deploy (02-deploy-app.sh)

# ─── Resumen ─────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   ✅  SERVIDOR CONFIGURADO EXITOSAMENTE                     ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Base de datos:  postgresql://uniid:***@localhost:5432/uniid ║"
echo "║  App directory:  /opt/uniid/                                 ║"
echo "║  Logs:           /opt/uniid/logs/                            ║"
echo "║  Backups:        /opt/uniid/backups/ (diarios a las 3am)     ║"
echo "║                                                              ║"
echo "║  PRÓXIMO PASO: ejecutar 02-deploy-app.sh                     ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  DB Password (guardala): $DB_PASSWORD"
echo "  JWT Secret generado automáticamente en /opt/uniid/.env"
echo ""
