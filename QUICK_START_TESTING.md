# Guide de Démarrage Rapide - Tests

**Date**: 2025-11-12
**Briques**: 76, 77, 77.1, 78, 79

---

## 🚀 Démarrage Rapide (5 minutes)

### Prérequis

- PostgreSQL 14+ installé et en cours d'exécution
- Redis 6+ installé et en cours d'exécution (optionnel pour tests complets)
- Node.js 18+ (optionnel pour tests API)

### Étape 1: Tester les Schémas SQL

**Windows (PowerShell)**:
```powershell
# Aller dans le dossier du projet
cd C:\Users\lomao\Desktop\Molam\molam-connect

# Exécuter le script de test
.\test-all-schemas.ps1
```

**Linux/Mac (Bash)**:
```bash
# Aller dans le dossier du projet
cd ~/molam-connect

# Rendre le script exécutable
chmod +x test-all-schemas.sh

# Exécuter le script de test
./test-all-schemas.sh
```

**Résultat attendu**:
```
=================================================
  Test des Schémas SQL - Molam Connect
=================================================

Database: molam_connect_test
User: postgres
Host: localhost

[1/7] Création de la base de données de test...
✅ Base de données créée

[2/7] Création de la fonction helper update_updated_at_column...
✅ Fonction helper créée

[3/7] Installation Brique 76 - Notifications...
✅ Brique 76 installée

[4/7] Installation Brique 77 - Dashboard...
✅ Brique 77 installée

[5/7] Installation Brique 77.1 - Alerts...
✅ Brique 77.1 installée

[6/7] Installation Brique 78 - Ops Approval...
✅ Brique 78 installée

[7/7] Installation Brique 79 - API Keys...
✅ Brique 79 installée

=================================================
  Vérifications
=================================================

Tables créées: 29
Fonctions créées: 25
Vues créées: 10
Triggers créés: 15

Liste des tables:
 - agent_locations
 - alert_decisions
 - alerts
 - api_key_events
 - api_key_quotas
 - api_key_secrets
 - api_key_usage
 - api_keys
 - approval_policies
 - dash_aggregates_hourly
 - dash_alerts
 - dash_snapshots
 - dash_widgets
 - notif_deliveries
 - notif_preferences
 - notif_requests
 - notif_templates
 - notif_throttle_counters
 - ops_actions
 - ops_approval_audit
 - ops_approvals
 - remediation_policies
 - sira_dash_recommendations

=================================================
  Résumé
=================================================

✅ Tous les schémas ont été installés avec succès

Base de données: molam_connect_test
Tables: 29
Fonctions: 25
Vues: 10
Triggers: 15

Prêt pour les tests! 🚀
```

---

## 🧪 Étape 2: Tests Manuels Rapides

### Test Brique 79 - API Keys

```bash
# Se connecter à la base de données
psql -U postgres -d molam_connect_test

# Créer une clé API test
INSERT INTO api_keys (
  tenant_type, tenant_id, key_id, mode, name, scopes, created_by
) VALUES (
  'merchant',
  gen_random_uuid(),
  'TK_test_ABC123XYZ456',
  'test',
  'Test Key',
  ARRAY['payments:create', 'payments:read'],
  gen_random_uuid()
);

-- Vérifier
SELECT key_id, mode, name, scopes, status FROM api_keys;

-- Résultat attendu:
--       key_id        | mode |   name   |           scopes            | status
-- --------------------+------+----------+-----------------------------+--------
-- TK_test_ABC123XYZ456| test | Test Key | {payments:create,payments:read} | active
```

### Test Brique 78 - Ops Approval

```sql
-- Créer une action d'approbation
INSERT INTO ops_actions (
  origin, action_type, params, created_by
) VALUES (
  'ops_ui',
  'FREEZE_MERCHANT',
  '{"merchant_id": "merchant-123", "reason": "test"}'::jsonb,
  gen_random_uuid()
) RETURNING id, status;

-- Résultat attendu:
--                  id                  |   status
-- -------------------------------------+-----------
-- f47ac10b-58cc-4372-a567-0e02b2c3d479 | requested
```

### Test Brique 77 - Dashboard

