# Test Dashboard Molam Connect
Write-Host "`n=== Test Dashboard Molam Connect ===" -ForegroundColor Cyan

# Test 1: Check if server is running
Write-Host "`n[1/5] Vérification du serveur..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get -TimeoutSec 5
    if ($health.status -eq "healthy") {
        Write-Host "  ✅ Serveur en ligne" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Serveur répond mais avec des problèmes" -ForegroundColor Yellow
        Write-Host "  Response: $($health | ConvertTo-Json)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ❌ Serveur inaccessible" -ForegroundColor Red
    Write-Host "  Démarrez le serveur avec: npm start" -ForegroundColor Yellow
    exit 1
}

# Test 2: Test Payment Intent API
Write-Host "`n[2/5] Test Payment Intent API..." -ForegroundColor Yellow
try {
    $body = @{
        amount = 10000
        currency = "XOF"
        description = "Test API"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/payment_intents" `
        -Method Post `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 5

    Write-Host "  ✅ Payment Intent créé: $($response.id)" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Erreur Payment Intent" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Gray
}

# Test 3: Test Auth Decision API
Write-Host "`n[3/5] Test Auth Decision API..." -ForegroundColor Yellow
try {
    $body = @{
        payment_id = "test-123"
        amount = 50000
        currency = "XOF"
        country = "SN"
        bin = "424242"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/decide" `
        -Method Post `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 5

    Write-Host "  ✅ Auth Decision: $($response.decision)" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Erreur Auth Decision" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Gray
}

# Test 4: Test OTP API
Write-Host "`n[4/5] Test OTP API..." -ForegroundColor Yellow
try {
    $body = @{
        phone = "+221771234567"
        method = "sms"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/otp/create" `
        -Method Post `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 5

    Write-Host "  ✅ OTP créé: $($response.id)" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Erreur OTP" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Gray
}

# Test 5: Test Customer API
Write-Host "`n[5/5] Test Customer API..." -ForegroundColor Yellow
try {
    $body = @{
        email = "test@example.com"
        name = "Test User"
        country = "SN"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/customers" `
        -Method Post `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 5

    Write-Host "  ✅ Customer créé: $($response.id)" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Erreur Customer" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Gray
}

# Summary
Write-Host "`n=== Résumé ===" -ForegroundColor Cyan
Write-Host "Dashboard disponible sur: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Si vous voyez des erreurs ❌ :" -ForegroundColor Yellow
Write-Host "  1. Vérifiez que PostgreSQL et Redis tournent" -ForegroundColor White
Write-Host "  2. Vérifiez les logs du serveur pour plus de détails" -ForegroundColor White
Write-Host "  3. Vérifiez que la DB molam_connect existe" -ForegroundColor White
Write-Host ""