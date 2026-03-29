#!/bin/bash
# ═══════════════════════════════════════════════════════════
# uni.id — Iniciar frontend Expo localmente
# Uso: ./start-frontend.sh
# ═══════════════════════════════════════════════════════════

set -e

FRONTEND_DIR="$(dirname "$0")/artifacts/uni-ud"

echo ""
echo "📱  uni.id — Frontend (Expo)"
echo "════════════════════════════"

# Verificar dependencias
if [ ! -d "node_modules" ]; then
  echo "📦  Instalando dependencias..."
  pnpm install
fi

# Copiar .env.local si no existe
if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
  cp "$FRONTEND_DIR/.env.local.example" "$FRONTEND_DIR/.env.local"
  echo "ℹ️  Creado artifacts/uni-ud/.env.local"
fi

echo ""
echo "✅  Iniciando Expo..."
echo "   • Web:    http://localhost:8081"
echo "   • Móvil:  Escaneá el QR con Expo Go"
echo "   • Presioná 'w' para abrir en el navegador"
echo ""
echo "   ⚠️  Para conectar desde el celular, editá .env.local"
echo "   y configurá EXPO_PUBLIC_API_URL=http://TU_IP:8080/api"
echo ""

cd "$FRONTEND_DIR" && pnpm start
