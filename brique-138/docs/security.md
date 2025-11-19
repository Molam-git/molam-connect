# Sécurité — Brique 138 (Agent Dashboard)

## RBAC Molam ID

| Rôle    | Portée | Capacités |
|---------|--------|-----------|
| Agent   | Self   | Ventes personnelles, float, insights |
| Ops     | Multi  | Vue multi-agents, overview, insight global |
| Finance | Full   | Ajout commissions, audit float |
| Admin   | Root   | Contourne tous les contrôles |

- Headers supportés : `x-role`, `x-user-id`, `x-agent-id`, `x-region`, `x-country`
- Middleware `authMiddleware` peuple `req.user` + `requireRole`
- `enforceAgentScope` bloque l’accès cross-agent pour les rôles Agent

## API Hardening

- Rate limiting hérité (`/api`)
- Toutes les routes retournent `req.id` (métadonnées logs)
- Requêtes paramétrées (pg) ✅
- Pagination limitée (`limit` ≤ 500) pour prévenir l’exfiltration
- Réponses JSON signées `application/json; charset=utf-8`

## SIRA Integration

- `buildAgentInsights` calcule :
  - Ratio float / ventes quotidiennes
  - Anomalies commissions (> ±50 %)
  - Score SIRA synthétique
- Alertes envoyées côté UI (bannières + toasts)
- Données prêtes pour brancher le moteur SIRA complet (webhook / gRPC)

## Observabilité

- Winston/Morgan loguent `req.id`, `agent_id`, `role`
- Healthcheck `/health` couvre PostgreSQL + Redis
- Prometheus prêt (`prom-client`) pour exposer `agent_dashboard_float_ratio`

## Synchronisation

- **Wallet** : updates `agent_float` via Treasury service
- **Connect** : webhook PaymentIntent → `agent_sales`
- **Treasury** : batch commissions → `agent_commissions`
- **Real-time** : SSE/websocket possible (non inclus dans MVP)

## Checklist Production

- [ ] JWT Molam ID + rotation des clés
- [ ] TLS obligatoire + CSP strict
- [ ] Masking des montants dans les logs
- [ ] Monitoring float < seuil (PagerDuty)
- [ ] Alertes SIRA → Ops Slack

