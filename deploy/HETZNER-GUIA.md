# uni.id — Guía de deploy en Hetzner

## Paso 1 — Crear cuenta en Hetzner

1. Ir a **https://www.hetzner.com/cloud**
2. Crear cuenta (necesitás email y tarjeta de crédito/débito)
   - También aceptan PayPal
3. Verificar el email

Costo: desde **€4/mes** (CX22 — suficiente para empezar)

---

## Paso 2 — Crear el servidor

En el panel de Hetzner Cloud:

1. Clic en **"Add Server"**
2. Configuración recomendada para empezar:
   - **Location:** Nuremberg (nbg1) o Falkenstein (fsn1) — Alemania
   - **Image:** Ubuntu 24.04 LTS
   - **Type:** CX22 (2 vCPU, 4GB RAM) — €4.35/mes
   - **SSH Key:** Crear una nueva (Hetzner te guía)
   - **Name:** uniid-api
3. Clic en **"Create & Buy Now"**
4. Anotar la **IP pública** que te asigna (ej: 49.13.xxx.xxx)

---

## Paso 3 — Conectarse al servidor por SSH

### En Mac / Linux:
```bash
ssh root@TU_IP_DEL_SERVIDOR
```

### En Windows:
- Descargar **PuTTY**: https://putty.org
- Host: TU_IP_DEL_SERVIDOR
- Port: 22
- Conectar

---

## Paso 4 — Subir y ejecutar el script de setup

Una vez conectado al servidor por SSH:

```bash
# Subir el script (desde tu PC, en otra terminal)
scp deploy/01-setup-server.sh root@TU_IP:/root/

# En el servidor, ejecutar:
bash /root/01-setup-server.sh
```

Esto tarda unos 3-5 minutos y configura TODO automáticamente:
- Node.js 22
- PostgreSQL (base de datos)
- Nginx (servidor web)
- Firewall
- Backups automáticos diarios
- Servicio que se reinicia solo si falla

---

## Paso 5 — Deploy de la app

Desde tu PC (en la carpeta del proyecto):

```bash
# Subir el script de deploy
scp deploy/02-deploy-app.sh root@TU_IP:/root/

# Subir el código del backend
scp -r artifacts/api-server root@TU_IP:/tmp/
scp database/schema.sql root@TU_IP:/tmp/

# Ejecutar deploy
ssh root@TU_IP "bash /root/02-deploy-app.sh"
```

---

## Paso 6 — Verificar que funciona

Desde tu PC:
```bash
curl http://TU_IP/api/healthz
# Debe responder: {"status":"ok"}
```

En tu celular: abrir el navegador y entrar a:
```
http://TU_IP/api/healthz
```

---

## Paso 7 — Activar HTTPS (requiere dominio)

Para tener `https://api.tudominio.com`:

1. Comprar un dominio (Namecheap, GoDaddy, NIC Argentina)
2. Crear un registro DNS tipo A:
   - Nombre: `api`
   - Valor: TU_IP_DEL_SERVIDOR
3. Esperar 5-30 minutos que propague
4. Ejecutar en el servidor:

```bash
bash /root/03-ssl.sh api.tudominio.com tu@email.com
```

Listo — SSL gratis y automático con Let's Encrypt.

---

## Paso 8 — Actualizar la app con la nueva URL

Editar `artifacts/uni-ud/.env`:
```env
# Con IP (HTTP, solo para pruebas):
EXPO_PUBLIC_API_URL=http://TU_IP/api

# Con dominio y HTTPS (producción):
EXPO_PUBLIC_API_URL=https://api.tudominio.com/api
```

---

## Comandos útiles en el servidor

```bash
# Ver estado
systemctl status uniid-api

# Ver logs en tiempo real
journalctl -u uniid-api -f

# Reiniciar
systemctl restart uniid-api

# Ver base de datos
psql -U uniid -d uniid

# Hacer backup manual
bash /opt/uniid-backup.sh
```

---

## Costos totales estimados

| Concepto | Costo |
|---------|-------|
| Servidor Hetzner CX22 | €4.35/mes |
| Dominio (opcional) | ~$10/año |
| SSL (Let's Encrypt) | GRATIS |
| Backups incluidos | GRATIS |
| **Total mínimo** | **~€5/mes** |

---

## ¿Qué pasa si el servidor se cae?

- El servicio `uniid-api` se reinicia automáticamente
- Si el servidor se apaga (raro), se levanta solo al reiniciar
- Los datos están en PostgreSQL con backup diario automático
- Tiempo estimado de recuperación: < 1 minuto

---

## Escalado cuando crezcas

Cuando tengas más usuarios, desde el panel de Hetzner:
- Clic en el servidor → "Resize" → elegir tipo más grande
- Sin migración, sin cambiar IP, sin reconfigurar nada
- Tarda 2 minutos

---

## Soporte

Hetzner tiene soporte 24/7 en inglés y alemán.
Documentación: https://docs.hetzner.com/cloud
