# Runbook — Sous-Brique 140ter: Auto-Debug Logs by Sira

## 📘 Vue d'ensemble

Système d'analyse automatique des erreurs SDK/API avec suggestions de correction locale (sans appel externe).

## 🔑 Opérations quotidiennes

### 📊 Monitoring des erreurs auto-debug

```bash
# Logs d'analyse d'erreurs
kubectl logs -l app=devportal-debug | grep "Auto-Debug"

# Métriques Prometheus
curl http://devportal:8140/metrics | grep auto_debug
```

### 📈 Métriques à surveiller

```sql
-- Total d'erreurs analysées par jour
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_errors,
  COUNT(*) FILTER (WHERE resolved = true) as resolved,
  COUNT(*) FILTER (WHERE resolved = false) as unresolved
FROM dev_auto_debug_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Erreurs par catégorie
SELECT
  proposed_fix->>'category' as category,
  sdk_language,
  COUNT(*) as total
FROM dev_auto_debug_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY category, sdk_language
ORDER BY total DESC;

-- Top 10 des erreurs les plus fréquentes
SELECT
  LEFT(error_message, 100) as error_pattern,
  COUNT(*) as occurrences,
  AVG(CASE WHEN resolved THEN 1 ELSE 0 END)::DECIMAL(5,2) as resolution_rate
FROM dev_auto_debug_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY LEFT(error_message, 100)
ORDER BY occurrences DESC
LIMIT 10;
```

### 🚨 Alertes automatiques

**Trop d'erreurs répétées (même pattern):**
```yaml
# Prometheus alert
- alert: AutoDebugRepeatedError
  expr: |
    rate(auto_debug_logs_total{resolved="false"}[5m]) > 10
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Erreur répétée détectée dans auto-debug"
    description: "Plus de 10 erreurs non résolues en 5 minutes"
```

**Taux de résolution faible:**
```yaml
- alert: AutoDebugLowResolutionRate
  expr: |
    (sum(auto_debug_logs_resolved_total) / sum(auto_debug_logs_total)) < 0.5
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "Taux de résolution auto-debug faible"
    description: "Moins de 50% des erreurs sont résolues"
```

### 🔧 Dépannage

**Les erreurs ne sont pas détectées:**
```bash
# 1. Vérifier que le worker tourne
kubectl logs devportal-api | grep "autoDebugWorker"

# 2. Vérifier la table
psql -d molam_connect -c "SELECT COUNT(*) FROM dev_auto_debug_logs WHERE created_at > NOW() - INTERVAL '1 hour';"

# 3. Tester manuellement
curl -X POST http://localhost:8140/api/debug/report \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -d '{
    "lang": "node",
    "error_message": "401 Unauthorized",
    "context": {"test": true}
  }'
```

**Les fixes proposés sont incorrects:**
```bash
# 1. Review des patterns dans autoDebugWorker.ts
grep -A 5 "errMsg.includes" src/sira/autoDebugWorker.ts

# 2. Analyser les feedbacks développeurs
psql -d molam_connect -c "
  SELECT
    error_message,
    proposed_fix->>'action' as suggested_fix,
    resolved
  FROM dev_auto_debug_logs
  WHERE resolved = false
  ORDER BY created_at DESC
  LIMIT 20;
"

# 3. Update des patterns si nécessaire
# Éditer src/sira/autoDebugWorker.ts et déployer
kubectl rollout restart deployment/devportal-api
```

**Console UI ne charge pas les erreurs:**
```bash
# 1. Vérifier les routes API
curl http://localhost:8140/api/debug/unresolved \
  -H "Authorization: Bearer $DEV_TOKEN"

# 2. Vérifier logs frontend
kubectl logs devportal-web | grep "debug"

# 3. Vérifier CORS si nécessaire
kubectl logs devportal-api | grep "CORS"
```

### 🧠 Amélioration continue

**Export des erreurs pour analyse:**
```bash
# Export CSV des erreurs non résolues
psql -d molam_connect -c "
  COPY (
    SELECT
      sdk_language,
      error_message,
      proposed_fix->>'category' as category,
      proposed_fix->>'action' as action,
      context,
      created_at
    FROM dev_auto_debug_logs
    WHERE resolved = false
    ORDER BY created_at DESC
  ) TO STDOUT CSV HEADER
" > unresolved_errors.csv
```

**Ajouter de nouveaux patterns de détection:**
1. Identifier les erreurs récurrentes non détectées
2. Ajouter pattern dans `autoDebugWorker.ts`:
```typescript
if (errMsg.includes('nouveau_pattern')) {
  fix = {
    action: 'Description de la solution',
    snippet: sampleNewPatternFix(lang),
    category: 'nouvelle_categorie',
  };
}
```
3. Déployer et tester

### 📊 Dashboard DevPortal

Les stats auto-debug sont affichées dans le Developer Portal:
- Total d'erreurs par langage
- Taux de résolution
- Catégories d'erreurs courantes
- Erreurs non résolues avec bouton "Marquer résolu"

### 🔄 Workflow de résolution

1. **Développeur rencontre erreur** → Colle dans Debug Console
2. **Sira analyse** → Propose fix + snippet
3. **Développeur applique fix** → Marque comme résolu
4. **Stats mises à jour** → Learning pour patterns futurs

### ⚙️ Configuration

Variables d'environnement:
```bash
# Aucune config externe requise - analyse locale
# Optionnel: activer logging verbose
DEBUG_AUTO_DEBUG=true
```

### 🔐 Sécurité

- Routes protégées par RBAC (`merchant_dev`, `dev_admin`)
- Pas d'appel API externe (analyse locale)
- Logs stockés en base avec développeur_id pour isolation
- Context JSONB peut contenir données sensibles → pas de leak dans UI

### 📈 KPIs

- **Taux de détection**: % d'erreurs matchant un pattern
- **Taux de résolution**: % d'erreurs marquées résolues
- **Temps moyen de résolution**: Durée entre création et résolution
- **Top 5 catégories d'erreurs**: Authentication, Network, Validation, etc.

---

## ✅ Checklist quotidienne

- [ ] Vérifier alertes Prometheus auto-debug
- [ ] Review top 10 erreurs non résolues
- [ ] Vérifier taux de résolution > 70%
- [ ] Export training data si nouveaux patterns détectés
- [ ] Update patterns dans code si nécessaire

---

**Support:** #sira-autodebug sur Slack
