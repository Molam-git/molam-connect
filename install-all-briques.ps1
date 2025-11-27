# Script to install dependencies for all React briques
# Usage: powershell -ExecutionPolicy Bypass -File install-all-briques.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Installing Dependencies for All Briques" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# List of briques with React apps
$briques = @(
    @{Name="Brique 149a (Wallet)"; Path="brique-149a-wallet/web"},
    @{Name="Brique 149b (Merchant Dashboard)"; Path="brique-149b-connect/web"},
    @{Name="Brique 109 (Checkout)"; Path="brique-109/web"},
    @{Name="Brique 107 (Offline Payments)"; Path="brique-107/web"},
    @{Name="Brique 1 (Multi-Currency Wallets)"; Path="brique1/web"}
)

$totalBriques = $briques.Count
$currentBrique = 0
$failedBriques = @()

foreach ($brique in $briques) {
    $currentBrique++
    Write-Host "[$currentBrique/$totalBriques] Installing $($brique.Name)..." -ForegroundColor Yellow
    Write-Host "Path: $($brique.Path)" -ForegroundColor Gray

    if (Test-Path $brique.Path) {
        Push-Location $brique.Path

        # Install main dependencies
        Write-Host "  → Running npm install..." -ForegroundColor Cyan
        npm install --legacy-peer-deps

        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Dependencies installed" -ForegroundColor Green

            # Install ajv separately
            Write-Host "  → Installing ajv..." -ForegroundColor Cyan
            npm install ajv --legacy-peer-deps 2>&1 | Out-Null

            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ ajv installed" -ForegroundColor Green
            }
        } else {
            Write-Host "  ✗ Failed to install dependencies" -ForegroundColor Red
            $failedBriques += $brique.Name
        }

        Pop-Location
        Write-Host ""
    } else {
        Write-Host "  ✗ Path not found: $($brique.Path)" -ForegroundColor Red
        $failedBriques += $brique.Name
        Write-Host ""
    }
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Installation Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

if ($failedBriques.Count -eq 0) {
    Write-Host "✓ All $totalBriques briques installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Build all briques: powershell -ExecutionPolicy Bypass -File build-all-briques.ps1" -ForegroundColor White
    Write-Host "  2. Start dev servers: powershell -ExecutionPolicy Bypass -File dev-all-briques.ps1" -ForegroundColor White
    Write-Host "  3. Start production: node server.js" -ForegroundColor White
} else {
    Write-Host "✓ $($totalBriques - $failedBriques.Count)/$totalBriques briques installed successfully" -ForegroundColor Yellow
    Write-Host "✗ Failed briques:" -ForegroundColor Red
    foreach ($failed in $failedBriques) {
        Write-Host "  - $failed" -ForegroundColor Red
    }
}
