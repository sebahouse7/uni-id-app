#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
#  uni.id — Activar HTTPS con certificado SSL gratuito (Let's Encrypt)
#  Ejecutar DESPUÉS de apuntar el dominio al servidor
#  Uso: bash 03-ssl.sh tu-dominio.com tu@email.com
# ═══════════════════════════════════════════════════════════════════════
set -e

DOMAIN="${1}"
EMAIL="${2}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Uso: bash 03-ssl.sh tu-dominio.com tu@email.com"
  echo "Ejemplo: bash 03-ssl.sh api.uni-id.com sebastian@humanidlabs.com"
  exit 1
fi

echo ""
echo "▶ Activando HTTPS para $DOMAIN..."

# Actualizar nginx con el dominio real
sed -i "s/server_name .*;/server_name $DOMAIN;/" /etc/nginx/sites-available/uniid-api
nginx -t && systemctl reload nginx

# Obtener certificado SSL gratuito
certbot --nginx \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive \
  --redirect

# Renovación automática (ya viene con certbot, pero lo forzamos)
systemctl enable certbot.timer 2>/dev/null || true

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║   ✅  HTTPS ACTIVADO                                  ║"
echo "║                                                        ║"
echo "║   Tu API está disponible en:                           ║"
echo "║   https://$DOMAIN/api/healthz"
echo "║                                                        ║"
echo "║   Certificado SSL: GRATIS y se renueva automático      ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "  Actualizá EXPO_PUBLIC_API_URL en la app:"
echo "  EXPO_PUBLIC_API_URL=https://$DOMAIN/api"
echo ""
