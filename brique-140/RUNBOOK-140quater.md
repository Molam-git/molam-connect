# Runbook — Sous-Brique 140quater: Self-Healing SDKs

## 📘 Vue d'ensemble

Système de SDKs auto-correctifs capables de détecter et corriger automatiquement les erreurs courantes sans intervention humaine.

## 🔑 Fonctionnalités principales

### 🔧 Auto-correction supportée

- **401 Unauthorized**: Injection clé API fallback
- **Timeout**: Augmentation automatique du timeout
- **invalid_currency**: Correction vers devise valide (XOF par défaut)
- **HMAC signature**: Recalcul automatique de la signature
- **429 Rate Limit**: Retry avec backoff exponentiel
- **400 Bad Request**: Validation et correction des champs requis

## 📊 Monitoring

### Métriques Prometheus

```bash
# Total patches appliqués
curl http://devportal:8140/metrics | grep self_heal_patches_total

# Taux de succès
curl http://devportal:8140/metrics | grep self_heal_success_rate

# Rollbacks déclenchés
curl http://devportal:8140/metrics | grep self_heal_rollbacks_total
```

### Requêtes SQL

```sql
-- Patches les plus utilisés
SELECT
  p.sdk_language,
  p.error_signature,
  p.description,
  COUNT(a.id) as applications,
  AVG(CASE WHEN a.success THEN 1.0 ELSE 0.0 END) as success_rate
FROM sdk_self_healing_registry p
LEFT JOIN sdk_patch_applications a ON p.id = a.patch_id
WHERE a.applied_at > NOW() - INTERVAL '7 days'
GROUP BY p.id, p.sdk_language, p.error_signature, p.description
ORDER BY applications DESC
LIMIT 10;

-- Taux de rollback par patch
SELECT
  p.description,
  COUNT(*) as total_applications,
  SUM(CASE WHEN a.rollback_triggered THEN 1 ELSE 0 END) as rollbacks,
  (SUM(CASE WHEN a.rollback_triggered THEN 1 ELSE 0 END)::FLOAT / COUNT(*)::FLOAT * 100) as rollback_rate
FROM sdk_self_healing_registry p
JOIN sdk_patch_applications a ON p.id = a.patch_id
WHERE a.applied_at > NOW() - INTERVAL '24 hours'
GROUP BY p.id, p.description
HAVING COUNT(*) > 10
ORDER BY rollback_rate DESC;

-- Erreurs par développeur
SELECT
  developer_id,
  sdk_language,
  COUNT(*) as total_patches_applied,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful
FROM sdk_patch_applications
WHERE applied_at > NOW() - INTERVAL '7 days'
GROUP BY developer_id, sdk_language
ORDER BY total_patches_applied DESC
LIMIT 20;
```

## 🚨 Alertes

### Taux de rollback élevé

```yaml
# Prometheus alert
- alert: SelfHealHighRollbackRate
  expr: |
    (sum(rate(self_heal_rollbacks_total[5m])) / sum(rate(self_heal_patches_total[5m]))) > 0.2
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Taux de rollback self-healing élevé"
    description: "Plus de 20% des patches sont rollback"
```

### Patch échouant systématiquement

```yaml
- alert: SelfHealPatchFailing
  expr: |
    (sum(rate(self_heal_patch_failures_total{patch_id="$1"}[10m])) /
     sum(rate(self_heal_patch_applications_total{patch_id="$1"}[10m]))) > 0.5
  for: 15m
  labels:
    severity: critical
  annotations:
    summary: "Patch self-healing échoue trop souvent"
    description: "Patch {{ $labels.patch_id }} échoue > 50%"
```

### Trop d'applications de patches (possible bug récurrent)

```yaml
- alert: SelfHealHighVolume
  expr: rate(self_heal_patches_total[5m]) > 100
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Volume élevé de patches self-healing"
    description: "Plus de 100 patches/min appliqués - possible bug SDK"
```

