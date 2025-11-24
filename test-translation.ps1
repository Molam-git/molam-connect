# Test Brique Translation Integration
Write-Host "`n=== TEST BRIQUE TRANSLATION ===" -ForegroundColor Cyan

$env:PGPASSWORD = "postgres"

Write-Host "`n[1/4] Verification de la base de donnees..." -ForegroundColor Yellow

$tables = @("translation_cache", "translation_overrides", "translation_feedback", "translation_audit")

foreach ($table in $tables) {
    $exists = psql -U postgres -d molam_connect -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table');"

    if ($exists -eq "t") {
        $count = psql -U postgres -d molam_connect -tAc "SELECT COUNT(*) FROM $table;"
        Write-Host "  OK $table ($count lignes)" -ForegroundColor Green
    } else {
        Write-Host "  ERREUR $table manquante !" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n[2/4] Test des traductions FR pre-chargees..." -ForegroundColor Yellow

$frTranslations = psql -U postgres -d molam_connect -tAc "SELECT source_text, override_text FROM translation_overrides WHERE target_lang = 'fr';"

if ($frTranslations) {
    Write-Host "  OK Traductions FR trouvees:" -ForegroundColor Green
    $lines = $frTranslations -split "`n"
    foreach ($line in $lines) {
        if ($line.Trim()) {
            $parts = $line -split "\|"
            if ($parts.Length -eq 2) {
                Write-Host "     $($parts[0].Trim()) -> $($parts[1].Trim())" -ForegroundColor Gray
            }
        }
    }
} else {
    Write-Host "  AVERTISSEMENT Aucune traduction FR trouvee" -ForegroundColor Yellow
}

Write-Host "`n[3/4] Test API Translation (si service demarre)..." -ForegroundColor Yellow

try {
    $testBody = @{
        text = "Welcome to Molam"
        sourceLang = "en"
        targetLang = "fr"
        namespace = "default"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/translate" `
        -Method POST `
        -Headers @{"Content-Type"="application/json"} `
        -Body $testBody `
        -TimeoutSec 5 `
        -ErrorAction Stop

    if ($response.text) {
        Write-Host "  OK API Translation repond" -ForegroundColor Green
        Write-Host "     Texte original: Welcome to Molam" -ForegroundColor Gray
        Write-Host "     Traduction FR: $($response.text)" -ForegroundColor Gray
    } else {
        Write-Host "  AVERTISSEMENT Reponse vide" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  AVERTISSEMENT API Translation non accessible (serveur eteint?)" -ForegroundColor Yellow
    Write-Host "     Demarrez avec: .\start-with-translation.ps1" -ForegroundColor Gray
}

Write-Host "`n[4/4] Verification fichiers dashboard..." -ForegroundColor Yellow

$files = @{
    "public\translate.js" = "Helper de traduction JS"
    "public\index.html" = "Dashboard principal (avec selecteur langue)"
    "brique-translation\backend\.env" = "Config service Translation"
}

foreach ($file in $files.Keys) {
    if (Test-Path $file) {
        Write-Host "  OK $($files[$file])" -ForegroundColor Green
    } else {
        Write-Host "  ERREUR $file manquant" -ForegroundColor Red
    }
}

Write-Host "`n=== RESULTAT ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Prochaines etapes:" -ForegroundColor Yellow
Write-Host "  1. Demarrer les services:" -ForegroundColor White
Write-Host "     .\start-with-translation.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Ouvrir le dashboard:" -ForegroundColor White
Write-Host "     http://localhost:3000" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Tester le selecteur de langue en haut a droite" -ForegroundColor White
Write-Host "     Passer de English a Francais" -ForegroundColor Gray
Write-Host ""
Write-Host "Langues supportees:" -ForegroundColor Cyan
Write-Host "  - Francais (FR)" -ForegroundColor Gray
Write-Host "  - English (EN)" -ForegroundColor Gray
Write-Host "  - Wolof (WO)" -ForegroundColor Gray
Write-Host "  - Arabe (AR)" -ForegroundColor Gray
Write-Host "  - Espagnol (ES)" -ForegroundColor Gray
Write-Host "  - Portugais (PT)" -ForegroundColor Gray
Write-Host ""
