# Find all SQL files in briques 1-40
Write-Host "`n=== Recherche des fichiers SQL dans briques 1-40 ===" -ForegroundColor Cyan

$sqlFiles = @()

# Briques 1-40
for ($i = 1; $i -le 40; $i++) {
    $brique = "brique$i"
    $path = "c:\Users\lomao\Desktop\Molam\molam-connect\$brique"

    if (Test-Path $path) {
        $files = Get-ChildItem -Path $path -Recurse -Filter "*.sql" -ErrorAction SilentlyContinue

        if ($files) {
            Write-Host "`n[$brique] Trouvé $($files.Count) fichier(s) SQL:" -ForegroundColor Yellow

            foreach ($file in $files) {
                $relativePath = $file.FullName.Replace("c:\Users\lomao\Desktop\Molam\molam-connect\", "")
                Write-Host "  - $relativePath" -ForegroundColor Gray
                $sqlFiles += $file.FullName
            }
        }
    }
}

# Briques spéciales (20-verse, 33-db)
$specialBriques = @("brique20-verse", "brique33-db")
foreach ($brique in $specialBriques) {
    $path = "c:\Users\lomao\Desktop\Molam\molam-connect\$brique"

    if (Test-Path $path) {
        $files = Get-ChildItem -Path $path -Recurse -Filter "*.sql" -ErrorAction SilentlyContinue

        if ($files) {
            Write-Host "`n[$brique] Trouvé $($files.Count) fichier(s) SQL:" -ForegroundColor Yellow

            foreach ($file in $files) {
                $relativePath = $file.FullName.Replace("c:\Users\lomao\Desktop\Molam\molam-connect\", "")
                Write-Host "  - $relativePath" -ForegroundColor Gray
                $sqlFiles += $file.FullName
            }
        }
    }
}

Write-Host "`n=== Résumé ===" -ForegroundColor Cyan
Write-Host "Total fichiers SQL trouvés: $($sqlFiles.Count)" -ForegroundColor Green

# Export to file for setup-all-schemas
$sqlFiles | Out-File -FilePath "sql-files-list.txt" -Encoding UTF8
Write-Host "`nListe exportée dans: sql-files-list.txt" -ForegroundColor White
