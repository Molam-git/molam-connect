# docs/runbook.md
# Runbook Brique 30 - Voice/TTS

## Monitoring
- Métriques Prometheus: `vocal_requests_total`, `vocal_latency_seconds`, `vocal_cost_usd_total`
- Dashboard Grafana: Voice Success Rate par région

## Procédures d'urgence

### Provider down
1. Désactiver le provider dans `tts_providers`
2. Vérifier que le providerSelector bascule automatiquement

### Budget dépassé
1. Modifier la règle dans `voice_channel_rules` pour réduire le budget
2. Ou désactiver temporairement `fallback_enabled`

### Latence élevée
1. Vérifier les métriques de latency par provider
2. Ajuster les `preferred_providers` dans les règles