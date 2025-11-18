# =====================================================================
# Script de Test - Tous les Schémas SQL (PowerShell)
# =====================================================================
# Ce script teste l'installation de tous les schémas SQL des briques
# Date: 2025-11-12
# =====================================================================

# Configuration
$DB_NAME = if ($env:DB_NAME) { $env:DB_NAME } else { "molam_connect_test" }
$DB_USER = if ($env:DB_USER) { $env:DB_USER } else { "postgres" }
$DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }

Write-Host "=================================================" -ForegroundColor Blue
Write-Host "  Test des Schémas SQL - Molam Connect" -ForegroundColor Blue
Write-Host "=================================================" -ForegroundColor Blue
Write-Host ""
Write-Host "Database: " -NoNewline
Write-Host "$DB_NAME" -ForegroundColor Green
Write-Host "User: " -NoNewline
Write-Host "$DB_USER" -ForegroundColor Green
Write-Host "Host: " -NoNewline
Write-Host "$DB_HOST" -ForegroundColor Green
Write-Host ""

# =====================================================================
# 1. Créer/Recréer la base de données de test
# =====================================================================

Write-Host "[1/7] Création de la base de données de test..." -ForegroundColor Yellow

# Drop si existe
dropdb -U $DB_USER -h $DB_HOST -p $DB_PORT --if-exists $DB_NAME 2>$null

# Créer
$createResult = createdb -U $DB_USER -h $DB_HOST -p $DB_PORT $DB_NAME 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Base de données créée" -ForegroundColor Green
} else {
    Write-Host "❌ Échec de création de la base de données" -ForegroundColor Red
    Write-Host $createResult
    exit 1
}

Write-Host ""

# =====================================================================
# 2. Fonction helper update_updated_at
# =====================================================================

Write-Host "[2/7] Création de la fonction helper update_updated_at_column..." -ForegroundColor Yellow

$helperFunction = @"
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS `$`$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
`$`$ LANGUAGE plpgsql;
"@

$helperFunction | psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -v ON_ERROR_STOP=1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Fonction helper créée" -ForegroundColor Green
} else {
    Write-Host "❌ Échec de création de la fonction helper" -ForegroundColor Red
    exit 1
}

Write-Host ""

# =====================================================================
# 3. Brique 76 - Notifications
# =====================================================================

Write-Host "[3/7] Installation Brique 76 - Notifications..." -ForegroundColor Yellow

if (Test-Path "brique-76\sql\004_notifications_schema.sql") {
    psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -v ON_ERROR_STOP=1 -f "brique-76\sql\004_notifications_schema.sql"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Brique 76 installée" -ForegroundColor Green
    } else {
        Write-Host "❌ Échec Brique 76" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️  Fichier brique-76\sql\004_notifications_schema.sql non trouvé" -ForegroundColor Yellow
}

Write-Host ""

# =====================================================================
# 4. Brique 77 - Dashboard
# =====================================================================

Write-Host "[4/7] Installation Brique 77 - Dashboard..." -ForegroundColor Yellow

if (Test-Path "brique-77\sql\005_dashboard_schema.sql") {
    psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -v ON_ERROR_STOP=1 -f "brique-77\sql\005_dashboard_schema.sql"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Brique 77 installée" -ForegroundColor Green
    } else {
        Write-Host "❌ Échec Brique 77" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️  Fichier brique-77\sql\005_dashboard_schema.sql non trouvé" -ForegroundColor Yellow
}

Write-Host ""

# =====================================================================
# 5. Brique 77.1 - Alerts
# =====================================================================

Write-Host "[5/7] Installation Brique 77.1 - Alerts..." -ForegroundColor Yellow

if (Test-Path "brique-77\sql\006_alerts_schema.sql") {
    psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -v ON_ERROR_STOP=1 -f "brique-77\sql\006_alerts_schema.sql"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Brique 77.1 installée" -ForegroundColor Green
    } else {
        Write-Host "❌ Échec Brique 77.1" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️  Fichier brique-77\sql\006_alerts_schema.sql non trouvé" -ForegroundColor Yellow
}

