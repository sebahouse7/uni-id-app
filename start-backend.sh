#!/bin/bash
# ═══════════════════════════════════════════════════════════
# uni.id — Iniciar backend localmente
# Uso: ./start-backend.sh
# ═══════════════════════════════════════════════════════════

set -e

BACKEND_DIR="$(dirname "$0")/artifacts/api-server"

echo ""
echo "🚀  uni.id — Backend"
echo "════════════════════"

# Verificar que existe .env
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo ""
  echo "⚠️  No se encontró artifacts/api-server/.env"
  echo "   Copiando .env.example → .env ..."
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  echo ""
  echo "❗ IMPORTANTE: Editá artifacts/api-server/.env y configurá DATABASE_URL"
  echo "   Luego volvé a correr este script."
  echo ""
  exit 1
fi

# Verificar que DATABASE_URL esté configurado
if grep -q "^DATABASE_URL=postgresql://usuario:password" "$BACKEND_DIR/.env" 2>/dev/null; then
  echo ""
  echo "❌  DATABASE_URL tiene el valor de ejemplo. Necesitás configurarlo."
  echo "   Editá artifacts/api-server/.env y completá DATABASE_URL"
  echo "   Podés usar una base gratuita en: https://neon.tech"
  echo ""
  exit 1
fi

# Verificar dependencias
if [ ! -d "node_modules" ]; then
  echo "📦  Instalando dependencias..."
  pnpm install
fi

echo "✅  Iniciando backend en http://localhost:8080"
echo "   Presioná Ctrl+C para detener"
echo ""

cd "$BACKEND_DIR" && pnpm dev
