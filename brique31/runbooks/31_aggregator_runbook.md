# Runbook - Brique 31 Aggregator

## Monitoring

### Métriques Clés
- `molam_aggregator_processed_events_total` : Volume d'événements traités
- `molam_aggregator_processing_latency_seconds` : Latence de traitement
- `molam_ws_connections` : Connexions WebSocket actives
- `molam_alerts_triggered_total` : Alertes déclenchées

### Seuils d'Alerte
- Latence > 200ms : Warning
- Latence > 500ms : Critical
- Événements non traités > 100/s : Critical
- Connexions WS > 10k : Warning

## Procédures d'Urgence

### Redémarrage du Service
```bash
# Arrêt gracieux
kubectl rollout restart deployment/aggregator -n molam-pay

# Vérification
kubectl get pods -n molam-pay -l app=aggregator