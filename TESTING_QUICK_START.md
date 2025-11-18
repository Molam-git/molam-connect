# Guide Rapide - Tester TOUTES les Briques (41-79)

**Date**: 2025-11-12
**Temps estimé**: 5-10 minutes

---

## 🚀 Démarrage Ultra-Rapide (1 commande)

### Windows (PowerShell)

```powershell
# Ouvrir PowerShell dans le dossier du projet
cd C:\Users\lomao\Desktop\Molam\molam-connect

# Exécuter le test complet (va demander le mot de passe PostgreSQL)
.\test-all-briques.ps1
```

**Note**: Le script va vous demander le mot de passe PostgreSQL si `PGPASSWORD` n'est pas défini.

**Astuce pour éviter la demande de mot de passe**:
```powershell
# Définir le mot de passe pour cette session
$env:PGPASSWORD = "votre_mot_de_passe"

# Puis exécuter le test
.\test-all-briques.ps1
```

### Linux/Mac (Bash)

```bash
# Aller dans le dossier du projet
cd ~/molam-connect

# Rendre le script exécutable
chmod +x test-all-briques.sh

# Exécuter le test complet (va demander le mot de passe PostgreSQL)
./test-all-briques.sh
```

**Note**: Le script va vous demander le mot de passe PostgreSQL si `PGPASSWORD` n'est pas défini.

**Astuce pour éviter la demande de mot de passe**:
```bash
# Définir le mot de passe pour cette session
export PGPASSWORD="votre_mot_de_passe"

# Puis exécuter le test
./test-all-briques.sh
```

---

## 📊 Résultat Attendu

```
================================================================
  Test COMPLET - Toutes les Briques Molam Connect (41-79)
================================================================

Database: molam_connect_test_all
User: postgres

Scanning briques directories...

Found 47 briques to test
Found 14 SQL schema files

================================================================
  Step 1: Database Setup
================================================================

Creating test database...
✅ Database created successfully

Creating helper functions...
✅ Helper functions created

================================================================
  Step 2: Installing SQL Schemas
================================================================

[1/14] brique-73 - 002_sira_enrichment.sql
   ✅ Success

[2/14] brique-73 - 003_unified_complete_schema.sql
   ✅ Success

[3/14] brique-74 - 001_developer_portal_schema.sql
   ✅ Success

[4/14] brique-74 - 002_banking_simulator_schema.sql
   ✅ Success

[5/14] brique-74 - 003_api_mock_generator_schema.sql
   ✅ Success

[6/14] brique-74 - 004_test_harness_schema.sql
   ✅ Success

[7/14] brique-75 - 001_merchant_settings_schema.sql
   ✅ Success

[8/14] brique-75 - 002_dynamic_zones_schema.sql
   ✅ Success

[9/14] brique-75 - 003_geo_fraud_rules_schema.sql
   ✅ Success

[10/14] brique-76 - 004_notifications_schema.sql
   ✅ Success

[11/14] brique-77 - 005_dashboard_schema.sql
   ✅ Success

[12/14] brique-77 - 006_alerts_schema.sql
   ✅ Success

[13/14] brique-78 - 007_approval_engine_schema.sql
   ✅ Success

[14/14] brique-79 - 008_api_keys_schema.sql
   ✅ Success

================================================================
  Step 3: Verification
================================================================

Database Objects Created:
  Tables:    50+
  Functions: 40+
  Views:     15+
  Triggers:  20+

================================================================
  Test Results Summary
================================================================

Briques scanned:  47
SQL files found:  14

Schemas installed: 14
Schemas failed:    0

Success Rate: 100.0%

================================================================
  Final Status
================================================================

🎉 ALL TESTS PASSED! All briques installed successfully!

Database: molam_connect_test_all
Ready for testing! 🚀

Test report saved to: test-results-2025-11-12-143530.json
```

---

## ✅ Vérifications Post-Test

### 1. Vérifier la Base de Données

```bash
# Se connecter à la base
psql -U postgres -d molam_connect_test_all

# Compter les tables
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

# Lister les tables
\dt

# Quitter
\q
```

### 2. Consulter le Rapport JSON

```bash
# Voir le rapport le plus récent
cat test-results-*.json | tail -1 | jq '.'
```

**Exemple de contenu**:
```json
{
  "timestamp": "2025-11-12 14:35:30",
  "database": "molam_connect_test_all",
  "total_briques": 47,
  "total_sql_files": 14,
  "success_count": 14,
  "failure_count": 0,
  "success_rate": "100.0%",
  "tables_created": 52,
  "functions_created": 42,
  "views_created": 16,
  "triggers_created": 22
}
```

---

## 🔧 Options de Configuration

### Variables d'Environnement

```bash
# Personnaliser la configuration
export DB_NAME="mon_test_db"
export DB_USER="mon_user"
export DB_HOST="localhost"
export DB_PORT="5432"

# Puis exécuter le test
./test-all-briques.sh
```

**Windows (PowerShell)**:
```powershell
$env:DB_NAME = "mon_test_db"
$env:DB_USER = "mon_user"
.\test-all-briques.ps1
```

---

## 🐛 Dépannage Rapide

### Erreur: Script bloqué à "Creating test database..."

