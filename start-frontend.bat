@echo off
REM ═══════════════════════════════════════════════════════════
REM uni.id — Iniciar frontend Expo en Windows
REM Uso: doble clic en start-frontend.bat
REM ═══════════════════════════════════════════════════════════

echo.
echo  uni.id - Frontend (Expo)
echo ==========================

IF NOT EXIST "artifacts\uni-ud\.env.local" (
  copy "artifacts\uni-ud\.env.local.example" "artifacts\uni-ud\.env.local"
  echo  Creado artifacts\uni-ud\.env.local
)

IF NOT EXIST "node_modules" (
  echo  Instalando dependencias...
  call pnpm install
)

echo.
echo  Iniciando Expo...
echo    Web:    http://localhost:8081
echo    Movil:  Escaneá el QR con Expo Go
echo    Presiona 'w' para abrir en navegador
echo.

cd artifacts\uni-ud && pnpm start
pause
