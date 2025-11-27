# Script to start all backend briques in dev mode (parallel)
# Usage: powershell -ExecutionPolicy Bypass -File dev-all-backend-briques.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Starting All Backend Briques (Dev Mode)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "WARNING: This will start 70+ development servers!" -ForegroundColor Yellow
Write-Host "This is resource-intensive and may slow down your system." -ForegroundColor Yellow
Write-Host ""

$response = Read-Host "Are you sure you want to continue? (yes/no)"
if ($response -ne "yes") {
    Write-Host "Aborted." -ForegroundColor Yellow
    exit 0
}

Write-Host ""

# Find all directories containing server.ts
$serverFiles = Get-ChildItem -Path . -Recurse -Filter "server.ts" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "node_modules" }

$briquePaths = @{}
$basePort = 4000

foreach ($file in $serverFiles) {
    $dir = $file.Directory
    while ($dir -and -not (Test-Path (Join-Path $dir.FullName "package.json"))) {
        $dir = $dir.Parent
        if ($dir.FullName -eq $PSScriptRoot) {
            break
        }
    }

    if ($dir -and (Test-Path (Join-Path $dir.FullName "package.json"))) {
        $relativePath = $dir.FullName.Replace("$PSScriptRoot\", "")
        if (-not $briquePaths.ContainsKey($relativePath)) {
            $briquePaths[$relativePath] = @{
                Name = $dir.Name
                Port = $basePort
            }
            $basePort++
        }
    }
}

$jobs = @()
$currentBrique = 0
$totalBriques = $briquePaths.Count

Write-Host "Found $totalBriques briques to start" -ForegroundColor Yellow
Write-Host ""

foreach ($path in $briquePaths.Keys | Sort-Object) {
    $currentBrique++
    $info = $briquePaths[$path]
    $name = $info.Name
    $port = $info.Port

    Write-Host "[$currentBrique/$totalBriques] Starting $name on port $port..." -ForegroundColor Cyan

    if (Test-Path $path) {
        # Start each dev server in a new PowerShell window
        $scriptBlock = @"
cd '$path'
Write-Host 'Starting $name on port $port...' -ForegroundColor Green
`$env:PORT=$port
npm run dev
"@

        $job = Start-Process powershell -ArgumentList "-NoExit", "-Command", $scriptBlock -PassThru
        $jobs += @{
            Job = $job
            Name = $name
            Port = $port
            Path = $path
        }

        # Wait a bit before starting the next one
        Start-Sleep -Milliseconds 500
    } else {
        Write-Host "  [ERROR] Path not found: $path" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  All Development Servers Started" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Running servers:" -ForegroundColor Yellow
foreach ($job in $jobs) {
    Write-Host "[OK] $($job.Name): http://localhost:$($job.Port)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Total: $($jobs.Count) servers running" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to stop all servers..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host ""
Write-Host "Stopping all servers..." -ForegroundColor Yellow

foreach ($job in $jobs) {
    try {
        Stop-Process -Id $job.Job.Id -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Stopped $($job.Name)" -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Could not stop $($job.Name)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "All servers stopped." -ForegroundColor Green