## 🔧 Dépannage

### Les patches ne s'appliquent pas

```bash
# 1. Vérifier que le self-heal est actif
psql -d molam_connect -c "SELECT COUNT(*) FROM sdk_self_healing_registry WHERE active = true;"

# 2. Vérifier logs SDK côté client
# Dans l'application du développeur, chercher:
# "⚡ Molam SDK applied self-healing patch"

# 3. Vérifier logs API
kubectl logs devportal-api | grep "self-heal"

# 4. Tester manuellement l'endpoint
curl -X POST http://localhost:8140/api/dev/self-heal \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sdk": "node",
    "error": "401 Unauthorized",
    "status": 401,
    "context": {"test": true}
  }'
```

### Patch provoque des erreurs

```bash
# 1. Identifier le patch problématique
psql -d molam_connect -c "
  SELECT p.id, p.description, COUNT(*) as failures
  FROM sdk_self_healing_registry p
  JOIN sdk_patch_applications a ON p.id = a.patch_id
  WHERE a.success = false
    AND a.applied_at > NOW() - INTERVAL '1 hour'
  GROUP BY p.id, p.description
  ORDER BY failures DESC;
"

# 2. Désactiver temporairement le patch
psql -d molam_connect -c "
  UPDATE sdk_self_healing_registry
  SET active = false
  WHERE id = 'PATCH_ID';
"

# 3. Analyser le code du patch
psql -d molam_connect -c "
  SELECT patch_code, rollback_code
  FROM sdk_self_healing_registry
  WHERE id = 'PATCH_ID';
"

# 4. Corriger et réactiver
psql -d molam_connect -c "
  UPDATE sdk_self_healing_registry
  SET
    patch_code = 'CORRECTED_CODE',
    active = true,
    updated_at = now()
  WHERE id = 'PATCH_ID';
"
```

### Rollbacks fréquents

```bash
# 1. Analyser les rollbacks
psql -d molam_connect -c "
  SELECT
    p.description,
    a.error_encountered,
    a.context,
    a.applied_at
  FROM sdk_patch_applications a
  JOIN sdk_self_healing_registry p ON a.patch_id = p.id
  WHERE a.rollback_triggered = true
    AND a.applied_at > NOW() - INTERVAL '24 hours'
  ORDER BY a.applied_at DESC
  LIMIT 20;
"

# 2. Améliorer le rollback_code
psql -d molam_connect -c "
  UPDATE sdk_self_healing_registry
  SET rollback_code = 'IMPROVED_ROLLBACK_CODE'
  WHERE id = 'PATCH_ID';
"
```

## 🔄 Gestion des patches

### Créer un nouveau patch

```bash
# Via API (nécessite rôle dev_admin)
curl -X POST http://localhost:8140/api/dev/patches \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sdk_language": "node",
    "error_signature": "ECONNREFUSED",
    "patch_code": "this.baseUrl = \"https://api-backup.molam.com\"; console.warn(\"⚡ Fallback to backup API\");",
    "description": "Fallback vers API de backup",
    "severity": "high",
    "rollback_code": "this.baseUrl = \"https://api.molam.com\";"
  }'

# Ou via SQL
psql -d molam_connect -c "
  INSERT INTO sdk_self_healing_registry
  (sdk_language, error_signature, patch_code, description, severity, rollback_code)
  VALUES (
    'python',
    'ConnectionError',
    'self.base_url = \"https://api-backup.molam.com\"',
    'Fallback API backup pour Python',
    'high',
    'self.base_url = \"https://api.molam.com\"'
  );
"
```

### Désactiver un patch

```bash
# Via API
curl -X DELETE http://localhost:8140/api/dev/patches/PATCH_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Via SQL
psql -d molam_connect -c "
  UPDATE sdk_self_healing_registry
  SET active = false, updated_at = now()
  WHERE id = 'PATCH_ID';
"
```

### Mettre à jour un patch

