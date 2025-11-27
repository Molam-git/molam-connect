# Script to list all available briques with server.ts
# Usage: powershell -ExecutionPolicy Bypass -File list-briques.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Available Backend Briques" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Find all directories containing server.ts
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

    if ($dir -and (Test-Path (Join-Path $dir.FullName "package.json"))) {
        $relativePath = $dir.FullName.Replace("$PSScriptRoot\", "")
        if (-not $briques.ContainsKey($dir.Name)) {
            # Read package.json to get description
            $packageJson = Get-Content (Join-Path $dir.FullName "package.json") | ConvertFrom-Json
            $description = if ($packageJson.description) { $packageJson.description } else { "No description" }

            $briques[$dir.Name] = @{
                Path = $relativePath
                Description = $description
                HasNodeModules = (Test-Path (Join-Path $dir.FullName "node_modules"))
            }
        }
    }
}

Write-Host "Found $($briques.Count) briques with server.ts" -ForegroundColor Yellow
Write-Host ""

# Group briques by category
$categories = @{
    "Core Briques (1-40)" = @()
    "Services (41-70)" = @()
    "Analytics & Business (70+)" = @()
    "Advanced Services (111+)" = @()
    "Other Services" = @()
}

foreach ($name in $briques.Keys | Sort-Object) {
    $info = $briques[$name]

    # Determine category
    if ($name -match "brique-?(\d+)") {
        $num = [int]$matches[1]
        if ($num -le 40) {
            $categories["Core Briques (1-40)"] += @{Name=$name; Info=$info}
        } elseif ($num -le 70) {
            $categories["Services (41-70)"] += @{Name=$name; Info=$info}
        } elseif ($num -ge 111) {
            $categories["Advanced Services (111+)"] += @{Name=$name; Info=$info}
        } else {
            $categories["Analytics & Business (70+)"] += @{Name=$name; Info=$info}
        }
    } else {
        $categories["Other Services"] += @{Name=$name; Info=$info}
    }
}

# Display by category
foreach ($category in $categories.Keys | Sort-Object) {
    $items = $categories[$category]
    if ($items.Count -gt 0) {
        Write-Host $category -ForegroundColor Magenta
        Write-Host ("=" * $category.Length) -ForegroundColor Magenta
        Write-Host ""

        foreach ($item in $items) {
            $name = $item.Name
            $info = $item.Info
            $status = if ($info.HasNodeModules) { "[OK]" } else { "[--]" }
            $statusColor = if ($info.HasNodeModules) { "Green" } else { "Red" }

            Write-Host "  $status " -NoNewline -ForegroundColor $statusColor
            Write-Host "$name" -ForegroundColor White -NoNewline
            Write-Host " - $($info.Description)" -ForegroundColor Gray
            Write-Host "      Path: $($info.Path)" -ForegroundColor DarkGray
            Write-Host ""
        }
    }
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Legend:" -ForegroundColor Yellow
Write-Host "  [OK] - Dependencies installed (ready to run)" -ForegroundColor Green
Write-Host "  [--] - Dependencies not installed (run install script first)" -ForegroundColor Red
Write-Host ""
Write-Host "Commands:" -ForegroundColor Cyan
Write-Host "  Install all: powershell -ExecutionPolicy Bypass -File install-all-backend-briques.ps1" -ForegroundColor White
Write-Host "  Start one:   powershell -ExecutionPolicy Bypass -File start-brique.ps1 <brique-name>" -ForegroundColor White
Write-Host "  Start all:   powershell -ExecutionPolicy Bypass -File dev-all-backend-briques.ps1" -ForegroundColor White
