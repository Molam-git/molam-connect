# Start Molam Connect with Translation Service
Write-Host "`n=== DEMARRAGE MOLAM CONNECT + TRANSLATION ===" -ForegroundColor Cyan

Write-Host "`n[1/2] Demarrage du service Translation (port 4015)..." -ForegroundColor Yellow

# Start Translation backend in background
$translationJob = Start-Job -ScriptBlock {
    Set-Location "C:\Users\lomao\Desktop\Molam\molam-connect\brique-translation\backend"
    npm run dev
}

Write-Host "  OK Service Translation demarre (Job ID: $($translationJob.Id))" -ForegroundColor Green
Write-Host "     URL: http://localhost:4015" -ForegroundColor Gray

# Wait a bit for Translation service to start
Start-Sleep -Seconds 3

Write-Host "`n[2/2] Demarrage du serveur principal (port 3000)..." -ForegroundColor Yellow
Write-Host "  Dashboard: http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Translation API: http://localhost:3000/api/translate" -ForegroundColor Cyan
Write-Host ""
Write-Host "=== SERVEUR DEMARRE ===" -ForegroundColor Green
Write-Host "Appuyez sur Ctrl+C pour arreter" -ForegroundColor Yellow
Write-Host ""

# Start main server (will run in foreground)
npm start

# Cleanup translation job when main server stops
Stop-Job -Job $translationJob
Remove-Job -Job $translationJob