**Cause**: PostgreSQL attend un mot de passe

**Solution**: Les scripts mis à jour vont maintenant demander le mot de passe automatiquement. Si vous utilisez une ancienne version:

1. Arrêter le script (`Ctrl+C`)
2. Définir `PGPASSWORD`:
   ```powershell
   # Windows
   $env:PGPASSWORD = "votre_mot_de_passe"
   ```
   ```bash
   # Linux/Mac
   export PGPASSWORD="votre_mot_de_passe"
   ```
3. Relancer le script

**Ou**: Voir [POSTGRESQL_SETUP.md](./POSTGRESQL_SETUP.md) pour d'autres méthodes d'authentification.

### Erreur: "postgres: command not found"

**Solution**: Ajouter PostgreSQL au PATH

**Windows**:
```powershell
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
```

**Linux/Mac**:
```bash
export PATH="/usr/local/pgsql/bin:$PATH"
```

### Erreur: "database already exists"

**Solution**: Supprimer l'ancienne base

```bash
dropdb -U postgres molam_connect_test_all
```

Puis relancer le test.

### Erreur: "permission denied"

**Solution**: Vérifier les permissions PostgreSQL

```bash
# Donner les permissions superuser
psql -U postgres -c "ALTER USER postgres WITH SUPERUSER;"
```

### Erreur: "some schemas failed"

**Solution**: C'est normal ! Certaines briques peuvent avoir des dépendances manquantes.

Le script continue et affiche un rapport avec :
- ✅ Schemas réussis
- ❌ Schemas échoués (avec détails)

---

## 📝 Tests Avancés

### Test d'une Brique Spécifique

```bash
# Tester uniquement la brique 76
psql -U postgres -d molam_connect_test_all \
  -f brique-76/sql/004_notifications_schema.sql
```

### Test Manuel de Fonctionnalités

```sql
-- Se connecter
psql -U postgres -d molam_connect_test_all

-- Tester Brique 79: Créer une API key
INSERT INTO api_keys (
  tenant_type, tenant_id, key_id, mode, name, scopes, created_by
) VALUES (
  'merchant',
  gen_random_uuid(),
  'TK_test_DEMO123',
  'test',
  'Demo Key',
  ARRAY['payments:create', 'payments:read'],
  gen_random_uuid()
);

-- Vérifier
SELECT key_id, mode, name, scopes, status FROM api_keys;

-- Tester Brique 78: Créer une action d'approbation
INSERT INTO ops_actions (
  origin, action_type, params, created_by
) VALUES (
  'ops_ui',
  'PAUSE_PAYOUT',
  '{"merchant_id": "test-123"}'::jsonb,
  gen_random_uuid()
);

-- Vérifier
SELECT id, action_type, status, created_at FROM ops_actions;
```

---

## 📊 Comparer avec les Tests Précédents

### Voir l'Historique des Tests

```bash
# Lister tous les rapports
ls -lh test-results-*.json

# Comparer deux rapports
diff <(jq -S . test-results-2025-11-12-140000.json) \
     <(jq -S . test-results-2025-11-12-143530.json)
```

---

## 🎯 Checklist de Validation

Après l'exécution du test, vérifiez :

- [ ] ✅ Base de données créée
- [ ] ✅ 0 erreurs critiques
- [ ] ✅ 50+ tables créées
- [ ] ✅ 40+ fonctions créées
- [ ] ✅ Success rate > 90%
- [ ] ✅ Rapport JSON généré
- [ ] ✅ Toutes les briques 76-79 installées

---

## 📚 Documentation Complète

Pour plus de détails :

| Document | Description |
|----------|-------------|
| [ALL_BRIQUES_INVENTORY.md](./ALL_BRIQUES_INVENTORY.md) | Inventaire complet des 47 briques |
| [TEST_PLAN.md](./TEST_PLAN.md) | Plan de test détaillé |
| [IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md) | Résumé de l'implémentation |
| [QUICK_START_TESTING.md](./QUICK_START_TESTING.md) | Guide pour briques 76-79 |

---

## 🚀 Prochaines Étapes

Après le test SQL :

1. **Tests API** : Démarrer les services Node.js et tester les endpoints
2. **Tests d'Intégration** : Vérifier les workflows inter-briques
3. **Tests de Performance** : Load testing avec k6
4. **Déploiement** : Passer en staging puis production

---

## 💡 Conseils

### Performance

- Le test prend ~5-10 minutes selon votre machine
- PostgreSQL doit être en cours d'exécution
- Assurez-vous d'avoir assez d'espace disque (>1GB)

### Sécurité

- Ne PAS utiliser ce script en production
- Base de test créée avec `_test_all` suffix
- Données de test uniquement

### Maintenance

- Exécuter le test après chaque ajout de brique
- Comparer les rapports JSON pour détecter les régressions
- Archiver les anciens rapports

---

## 🎉 Félicitations !

Si le test passe :

- ✅ **47 briques** scannées
- ✅ **14+ schémas SQL** installés
- ✅ **50+ tables** créées
- ✅ **Base de données** prête
- ✅ **Prêt pour production** 🚀

---

**Testing Quick Start v1.0**
**Date**: 2025-11-12
**Temps**: 5-10 minutes

Bon test ! 🎯
