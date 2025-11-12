# Brique 62 - Unified Merchant Dashboard

**Complete Dashboard with Wallet, Connect, Subscriptions, Disputes & Real-Time SIRA Widgets**

## Overview

Brique 62 is a **production-ready unified dashboard** that aggregates data from all Molam Connect services and provides merchants with a single pane of glass for:

- **Wallet**: Balances, transfers, pending payouts
- **Connect**: Sales, refunds, transaction volumes
- **Subscriptions**: MRR, ARR, churn rate, active subscriptions
- **Disputes**: Pending disputes, chargebacks, evidence tracking
- **SIRA Widgets**: Real-time fraud alerts, churn predictions, anomaly detection

## Features Delivered

### ✅ Core Dashboard Infrastructure

1. **Widget System** ([src/services/dashboardService.ts](src/services/dashboardService.ts))
   - Customizable widgets per merchant/user
   - Drag-and-drop layout configuration (stored in JSONB)
   - Widget types: balance, transactions, subscriptions, disputes, SIRA tiles
   - Sort order and visibility control

2. **Real-Time Tiles** ([migrations/062_merchant_dashboard.sql](migrations/062_merchant_dashboard.sql))
   - Priority-based alert system (low/normal/high/critical)
   - Automatic expiration
   - Acknowledgement workflow
   - Source tracking (sira, wallet, connect, subscriptions, disputes)

3. **Ops Dashboard Rules** ([src/services/dashboardService.ts](src/services/dashboardService.ts))
   - Configurable business rules and thresholds
   - Scope-based rules (wallet/connect/subscriptions/disputes/all)
   - Rule types: threshold, timeout, escalation, auto_action, suggestion
   - RBAC-protected (ops only)

### ✅ SIRA Integration

**Tiles Aggregator Worker** ([src/workers/tilesAggregator.ts](src/workers/tilesAggregator.ts))

Fetches data from multiple sources and creates real-time tiles:

- **Churn Alerts** - High-risk subscriptions from Brique 61 SIRA
- **Fraud Alerts** - High-risk transactions from Brique 57
- **Balance Summary** - Wallet balances from Brique 50
- **Disputes Summary** - Pending disputes from Brique 58
- **MRR Summary** - Subscription metrics from Brique 61

**Auto-refresh:** Every 1 minute (configurable)

### ✅ API Endpoints

**Dashboard Routes** ([src/routes/dashboardRoutes.ts](src/routes/dashboardRoutes.ts))

- `GET /api/dashboard/:merchantId/widgets` - Get user's widgets
- `POST /api/dashboard/:merchantId/widgets` - Create widget
- `PUT /api/dashboard/widget/:id` - Update widget config
- `DELETE /api/dashboard/widget/:id` - Delete (hide) widget
- `GET /api/dashboard/:merchantId/tiles` - Get real-time tiles
- `POST /api/dashboard/tile/:id/acknowledge` - Acknowledge alert
- `GET /api/dashboard/:merchantId/metrics` - Get metrics summary
- `GET /api/dashboard/ops/rules` - Get ops rules (ops only)
- `POST /api/dashboard/ops/rules` - Create/update rule (ops only)

### ✅ React Dashboard UI

**Dashboard Component** ([web/src/Dashboard.tsx](web/src/Dashboard.tsx))

**Features:**
- Real-time tile display with priority color coding
- Alert acknowledgement workflow
- Responsive grid layout (mobile-friendly)
- Auto-refresh tiles every 60 seconds
- Widget rendering based on type
- Empty state handling

**Tile Types Supported:**
- Churn Risk - Count and highest risk score
- Fraud Alerts - High-risk transaction count
- Balance Summary - Multi-currency wallet balances
- Disputes Pending - Count and total amount
- Subscriptions MRR - MRR, ARR, active count, churn rate

### ✅ RBAC (Role-Based Access Control)

**Supported Roles:**
- `merchant_admin` - Full dashboard access
- `merchant_finance` - Balance, payouts, financial widgets
- `merchant_support` - Disputes, refunds, customer issues
- `billing_ops` - All data + ops rules management

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   MOLAM CONNECT - BRIQUE 62                      │
│                  Unified Merchant Dashboard                      │
└─────────────────────────────────────────────────────────────────┘

External Services:
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Wallet (B50) │ │ Connect(B55) │ │ Disputes(B58)│ │  SIRA (B61)  │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │                │
       └────────────────┴────────────────┴────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Tiles Aggregator     │
                    │  Worker (TS)          │
                    │  • Polls services     │
                    │  • Creates tiles      │
                    │  • Prioritizes alerts │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  PostgreSQL           │
                    │  • dashboard_tiles    │
                    │  • dashboard_widgets  │
                    │  • ops_rules          │
                    └───────────┬───────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
        ┌────────────────────┐  ┌────────────────────┐
        │  Node.js API       │  │  React Dashboard   │
        │  (Express)         │  │  (UI)              │
        │  • RBAC            │  │  • Real-time tiles │
        │  • Widget CRUD     │  │  • Acknowledgment  │
        │  • Tile delivery   │  │  • Auto-refresh    │
        └────────────────────┘  └────────────────────┘
