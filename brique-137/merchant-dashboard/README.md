# Brique 137 — Merchant Dashboard (Industrielle et Complète)

## Vue d'ensemble

Tableau de bord marchand de qualité production avec KPIs temps-réel, transactions paginées, remboursements, versements, litiges, et intégration SIRA. Interface Apple-like responsive avec RBAC complet via Molam ID.

## Fonctionnalités

### KPIs Temps-Réel
- **Métriques principales**: Ventes, remboursements, frais, revenu net
- **Périodes**: Aujourd'hui, hier, 7 derniers jours, MTD, YTD, personnalisée
- **Multi-devises**: Affichage dans la devise marchande + équivalent USD
- **Métriques avancées**: Panier moyen, taux de chargeback, taux de conversion
- **Cache intelligent**: KPIs pré-calculés avec TTL de 2 minutes

### Transactions
- **Liste paginée**: 50-200 transactions par page avec keyset pagination
- **Filtres avancés**: Date, statut, devise, type, canal (wallet/card/bank)
- **Recherche**: Par référence, email client, montant
- **Export**: CSV et PDF signés avec URL S3 temporaire

### Remboursements
- **Initiation**: Par merchant_admin avec validation montant
- **Approbation dynamique**: Intégration B136ter si montant > seuil
- **2FA optionnel**: Configurable par marchand
- **Evidence**: Upload de preuves (reçus, KYC, communications)
- **Double-entry**: Créa

tion automatique d'écritures ledger inversées

### Versements (Payouts)
- **Planification**: daily, weekly, monthly, instant (avec frais)
- **Historique**: Liste complète avec statuts et dates
- **Hold tracking**: Affichage du statut treasury (B34/B35)
- **Ajustements**: Prises en compte automatiques des refunds

### Litiges (Disputes)
- **Types**: Chargeback, retrieval request, merchant dispute
- **Evidence**: Upload avec deadline tracking
- **Workflow**: open → under_review → won/lost/accepted
- **Network intégration**: Visa/Mastercard case IDs

### Alertes SIRA
- **Anomalies**: Volume inhabituel, taux de chargeback élevé
- **Seuils**: Breach de limites configurées
- **Recommendations**: Suggestions SIRA pour mitigation
- **Severity**: info, warning, critical

### RBAC & Sécurité
- **Rôles**: merchant_admin, merchant_accountant, merchant_support
- **Molam ID JWT**: Authentification RS256
- **2FA**: OTP pour opérations sensibles
- **Audit complet**: Tous les actions loggées avec IP + user_agent
- **mTLS**: Communication inter-services sécurisée

## Architecture

### Backend (Node.js/TypeScript)
```
src/
  routes/
    merchant/
      dashboard.ts          - API endpoints
  services/
    merchantService.ts      - Business logic
    kpiHelpers.ts           - KPI computation
    webhookPublisher.ts     - Event publishing
  workers/
    kpiWorker.ts            - Kafka consumer pour KPIs temps-réel
  utils/
    authz.ts                - Molam ID JWT + RBAC
    i18n.ts                 - Multi-langue (fr, en, ar, wo)
    db.ts                   - PostgreSQL pool
    logger.ts               - Winston logging
```

### Frontend (React/TypeScript)
```
web/src/
  MerchantDashboard.tsx     - Composant principal Apple-like
  components/
    KPICard.tsx             - Cartes métriques
    TransactionTable.tsx    - Table paginée
    PayoutsList.tsx         - Liste versements
```

### Base de Données
- **merchant_dashboards**: Configuration marchands (devise, schedule, locale)
- **merchant_kpis_cache**: KPIs pré-calculés avec TTL
- **refunds**: Remboursements avec approval tracking
- **disputes**: Litiges avec evidence et deadlines
- **merchant_actions_audit**: Audit immutable de toutes actions
- **merchant_alerts**: Alertes SIRA et seuils
- **merchant_webhooks**: Endpoints webhooks marchands
- **mv_merchant_tx_agg**: Materialized view pour agrégats rapides

## API Endpoints

### GET /api/merchant/dashboard/summary
Récupérer KPIs pour une période

