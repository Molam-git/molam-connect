@echo off
title MOLAM CONNECT - Docker Build & Run
cls

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║            MOLAM CONNECT - DOCKER BUILD ^& RUN                  ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

echo Ce script va :
echo   1. Arreter les conteneurs existants
echo   2. Builder l'image Docker
echo   3. Demarrer tous les services (PostgreSQL, Redis, API)
echo.
pause

echo.
echo [1/4] Arret des conteneurs existants...
docker-compose -f docker-compose.full.yml down
echo      - OK
echo.

echo [2/4] Build de l'image Docker...
echo      (Cela peut prendre quelques minutes la premiere fois)
docker-compose -f docker-compose.full.yml build
if %errorlevel% neq 0 (
    echo      - ERREUR lors du build !
    pause
    exit /b 1
)
echo      - OK
echo.

echo [3/4] Demarrage des conteneurs...
docker-compose -f docker-compose.full.yml up -d
if %errorlevel% neq 0 (
    echo      - ERREUR lors du demarrage !
    pause
    exit /b 1
)
echo      - OK
echo.

echo [4/4] Attente du demarrage complet...
timeout /t 10 /nobreak >nul
echo      - OK
echo.

echo ╔════════════════════════════════════════════════════════════════╗
echo ║                    DEMARRAGE TERMINE !                         ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo  Services en cours d'execution:
echo    - PostgreSQL         : localhost:5434
echo    - Redis              : localhost:6379
echo    - API Backend        : http://localhost:3000
echo    - Dashboard          : http://localhost:3001/dashboard
echo    - Metrics (Prometheus): http://localhost:9090/metrics
echo.
echo  Pour tester l'API :
echo    ^> curl http://localhost:3000/health
echo.

echo  Pour voir les logs en temps reel :
echo    docker-compose -f docker-compose.full.yml logs -f
echo.
echo  Pour arreter tous les services :
echo    docker-compose -f docker-compose.full.yml down
echo.

start http://localhost:3001/dashboard

echo  Ouverture du dashboard...
echo.
pause
