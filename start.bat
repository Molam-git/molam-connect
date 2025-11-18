@echo off
REM ============================================================================
REM MOLAM CONNECT - Windows Startup Script
REM ============================================================================

echo ============================================================
echo  MOLAM CONNECT - Starting Development Server
echo ============================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/5] Checking Node.js version...
node --version
echo.

REM Check if PostgreSQL is installed
echo [2/5] Checking PostgreSQL...
where psql >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] PostgreSQL CLI ^(psql^) not found!
    echo If PostgreSQL is installed, make sure psql is in your PATH
    echo.
)

REM Check if dependencies are installed
if NOT exist "node_modules" (
    echo [3/5] Installing dependencies...
    call npm install
    echo.
) else (
    echo [3/5] Dependencies already installed
    echo.
)

REM Check if database exists
echo [4/5] Checking database...
echo If database doesn't exist, run: npm run db:setup
echo.

REM Start the server
echo [5/5] Starting server...
echo.
echo ============================================================
echo  Server will start at: http://localhost:3000
echo  Dashboard: http://localhost:3000/dashboard
echo  Health Check: http://localhost:3000/health
echo ============================================================
echo.
echo Press Ctrl+C to stop the server
echo.

npm start
