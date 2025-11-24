@echo off
REM ============================================================================
REM MOLAM CONNECT - Start All Services
REM ============================================================================

echo ============================================================
echo  MOLAM CONNECT - Starting All Services
echo ============================================================
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    pause
    exit /b 1
)

echo [INFO] Starting services...
echo.

echo ============================================================
echo  Services that will be started:
echo ============================================================
echo  1. Gateway Server     : http://localhost:3000
echo  2. Molam Platform UI  : http://localhost:3001
echo  3. Wallet API         : http://localhost:8080 (manual)
echo  4. Connect API        : http://localhost:8081 (manual)
echo ============================================================
echo.

REM Start Gateway (server.js) in new window
echo Starting Gateway Server...
start "Molam Gateway" cmd /k "cd /d %~dp0 && npm start"
timeout /t 3 /nobreak >nul

REM Start Frontend (molam-platform) in new window
echo Starting Molam Platform UI...
start "Molam Platform UI" cmd /k "cd /d %~dp0molam-platform && npm start"
timeout /t 3 /nobreak >nul

echo.
echo ============================================================
echo  Services Started!
echo ============================================================
echo.
echo  Gateway Dashboard : http://localhost:3000
echo  Platform UI       : http://localhost:3001
echo.
echo  To start backend services manually:
echo  - Wallet API  : cd brique-149a-wallet/server ^&^& npm run dev
echo  - Connect API : cd brique-149b-connect/server ^&^& npm run dev
echo.
echo  Press any key to stop all services...
echo ============================================================

pause >nul

REM Kill all node processes (optional)
echo Stopping services...
taskkill /F /FI "WindowTitle eq Molam Gateway*" >nul 2>&1
taskkill /F /FI "WindowTitle eq Molam Platform UI*" >nul 2>&1

echo All services stopped.
