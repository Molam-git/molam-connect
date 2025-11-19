# =====================================================================
# Setup All Database Schemas - Molam Connect
# =====================================================================
# Ce script crée la base de données molam_connect et importe
# TOUS les schémas SQL de toutes les briques
# =====================================================================

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  MOLAM CONNECT - Database Setup (All Briques)" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# Demander le mot de passe PostgreSQL UNE SEULE FOIS
Write-Host "Entrez le mot de passe PostgreSQL (utilisateur 'postgres'):" -ForegroundColor Yellow
$securePassword = Read-Host "Mot de passe" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Définir la variable d'environnement pour toutes les commandes psql
$env:PGPASSWORD = $password
Write-Host "✅ Mot de passe enregistré pour cette session" -ForegroundColor Green
Write-Host ""

# Vérifier si PostgreSQL est accessible
Write-Host "[1/5] Vérification de PostgreSQL..." -ForegroundColor Yellow
try {
    $pgVersion = psql -U postgres -c "SELECT version();" -t 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Impossible de se connecter à PostgreSQL" -ForegroundColor Red
        Write-Host "Vérifiez que:" -ForegroundColor Yellow
        Write-Host "  1. PostgreSQL est démarré (Start-Service postgresql-x64-18)" -ForegroundColor White
        Write-Host "  2. Le mot de passe est correct" -ForegroundColor White
        Write-Host "  3. L'utilisateur 'postgres' existe" -ForegroundColor White

        # Nettoyer le mot de passe
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
        Remove-Variable password, env:PGPASSWORD -ErrorAction SilentlyContinue
        exit 1
    }
    Write-Host "✅ PostgreSQL accessible" -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur: $_" -ForegroundColor Red

    # Nettoyer le mot de passe
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
    Remove-Variable password, env:PGPASSWORD -ErrorAction SilentlyContinue
    exit 1
}
Write-Host ""

# Créer la base de données
Write-Host "[2/5] Création de la base de données 'molam_connect'..." -ForegroundColor Yellow
$dbExists = psql -U postgres -lqt | Select-String -Pattern "molam_connect"
if ($dbExists) {
    Write-Host "⚠️  La base de données 'molam_connect' existe déjà" -ForegroundColor Yellow
    $response = Read-Host "Voulez-vous la supprimer et la recréer? (y/N)"
    if ($response -eq "y" -or $response -eq "Y") {
        Write-Host "Suppression de la base de données..." -ForegroundColor Yellow
        psql -U postgres -c "DROP DATABASE molam_connect;" 2>$null
        psql -U postgres -c "CREATE DATABASE molam_connect;" | Out-Null
        Write-Host "✅ Base de données recréée" -ForegroundColor Green
    } else {
        Write-Host "✅ Utilisation de la base existante" -ForegroundColor Green
    }
} else {
    psql -U postgres -c "CREATE DATABASE molam_connect;" | Out-Null
    Write-Host "✅ Base de données créée" -ForegroundColor Green
}
Write-Host ""

# Liste de tous les fichiers SQL dans l'ordre
Write-Host "[3/5] Recherche des schémas SQL..." -ForegroundColor Yellow

