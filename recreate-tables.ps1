# Recreate tables with correct structure
Write-Host "`n=== Recréation des Tables ===" -ForegroundColor Cyan

$env:PGPASSWORD = "postgres"

Write-Host "`n[1/3] Recréation de payment_intents..." -ForegroundColor Yellow
$recreatePaymentIntents = @"
DROP TABLE IF EXISTS payment_intents CASCADE;

CREATE TABLE payment_intents (
    id TEXT PRIMARY KEY,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    customer_id TEXT,
    description TEXT,
    client_secret TEXT,
    payment_method TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
"@

psql -U postgres -d molam_connect -c $recreatePaymentIntents
Write-Host "  ✅ payment_intents recréée" -ForegroundColor Green

Write-Host "`n[2/3] Recréation de auth_decisions..." -ForegroundColor Yellow
$recreateAuthDecisions = @"
DROP TABLE IF EXISTS auth_decisions CASCADE;

CREATE TABLE auth_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id TEXT NOT NULL,
    user_id TEXT,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    country TEXT,
    bin TEXT,
    device_fingerprint TEXT,
    device_ip TEXT,
    decision TEXT NOT NULL,
    auth_method TEXT,
    recommended_method TEXT,
    final_method TEXT,
    risk_score NUMERIC,
    factors JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"@

psql -U postgres -d molam_connect -c $recreateAuthDecisions
Write-Host "  ✅ auth_decisions recréée" -ForegroundColor Green

Write-Host "`n[3/3] Recréation de customers..." -ForegroundColor Yellow
$recreateCustomers = @"
DROP TABLE IF EXISTS customers CASCADE;

CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT,
    country TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
"@

psql -U postgres -d molam_connect -c $recreateCustomers
Write-Host "  ✅ customers recréée" -ForegroundColor Green

Write-Host "`n=== Terminé ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tables recréées avec la bonne structure !" -ForegroundColor Green
Write-Host ""
Write-Host "Maintenant:" -ForegroundColor Yellow
Write-Host "  1. Redémarrez le serveur (Ctrl+C puis 'npm start')" -ForegroundColor White
Write-Host "  2. Testez: .\test-dashboard.ps1" -ForegroundColor White
Write-Host ""
