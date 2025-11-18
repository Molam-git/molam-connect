# 🔧 PostgreSQL - Résolution du problème d'authentification

## Problème

```
psql: error: connection to server at "localhost" (::1), port 5432 failed:
FATAL: password authentication failed for user "postgres"
```

---

## Solution rapide (Windows)

### Option 1: Se connecter sans mot de passe (méthode trust)

1. **Trouver le fichier `pg_hba.conf`**

   Localisation typique:
   ```
   C:\Program Files\PostgreSQL\15\data\pg_hba.conf
   ou
   C:\Program Files\PostgreSQL\14\data\pg_hba.conf
   ```

2. **Ouvrir `pg_hba.conf` en tant qu'Administrateur**

   - Clic droit sur Notepad → "Exécuter en tant qu'administrateur"
   - Ouvrir le fichier `pg_hba.conf`

3. **Trouver ces lignes** (vers la fin du fichier):

   ```
   # IPv4 local connections:
   host    all             all             127.0.0.1/32            scram-sha-256
   # IPv6 local connections:
   host    all             all             ::1/128                 scram-sha-256
   ```

4. **Remplacer `scram-sha-256` par `trust`**:

   ```
   # IPv4 local connections:
   host    all             all             127.0.0.1/32            trust
   # IPv6 local connections:
   host    all             all             ::1/128                 trust
   ```

5. **Redémarrer PostgreSQL**

   Ouvrir PowerShell en tant qu'Administrateur:
   ```powershell
   # Arrêter PostgreSQL
   net stop postgresql-x64-15

   # Démarrer PostgreSQL
   net start postgresql-x64-15
   ```

   Note: Remplacez `15` par votre version (14, 13, etc.)

6. **Se connecter sans mot de passe**

   ```powershell
   psql -U postgres
   ```

   Vous devriez maintenant être connecté !

7. **Créer un nouveau mot de passe**

   Dans psql:
   ```sql
   ALTER USER postgres PASSWORD 'postgres';
   ```

8. **Remettre `scram-sha-256` dans `pg_hba.conf`** (sécurité)

   Répéter les étapes 1-5 mais remettre `scram-sha-256` au lieu de `trust`

---

### Option 2: Script PowerShell automatique

Créez un fichier `reset-postgres-password.ps1`:

```powershell
# Exécuter en tant qu'Administrateur
Write-Host "=== Reset PostgreSQL Password ===" -ForegroundColor Cyan

# Trouver le fichier pg_hba.conf
$pgVersion = "15"  # Changez selon votre version
$pgDataPath = "C:\Program Files\PostgreSQL\$pgVersion\data"
$pgHbaPath = "$pgDataPath\pg_hba.conf"

if (-not (Test-Path $pgHbaPath)) {
    Write-Host "ERROR: pg_hba.conf not found at $pgHbaPath" -ForegroundColor Red
    Write-Host "Please update the script with correct PostgreSQL version and path" -ForegroundColor Yellow
    exit 1
}

# Backup
Copy-Item $pgHbaPath "$pgHbaPath.backup"
Write-Host "Backup created: $pgHbaPath.backup" -ForegroundColor Green

# Modifier pg_hba.conf
$content = Get-Content $pgHbaPath
$newContent = $content -replace "scram-sha-256", "trust"
Set-Content $pgHbaPath $newContent

Write-Host "pg_hba.conf modified (authentication set to trust)" -ForegroundColor Green

# Redémarrer PostgreSQL
Write-Host "Restarting PostgreSQL..." -ForegroundColor Yellow
net stop postgresql-x64-$pgVersion
Start-Sleep -Seconds 2
net start postgresql-x64-$pgVersion

Write-Host ""
Write-Host "=== Now run these commands ===" -ForegroundColor Cyan
Write-Host "psql -U postgres" -ForegroundColor White
Write-Host "ALTER USER postgres PASSWORD 'postgres';" -ForegroundColor White
Write-Host "\q" -ForegroundColor White
Write-Host ""
Write-Host "Then restore pg_hba.conf:" -ForegroundColor Yellow
Write-Host "Copy-Item '$pgHbaPath.backup' '$pgHbaPath' -Force" -ForegroundColor White
Write-Host "net stop postgresql-x64-$pgVersion" -ForegroundColor White
Write-Host "net start postgresql-x64-$pgVersion" -ForegroundColor White
```

Exécuter:
```powershell
# Clic droit PowerShell → Exécuter en tant qu'administrateur
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
.\reset-postgres-password.ps1
```

---

### Option 3: Utiliser pgAdmin (interface graphique)

Si vous avez pgAdmin installé:

1. Ouvrir **pgAdmin**
2. Clic droit sur "PostgreSQL 15" → Properties
3. Tab "Connection"
4. Cocher "Save password"
5. Entrer le mot de passe actuel (si vous le connaissez)

---

### Option 4: Trouver le mot de passe dans l'installeur

Si vous avez installé PostgreSQL récemment:

1. Chercher dans `C:\Program Files\PostgreSQL\15\` un fichier `installation_summary.txt` ou similaire
2. Le mot de passe peut y être noté

---

## Après avoir réinitialisé le mot de passe

### 1. Mettre à jour `.env`

Éditez `c:\Users\lomao\Desktop\Molam\molam-connect\.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/molam_connect
```

Remplacez `postgres:postgres` par `postgres:VOTRE_MOT_DE_PASSE`

### 2. Tester la connexion

```powershell
psql -U postgres
# Entrer le mot de passe quand demandé
```

### 3. Créer la base de données

```powershell
# Se connecter
psql -U postgres

# Dans psql:
CREATE DATABASE molam_connect;
\c molam_connect
\i c:/Users/lomao/Desktop/Molam/molam-connect/database/setup.sql
\q
```

---

## Commandes utiles

```powershell
# Voir les services PostgreSQL
Get-Service *postgres*

# Redémarrer PostgreSQL
net stop postgresql-x64-15
net start postgresql-x64-15

# Se connecter à une base spécifique
psql -U postgres -d molam_connect

# Lister les bases de données
psql -U postgres -l

# Vérifier la version
psql --version
```

---

## Alternative: Utiliser un autre utilisateur

Si vous ne voulez pas utiliser `postgres`, créez un nouvel utilisateur:

```sql
-- En tant que postgres (après connexion)
CREATE USER molam WITH PASSWORD 'molam123';
CREATE DATABASE molam_connect OWNER molam;
GRANT ALL PRIVILEGES ON DATABASE molam_connect TO molam;
```

Puis dans `.env`:
```env
DATABASE_URL=postgresql://molam:molam123@localhost:5432/molam_connect
```

---

## Si rien ne fonctionne: Réinstaller PostgreSQL

1. Désinstaller PostgreSQL (Panneau de configuration → Programmes)
2. Supprimer le dossier `C:\Program Files\PostgreSQL\`
3. Télécharger l'installeur: https://www.postgresql.org/download/windows/
4. Lors de l'installation, **NOTER LE MOT DE PASSE** que vous choisissez pour `postgres`
5. Cocher "Stack Builder" pour installer des outils supplémentaires

---

## Besoin d'aide ?

Si aucune solution ne fonctionne, envoyez-moi:
1. Votre version de PostgreSQL: `psql --version`
2. Le contenu de `pg_hba.conf` (masquez les infos sensibles)
3. Les logs de PostgreSQL (dans `C:\Program Files\PostgreSQL\15\data\log\`)
