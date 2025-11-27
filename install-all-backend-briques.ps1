# Script to install dependencies for all backend briques with server.ts
# Usage: powershell -ExecutionPolicy Bypass -File install-all-backend-briques.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Installing All Backend Briques" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Find all directories containing server.ts
$serverFiles = Get-ChildItem -Path . -Recurse -Filter "server.ts" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "node_modules" }

$briquePaths = @{}

foreach ($file in $serverFiles) {
    # Find the nearest package.json directory
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
            $briquePaths[$relativePath] = $dir.Name
        }
    }
}

$totalBriques = $briquePaths.Count
$currentBrique = 0
$failedBriques = @()
$successBriques = @()

Write-Host "Found $totalBriques briques with server.ts" -ForegroundColor Yellow
Write-Host ""

foreach ($path in $briquePaths.Keys | Sort-Object) {
    $currentBrique++
    $name = $briquePaths[$path]

    Write-Host "[$currentBrique/$totalBriques] Installing $name..." -ForegroundColor Yellow
    Write-Host "Path: $path" -ForegroundColor Gray

    if (Test-Path $path) {
        Push-Location $path

        # Check if package.json exists
        if (Test-Path "package.json") {
            # Check if node_modules exists
            if (Test-Path "node_modules") {
                Write-Host "  [OK] node_modules already exists, skipping" -ForegroundColor Green
                $successBriques += $name
            } else {
                Write-Host "  Running npm install..." -ForegroundColor Cyan
                $output = npm install 2>&1 | Out-String

                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  [OK] Dependencies installed" -ForegroundColor Green
                    $successBriques += $name
                } else {
                    Write-Host "  [ERROR] Failed to install dependencies" -ForegroundColor Red
                    $failedBriques += @{Name=$name; Path=$path; Error="npm install failed"}
                }
            }
        } else {
            Write-Host "  [SKIP] No package.json found" -ForegroundColor Yellow
        }

        Pop-Location
        Write-Host ""
    } else {
        Write-Host "  [ERROR] Path not found" -ForegroundColor Red
        $failedBriques += @{Name=$name; Path=$path; Error="Path not found"}
        Write-Host ""
    }
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Installation Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

Write-Host "[SUCCESS] $($successBriques.Count)/$totalBriques briques" -ForegroundColor Green

if ($failedBriques.Count -gt 0) {
    Write-Host "[FAILED] $($failedBriques.Count) briques" -ForegroundColor Red
    Write-Host ""
    Write-Host "Failed briques:" -ForegroundColor Red
    foreach ($failed in $failedBriques) {
        Write-Host "  - $($failed.Name) ($($failed.Path)): $($failed.Error)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start individual briques: powershell -ExecutionPolicy Bypass -File start-brique.ps1 <brique-name>" -ForegroundColor White
Write-Host "  2. Start all briques: powershell -ExecutionPolicy Bypass -File dev-all-backend-briques.ps1" -ForegroundColor White
