#!/bin/bash
# Ver logs del servidor uni.id
echo "=== Estado del servicio ==="
systemctl status uniid-api --no-pager

echo ""
echo "=== Últimas 50 líneas de logs ==="
tail -50 /opt/uniid/logs/api.log 2>/dev/null || journalctl -u uniid-api -n 50 --no-pager

echo ""
echo "=== Errores recientes ==="
tail -20 /opt/uniid/logs/api-error.log 2>/dev/null || echo "(sin errores)"