**Query Params:**
- `period` - today | yesterday | last_7d | mtd | ytd | custom:YYYY-MM-DD:YYYY-MM-DD
- `currency` - XOF | USD | GHS | NGN | KES

**Response:**
```json
{
  "ok": true,
  "period": "mtd",
  "currency": "XOF",
  "summary": {
    "sales": {
      "value": 15000000,
      "currency": "XOF",
      "usd_equivalent": 25500,
      "txn_count": 450
    },
    "refunds": {
      "value": 500000,
      "currency": "XOF",
      "usd_equivalent": 850,
      "txn_count": 12
    },
    "fees": {
      "value": 450000,
      "currency": "XOF",
      "usd_equivalent": 765
    },
    "net_revenue": {
      "value": 14050000,
      "currency": "XOF",
      "usd_equivalent": 23885
    },
    "avg_ticket": {
      "value": 33333,
      "currency": "XOF"
    },
    "chargeback_rate": {
      "value": 0.44,
      "currency": "%"
    }
  }
}
```

### GET /api/merchant/dashboard/transactions
Liste paginée des transactions

**Query Params:**
- `page` - Numéro de page (défaut: 1)
- `limit` - Transactions par page (défaut: 50, max: 200)
- `status` - succeeded | pending | failed | refunded
- `type` - payment | refund
- `currency` - XOF | USD | etc.
- `channel` - wallet | card | bank_transfer
- `from` - Date début (YYYY-MM-DD)
- `to` - Date fin (YYYY-MM-DD)

**Response:**
```json
{
  "ok": true,
  "page": 1,
  "limit": 50,
  "total": 1234,
  "total_pages": 25,
  "rows": [
    {
      "id": "uuid",
      "type": "payment",
      "amount": 50000,
      "currency": "XOF",
      "fee_molam": 1500,
      "status": "succeeded",
      "reference_code": "REF-ABC123",
      "channel": "wallet",
      "occurred_at": "2025-01-19T10:30:00Z",
      "customer_email": "client@example.com",
      "customer_name": "Jean Dupont"
    }
  ]
}
```

### POST /api/merchant/dashboard/refund
Initier un remboursement

**Auth**: merchant_admin

**Request:**
```json
{
  "transaction_id": "uuid",
  "amount": 50000,
  "reason": "Client request - product not delivered",
  "evidence": [
    "https://s3.amazonaws.com/molam/evidence/receipt-123.pdf"
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "refund": {
    "id": "uuid",
    "transaction_id": "uuid",
    "amount": 50000,
    "currency": "XOF",
    "status": "processing",
    "requires_approval": false,
    "created_at": "2025-01-19T11:00:00Z"
  }
}
```

**Errors:**
- `404 transaction_not_found`
- `400 cannot_refund_non_succeeded_txn`
- `400 refund_amount_exceeds_transaction_amount`
- `500 approval_request_failed` - Si création approbation B136ter échoue

### GET /api/merchant/dashboard/payouts
Liste des versements

**Query Params:**
- `status` - pending | paid | failed
- `page`, `limit`

**Response:**
```json
{
  "ok": true,
  "page": 1,
  "limit": 50,
  "rows": [
    {
      "id": "uuid",
      "amount": 14000000,
      "currency": "XOF",
      "status": "paid",
      "scheduled_date": "2025-01-20",
      "paid_at": "2025-01-20T08:00:00Z",
      "fee": 5000
    }
  ]
}
```

### GET /api/merchant/dashboard/disputes
Liste des litiges

**Response:**
```json
{
  "ok": true,
  "disputes": [
    {
      "id": "uuid",
      "transaction_id": "uuid",
      "type": "chargeback",
      "reason": "Fraudulent transaction",
      "amount": 100000,
      "currency": "XOF",
      "status": "open",
      "evidence_required": true,
      "evidence_deadline": "2025-01-25T23:59:59Z",
      "created_at": "2025-01-19T10:00:00Z"
    }
  ]
}
```

### POST /api/merchant/dashboard/disputes/:id/evidence
Upload preuves pour litige

**Request:**
```json
{
  "evidence_urls": [
    "https://s3.amazonaws.com/molam/evidence/invoice-123.pdf",
    "https://s3.amazonaws.com/molam/evidence/delivery-proof.jpg"
  ]
}
```

