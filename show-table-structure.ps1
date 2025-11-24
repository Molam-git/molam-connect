# Show exact table structures
Write-Host "`n=== Structure des Tables ===" -ForegroundColor Cyan

$env:PGPASSWORD = "postgres"

Write-Host "`n[1/3] Structure payment_intents:" -ForegroundColor Yellow
psql -U postgres -d molam_connect -c "\d payment_intents"

Write-Host "`n[2/3] Structure auth_decisions:" -ForegroundColor Yellow
psql -U postgres -d molam_connect -c "\d auth_decisions"

Write-Host "`n[3/3] Structure customers:" -ForegroundColor Yellow
psql -U postgres -d molam_connect -c "\d customers"