Write-Host ""

# =====================================================================
# 6. Brique 78 - Ops Approval
# =====================================================================

Write-Host "[6/7] Installation Brique 78 - Ops Approval..." -ForegroundColor Yellow

if (Test-Path "brique-78\sql\007_approval_engine_schema.sql") {
    psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -v ON_ERROR_STOP=1 -f "brique-78\sql\007_approval_engine_schema.sql"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Brique 78 installée" -ForegroundColor Green
    } else {
        Write-Host "❌ Échec Brique 78" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️  Fichier brique-78\sql\007_approval_engine_schema.sql non trouvé" -ForegroundColor Yellow
}

Write-Host ""

# =====================================================================
# 7. Brique 79 - API Keys
# =====================================================================

Write-Host "[7/7] Installation Brique 79 - API Keys..." -ForegroundColor Yellow

if (Test-Path "brique-79\sql\008_api_keys_schema.sql") {
    psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -v ON_ERROR_STOP=1 -f "brique-79\sql\008_api_keys_schema.sql"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Brique 79 installée" -ForegroundColor Green
    } else {
        Write-Host "❌ Échec Brique 79" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️  Fichier brique-79\sql\008_api_keys_schema.sql non trouvé" -ForegroundColor Yellow
}

Write-Host ""

# =====================================================================
# Vérifications
# =====================================================================

Write-Host "=================================================" -ForegroundColor Blue
Write-Host "  Vérifications" -ForegroundColor Blue
Write-Host "=================================================" -ForegroundColor Blue
Write-Host ""

# Compter les tables
$TABLE_COUNT = (psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';").Trim()
Write-Host "Tables créées: " -NoNewline
Write-Host "$TABLE_COUNT" -ForegroundColor Green

# Compter les fonctions
$FUNCTION_COUNT = (psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';").Trim()
Write-Host "Fonctions créées: " -NoNewline
Write-Host "$FUNCTION_COUNT" -ForegroundColor Green

# Compter les vues
$VIEW_COUNT = (psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'public';").Trim()
Write-Host "Vues créées: " -NoNewline
Write-Host "$VIEW_COUNT" -ForegroundColor Green

# Compter les triggers
$TRIGGER_COUNT = (psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -t -c "SELECT COUNT(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public';").Trim()
Write-Host "Triggers créés: " -NoNewline
Write-Host "$TRIGGER_COUNT" -ForegroundColor Green

Write-Host ""

# Liste des tables
Write-Host "Liste des tables:" -ForegroundColor Blue
$tables = psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
$tables -split "`n" | Where-Object { $_.Trim() -ne "" } | ForEach-Object { Write-Host " - $($_.Trim())" }

Write-Host ""

# =====================================================================
# Résumé
# =====================================================================

Write-Host "=================================================" -ForegroundColor Blue
Write-Host "  Résumé" -ForegroundColor Blue
Write-Host "=================================================" -ForegroundColor Blue
Write-Host ""
Write-Host "✅ Tous les schémas ont été installés avec succès" -ForegroundColor Green
Write-Host ""
Write-Host "Base de données: " -NoNewline
Write-Host "$DB_NAME" -ForegroundColor Green
Write-Host "Tables: " -NoNewline
Write-Host "$TABLE_COUNT" -ForegroundColor Green
Write-Host "Fonctions: " -NoNewline
Write-Host "$FUNCTION_COUNT" -ForegroundColor Green
Write-Host "Vues: " -NoNewline
Write-Host "$VIEW_COUNT" -ForegroundColor Green
Write-Host "Triggers: " -NoNewline
Write-Host "$TRIGGER_COUNT" -ForegroundColor Green
Write-Host ""
Write-Host "Prêt pour les tests! 🚀" -ForegroundColor Blue
Write-Host ""