```sql
UPDATE sdk_self_healing_registry
SET
  patch_code = 'NEW_CODE',
  rollback_code = 'NEW_ROLLBACK',
  version = '2.0.0',
  updated_at = now()
WHERE id = 'PATCH_ID';
```

## 🧠 Amélioration continue

### Export des données pour analyse

```bash
# Export CSV des patches appliqués
psql -d molam_connect -c "
  COPY (
    SELECT
      p.sdk_language,
      p.error_signature,
      p.description,
      a.error_encountered,
      a.success,
      a.rollback_triggered,
      a.context,
      a.applied_at
    FROM sdk_patch_applications a
    JOIN sdk_self_healing_registry p ON a.patch_id = p.id
    WHERE a.applied_at > NOW() - INTERVAL '30 days'
    ORDER BY a.applied_at DESC
  ) TO STDOUT CSV HEADER
" > patch_applications.csv
```

### Identifier les nouveaux patterns d'erreurs

```sql
-- Erreurs sans patch disponible
SELECT
  sdk_language,
  LEFT(error_encountered, 100) as error_pattern,
  COUNT(*) as occurrences
FROM sdk_patch_applications
WHERE patch_applied = false
  AND applied_at > NOW() - INTERVAL '7 days'
GROUP BY sdk_language, LEFT(error_encountered, 100)
ORDER BY occurrences DESC
LIMIT 20;
```

## 🔐 Sécurité

### Validation des patches

- **Code review obligatoire** pour tous les patches avant activation
- **Sandboxing**: Exécution des patches dans contexte limité (pas d'accès filesystem, network limité)
- **Audit trail**: Tous les patches appliqués sont tracés avec développeur_id
- **Rollback automatique**: Si patch échoue, rollback immédiat
- **Versioning**: Chaque modification de patch incrémente la version

### Bonnes pratiques

1. **Tester en dev**: Créer patch avec `active = false`, tester manuellement
2. **Rollback disponible**: Toujours fournir un `rollback_code`
3. **Logs verbeux**: Patches doivent logger leurs actions
4. **Idempotence**: Patches doivent être réexécutables sans effets de bord
5. **Timeout**: Patches ne doivent pas bloquer (max 5s d'exécution)

## 📈 KPIs

- **Taux d'application**: % de patches appliqués avec succès
- **Taux de rollback**: % de patches nécessitant un rollback
- **MTTR (Mean Time To Repair)**: Temps moyen de correction par patch
- **Coverage**: % d'erreurs couvertes par au moins un patch
- **Adoption SDK**: % de développeurs avec self-healing activé

## 🔄 Workflow développeur

1. **Erreur détectée** → SDK capture erreur
2. **Appel API self-heal** → Récupération patch distant
3. **Application patch** → Correction en mémoire
4. **Retry requête** → Tentative avec correction appliquée
5. **Notification** → Logs SDK + callback `onPatchApplied`
6. **Audit** → Enregistrement en base pour stats

## ⚙️ Configuration SDK

```javascript
// Node.js
const client = new MolamClient({
  apiKey: process.env.MOLAM_API_KEY,
  secretKey: process.env.MOLAM_SECRET_KEY,
  enableSelfHealing: true, // Activer auto-correction
  onPatchApplied: (patch) => {
    console.log('Patch appliqué:', patch.description);
    // Notifier monitoring externe
  },
});

// Historique des patches
const history = client.getPatchHistory();
console.log('Patches appliqués:', history);
```

---

## ✅ Checklist quotidienne

- [ ] Vérifier taux de succès patches > 90%
- [ ] Vérifier taux de rollback < 10%
- [ ] Review patches appliqués > 100 fois/jour
- [ ] Identifier nouveaux patterns d'erreurs sans patch
- [ ] Vérifier alertes Prometheus
- [ ] Export stats hebdomadaires pour amélioration

---

**Support:** #self-healing-sdk sur Slack