```sql
-- Créer un agrégat horaire
SELECT upsert_hourly_aggregate(
  now(),
  'platform',
  NULL,
  'CI',
  'GLOBAL',
  'XOF',
  '{"gmv": 1000000, "transaction_count": 100}'::jsonb
);

-- Vérifier
SELECT bucket_ts, gmv, transaction_count
FROM dash_aggregates_hourly
ORDER BY bucket_ts DESC
LIMIT 1;
```

### Test Brique 77.1 - Alerts

```sql
-- Créer une alerte
SELECT create_alert_with_remediation(
  'float_low',
  'agent',
  gen_random_uuid(),
  'critical',
  '{"metric": "float_available", "value": 500000, "threshold": 1000000}'::jsonb,
  'Float niveau critique',
  'Float disponible en dessous du seuil'
);

-- Vérifier
SELECT alert_type, severity, status FROM alerts;
```

### Test Brique 76 - Notifications

```sql
-- Créer un template
INSERT INTO notif_templates (
  template_key, scope, content, channels, category, created_by
) VALUES (
  'test_notification',
  'global',
  '{"fr": {"email": {"subject": "Test", "body": "Ceci est un test {{name}}"}}}'::jsonb,
  ARRAY['email'],
  'transactional',
  gen_random_uuid()
) RETURNING id, template_key, status;
```

---

## 📊 Étape 3: Vérifications Complètes

### Vérifier l'intégrité de toutes les tables

```sql
-- Compter les tables par brique
SELECT
  CASE
    WHEN tablename LIKE 'notif%' THEN 'Brique 76 - Notifications'
    WHEN tablename LIKE 'dash%' THEN 'Brique 77 - Dashboard'
    WHEN tablename LIKE 'alert%' OR tablename = 'remediation_policies' THEN 'Brique 77.1 - Alerts'
    WHEN tablename LIKE 'ops_%' OR tablename LIKE 'approval%' THEN 'Brique 78 - Approval'
    WHEN tablename LIKE 'api_key%' THEN 'Brique 79 - API Keys'
    ELSE 'Autres'
  END as brique,
  COUNT(*) as table_count
FROM pg_tables
WHERE schemaname = 'public'
GROUP BY brique
ORDER BY brique;
```

**Résultat attendu**:
```
           brique            | table_count
-----------------------------+-------------
 Brique 76 - Notifications   |           5
 Brique 77 - Dashboard       |           6
 Brique 77.1 - Alerts        |           3
 Brique 78 - Approval        |           4
 Brique 79 - API Keys        |           5
 Autres                      |           6
```

### Vérifier les contraintes et indexes

```sql
-- Vérifier les foreign keys
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;

-- Vérifier les indexes
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

---

## 🔍 Étape 4: Tests de Fonctionnalités

### Test du Workflow Complet: Alert → Approval → Execution

```sql
-- 1. Créer une alerte
DO $$
DECLARE
  v_alert_id UUID;
  v_action_id UUID;
BEGIN
  -- Créer l'alerte
  v_alert_id := create_alert_with_remediation(
    'float_low',
    'agent',
    gen_random_uuid(),
    'critical',
    '{"metric": "float_available", "value": 500000, "threshold": 1000000}'::jsonb,
    'Float critique',
    'Float disponible trop bas'
  );

  RAISE NOTICE 'Alert créée: %', v_alert_id;

  -- Simuler la création d'une action d'approbation
  INSERT INTO ops_actions (origin, action_type, params, created_by)
  VALUES (
    'alert',
    'ADJUST_FLOAT',
    jsonb_build_object('alert_id', v_alert_id, 'amount', 1000000),
    gen_random_uuid()
  ) RETURNING id INTO v_action_id;

  RAISE NOTICE 'Action créée: %', v_action_id;

  -- Simuler 2 approbations
  INSERT INTO ops_approvals (ops_action_id, voter_id, voter_roles, vote)
  VALUES
    (v_action_id, gen_random_uuid(), ARRAY['finance_ops'], 'approve'),
    (v_action_id, gen_random_uuid(), ARRAY['finance_ops'], 'approve');

  -- Évaluer le quorum
  PERFORM evaluate_quorum(v_action_id);

  -- Vérifier le statut
  RAISE NOTICE 'Statut final: %', (SELECT status FROM ops_actions WHERE id = v_action_id);
END $$;
```

### Test de Rotation de Clé API

```sql
DO $$
DECLARE
  v_key_id UUID;
  v_key_id_public TEXT;
