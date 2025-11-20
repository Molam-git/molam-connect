# Runbook — Sous-Brique 140bis: AI Dev Assistant (Sira)

## 📘 Opérations quotidiennes

### 🔑 Vérifier quotas API Sira

```bash
# Logs API calls
kubectl logs -l app=devportal-ai | grep "Sira"

# Vérifier usage quota
kubectl logs devportal-ai | grep quota

# Metrics Prometheus
curl http://devportal:8140/metrics | grep sira_api_calls_total
```

### 🔄 Fallback si Sira indisponible

Système automatique de fallback vers snippets statiques :
- Si `SIRA_API_KEY` non configurée → snippets statiques
- Si timeout > 5s → snippets statiques
- Si erreur API → snippets statiques

**Vérifier fallback:**
```bash
# Logs de fallback
kubectl logs devportal-ai | grep "Fallback snippet"
```

### 🧠 Feedback & apprentissage

Les feedbacks développeurs alimentent Sira training :

```sql
-- Voir feedbacks récents
SELECT * FROM dev_ai_feedback
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY rating DESC;

-- Statistiques
SELECT
  lang,
  AVG(rating) as avg_rating,
  COUNT(*) as total_queries
FROM dev_ai_feedback
WHERE rating IS NOT NULL
GROUP BY lang;
```

**Export pour training:**
```bash
# Export feedbacks positifs (rating >= 4)
psql -d molam_connect -c "
  COPY (
    SELECT query, suggestion, lang
    FROM dev_ai_feedback
    WHERE rating >= 4
  ) TO STDOUT CSV HEADER
" > sira_training_data.csv
```

### 🚨 Alertes

**Quota proche limite:**
```yaml
# Prometheus alert
- alert: SiraQuotaNearLimit
  expr: sira_api_calls_total > 90000
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Quota Sira proche de la limite"
```

**Taux d'erreur élevé:**
```yaml
- alert: SiraHighErrorRate
  expr: rate(sira_api_errors_total[5m]) > 0.1
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Taux d'erreur Sira élevé"
```

### 🔧 Dépannage

**Sira ne répond pas:**
```bash
# 1. Vérifier API key
kubectl get secret molam-secrets -o jsonpath='{.data.SIRA_API_KEY}' | base64 -d

# 2. Test direct API
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $SIRA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"test"}]}'

# 3. Redémarrer pod
kubectl rollout restart deployment/devportal-ai
```

**Snippets incorrects:**
```bash
# Vérifier logs de génération
kubectl logs devportal-ai | grep "siraAssist"

# Vérifier feedback négatif
psql -d molam_connect -c "
  SELECT query, rating, feedback_text
  FROM dev_ai_feedback
  WHERE rating <= 2
  ORDER BY created_at DESC
  LIMIT 10;
"
```

### 📊 Métriques à surveiller

- `sira_api_calls_total` - Total appels
- `sira_api_latency_seconds` - Latence moyenne
- `sira_api_errors_total` - Total erreurs
- `sira_fallback_used_total` - Fallbacks utilisés
- `sira_feedback_rating_avg` - Note moyenne

### 🔄 Rotation API keys

```bash
# 1. Créer nouvelle key Sira
# 2. Update secret K8s
kubectl create secret generic molam-secrets \
  --from-literal=SIRA_API_KEY=new_key \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Redémarrer pods
kubectl rollout restart deployment/devportal-ai

# 4. Vérifier
kubectl logs devportal-ai | head -20
```

---

## ✅ Checklist quotidienne

- [ ] Vérifier quota Sira (< 90%)
- [ ] Vérifier taux d'erreur (< 5%)
- [ ] Review feedbacks négatifs
- [ ] Vérifier latence moyenne (< 2s)
- [ ] Export training data si nécessaire

---

**Support:** #sira-devportal sur Slack