```

## Database Schema

### dashboard_widgets
User-customizable widgets with layout configuration:
- `merchant_id`, `user_id`, `widget_type`
- `config` (JSONB) - Position, filters, size, preferences
- `is_visible`, `sort_order`

### dashboard_tiles_cache
Real-time alerts from all services:
- `merchant_id`, `tile_type`, `priority`
- `payload` (JSONB) - Tile content and metadata
- `source` - Origin service (sira, wallet, connect, etc.)
- `acknowledged`, `expires_at`

### ops_dashboard_rules
Business rules configured by ops:
- `rule_name`, `scope`, `rule_type`
- `params` (JSONB) - Rule-specific thresholds
- `active` - Enable/disable flag

### dashboard_action_log
Audit trail of user interactions:
- `merchant_id`, `user_id`, `action_type`
- `entity_type`, `entity_id`, `details`

### dashboard_metrics_summary
Pre-aggregated daily metrics:
- `merchant_id`, `metric_date`
- `metrics` (JSONB) - MRR, balance, disputes, etc.

## Setup & Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
NODE_ENV=development
PORT=8062
DATABASE_URL=postgresql://user:password@localhost:5432/molam

# External APIs
WALLET_API_URL=http://localhost:8050
CONNECT_API_URL=http://localhost:8055
SUBSCRIPTIONS_API_URL=http://localhost:8060
DISPUTES_API_URL=http://localhost:8058
SIRA_API_URL=http://localhost:8061

# Dashboard Configuration
TILES_REFRESH_INTERVAL_MS=60000       # 1 minute
DASHBOARD_CACHE_TTL_MS=300000         # 5 minutes
```

### 3. Run Migrations

```bash
psql $DATABASE_URL -f migrations/062_merchant_dashboard.sql
```

### 4. Build

```bash
npm run build
```

## Usage

### Start Dashboard API

```bash
npm start
# or for development with auto-reload:
npm run dev
```

### Start Tiles Aggregator Worker

```bash
npm run worker:tiles
```

### Start React UI (Development)

```bash
npm run web:dev
```

## API Examples

### Get Widgets

```bash
curl http://localhost:8062/api/dashboard/merchant-123/widgets \
  -H "Authorization: Bearer YOUR_JWT"
```

**Response:**
```json
[
  {
    "id": "widget-uuid",
    "merchant_id": "merchant-123",
    "user_id": "user-123",
    "widget_type": "balance",
    "config": {
      "position": {"x": 0, "y": 0},
      "size": {"w": 4, "h": 2},
      "currency": "USD"
    },
    "is_visible": true,
    "sort_order": 0
  }
]
```

### Get Real-Time Tiles

```bash
curl http://localhost:8062/api/dashboard/merchant-123/tiles \
  -H "Authorization: Bearer YOUR_JWT"
```

**Response:**
```json
[
  {
    "id": "tile-uuid",
    "merchant_id": "merchant-123",
    "tile_type": "churn_risk",
    "priority": "high",
    "payload": {
      "count": 5,
      "highest_risk": 85.3,
      "predictions": [...]
    },
    "computed_at": "2025-11-06T10:00:00Z",
    "source": "sira",
    "acknowledged": false
  },
  {
    "id": "tile-uuid-2",
    "tile_type": "fraud_alerts",
    "priority": "critical",
    "payload": {
      "count": 3,
      "message": "3 high-risk transactions detected"
    },
    "source": "sira",
    "acknowledged": false
  }
]
```

### Acknowledge Tile

```bash
curl -X POST http://localhost:8062/api/dashboard/tile/tile-uuid/acknowledge \
  -H "Authorization: Bearer YOUR_JWT"
```

### Create Ops Rule

```bash
curl -X POST http://localhost:8062/api/dashboard/ops/rules \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "rule_name": "high_churn_threshold",
    "scope": "subscriptions",
    "rule_type": "threshold",
    "params": {
      "churn_rate_threshold": 10.0,
      "alert_priority": "high"
    },
    "active": true
  }'
```

## Tile Priority System

Tiles are displayed in priority order:

| Priority | Color | Use Case |
|----------|-------|----------|
| `critical` | Red | Fraud detected, account suspended, critical errors |
| `high` | Orange | High churn risk, pending disputes, failed payments |
| `normal` | Blue | Daily summaries, routine notifications |
| `low` | Gray | Informational messages |

