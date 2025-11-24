# Diagnostic RBAC - Identifier les problèmes
Write-Host "`n=== RBAC Diagnostic ===" -ForegroundColor Cyan

# 1. Vérifier le fichier .env
Write-Host "`n[1/6] Vérification du fichier .env..." -ForegroundColor Yellow
if (Test-Path "brique-68/.env") {
    Write-Host "  ✅ Fichier .env existe" -ForegroundColor Green
    $dbName = Select-String -Path "brique-68/.env" -Pattern "DB_NAME=" | Select-Object -First 1
    Write-Host "  Config: $dbName" -ForegroundColor Gray
} else {
    Write-Host "  ❌ Fichier .env manquant!" -ForegroundColor Red
}

# 2. Vérifier les fichiers compilés
Write-Host "`n[2/6] Vérification des fichiers compilés..." -ForegroundColor Yellow
if (Test-Path "brique-68/dist/utils/db.js") {
    Write-Host "  ✅ Fichier db.js compilé existe" -ForegroundColor Green
    $dbContent = Get-Content "brique-68/dist/utils/db.js" -Raw
    if ($dbContent -match "molam_connect") {
        Write-Host "  ✅ Utilise molam_connect" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Utilise encore molam_rbac!" -ForegroundColor Red
        Write-Host "  → Exécutez: cd brique-68 && npm run build" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ❌ Fichier compilé manquant" -ForegroundColor Red
}

# 3. Vérifier dotenv dans les fichiers compilés
Write-Host "`n[3/6] Vérification de dotenv..." -ForegroundColor Yellow
if (Test-Path "brique-68/dist/utils/db.js") {
    $dbContent = Get-Content "brique-68/dist/utils/db.js" -Raw
    if ($dbContent -match "dotenv/config") {
        Write-Host "  ✅ dotenv/config importé" -ForegroundColor Green
    } else {
        Write-Host "  ❌ dotenv/config manquant!" -ForegroundColor Red
        Write-Host "  → Rebuild nécessaire" -ForegroundColor Yellow
    }
}

# 4. Tester la connexion PostgreSQL
Write-Host "`n[4/6] Test de connexion PostgreSQL..." -ForegroundColor Yellow
try {
    $result = psql -U postgres -d molam_connect -t -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Base molam_connect accessible" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Erreur de connexion" -ForegroundColor Red
    }
} catch {
    Write-Host "  ⚠️  psql non disponible" -ForegroundColor Yellow
}

# 5. Vérifier si le serveur tourne
Write-Host "`n[5/6] Vérification du serveur..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -ErrorAction Stop
    Write-Host "  ✅ Serveur en cours d'exécution" -ForegroundColor Green
    Write-Host "  Status: $($health.status)" -ForegroundColor Gray
} catch {
    Write-Host "  ❌ Serveur non accessible" -ForegroundColor Red
    Write-Host "  → Démarrez avec: npm start" -ForegroundColor Yellow
}

# 6. Tester une requête RBAC
Write-Host "`n[6/6] Test d'une requête RBAC..." -ForegroundColor Yellow
try {
    $headers = @{ "x-user-id" = "test-123" }
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/rbac/permissions" -Headers $headers -ErrorAction Stop
    Write-Host "  ✅ Endpoint RBAC fonctionne!" -ForegroundColor Green
    Write-Host "  Permissions: $($response.Count)" -ForegroundColor Gray
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "  ❌ Erreur HTTP $statusCode" -ForegroundColor Red

    if ($statusCode -eq 500) {
        Write-Host ""
        Write-Host "  Probable cause: Base de données incorrecte" -ForegroundColor Yellow
        Write-Host "  Solutions:" -ForegroundColor Yellow
        Write-Host "    1. Vérifier brique-68/.env contient DB_NAME=molam_connect" -ForegroundColor White
        Write-Host "    2. Rebuilder: cd brique-68; npm run build" -ForegroundColor White
        Write-Host "    3. Redémarrer le serveur: Ctrl+C puis npm start" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "=== Résumé ===" -ForegroundColor Cyan
Write-Host "Si des erreurs persistent:" -ForegroundColor Yellow
Write-Host "  1. cd brique-68" -ForegroundColor White
Write-Host "  2. npm run build" -ForegroundColor White
Write-Host "  3. cd .." -ForegroundColor White
Write-Host "  4. Redémarrer le serveur (Ctrl+C puis npm start)" -ForegroundColor White
Write-Host "  5. Relancer ce diagnostic" -ForegroundColor White
Write-Host ""
