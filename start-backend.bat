@echo off
REM ═══════════════════════════════════════════════════════════
REM uni.id — Iniciar backend en Windows
REM Uso: doble clic en start-backend.bat
REM ═══════════════════════════════════════════════════════════

echo.
echo  uni.id - Backend
echo ==================

IF NOT EXIST "artifacts\api-server\.env" (
  echo.
  echo  Creando .env desde .env.example...
  copy "artifacts\api-server\.env.example" "artifacts\api-server\.env"
  echo.
  echo  IMPORTANTE: Edita artifacts\api-server\.env y configura DATABASE_URL
  echo  Luego vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

IF NOT EXIST "node_modules" (
  echo  Instalando dependencias...
  call pnpm install
)

echo  Iniciando backend en http://localhost:8080
echo  Presiona Ctrl+C para detener
echo.

cd artifacts\api-server && pnpm dev
pause