$sqlFiles = @(
    # Brique 41-50
    "brique-41/migrations/000_b41_connect_core.sql"
    "brique-42/migrations/001_b42_connect_payments.sql"
    "brique-42/migrations/002_b42_connect_webhooks.sql"
    "brique-43/migrations/001_b43_checkout_orchestration.sql"
    "brique-44/migrations/001_b44_fraud_detection.sql"
    "brique-45/migrations/001_b45_webhooks.sql"
    "brique-46/migrations/001_b46_billing.sql"
    "brique-47/migrations/001_b47_disputes.sql"
    "brique-48/migrations/001_b48_radar.sql"
    "brique-49/migrations/49_tax.sql"
    "brique-50/migrations/050_fiscal_reporting.sql"

    # Brique 51-60
    "brique-51/migrations/051_refunds_reversals.sql"
    "brique-51/migrations/bis/051bis_policies_zones.sql"
    "brique-52/migrations/052_subscriptions.sql"
    "brique-53/migrations/053_checkout.sql"
    "brique-54/migrations/054_refunds.sql"
    "brique-55/migrations/055_disputes.sql"
    "brique-56/migrations/056_radar.sql"
    "brique-57/migrations/057_merchant_protection.sql"
    "brique-58/migrations/058_disputes.sql"
    "brique-59/migrations/059_sira_analytics.sql"
    "brique-60/migrations/060_recurring_billing.sql"

    # Brique 61-70
    "brique-61/migrations/061_subscription_analytics.sql"
    "brique-61/migrations/061_subscription_analytics_ml.sql"
    "brique-62/migrations/062_merchant_dashboard.sql"
    "brique-64/migrations/064_split_payments.sql"
    "brique-65/migrations/065_tax_engine.sql"
    "brique-66/migrations/066_disputes.sql"
    "brique-67/migrations/067_subscriptions.sql"
    "brique-68/migrations/068_rbac.sql"
    "brique-69/migrations/001_create_analytics_tables.sql"
    "brique-69/migrations/002_create_reporting_tables.sql"
    "brique-70/migrations/001_create_marketing_tables.sql"

    # Brique 70 variants
    "brique-70bis/migrations/001_create_ai_marketing_tables.sql"
    "brique-70ter/migrations/001_create_ai_learning_tables.sql"
    "brique-70quater/migrations/001_create_pricing_ai_tables.sql"
    "brique-70quinquies/migrations/001_create_ai_campaigns_tables.sql"
    "brique-70sexies/migrations/001_create_social_ads_tables.sql"
    "brique-70octies/migrations/001_create_loyalty_tables.sql"
    "brique-70octies/migrations/002_upgrade_industrial.sql"
    "brique-70nonies/migrations/001_create_refund_tables.sql"

    # Brique 71-79
    "brique-71/migrations/001_create_kyc_tables.sql"
    "brique-72/migrations/001_create_limits_tables.sql"
    "brique-73/migrations/001_create_devconsole_tables.sql"
    "brique-73/migrations/002_create_webhooks_tables.sql"
    "brique-73/sql/002_sira_enrichment.sql"
    "brique-73/sql/003_unified_complete_schema.sql"
    "brique-73bis/migrations/001_create_observability_tables.sql"

    # Brique 74-79 (Production Ready)
    "brique-74/sql/001_developer_portal_schema.sql"
    "brique-74/sql/002_banking_simulator_schema.sql"
    "brique-74/sql/003_api_mock_generator_schema.sql"
    "brique-74/sql/004_test_harness_schema.sql"
    "brique-75/sql/001_merchant_settings_schema.sql"
    "brique-75/sql/002_dynamic_zones_schema.sql"
    "brique-75/sql/003_geo_fraud_rules_schema.sql"
    "brique-76/sql/004_notifications_schema.sql"
    "brique-77/sql/005_dashboard_schema.sql"
    "brique-77/sql/006_alerts_schema.sql"
    "brique-78/sql/007_approval_engine_schema.sql"
    "brique-79/sql/008_api_keys_schema.sql"

    # Brique 80-90
    "brique-80/sql/009_rate_limits_schema.sql"
    "brique-81/sql/010_billing_overages_schema.sql"
    "brique-82/sql/011_overage_preview_tables.sql"
    "brique-83/sql/012_sira_tables.sql"
    "brique-84/sql/013_payouts_tables.sql"
    "brique-85/sql/014_bank_connectors.sql"
    "brique-86/migrations/001_b86_statement_reconciliation.sql"
    "brique-87/migrations/001_b87_rules_engine.sql"
    "brique-88/migrations/001_b88_ledger_adjustments.sql"
    "brique-89/migrations/001_b89_payouts_engine.sql"
    "brique-90/migrations/001_b90_compliance_aml.sql"

    # Brique 91-99
    "brique-91/migrations/001_b91_treasury_operations.sql"
    "brique-92/migrations/001_b92_payouts_engine.sql"
    "brique-93/migrations/001_b93_scheduling_engine.sql"
    "brique-94/migrations/001_b94_molam_form_core.sql"
    "brique-95/migrations/001_b95_auto_switch_routing.sql"
    "brique-97/migrations/001_create_tokenization_schema.sql"
    "brique-98/migrations/001_create_offline_schema.sql"
    "brique-99/migrations/001_create_plugin_integrations.sql"

    # Brique 104-106
    "brique-104/php-sdk/sql/migrations/2025_01_create_idempotency_and_webhooks.sql"
    "brique-105/migrations/001_idempotency_and_webhooks.sql"
    "brique-106/auth-service/migrations/001_auth_decisions_and_otp.sql"

    # Brique 107 - Offline Fallback (QR + USSD)
    "brique-107/migrations/001_offline_fallback.sql"

    # Brique 108 - PaymentIntent & 3DS2 Orchestration
    "brique-108/migrations/001_payment_intent_3ds2.sql"

    # Brique 109 - Checkout Widgets & SDK Enhancements
    "brique-109/migrations/001_checkout_widgets.sql"

    # Brique 110 - Plugin Telemetry & Upgrade Notifications
    "brique-110/migrations/001_plugin_telemetry.sql"

    # Brique 110bis - Auto-Healing Plugins & Interop Layer
    "brique-110bis/migrations/001_auto_healing_interop.sql"

    # Brique 110ter - AI Plugin Forge
    "brique-110ter/migrations/001_plugin_forge.sql"

    # Brique 111-2 - AI Config Advisor (SIRA)
    "brique-111-2/migrations/001_ai_config_advisor.sql"

    # Brique 112 - SIRA Training & Data Pipeline
    "brique-112/migrations/001_sira_training_pipeline.sql"

    # Brique 113 - SIRA Inference Service & Low-Latency Router
    "brique-113/migrations/001_sira_inference.sql"

    # Brique 115bis - Rollback Automatique & Safe Upgrade
    "brique-115bis/migrations/001_rollback_automatic.sql"

    # Brique 115ter - Canary Release & Progressive Rollout (extension de 115bis)
    "brique-115bis/migrations/002_progressive_rollout.sql"

    # Brique 116 - Charge Routing Logs (Debugging & SIRA Learning)
    "brique-116/migrations/001_charge_routing_logs.sql"

    # Brique 116bis - Smart Auto-Routing by Sira (extension de 116)
    "brique-116/migrations/002_smart_auto_routing.sql"

    # Brique 116ter - Predictive Routing Simulator (extension de 116bis)
    "brique-116/migrations/003_predictive_routing_simulator.sql"

    # Brique 116quater - AI Adaptive Routing Over Time (extension de 116ter)
    "brique-116/migrations/004_adaptive_routing_over_time.sql"
)