BEGIN
  -- Créer une clé
  INSERT INTO api_keys (tenant_type, tenant_id, key_id, mode, name, scopes, created_by)
  VALUES (
    'merchant',
    gen_random_uuid(),
    'TK_test_ROTATION123',
    'test',
    'Rotation Test Key',
    ARRAY['payments:create'],
    gen_random_uuid()
  ) RETURNING id, key_id INTO v_key_id, v_key_id_public;

  RAISE NOTICE 'Clé créée: %', v_key_id_public;

  -- Créer le premier secret (version 1)
  INSERT INTO api_key_secrets (api_key_id, version, secret_ciphertext, secret_hash, status)
  VALUES (v_key_id, 1, 'encrypted_v1'::bytea, 'hash_v1', 'active');

  -- Simuler rotation: créer version 2
  INSERT INTO api_key_secrets (api_key_id, version, secret_ciphertext, secret_hash, status)
  VALUES (v_key_id, 2, 'encrypted_v2'::bytea, 'hash_v2', 'active');

  -- Marquer version 1 comme retiring
  UPDATE api_key_secrets
  SET status = 'retiring', retiring_at = now() + INTERVAL '10 minutes'
  WHERE api_key_id = v_key_id AND version = 1;

  -- Vérifier les versions
  RAISE NOTICE 'Versions actives: %', (
    SELECT COUNT(*) FROM api_key_secrets
    WHERE api_key_id = v_key_id AND status IN ('active', 'retiring')
  );
END $$;
```

---

## ✅ Checklist de Validation

Cochez au fur et à mesure:

### Schémas SQL
- [ ] Tous les schémas s'exécutent sans erreur
- [ ] 29 tables créées
- [ ] 25+ fonctions créées
- [ ] 10+ vues créées
- [ ] 15+ triggers créés

### Brique 76 - Notifications
- [ ] Templates créés
- [ ] Notifications envoyées
- [ ] Throttling fonctionne
- [ ] Préférences utilisateur respectées

### Brique 77 - Dashboard
- [ ] Agrégats horaires créés
- [ ] Snapshots générés
- [ ] Ops actions créées
- [ ] Widgets configurables

### Brique 77.1 - Alerts
- [ ] Alertes créées
- [ ] Politiques de remédiation configurées
- [ ] Workflow de remédiation fonctionne

### Brique 78 - Ops Approval
- [ ] Actions créées
- [ ] Votes enregistrés
- [ ] Quorum évalué correctement
- [ ] Actions exécutées après approbation

### Brique 79 - API Keys
- [ ] Clés créées (test et live)
- [ ] Secrets chiffrés
- [ ] Validation fonctionne
- [ ] Rotation avec grace period
- [ ] Révocation instantanée
- [ ] Quotas enforced

---

## 🐛 Dépannage

### Erreur: "database does not exist"

```bash
# Créer la base manuellement
createdb -U postgres molam_connect_test
```

### Erreur: "function already exists"

```bash
# Recréer la base
dropdb -U postgres molam_connect_test
createdb -U postgres molam_connect_test
# Ré-exécuter le script
```

### Erreur: "permission denied"

```bash
# Donner les permissions
psql -U postgres -c "ALTER USER postgres WITH SUPERUSER;"
```

### PostgreSQL n'est pas dans le PATH

**Windows**:
```powershell
# Ajouter PostgreSQL au PATH
$env:Path += ";C:\Program Files\PostgreSQL\14\bin"
```

**Linux/Mac**:
```bash
# Ajouter au PATH
export PATH="/usr/local/pgsql/bin:$PATH"
```

---

## 📞 Support

En cas de problème:

1. Vérifier les logs PostgreSQL
2. Vérifier que PostgreSQL est en cours d'exécution: `pg_isready`
3. Vérifier les permissions: `psql -U postgres -c "SELECT current_user;"`
4. Consulter le fichier [TEST_PLAN.md](./TEST_PLAN.md) pour plus de détails

---

## 🎉 Félicitations!

Si tous les tests passent, vous avez:
- ✅ 5 briques installées
- ✅ 29 tables créées
- ✅ 25+ fonctions SQL
- ✅ 11,400+ lignes de code testées
- ✅ Système prêt pour la production

**Prochaine étape**: Tests d'intégration API avec les services Node.js

---

**Guide de Démarrage Rapide v1.0**
**Date**: 2025-11-12

Temps total estimé: **5-10 minutes**

Bon test! 🚀
