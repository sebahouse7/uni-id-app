#!/bin/bash
# uni.id — Deploy backend to Railway
# Usage: DATABASE_URL="postgresql://..." bash deploy/deploy-railway.sh

set -e

PROJECT_ID="a58781bd-0545-4878-8ae1-21416fe56bfd"
SVC_ID="ece20428-adbb-4a7e-a64e-c1f11f772de6"
ENV_ID="7bf8d483-40bb-4b58-8990-651dfa1b57aa"

if [ -z "$DATABASE_URL" ]; then
  echo "❌  Falta DATABASE_URL. Usá: DATABASE_URL='postgresql://...' bash deploy/deploy-railway.sh"
  exit 1
fi

if [ -z "$RAILWAY_TOKEN" ]; then
  echo "❌  Falta RAILWAY_TOKEN"
  exit 1
fi

echo "🔄 Configurando variables de entorno en Railway..."

# Set all required env vars
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -d "{\"query\":\"mutation { variableCollectionUpsert(input: { projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$SVC_ID\\\", variables: { DATABASE_URL: \\\"$DATABASE_URL\\\", NODE_ENV: \\\"production\\\", JWT_SECRET: \\\"uni_id_jwt_prod_$(date +%s)_humanidhubs\\\" } }) }\"}" > /dev/null

echo "✅ Variables configuradas"

echo "🚀 Triggering redeploy..."
DEPLOY_ID=$(curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -d "{\"query\":\"mutation { serviceInstanceDeployV2(serviceId: \\\"$SVC_ID\\\", environmentId: \\\"$ENV_ID\\\") }\"}" | grep -o '"serviceInstanceDeployV2":"[^"]*"' | cut -d'"' -f4)

echo "✅ Deploy iniciado: $DEPLOY_ID"
echo "🔗 Ver estado en: https://railway.app/project/$PROJECT_ID"
echo ""
echo "Esperando 40 segundos para verificar..."
sleep 40

# Check endpoint
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://expressjs-production-8bfc.up.railway.app/api/healthz)
if [ "$STATUS" = "200" ]; then
  echo "✅ Backend online! https://expressjs-production-8bfc.up.railway.app/api/healthz"
else
  echo "⏳ Deploy en progreso (HTTP $STATUS). Chequeá en https://railway.app/project/$PROJECT_ID"
fi