### PUT /api/merchant/dashboard/settings/payout-schedule
Modifier planification versements

**Request:**
```json
{
  "schedule": "weekly"
}
```

**Values**: daily | weekly | monthly | instant

### GET /api/merchant/dashboard/alerts
Récupérer alertes actives

**Response:**
```json
{
  "ok": true,
  "alerts": [
    {
      "id": "uuid",
      "alert_type": "unusual_sales_volume",
      "severity": "warning",
      "title": "Volume de ventes inhabituel détecté",
      "description": "Les ventes aujourd'hui (5M XOF) sont 3x supérieures à hier",
      "sira_recommendations": [
        "Vérifier les transactions récentes",
        "Contacter le marchand",
        "Rechercher patterns de fraude"
      ],
      "created_at": "2025-01-19T12:00:00Z"
    }
  ]
}
```

### POST /api/merchant/dashboard/export
Exporter données (CSV ou PDF)

**Request:**
```json
{
  "format": "csv",
  "period": "mtd",
  "type": "transactions"
}
```

**Response:**
```json
{
  "ok": true,
  "export_url": "https://exports.molam.com/merchants/uuid/export-1234567890.csv?signature=xyz",
  "expires_in": 3600
}
```

## Worker Kafka

### Topics Écoutés
- `wallet_txn_created` - Nouvelle transaction
- `wallet_txn_succeeded` - Transaction réussie
- `refund_created` - Remboursement créé
- `payout_created` - Versement créé
- `dispute_created` - Litige créé

### Traitement
1. **Incrémentation KPIs**: Mise à jour atomique de `merchant_kpis_cache`
2. **Détection anomalies**: Si ventes aujourd'hui > 3x hier → créer alerte
3. **Publication webhooks**: Appel endpoints marchands configurés
4. **Refresh MV**: Toutes les 5 minutes, refresh `mv_merchant_tx_agg`

### Exemple Event
```json
{
  "id": "evt-123",
  "type": "wallet_txn_succeeded",
  "merchant_id": "uuid",
  "amount": 50000,
  "currency": "XOF",
  "status": "succeeded",
  "occurred_at": "2025-01-19T10:30:00Z"
}
```

## Webhooks Marchands

### Configuration
Marchands peuvent configurer webhooks via dashboard.

**Events disponibles:**
- `transaction.succeeded`
- `refund.created`
- `payout.paid`
- `dispute.created`
- `merchant.metrics.updated`

### Format Webhook
```json
{
  "id": "webhook-evt-123",
  "event": "transaction.succeeded",
  "created_at": "2025-01-19T10:30:00Z",
  "data": {
    "transaction_id": "uuid",
    "merchant_id": "uuid",
    "amount": 50000,
    "currency": "XOF",
    "reference_code": "REF-ABC123"
  }
}
```

**Headers:**
- `X-Molam-Signature`: HMAC SHA256 du body avec secret marchand
- `X-Molam-Event`: Nom de l'événement

### Vérification Signature
```typescript
const signature = crypto
  .createHmac("sha256", webhookSecret)
  .update(JSON.stringify(body))
  .digest("hex");

if (signature !== req.headers["x-molam-signature"]) {
  throw new Error("Invalid signature");
}
```

## Configuration

**Variables d'environnement:**

```bash
# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/molam_merchant

# Molam ID JWT
MOLAM_ID_JWT_PUBLIC="-----BEGIN PUBLIC KEY-----..."

# Services
RISK_AWARE_APPROVALS_URL=http://risk-aware-approvals:3000
EVENT_BUS_URL=http://event-bus:3000
SERVICE_TOKEN=internal-jwt-token

# Kafka
KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
KAFKA_CLIENT_ID=merchant-dashboard
KAFKA_GROUP_ID=merchant-dashboard-kpi-worker

# Logging
LOG_LEVEL=info
```

## Déploiement

### Build & Push
```bash
docker build -t molam/merchant-dashboard:latest .
docker push molam/merchant-dashboard:latest
```

### Apply K8s Manifests
```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/worker.yaml
```

