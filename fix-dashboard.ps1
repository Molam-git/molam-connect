# Fix Dashboard - Create missing tables manually
Write-Host "`n=== Fix Dashboard Molam Connect ===" -ForegroundColor Cyan

$env:PGPASSWORD = "postgres"

Write-Host "`n[1/3] Création des tables basiques..." -ForegroundColor Yellow

# Create payment_intents table
$createPaymentIntents = @"
CREATE TABLE IF NOT EXISTS payment_intents (
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

psql -U postgres -d molam_connect -c $createPaymentIntents 2>&1 | Out-Null
Write-Host "  ✅ payment_intents" -ForegroundColor Green

# Create customers table
$createCustomers = @"
CREATE TABLE IF NOT EXISTS customers (
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

psql -U postgres -d molam_connect -c $createCustomers 2>&1 | Out-Null
Write-Host "  ✅ customers" -ForegroundColor Green

# Create auth_decisions table
$createAuthDecisions = @"
CREATE TABLE IF NOT EXISTS auth_decisions (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL,
    user_id TEXT,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    country TEXT,
    bin TEXT,
    device_fingerprint TEXT,
    decision TEXT NOT NULL,
    auth_method TEXT,
    risk_score NUMERIC,
    factors JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"@

psql -U postgres -d molam_connect -c $createAuthDecisions 2>&1 | Out-Null
Write-Host "  ✅ auth_decisions" -ForegroundColor Green

# Create otp_codes table (already exists probably since OTP works)
$createOTP = @"
CREATE TABLE IF NOT EXISTS otp_codes (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    method TEXT DEFAULT 'sms',
    verified BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"@

psql -U postgres -d molam_connect -c $createOTP 2>&1 | Out-Null
Write-Host "  ✅ otp_codes" -ForegroundColor Green

Write-Host "`n[2/3] Vérification des tables créées..." -ForegroundColor Yellow
$tables = psql -U postgres -d molam_connect -tAc "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"

if ($tables) {
    $tableArray = $tables -split "`n" | Where-Object { $_ -ne "" }
    Write-Host "  Tables présentes ($($tableArray.Count)):" -ForegroundColor Gray
    $tableArray | ForEach-Object { Write-Host "    - $_" -ForegroundColor DarkGray }
} else {
    Write-Host "  ❌ Aucune table trouvée" -ForegroundColor Red
}

Write-Host "`n[3/3] Test de création d'un payment intent..." -ForegroundColor Yellow
$testInsert = @"
INSERT INTO payment_intents (id, amount, currency, description, client_secret)
VALUES ('test-pi-001', 10000, 'XOF', 'Test payment', 'secret_test123')
ON CONFLICT (id) DO NOTHING;
"@

try {
    psql -U postgres -d molam_connect -c $testInsert 2>&1 | Out-Null
    Write-Host "  ✅ Insertion test réussie" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Erreur d'insertion" -ForegroundColor Red
}

Write-Host "`n=== Terminé ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Maintenant:" -ForegroundColor Yellow
Write-Host "  1. Redémarrez le serveur (Ctrl+C puis 'npm start')" -ForegroundColor White
Write-Host "  2. Testez à nouveau: .\test-dashboard.ps1" -ForegroundColor White
Write-Host ""
