# Script to find briques without SQL files
# Usage: powershell -ExecutionPolicy Bypass -File check-briques-sql.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Checking Briques for SQL Files" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Find all brique directories (1-149)
$briqueDirs = Get-ChildItem -Path . -Directory -Filter "brique*" -ErrorAction SilentlyContinue

$briquesWithSql = @()
$briquesWithoutSql = @()

foreach ($dir in $briqueDirs) {
    $name = $dir.Name

    # Extract number from brique name
    if ($name -match "brique-?(\d+)") {
        $num = [int]$matches[1]

        # Only check briques 1-149
        if ($num -ge 1 -and $num -le 149) {
            # Check for .sql files
            $sqlFiles = Get-ChildItem -Path $dir.FullName -Recurse -Filter "*.sql" -ErrorAction SilentlyContinue

            if ($sqlFiles.Count -gt 0) {
                $briquesWithSql += @{
                    Name = $name
                    Number = $num
                    SqlCount = $sqlFiles.Count
                }
            } else {
                $briquesWithoutSql += @{
                    Name = $name
                    Number = $num
                }
            }
        }
    }
}

# Sort by number
$briquesWithSql = $briquesWithSql | Sort-Object { $_.Number }
$briquesWithoutSql = $briquesWithoutSql | Sort-Object { $_.Number }

$totalChecked = $briquesWithSql.Count + $briquesWithoutSql.Count

Write-Host "Total briques checked: $totalChecked" -ForegroundColor Yellow
Write-Host "Briques WITH SQL files: $($briquesWithSql.Count)" -ForegroundColor Green
Write-Host "Briques WITHOUT SQL files: $($briquesWithoutSql.Count)" -ForegroundColor Red
Write-Host ""

if ($briquesWithoutSql.Count -gt 0) {
    Write-Host "============================================" -ForegroundColor Red
    Write-Host "  Briques WITHOUT SQL Files" -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red
    Write-Host ""

    foreach ($brique in $briquesWithoutSql) {
        Write-Host "  - Brique $($brique.Number) ($($brique.Name))" -ForegroundColor Red
    }
    Write-Host ""
}

if ($briquesWithSql.Count -gt 0) {
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  Briques WITH SQL Files" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""

    foreach ($brique in $briquesWithSql) {
        Write-Host "  - Brique $($brique.Number) ($($brique.Name)) - $($brique.SqlCount) file(s)" -ForegroundColor Green
    }
    Write-Host ""
}

Write-Host "Summary saved to: briques-sql-report.txt" -ForegroundColor Cyan

# Save report to file
$report = @"
Briques SQL Files Report
Generated: $(Get-Date)

Total briques checked: $totalChecked
Briques WITH SQL files: $($briquesWithSql.Count)
Briques WITHOUT SQL files: $($briquesWithoutSql.Count)

========================================
Briques WITHOUT SQL Files:
========================================
$($briquesWithoutSql | ForEach-Object { "  - Brique $($_.Number) ($($_.Name))" } | Out-String)

========================================
Briques WITH SQL Files:
========================================
$($briquesWithSql | ForEach-Object { "  - Brique $($_.Number) ($($_.Name)) - $($_.SqlCount) file(s)" } | Out-String)
"@

$report | Out-File -FilePath "briques-sql-report.txt" -Encoding UTF8

Write-Host "Done!" -ForegroundColor Green
