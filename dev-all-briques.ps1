# Script to run all React briques in development mode (parallel)
# Usage: powershell -ExecutionPolicy Bypass -File dev-all-briques.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Starting All React Briques (Dev Mode)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  WARNING: This will start 5 development servers!" -ForegroundColor Yellow
Write-Host "   Each server will use a different port." -ForegroundColor Yellow
Write-Host ""

# List of briques with React apps and their dev ports
$briques = @(
    @{Name="Brique 149a (Wallet)"; Path="brique-149a-wallet/web"; Port=3001},
    @{Name="Brique 149b (Merchant Dashboard)"; Path="brique-149b-connect/web"; Port=3002},
    @{Name="Brique 109 (Checkout)"; Path="brique-109/web"; Port=3003},
    @{Name="Brique 107 (Offline Payments)"; Path="brique-107/web"; Port=3004},
    @{Name="Brique 1 (Multi-Currency Wallets)"; Path="brique1/web"; Port=3005}
)

$jobs = @()

foreach ($brique in $briques) {
    Write-Host "→ Starting $($brique.Name) on port $($brique.Port)..." -ForegroundColor Cyan

    if (Test-Path $brique.Path) {
        # Start each dev server in a new PowerShell window
        $job = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$($brique.Path)'; Write-Host 'Starting $($brique.Name) on port $($brique.Port)...' -ForegroundColor Green; `$env:PORT=$($brique.Port); npm start" -PassThru
        $jobs += @{Job=$job; Name=$brique.Name; Port=$brique.Port}

        # Wait a bit before starting the next one to avoid port conflicts
        Start-Sleep -Seconds 2
    } else {
        Write-Host "  ✗ Path not found: $($brique.Path)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Development Servers Started" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

foreach ($job in $jobs) {
    Write-Host "✓ $($job.Name): http://localhost:$($job.Port)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Press any key to stop all servers..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host ""
Write-Host "Stopping all servers..." -ForegroundColor Yellow

foreach ($job in $jobs) {
    Stop-Process -Id $job.Job.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  ✓ Stopped $($job.Name)" -ForegroundColor Green
}

Write-Host ""
Write-Host "All servers stopped." -ForegroundColor Green
