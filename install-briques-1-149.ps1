# Script to install npm dependencies for all briques from 1 to 149
# Usage: powershell -ExecutionPolicy Bypass -File install-briques-1-149.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Installing Briques 1-149" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

# Find all brique directories (1-149)
$briqueDirs = @()

# Pattern variations to search for
$patterns = @(
    "brique1",
    "brique-*"
)

# Find all matching directories
foreach ($pattern in $patterns) {
    $dirs = Get-ChildItem -Path . -Directory -Filter $pattern -ErrorAction SilentlyContinue
    $briqueDirs += $dirs
}

# Filter to keep only briques 1-149
$filteredBriques = @()
foreach ($dir in $briqueDirs) {
    $name = $dir.Name
    # Extract number from brique name
    if ($name -match "brique-?(\d+)") {
        $num = [int]$matches[1]
        if ($num -ge 1 -and $num -le 149) {
            $filteredBriques += @{
                Dir = $dir
                Name = $name
                Number = $num
            }
        }
    }
}

# Sort by number
$filteredBriques = $filteredBriques | Sort-Object { $_.Number }

$totalBriques = $filteredBriques.Count
Write-Host "Found $totalBriques briques (1-149)" -ForegroundColor Yellow
Write-Host ""

$installed = @()
$skipped = @()
$failed = @()
$currentBrique = 0

foreach ($briqueInfo in $filteredBriques) {
    $currentBrique++
    $dir = $briqueInfo.Dir
    $name = $briqueInfo.Name
    $num = $briqueInfo.Number

    Write-Host "[$currentBrique/$totalBriques] Brique $num ($name)" -ForegroundColor Yellow

    # Check if package.json exists in root or common subdirectories
    $packageJsonPaths = @(
        (Join-Path $dir.FullName "package.json"),
        (Join-Path $dir.FullName "src\package.json"),
        (Join-Path $dir.FullName "backend\package.json"),
        (Join-Path $dir.FullName "server\package.json")
    )

    $foundPackageJson = $null
    foreach ($path in $packageJsonPaths) {
        if (Test-Path $path) {
            $foundPackageJson = Split-Path $path -Parent
            break
        }
    }

    if ($foundPackageJson) {
        Push-Location $foundPackageJson

        # Check if node_modules already exists
        if (Test-Path "node_modules") {
            Write-Host "  [SKIP] node_modules already exists" -ForegroundColor Green
            $skipped += $name
        } else {
            Write-Host "  Installing dependencies..." -ForegroundColor Cyan

            # Run npm install
            $output = npm install 2>&1 | Out-String

            if ($LASTEXITCODE -eq 0) {
                Write-Host "  [OK] Installed successfully" -ForegroundColor Green
                $installed += $name
            } else {
                Write-Host "  [ERROR] Installation failed" -ForegroundColor Red
                $failed += @{
                    Name = $name
                    Path = $foundPackageJson
                    Error = "npm install failed"
                }
            }
        }

        Pop-Location
    } else {
        Write-Host "  [SKIP] No package.json found" -ForegroundColor DarkGray
        $skipped += $name
    }

    Write-Host ""
}

$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Installation Complete" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  Total briques found: $totalBriques" -ForegroundColor White
Write-Host "  Installed: $($installed.Count)" -ForegroundColor Green
Write-Host "  Skipped: $($skipped.Count)" -ForegroundColor Cyan
Write-Host "  Failed: $($failed.Count)" -ForegroundColor Red
Write-Host "  Duration: $($duration.ToString('mm\:ss'))" -ForegroundColor White
Write-Host ""

if ($installed.Count -gt 0) {
    Write-Host "Installed briques:" -ForegroundColor Green
    foreach ($name in $installed) {
        Write-Host "  - $name" -ForegroundColor White
    }
    Write-Host ""
}

if ($failed.Count -gt 0) {
    Write-Host "Failed briques:" -ForegroundColor Red
    foreach ($fail in $failed) {
        Write-Host "  - $($fail.Name): $($fail.Error)" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "Done!" -ForegroundColor Green
