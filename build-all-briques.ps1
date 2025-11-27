# Script to build all React briques
# Usage: powershell -ExecutionPolicy Bypass -File build-all-briques.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Building All React Briques" -ForegroundColor Cyan
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
    Write-Host "[$currentBrique/$totalBriques] Processing $($brique.Name)..." -ForegroundColor Yellow
    Write-Host "Path: $($brique.Path)" -ForegroundColor Gray

    if (Test-Path $brique.Path) {
        Push-Location $brique.Path

        # Check if node_modules exists
        if (Test-Path "node_modules") {
            Write-Host "  ✓ node_modules already exists, skipping npm install" -ForegroundColor Green
        } else {
            Write-Host "  → Installing dependencies..." -ForegroundColor Cyan
            npm install --legacy-peer-deps 2>&1 | Out-Null

            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ Dependencies installed" -ForegroundColor Green
            } else {
                Write-Host "  ✗ Failed to install dependencies" -ForegroundColor Red
                $failedBriques += $brique.Name
                Pop-Location
                continue
            }
        }

        # Install ajv if needed
        if (-not (Test-Path "node_modules/ajv")) {
            Write-Host "  → Installing ajv..." -ForegroundColor Cyan
            npm install ajv --legacy-peer-deps 2>&1 | Out-Null
        }

        # Build the app
        Write-Host "  → Building production bundle..." -ForegroundColor Cyan
        npm run build

        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Build completed successfully" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Build failed" -ForegroundColor Red
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
Write-Host "  Build Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

if ($failedBriques.Count -eq 0) {
    Write-Host "✓ All $totalBriques briques built successfully!" -ForegroundColor Green
} else {
    Write-Host "✓ $($totalBriques - $failedBriques.Count)/$totalBriques briques built successfully" -ForegroundColor Yellow
    Write-Host "✗ Failed briques:" -ForegroundColor Red
    foreach ($failed in $failedBriques) {
        Write-Host "  - $failed" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "To start the server, run: node server.js" -ForegroundColor Cyan
