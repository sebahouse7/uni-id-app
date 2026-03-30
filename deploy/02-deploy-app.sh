#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
#  uni.id — Deploy / actualización del backend
#  Ejecutar cada vez que haya cambios:
#  bash 02-deploy-app.sh
# ═══════════════════════════════════════════════════════════════════════
set -e

APP_DIR="/opt/uniid"
APP_USER="uniid"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo "▶ uni.id — Deploy del backend..."
echo ""

# ─── Copiar archivos del backend ──────────────────────────────────────
echo "  Copiando archivos..."
rsync -av --delete \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='dist' \
  "$PROJECT_ROOT/artifacts/api-server/" \
  "$APP_DIR/api/"

# ─── Instalar dependencias ────────────────────────────────────────────
echo "  Instalando dependencias..."
cd $APP_DIR/api
sudo -u $APP_USER pnpm install --frozen-lockfile --prod=false

# ─── Build de producción ──────────────────────────────────────────────
echo "  Compilando..."
sudo -u $APP_USER sh -c "cd $APP_DIR/api && NODE_ENV=production pnpm run build"

# ─── Schema de base de datos ──────────────────────────────────────────
echo "  Aplicando schema de base de datos..."
source $APP_DIR/.env
PGPASSWORD="$(echo $DATABASE_URL | sed 's/.*:\(.*\)@.*/\1/')" \
  psql "$DATABASE_URL" < "$PROJECT_ROOT/database/schema.sql" 2>/dev/null || true

# ─── Reiniciar servicio ───────────────────────────────────────────────
echo "  Reiniciando servicio..."
systemctl enable uniid-api
systemctl restart uniid-api
sleep 3

# ─── Verificar que levantó ────────────────────────────────────────────
if systemctl is-active --quiet uniid-api; then
  echo ""
  echo "  ✅  Backend corriendo"
  # Test de health
  sleep 2
  HEALTH=$(curl -s http://localhost:3001/api/healthz 2>/dev/null || echo "no response")
  echo "  Health check: $HEALTH"
else
  echo ""
  echo "  ❌  El servicio no levantó. Revisá los logs:"
  echo "  journalctl -u uniid-api -n 50"
  exit 1
fi

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   ✅  DEPLOY EXITOSO                  ║"
echo "╚════════════════════════════════════════╝"
echo ""