### Migrations
```bash
psql $DATABASE_URL -f migrations/2025_01_19_create_merchant_dashboard.sql
```

### Vérification
```bash
kubectl get pods -l app=merchant-dashboard-api
kubectl logs -l app=merchant-dashboard-api --tail=100
kubectl get hpa merchant-dashboard-api-hpa
```

## Métriques Prometheus

```
molam_merchant_dashboard_http_request_duration_ms{method, route, status_code}
molam_merchant_kpi_compute_seconds (histogram)
molam_merchant_transactions_query_latency_seconds (histogram)
molam_merchant_refunds_total{merchant_id, status}
```

## Monitoring & Alertes

**Alertes recommandées:**
- API P95 latency > 500ms sur 5 min
- KPI compute time > 2s sur 10 min
- Refund creation failure rate > 5% sur 15 min
- Worker Kafka lag > 10000 messages
- MV refresh failure

**Dashboards Grafana:**
- Top marchands par GMV
- KPIs drift (comparaison périodes)
- Transactions success rate par canal
- Refunds rate trend
- Payouts pending aging

## Tests

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### E2E Tests
```bash
# Seed test merchant
psql $DATABASE_URL -c "INSERT INTO merchants(...) VALUES(...);"

# Create transaction
curl -X POST .../transactions ...

# Wait for worker ingestion
sleep 5

# Check dashboard KPIs
curl /api/merchant/dashboard/summary?period=today

# Verify KPIs match transaction
```

## Sécurité

### RBAC
- **merchant_admin**: Toutes opérations (refunds, settings, export)
- **merchant_accountant**: KPIs, transactions, payouts (read-only)
- **merchant_support**: Transactions, disputes (read + evidence upload)

### 2FA
Configurable par marchand pour:
- Refunds > seuil
- Modification payout schedule
- Export données

### Audit Trail
Toutes actions loggées dans `merchant_actions_audit`:
- User ID, IP, User-Agent
- Action type, resource type, resource ID
- Changes (before/after)
- 2FA verification status
- Approval requirements

### Data Access
- Merchant ne peut accéder qu'à ses propres données
- Middleware vérifie `req.user.merchantId` sur chaque route
- Tests RBAC fuzzing pour éviter leaks

## Runbook

### Merchant onboarding
```sql
-- Create dashboard config
INSERT INTO merchant_dashboards(merchant_id, default_currency, payout_schedule, timezone, locale)
VALUES('merchant-uuid', 'XOF', 'weekly', 'Africa/Abidjan', 'fr');
```

### Recalculer KPIs (si corrupted)
```sql
-- Delete cache
DELETE FROM merchant_kpis_cache WHERE merchant_id = 'uuid';

-- Refresh MV
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_merchant_tx_agg;

-- Next API call will recompute
```

### Debug slow queries
```sql
-- Check MV freshness
SELECT computed_at FROM mv_merchant_tx_agg ORDER BY computed_at DESC LIMIT 1;

-- Check cache hit rate
SELECT
  period,
  COUNT(*) as cached_kpis,
  MAX(computed_at) as last_computed
FROM merchant_kpis_cache
WHERE merchant_id = 'uuid'
GROUP BY period;

-- Analyze transaction query
EXPLAIN ANALYZE
SELECT * FROM wallet_transactions
WHERE merchant_id = 'uuid'
ORDER BY occurred_at DESC
LIMIT 50;
```

## Version

**1.0.0** | Statut: ✅ Production Ready

## Points d'Intégration

- **Molam ID**: Auth JWT RS256 + RBAC
- **B136ter (Risk-Aware Approvals)**: Refunds requiring approval
- **B136bis (Multi-Channel)**: Webhooks pour événements marchands
- **B34/B35 (Treasury)**: Payouts status tracking
- **Event Bus**: Publication `merchant.*` events
- **Kafka**: Ingestion temps-réel pour KPIs
- **SIRA**: Alertes anomalies et recommendations

## Équipe

- **Dev Lead**: Merchant Dashboard Industrial
- **Product**: merchant-product@molam.com
- **Support**: merchant-support@molam.com

## License

Propriétaire Molam Pay © 2025
