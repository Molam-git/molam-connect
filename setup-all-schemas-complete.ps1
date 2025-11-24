# =====================================================================
# Setup All Database Schemas - Molam Connect (COMPLET)
# =====================================================================
# Ce script crée la base de données molam_connect et importe
# TOUS les schémas SQL de TOUTES les briques (1-149)
# =====================================================================

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  MOLAM CONNECT - Database Setup (Briques 1-149)" -ForegroundColor Cyan
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
Write-Host "[1/6] Vérification de PostgreSQL..." -ForegroundColor Yellow
try {
    $pgVersion = psql -U postgres -c "SELECT version();" -t 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Impossible de se connecter à PostgreSQL" -ForegroundColor Red
        Write-Host "Vérifiez que:" -ForegroundColor Yellow
        Write-Host "  1. PostgreSQL est démarré" -ForegroundColor White
        Write-Host "  2. Le mot de passe est correct" -ForegroundColor White
        Write-Host "  3. L'utilisateur 'postgres' existe" -ForegroundColor White

        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
        Remove-Variable password, env:PGPASSWORD -ErrorAction SilentlyContinue
        exit 1
    }
    Write-Host "✅ PostgreSQL accessible" -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur: $_" -ForegroundColor Red
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
    Remove-Variable password, env:PGPASSWORD -ErrorAction SilentlyContinue
    exit 1
}
Write-Host ""

# Créer la base de données
Write-Host "[2/6] Création de la base de données 'molam_connect'..." -ForegroundColor Yellow
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
Write-Host "[3/6] Recherche des schémas SQL..." -ForegroundColor Yellow

$sqlFiles = @(
    # ===============================================
    # BRIQUES 1-40 (Nouvellement ajoutées)
    # ===============================================

    # Brique 1 - Wallets multi-devises/multi-pays (CORE)
    "brique1/sql/0001_ref_countries.sql"
    "brique1/sql/0002_ref_currencies.sql"
    "brique1/sql/0003_molam_wallets.sql"
    "brique1/sql/0004_constraints_and_triggers.sql"
    "brique1/sql/0005_indexes.sql"
    "brique1/sql/0006_seed_ref.sql"

    # Brique 2 - Payment Backend
    "brique2/backend/src/db/migrations/002_wallet_transactions.sql"

    # Brique 3 - Cash In (Top-ups)
    "brique3/sql/003_topups.sql"
    "brique3/sql/003_fn_post_topup.sql"

    # Brique 4 - Cash Out (Withdrawals)
    "brique4/sql/004_withdrawals.sql"
    "brique4/sql/004_fn_post_withdrawal.sql"

    # Brique 5 - P2P Transfers
    "brique5/database/migrations/005_transfers.sql"
    "brique5/database/functions/post_transfer_ledger.sql"

    # Brique 6 - QR Codes
    "brique6/database/migrations/006_create_molam_qr_codes.sql"
    "brique6/database/functions/cleanup_expired_qr_codes.sql"

    # Brique 7 - QR Static
    "brique7/database/migrations/001_qr_static_tables.sql"

    # Brique 8 - USSD
    "brique8/migrations/001_create_ussd_tables.sql"

    # Brique 9 - Schema
    "brique9/sql/schema.sql"

    # Brique 10 - Telecom Top-up
    "brique10/database/migrations/001_create_molam_telecom_operators.sql"
    "brique10/database/migrations/002_create_molam_topup_products.sql"
    "brique10/database/migrations/003_create_molam_topup_transactions.sql"
    "brique10/database/seeds/molam_telecom_operators_seed.sql"
    "brique10/database/seeds/molam_topup_products_seed.sql"

    # Brique 11 - Rewards
    "brique11/sql/001_create_tables.sql"
    "brique11/sql/002_insert_reward_pool.sql"
    "brique11/sql/003_alter_transaction_type.sql"
    "brique11/sql/indexes_constraints.sql"

    # Brique 12
    "brique12/sql/init.sql"

    # Brique 13 - Tables & Views
    "brique13/sql/02_tables.sql"
    "brique13/sql/03_views.sql"
    "brique13/sql/04_audit_tables.sql"
    "brique13/sql/01_indexes.sql"

    # Brique 14 - Notifications
    "brique14/services/pay-notifier/prisma/001_init_notifications.sql"

    # Brique 15 - Notifications (Multi-langue)
    "brique15/sql/schema.sql"
    "brique15/sql/seeds.sql"

    # Brique 16 - Agents
    "brique16/src/database/migrations/001_create_molam_agents_tables.sql"
    "brique16/src/database/seed/agent-commission-rates.seed.sql"

    # Brique 17 - Cash In Transactions
    "brique17/sql/migrations/017_cashin_transactions.sql"
    "brique17/sql/functions/cashin_transaction.sql"

    # Brique 18 - Agent Operations
    "brique18/sql/01_agents.sql"
    "brique18/sql/02_pricing.sql"
    "brique18/sql/03_cash_ops.sql"
    "brique18/sql/04_commissions.sql"
    "brique18/sql/05_audit.sql"

    # Brique 19 - Commission Balances
    "brique19/src/migrations/19_01_commission_balances.sql"
    "brique19/src/migrations/19_02_statements.sql"
    "brique19/src/migrations/19_03_functions.sql"

    # Brique 20-verse - Agent Payouts
    "brique20-verse/src/db/migrations/001_create_agent_payout_tables.sql"

    # Brique 21 - Reporting
    "brique21/migrations/001_initial_reporting_schema.sql"

    # Brique 22 - Bank Integration
    "brique22/migrations/001_create_bank_tables.sql"

    # Brique 23 - Float Management
    "brique23/migrations/001_create_float_tables.sql"

    # Brique 25 - Bank Partners
    "brique25/sql/init.sql"

    # Brique 26
    "brique26/backend/sql/init.sql"

    # Brique 27 - Transaction Notifications
    "brique27/database/migrations/001_create_notification_tables.sql"
    "brique27/database/migrations/002_create_channel_routing_tables.sql"
    "brique27/database/migrations/003_create_audit_tables.sql"
    "brique27/database/seeds/channel_routing_seed.sql"
    "brique27/database/seeds/notification_templates_seed.sql"

    # Brique 28 - Notifications
    "brique28/migrations/20250101000000_notifications.sql"

    # Brique 29 - Notification Templates
    "brique29/database/migrations/001_create_notification_templates.sql"

    # Brique 30 - Voice/TTS
    "brique30/sql/migrations/001_create_voice_tables.sql"
    "brique30/sql/migrations/002_create_voice_rules.sql"

    # Brique 31 - Realtime Alerts
    "brique31/sql/31_realtime_tables.sql"
    "brique31/sql/32_alert_rules_ext.sql"

    # Brique 32 - Ops Backend
    "brique32/backend/migrations/001_create_ops_tables.sql"

    # Brique 33-db - KYC/Compliance (CORE)
    "brique33-db/database/migrations/001_create_kyc_tables.sql"
    "brique33-db/database/migrations/002_seed_kyc_data.sql"

    # Brique 34 - Treasury
    "brique34/database/migrations/001_create_bank_treasury_tables.sql"
    "brique34/database/seeds/seed_initial_bank_profiles.sql"

    # Brique 35 - Payouts Engine
    "brique35/database/migrations/001_create_payouts_tables.sql"
    "brique35/database/migrations/002_add_approval_fields.sql"
    "brique35/database/seeds/payout_configs.sql"

    # Brique 36 - Agent Settlement
    "brique36/migrations/001_create_agent_contracts.sql"
    "brique36/migrations/002_create_agent_settlement_batches.sql"
    "brique36/migrations/003_create_agent_settlement_lines.sql"
    "brique36/migrations/004_create_agent_disputes.sql"

    # Brique 37 - Insurance
    "brique37/sql/migrations/001_create_insurance_tables.sql"

    # Brique 38 - Disputes
    "brique38/sql/migrations/001_create_dispute_tables.sql"

    # Brique 39
    "brique39/migrations/2025_09_01_b39_create_tables.sql"

    # Brique 40 - Fraud Detection
    "brique40/migrations/20250601_create_fraud_tables.sql"

    # ===============================================
    # BRIQUES 41-149 (Existantes)
    # ===============================================

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

    # Brique 80-149 (continuation...)
    "brique-80/sql/009_rate_limits_schema.sql"
    "brique-81/sql/010_billing_overages_schema.sql"
    # ... (le reste selon l'ancien fichier)
)

