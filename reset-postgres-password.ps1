# =====================================================================
# Script de Réinitialisation du Mot de Passe PostgreSQL
# =====================================================================
# Ce script permet de réinitialiser le mot de passe de l'utilisateur postgres
# Date: 2025-11-12
# =====================================================================

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Réinitialisation Mot de Passe PostgreSQL" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si PostgreSQL est en cours d'exécution
$service = Get-Service -Name "postgresql-x64-18" -ErrorAction SilentlyContinue

if ($service -eq $null) {
    Write-Host "❌ Service PostgreSQL non trouvé" -ForegroundColor Red
    Write-Host "Vérifiez le nom du service avec: Get-Service postgresql*" -ForegroundColor Yellow
    exit 1
}

if ($service.Status -ne "Running") {
    Write-Host "❌ PostgreSQL n'est pas en cours d'exécution" -ForegroundColor Red
    Write-Host "Démarrez le service avec: Start-Service $($service.Name)" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ PostgreSQL est en cours d'exécution" -ForegroundColor Green
Write-Host ""

# Demander le nouveau mot de passe
Write-Host "Entrez le nouveau mot de passe pour l'utilisateur 'postgres':" -ForegroundColor Yellow
$newPassword1 = Read-Host "Nouveau mot de passe" -AsSecureString
$newPassword2 = Read-Host "Confirmer le mot de passe" -AsSecureString

# Convertir en texte pour comparer
$BSTR1 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($newPassword1)
$pass1 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR1)
$BSTR2 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($newPassword2)
$pass2 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR2)

if ($pass1 -ne $pass2) {
    Write-Host ""
    Write-Host "❌ Les mots de passe ne correspondent pas" -ForegroundColor Red
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR1)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR2)
    exit 1
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Méthode 1: Configuration Trust (Temporaire)" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Cette méthode nécessite de modifier pg_hba.conf temporairement." -ForegroundColor Yellow
Write-Host ""

# Trouver pg_hba.conf
Write-Host "1. Localisation de pg_hba.conf..." -ForegroundColor Cyan

$pgHbaPath = "C:\Program Files\PostgreSQL\18\data\pg_hba.conf"

if (-not (Test-Path $pgHbaPath)) {
    Write-Host "   Fichier pg_hba.conf non trouvé à l'emplacement par défaut" -ForegroundColor Yellow
    Write-Host "   Essayez de le trouver avec:" -ForegroundColor Yellow
    Write-Host '   psql -U postgres -c "SHOW hba_file;"' -ForegroundColor Gray
    Write-Host ""
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Instructions Manuelles" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Suivez ces étapes:" -ForegroundColor Yellow
Write-Host ""

Write-Host "1. Ouvrez ce fichier en tant qu'Administrateur:" -ForegroundColor White
Write-Host "   $pgHbaPath" -ForegroundColor Cyan
Write-Host ""

Write-Host "2. Trouvez cette ligne:" -ForegroundColor White
Write-Host '   host    all             all             127.0.0.1/32            scram-sha-256' -ForegroundColor Gray
Write-Host ""

Write-Host "3. Changez-la temporairement en:" -ForegroundColor White
Write-Host '   host    all             all             127.0.0.1/32            trust' -ForegroundColor Green
Write-Host ""

Write-Host "4. Aussi cette ligne:" -ForegroundColor White
Write-Host '   local   all             all                                     scram-sha-256' -ForegroundColor Gray
Write-Host ""

Write-Host "5. Changez-la en:" -ForegroundColor White
Write-Host '   local   all             all                                     trust' -ForegroundColor Green
Write-Host ""

Write-Host "6. Redémarrez PostgreSQL:" -ForegroundColor White
Write-Host "   Restart-Service postgresql-x64-18" -ForegroundColor Cyan
Write-Host ""

Write-Host "7. Connectez-vous sans mot de passe et changez-le:" -ForegroundColor White
Write-Host '   psql -U postgres' -ForegroundColor Cyan
Write-Host '   ALTER USER postgres WITH PASSWORD ' -NoNewline -ForegroundColor Cyan
Write-Host "'$pass1'" -ForegroundColor Green -NoNewline
Write-Host ';' -ForegroundColor Cyan
Write-Host '   \q' -ForegroundColor Cyan
Write-Host ""

Write-Host "8. Remettez pg_hba.conf comme avant (scram-sha-256)" -ForegroundColor White
Write-Host ""

Write-Host "9. Redémarrez PostgreSQL à nouveau:" -ForegroundColor White
Write-Host "   Restart-Service postgresql-x64-18" -ForegroundColor Cyan
Write-Host ""

Write-Host "================================================================" -ForegroundColor Green
Write-Host "  Alternative: Utilisation de pgAdmin" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""

Write-Host "Si vous avez pgAdmin installé:" -ForegroundColor Yellow
Write-Host "1. Ouvrez pgAdmin" -ForegroundColor White
Write-Host "2. Clic droit sur le serveur PostgreSQL > Properties" -ForegroundColor White
Write-Host "3. Onglet Connection > Modifier le mot de passe" -ForegroundColor White
Write-Host ""

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Votre Nouveau Mot de Passe" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Une fois changé, définissez-le dans l'environnement:" -ForegroundColor Yellow
Write-Host ""
Write-Host '  $env:PGPASSWORD = ' -NoNewline -ForegroundColor White
Write-Host "'$pass1'" -ForegroundColor Green
Write-Host ""

Write-Host "Puis exécutez le test:" -ForegroundColor Yellow
Write-Host "  .\test-all-briques.ps1" -ForegroundColor Cyan
Write-Host ""

# Nettoyer les mots de passe de la mémoire
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR1)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR2)
Remove-Variable pass1, pass2

Write-Host "================================================================" -ForegroundColor Green
Write-Host "  Script Terminé" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
