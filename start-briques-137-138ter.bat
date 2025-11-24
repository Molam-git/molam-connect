@echo off
REM =============================================================================
REM Molam Connect - Démarrage Briques 137 & 138ter (Windows)
REM =============================================================================

setlocal enabledelayedexpansion

echo ============================================================
echo 🚀 DÉMARRAGE BRIQUES 137 ^& 138ter
echo ============================================================
echo.

REM Vérifier que nous sommes dans le bon répertoire
if not exist "brique-137" (
    echo ❌ Erreur: ce script doit être exécuté depuis le répertoire molam-connect/
    exit /b 1
)

if not exist "brique-138ter" (
    echo ❌ Erreur: ce script doit être exécuté depuis le répertoire molam-connect/
    exit /b 1
)

REM =============================================================================
REM Vérification des prérequis
REM =============================================================================
echo 🔍 Vérification des prérequis...
echo.

REM Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ Node.js non installé
    exit /b 1
)
echo ✅ Node.js disponible
node --version

REM Check npm
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ npm non installé
    exit /b 1
)
echo ✅ npm disponible
npm --version

REM Check PostgreSQL (optionnel)
where psql >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ⚠️  PostgreSQL CLI non trouvé. Installation manuelle des migrations requise.
) else (
    echo ✅ PostgreSQL disponible
)

echo.

REM =============================================================================
REM Build des projets
REM =============================================================================
echo 🔨 Build des projets TypeScript...
echo.

REM Build Brique 137
echo 📦 Build Brique 137 - Merchant Dashboard...
cd brique-137\merchant-dashboard
if not exist "node_modules" (
    echo Installation dépendances...
    call npm install --include=dev
)
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ❌ Build Brique 137 échoué
    exit /b 1
)
cd ..\..
echo ✅ Brique 137 compilée
echo.

REM Build Brique 138ter
echo 📦 Build Brique 138ter - Cooperative Failover Mesh...
cd brique-138ter\cooperative-failover-mesh
if not exist "node_modules" (
    echo Installation dépendances...
    call npm install --include=dev
)
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ❌ Build Brique 138ter échoué
    exit /b 1
)
cd ..\..
echo ✅ Brique 138ter compilée
echo.

REM =============================================================================
REM Vérification des migrations
REM =============================================================================
echo 🗄️  Vérification des migrations DB...
echo.

if "%DATABASE_URL%"=="" (
    echo ⚠️  DATABASE_URL non défini. Migrations à exécuter manuellement:
    echo    cd brique-137\merchant-dashboard ^&^& npm run migrate
    echo    psql %%DATABASE_URL%% -f brique-138ter\cooperative-failover-mesh\migrations\2025_01_19_create_mesh_system.sql
    echo.
) else (
    echo ✅ DATABASE_URL configuré
    echo.
    set /p MIGRATE="Exécuter les migrations maintenant? (y/n): "
    if /i "!MIGRATE!"=="y" (
        echo Exécution migrations Brique 137...
        cd brique-137\merchant-dashboard
        call npm run migrate
        cd ..\..

        echo Exécution migrations Brique 138ter...
        psql "%DATABASE_URL%" -f brique-138ter\cooperative-failover-mesh\migrations\2025_01_19_create_mesh_system.sql
    )
)

echo.

REM =============================================================================
REM Démarrage des services
REM =============================================================================
echo 🚀 Démarrage des services en mode DÉVELOPPEMENT...
echo.

echo Ouverture des services dans des fenêtres séparées:
echo.
echo   Terminal 1 - Merchant Dashboard (Port 3001)
echo   Terminal 2 - Merchant Dashboard KPI Worker (Kafka)
echo   Terminal 3 - Cooperative Failover Mesh (Port 3138)
echo.

REM Démarrer chaque service dans une nouvelle fenêtre cmd
start "Brique 137 - Merchant Dashboard" cmd /k "cd /d %CD%\brique-137\merchant-dashboard && npm run dev"
timeout /t 2 /nobreak >nul

start "Brique 137 - KPI Worker" cmd /k "cd /d %CD%\brique-137\merchant-dashboard && npm run worker"
timeout /t 2 /nobreak >nul

start "Brique 138ter - Mesh Controller" cmd /k "cd /d %CD%\brique-138ter\cooperative-failover-mesh && npm run dev"

echo.
echo ============================================================
echo ✅ SERVICES DÉMARRÉS
echo ============================================================
echo.
echo 📊 Brique 137 - Merchant Dashboard
echo   URL: http://localhost:3001
echo   Health: http://localhost:3001/health
echo   API Base: http://localhost:3001/api/merchant
echo.
echo   Endpoints principaux:
echo     GET  /api/merchant/summary?period=mtd^&currency=XOF
echo     GET  /api/merchant/transactions?limit=50^&offset=0
echo     POST /api/merchant/refund
echo     GET  /api/merchant/payouts
echo     GET  /api/merchant/disputes
echo.
echo 🌐 Brique 138ter - Cooperative Failover Mesh
echo   URL: http://localhost:3138
echo   Health: http://localhost:3138/health
echo   API Base: http://localhost:3138/api/mesh
echo.
echo   Endpoints principaux:
echo     GET  /api/mesh/regions
echo     GET  /api/mesh/predictions
echo     POST /api/mesh/predictions/generate
echo     GET  /api/mesh/proposals
echo     POST /api/mesh/proposals/:id/simulate
echo     POST /api/mesh/proposals/:id/approve
echo.
echo 📚 Documentation complète:
echo   - BRIQUE_137_138TER_INTEGRATION.md
echo   - brique-137\merchant-dashboard\README.md
echo   - brique-138ter\cooperative-failover-mesh\README.md
echo.
echo ⚙️  Configuration:
echo   - Brique 137: brique-137\merchant-dashboard\.env
echo   - Brique 138ter: brique-138ter\cooperative-failover-mesh\.env
echo.
echo ============================================================
echo.
echo Appuyez sur une touche pour fermer cette fenêtre...
pause >nul