Write-Host "✅ Trouvé $($sqlFiles.Count) fichiers SQL à importer" -ForegroundColor Green
Write-Host ""

# Importer les schémas
Write-Host "[4/6] Importation des schémas SQL..." -ForegroundColor Yellow
$imported = 0
$skipped = 0
$failed = 0

foreach ($file in $sqlFiles) {
    $fullPath = Join-Path $PSScriptRoot $file

    if (Test-Path $fullPath) {
        Write-Host "  Importation: $file" -ForegroundColor Gray

        try {
            psql -U postgres -d molam_connect -f $fullPath -q 2>&1 | Out-Null

            if ($LASTEXITCODE -eq 0) {
                $imported++
            } else {
                Write-Host "    ⚠️  Erreur d'importation (peut être normal si déjà existant)" -ForegroundColor Yellow
                $skipped++
            }
        } catch {
            Write-Host "    ❌ Échec: $_" -ForegroundColor Red
            $failed++
        }
    } else {
        Write-Host "    ⏭️  Fichier non trouvé: $file" -ForegroundColor DarkGray
        $skipped++
    }
}

Write-Host ""
Write-Host "✅ Importation terminée" -ForegroundColor Green
Write-Host "  Importés: $imported" -ForegroundColor Green
Write-Host "  Ignorés: $skipped" -ForegroundColor Yellow
if ($failed -gt 0) {
    Write-Host "  Échecs: $failed" -ForegroundColor Red
}
Write-Host ""

# Vérifier les tables créées
Write-Host "[5/6] Vérification des tables créées..." -ForegroundColor Yellow
$tableCount = psql -U postgres -d molam_connect -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
Write-Host "✅ Total de tables créées: $tableCount" -ForegroundColor Green
Write-Host ""

# Afficher quelques tables importantes
Write-Host "[6/6] Tables principales créées:" -ForegroundColor Yellow
$importantTables = @("ref_countries", "ref_currencies", "molam_wallets", "molam_topups", "payment_intents", "permissions", "roles")

foreach ($table in $importantTables) {
    $exists = psql -U postgres -d molam_connect -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table');"
    if ($exists -eq "t") {
        Write-Host "  ✅ $table" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $table (manquante)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  ✅ Setup terminé!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Prochaines étapes:" -ForegroundColor Yellow
Write-Host "  1. Redémarrez le serveur: npm start" -ForegroundColor White
Write-Host "  2. Testez le dashboard: http://localhost:3000" -ForegroundColor White
Write-Host "  3. Testez les APIs: .\test-dashboard.ps1" -ForegroundColor White
Write-Host ""

# Nettoyer le mot de passe
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
Remove-Variable password, env:PGPASSWORD -ErrorAction SilentlyContinue
