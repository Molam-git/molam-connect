# Script to start a specific brique in dev mode
# Usage: powershell -ExecutionPolicy Bypass -File start-brique.ps1 <brique-name>
# Example: powershell -ExecutionPolicy Bypass -File start-brique.ps1 brique-111

param(
    [Parameter(Mandatory=$true)]
    [string]$BriqueName,

    [Parameter(Mandatory=$false)]
    [int]$Port = 0
)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Starting $BriqueName" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Find the brique directory
$briquePath = $null

# Check common locations
$possiblePaths = @(
    ".\$BriqueName",
    ".\$BriqueName\src",
    ".\$BriqueName\backend"
)

foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        # Look for package.json
        $dir = Get-Item $path
        while ($dir -and -not (Test-Path (Join-Path $dir.FullName "package.json"))) {
            $dir = $dir.Parent
            if ($dir.FullName -eq $PSScriptRoot) {
                break
            }
        }

        if ($dir -and (Test-Path (Join-Path $dir.FullName "package.json"))) {
            $briquePath = $dir.FullName
            break
        }
    }
}

if (-not $briquePath) {
    Write-Host "[ERROR] Brique not found: $BriqueName" -ForegroundColor Red
    Write-Host ""
    Write-Host "Available briques:" -ForegroundColor Yellow

    # List available briques
    $serverFiles = Get-ChildItem -Path . -Recurse -Filter "server.ts" -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch "node_modules" }

    $briques = @{}
    foreach ($file in $serverFiles) {
        $dir = $file.Directory
        while ($dir -and -not (Test-Path (Join-Path $dir.FullName "package.json"))) {
            $dir = $dir.Parent
            if ($dir.FullName -eq $PSScriptRoot) {
                break
            }
        }
        if ($dir) {
            $relativePath = $dir.FullName.Replace("$PSScriptRoot\", "")
            if (-not $briques.ContainsKey($dir.Name)) {
                $briques[$dir.Name] = $relativePath
            }
        }
    }

    foreach ($name in $briques.Keys | Sort-Object) {
        Write-Host "  - $name" -ForegroundColor White
    }

    exit 1
}

Write-Host "Found brique at: $briquePath" -ForegroundColor Green
Write-Host ""

Push-Location $briquePath

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies first..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install dependencies" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Write-Host "[OK] Dependencies installed" -ForegroundColor Green
    Write-Host ""
}

# Set port if specified
if ($Port -gt 0) {
    $env:PORT = $Port
    Write-Host "Starting on port $Port..." -ForegroundColor Cyan
} else {
    Write-Host "Starting (default port)..." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start the dev server
npm run dev

Pop-Location