## RBAC Authorization Matrix

| Role | View Tiles | Acknowledge | Manage Widgets | Manage Rules |
|------|-----------|-------------|----------------|--------------|
| `merchant_admin` | ✅ | ✅ | ✅ | ❌ |
| `merchant_finance` | ✅ (financial only) | ✅ | ❌ | ❌ |
| `merchant_support` | ✅ (disputes only) | ✅ | ❌ | ❌ |
| `billing_ops` | ✅ (all) | ✅ | ✅ | ✅ |

## Monitoring & Observability

### Health Check

```bash
curl http://localhost:8062/health
```

### Metrics

```bash
curl http://localhost:8062/metrics
```

### Database Queries

**Check tile distribution by priority:**
```sql
SELECT priority, COUNT(*) as count
FROM dashboard_tiles_cache
WHERE acknowledged = false
GROUP BY priority;
```

**Check unacknowledged tiles per merchant:**
```sql
SELECT merchant_id, COUNT(*) as unack_count
FROM dashboard_tiles_cache
WHERE acknowledged = false
GROUP BY merchant_id
ORDER BY unack_count DESC;
```

**Audit trail of tile acknowledgements:**
```sql
SELECT * FROM dashboard_action_log
WHERE action_type = 'acknowledge_tile'
ORDER BY created_at DESC
LIMIT 20;
```

## Performance Targets

- **API Response Time**: P95 < 200ms
- **Tiles Refresh**: Every 60 seconds
- **Widget Load**: < 100ms
- **Tile Aggregation**: < 5 seconds per cycle

## Integration with Other Briques

### Brique 50 (Wallet)
- Fetches balance summaries
- Displays pending payouts
- Shows transaction volumes

### Brique 55 (Connect)
- Sales summaries
- Refund statistics
- Transaction trends

### Brique 58 (Disputes)
- Pending dispute count
- Total disputed amounts
- Evidence deadline alerts

### Brique 60 (Subscriptions)
- Active subscription count
- Failed payment alerts
- Plan change notifications

### Brique 61 (SIRA Analytics)
- Churn predictions
- Fraud alerts
- Risk scoring
- MRR/ARR metrics

## Troubleshooting

### Tiles Not Appearing

**Issue:** No tiles showing in dashboard

**Solution:**
1. Check tiles aggregator worker is running: `npm run worker:tiles`
2. Verify external services are accessible (SIRA, Wallet, etc.)
3. Check logs for aggregation errors

```bash
# Check recent tiles
SELECT * FROM dashboard_tiles_cache ORDER BY computed_at DESC LIMIT 10;
```

### Widget Configuration Not Saving

**Issue:** Widget config changes not persisted

**Solution:**
1. Ensure user has correct role (`merchant_admin`)
2. Check database connection
3. Verify JSONB config format is valid

### High Priority Tiles Overwhelming Dashboard

**Issue:** Too many critical alerts

**Solution:**
1. Adjust alert thresholds in ops rules
2. Increase tile expiration time
3. Auto-acknowledge low-priority tiles after 24h

```sql
-- Auto-acknowledge old low-priority tiles
UPDATE dashboard_tiles_cache
SET acknowledged = true, acknowledged_by = 'system'
WHERE priority = 'low' AND computed_at < NOW() - INTERVAL '24 hours';
```

## Security Considerations

### Authentication & Authorization
- All endpoints require valid JWT
- RBAC enforced at route level
- User can only see their own widgets
- Ops rules require `billing_ops` role

### Data Privacy
- Tiles contain aggregated data only
- No PII in tile payloads
- Audit logs for all user actions

### Rate Limiting
- Tiles endpoint: 100 req/min per user
- Widget CRUD: 50 req/min per user

## Future Enhancements

- [ ] WebSocket support for real-time tile push
- [ ] Advanced widget library (charts, graphs, tables)
- [ ] Custom widget creation by merchants
- [ ] Dashboard templates and presets
- [ ] Email/SMS notifications for critical tiles
- [ ] Mobile app support
- [ ] Multi-language support (i18n)
- [ ] Dark mode theme
- [ ] Export dashboard to PDF/Excel

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
npm run test:integration
```

### Load Testing

```bash
# Simulate 100 concurrent users
npm run test:load
```

## Build Status

**✅ 0 TypeScript compilation errors**
**✅ All dependencies installed**
**✅ SQL migrations complete**

---

**Port:** 8062 (Dashboard API)

**Dependencies:** PostgreSQL, Brique 50 (Wallet), Brique 55 (Connect), Brique 58 (Disputes), Brique 60 (Subscriptions), Brique 61 (SIRA)

**UI Framework:** React 18+ with Tailwind CSS

Built with ❤️ for Molam Connect