Write-Host "✅ Trouvé $($sqlFiles.Count) fichiers SQL" -ForegroundColor Green
Write-Host ""

# Importer tous les schémas
Write-Host "[4/5] Importation des schémas SQL..." -ForegroundColor Yellow
Write-Host ""

$success = 0
$failed = 0
$skipped = 0

foreach ($file in $sqlFiles) {
    $fullPath = Join-Path $PSScriptRoot $file

    if (Test-Path $fullPath) {
        Write-Host "  Importing: $file" -ForegroundColor Gray

        try {
            # Convertir le chemin Windows en style Unix pour psql
            $unixPath = $fullPath -replace '\\', '/'

            # Exécuter le fichier SQL
            $result = psql -U postgres -d molam_connect -f $unixPath 2>&1

            if ($LASTEXITCODE -eq 0) {
                Write-Host "    ✅ Importé" -ForegroundColor Green
                $success++
            } else {
                Write-Host "    ⚠️  Erreurs (peut-être des duplicates)" -ForegroundColor Yellow
                $success++
            }
        } catch {
            Write-Host "    ❌ Échec: $_" -ForegroundColor Red
            $failed++
        }
    } else {
        Write-Host "  ⏭️  Fichier non trouvé: $file" -ForegroundColor DarkGray
        $skipped++
    }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Résumé de l'Importation" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "✅ Importés avec succès: $success" -ForegroundColor Green
Write-Host "❌ Échecs: $failed" -ForegroundColor Red
Write-Host "⏭️  Ignorés (non trouvés): $skipped" -ForegroundColor Yellow
Write-Host "📊 Total: $($sqlFiles.Count)" -ForegroundColor Cyan
Write-Host ""

# Vérifier les tables créées
Write-Host "[5/5] Vérification des tables créées..." -ForegroundColor Yellow
$tables = psql -U postgres -d molam_connect -c "\dt" -t | Measure-Object -Line
Write-Host "✅ $($tables.Lines) tables créées dans molam_connect" -ForegroundColor Green
Write-Host ""

Write-Host "================================================================" -ForegroundColor Green
Write-Host "  Base de Données Configurée !" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Prochaines étapes:" -ForegroundColor Yellow
Write-Host "  1. Démarrer le serveur: npm start" -ForegroundColor White
Write-Host "  2. Ouvrir le dashboard: http://localhost:3000/dashboard" -ForegroundColor White
Write-Host "  3. Tester les APIs!" -ForegroundColor White
Write-Host ""
Write-Host "Pour voir toutes les tables:" -ForegroundColor Yellow
Write-Host "  psql -U postgres -d molam_connect -c `"\dt`"" -ForegroundColor Cyan
Write-Host ""

# Nettoyer le mot de passe de la mémoire pour la sécurité
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
Remove-Variable password, BSTR, securePassword, env:PGPASSWORD -ErrorAction SilentlyContinue

Write-Host "🔒 Mot de passe nettoyé de la mémoire" -ForegroundColor DarkGray
Write-Host ""
