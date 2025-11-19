# Brique 116 — Charge Routing Logs (Debugging & SIRA Learning)

Système de logging détaillé des tentatives de routing de paiements pour debugging Ops et apprentissage automatique Sira.

## Objectif

**Traçabilité complète des paiements** : Logger chaque tentative de paiement routée par Molam Form (Wallet, Carte, Banque, rails locaux) pour :

- **Debug Ops** : Analyse rapide des échecs, latences, et problèmes de routing
- **Optimisation Sira** : Apprentissage automatique pour choisir le meilleur rail (coût, succès, rapidité)
- **Interop Molam ID** : Logs multi-pays, multi-langues, multi-devises avec RBAC
- **Compatible** : Wallet + Connect

### Garanties

- ✅ Logging non-bloquant (performance)
- ✅ Statistiques temps réel par route
- ✅ Détection automatique d'anomalies (spike failures, latence)
- ✅ Recommandations Sira pour optimisation
- ✅ Support multi-devises (USD, EUR, XOF, etc.)
- ✅ Vues SQL optimisées pour analytics rapide

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│               Payment Routing Flow                           │
├──────────────────────────────────────────────────────────────┤
│  1. Merchant initiates payment                               │
│  2. Select route (VISA_US, MTN_SN, SEPA_FR, etc.)           │
│  3. Measure latency START                                    │
│  4. Attempt payment via selected route                       │
│  5. Success OR Failure                                       │
│  6. Measure latency END                                      │
│  7. LOG to charge_routing_logs (non-blocking)                │
│  8. Fallback to alternate route if needed                    │
│                                                              │
│  [Background] Sira analyzes logs                             │
│     └─ Detect anomalies (failures, latency spikes)          │
│     └─ Generate recommendations (prioritize/disable routes)  │
└──────────────────────────────────────────────────────────────┘
```

## Database Schema

### Main Table

```sql
CREATE TABLE charge_routing_logs (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  user_id UUID,
  method TEXT NOT NULL,              -- 'wallet' | 'card' | 'bank'
  route TEXT NOT NULL,               -- 'VISA_US', 'MTN_SN', 'SEPA_FR'
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,            -- ISO 4217
  status TEXT NOT NULL,              -- 'success' | 'failed' | 'retried'
  latency_ms INT,
  error_code TEXT,
  fallback_route TEXT,
  country_code TEXT,
  provider TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Key Views

**v_routing_stats_by_route** - Performance statistics per route
```sql
SELECT * FROM v_routing_stats_by_route
WHERE merchant_id = 'merchant-123'
ORDER BY total_attempts DESC;
```

**v_failing_routes** - Routes with >10% failure rate (last 24h)
```sql
SELECT * FROM v_failing_routes;
```

**v_slow_routes** - Routes with p95 latency >2000ms (last 24h)
```sql
SELECT * FROM v_slow_routes;
```

### Key Functions

**get_route_recommendations()** - Sira recommendations
```sql
SELECT * FROM get_route_recommendations('merchant-123', 'card');
-- Returns: route, recommendation ('disable' | 'monitor' | 'optimize_latency' | 'prioritize'), reason, metrics
```

**detect_routing_anomalies()** - Real-time anomaly detection
```sql
SELECT * FROM detect_routing_anomalies();
-- Returns: merchant_id, route, anomaly_type ('failure_spike' | 'latency_spike'), current_value, threshold
```

## API Endpoints

### POST /api/charges/routing-log
Log a payment routing attempt

**Request:**
```json
{
  "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
  "merchant_id": "merchant-123",
  "user_id": "user-456",
  "method": "wallet",
  "route": "MTN_SN",
  "amount": 50.00,
  "currency": "XOF",
  "status": "success",
  "latency_ms": 450,
  "country_code": "SN",
  "provider": "MTN_Mobile_Money"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Routing logged successfully"
}
```

### GET /api/charges/routing-stats/:merchantId
Get routing statistics for a merchant

**Query Parameters:**
- `method` - Filter by payment method (wallet/card/bank)
- `days` - Time period in days (default: 7)

**Response:**
```json
{
  "merchant_id": "merchant-123",
  "period_days": 7,
  "stats": [
    {
      "route": "VISA_US",
      "method": "card",
      "total": 1250,
      "success": 1210,
      "failed": 40,
      "success_rate": 96.80,
      "avg_latency": 485.23,
      "p95_latency": 850.00,
      "total_volume": 125000.00,
      "currency": "USD"
    }
  ]
}
```

### GET /api/charges/routing-recommendations/:merchantId
Get Sira recommendations for route optimization

**Response:**
```json
{
  "merchant_id": "merchant-123",
  "recommendations": [
    {
      "route": "SLOW_PROVIDER",
      "recommendation": "disable",
      "reason": "Taux d'échec critique (25%)",
      "metrics": {
        "total_attempts": 100,
        "success_rate_pct": 75.00,
        "avg_latency_ms": 3200,
        "p95_latency_ms": 5000
      }
    },
    {
      "route": "VISA_OPTIMIZED",
      "recommendation": "prioritize",
      "reason": "Performance excellente",
      "metrics": {
        "total_attempts": 5000,
        "success_rate_pct": 98.50,
        "avg_latency_ms": 350,
        "p95_latency_ms": 600
      }
    }
  ]
}
```

### GET /api/charges/routing-anomalies
Detect real-time routing anomalies (Sira monitoring)

**Response:**
```json
{
  "anomalies": [
    {
      "merchant_id": "merchant-456",
      "route": "MTN_CI",
      "anomaly_type": "failure_spike",
      "current_value": 22.50,
      "threshold": 15.00,
      "detected_at": "2025-01-19T10:30:00Z"
    }
  ]
}
```

### GET /api/charges/failing-routes
Get routes with high failure rate

### GET /api/charges/slow-routes
Get routes with high latency

### GET /api/charges/routing-history
Get historical routing logs with filters

### GET /api/charges/routing-overview
Get comprehensive overview of routing performance

## PHP Integration (WooCommerce)

### Include the Logger

```php
<?php
// molam-form.php
require_once __DIR__ . '/includes/molam-routing-logger.php';
```

### Log Successful Routing

```php
<?php
use Molam_Routing_Logger;

$transaction_id = '550e8400-e29b-41d4-a716-446655440000';
$route = 'VISA_US';
$amount = 100.50;
$currency = 'USD';
$latency_ms = 450;

Molam_Routing_Logger::log_success(
    $transaction_id,
    $route,
    $amount,
    $currency,
    $latency_ms
);
```

### Log Failed Routing with Fallback

```php
<?php
$transaction_id = '660e8400-e29b-41d4-a716-446655440001';

// Primary route fails
Molam_Routing_Logger::log_failure(
    $transaction_id,
    'MTN_SN',       // Failed route
    50.00,
    'XOF',
    'INSUFFICIENT_BALANCE',  // Error code
    1200,           // Latency
    'ORANGE_SN'     // Fallback route used
);

// Fallback succeeds
Molam_Routing_Logger::log_success(
    $transaction_id,
    'ORANGE_SN',
    50.00,
    'XOF',
    800
);
```

### Measure and Log Automatically

```php
<?php
$result = Molam_Routing_Logger::measure_routing(
    function() use ($payment_data) {
        // Your payment processing code
        return process_payment_via_route($payment_data);
    },
    $transaction_id,
    $route,
    $amount,
    $currency
);

// Automatically logs success/failure with latency measurement
```

### Helper Function

```php
<?php
// Simple helper
molam_log_routing(
    $transaction_id,
    'SEPA_FR',
    200.00,
    'EUR',
    'success',
    [
        'latency_ms' => 650,
        'country_code' => 'FR',
        'provider' => 'Stripe'
    ]
);
```

## React Dashboard

### Access

```
http://localhost:3000/ops/routing-logs
```

### Features

- **Anomaly Alerts** - Real-time detection of failures and latency spikes
- **Sira Recommendations** - AI-powered route optimization suggestions
- **Performance Table** - Success rate, latency (avg/p95), volume per route
- **Method Filter** - Filter by wallet/card/bank
- **Auto-refresh** - Updates every 30 seconds

## Example Scenarios

### Scenario 1: Successful Card Payment

```javascript
// Log via API
await fetch('/api/charges/routing-log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-User-Role': 'plugin_client' },
  body: JSON.stringify({
    transaction_id: '550e8400-e29b-41d4-a716-446655440000',
    merchant_id: 'merchant-001',
    user_id: 'user-123',
    method: 'card',
    route: 'VISA_US',
    amount: 100.50,
    currency: 'USD',
    status: 'success',
    latency_ms: 450
  })
});
```

### Scenario 2: Wallet Payment with Fallback

```javascript
// Primary fails
await logRouting({
  transaction_id: 'tx-001',
  route: 'MTN_SN',
  method: 'wallet',
  amount: 50.00,
  currency: 'XOF',
  status: 'failed',
  error_code: 'INSUFFICIENT_BALANCE',
  latency_ms: 1200
});

// Fallback succeeds
await logRouting({
  transaction_id: 'tx-001',
  route: 'ORANGE_SN',
  method: 'wallet',
  amount: 50.00,
  currency: 'XOF',
  status: 'success',
  latency_ms: 800,
  fallback_route: 'MTN_SN'
});
```

### Scenario 3: Sira Detects Anomaly

```sql
-- Sira monitoring detects failure spike
SELECT * FROM detect_routing_anomalies();

-- Result:
-- merchant_id   | route    | anomaly_type    | current_value | threshold
-- merchant-123  | MTN_CI   | failure_spike   | 22.50         | 15.00

-- Sira automatically recommends action
SELECT * FROM get_route_recommendations('merchant-123', NULL);

-- Result:
-- route  | recommendation | reason
-- MTN_CI | monitor        | Taux d'échec élevé (22.5%)
```

## Sira Integration

### Automatic Monitoring

Sira runs continuous analysis:

```bash
# Cron job every 5 minutes
*/5 * * * * curl -X GET https://api.molam.com/api/charges/routing-anomalies \
  -H "X-User-Role: sira_ai"
```

### Learning Process

1. **Data Collection** - All routing attempts logged in real-time
2. **Pattern Recognition** - Analyze success rates, latency patterns, error types
3. **Recommendation Generation** - Suggest route prioritization, disabling failing routes
4. **Continuous Improvement** - Learn from outcomes, adjust recommendations

### Optimization Actions

**Sira can automatically:**
- Suggest disabling routes with >20% failure rate
- Recommend latency optimization for slow routes (>3s p95)
- Prioritize high-performing routes (>95% success, <1s avg latency)
- Detect regional issues (geo-specific failures)

## Deployment

### 1. Run Database Migration

```bash
psql -d molam -f brique-116/migrations/001_charge_routing_logs.sql
```

### 2. Configure API Routes

```javascript
// server.js
const { router: routingRouter, setPool } = require('./brique-116/src/routes/routing');
setPool(pool);
app.use('/api/charges', routingRouter);
```

### 3. Deploy PHP Logger

```bash
cp brique-116/plugins/woocommerce/molam-routing-logger.php \
   /var/www/html/wp-content/plugins/molam-form/includes/

# Include in main plugin
# molam-form.php:
require_once __DIR__ . '/includes/molam-routing-logger.php';
```

### 4. Configure API Credentials

```php
// wp-config.php or plugin settings
define('MOLAM_API_URL', 'https://api.molam.com');
update_option('molam_api_key', 'your-api-key');
update_option('molam_merchant_id', 'merchant-123');
```

### 5. Deploy React Dashboard

```bash
cd brique-116/src/components
npm run build

# Serve dashboard
# server.js:
app.use('/ops/routing-logs', express.static('brique-116/dist'));
```

## Monitoring & Alerts

### Key Metrics

- **Total Routing Attempts**: All logged payments
- **Success Rate by Route**: Target >95%
- **Average Latency**: Target <1000ms
- **P95 Latency**: Target <2000ms
- **Failure Spikes**: Alert if >15% in 15 minutes

### Alert Rules

```yaml
# Prometheus Alerts
- alert: HighRoutingFailureRate
  expr: |
    (sum(routing_failures_1h) / sum(routing_total_1h)) > 0.15
  for: 10m
  labels:
    severity: warning

- alert: RoutingLatencySpike
  expr: |
    routing_p95_latency_ms > 2000
  for: 15m
  labels:
    severity: warning

- alert: RouteCompletelyDown
  expr: |
    (sum(routing_failures_5m) / sum(routing_total_5m)) > 0.50
  for: 5m
  labels:
    severity: critical
```

## Troubleshooting

### High Failure Rate on Specific Route

```sql
-- Identify the problem
SELECT * FROM v_failing_routes WHERE route = 'MTN_SN';

-- Check error codes
SELECT error_code, COUNT(*) as count
FROM charge_routing_logs
WHERE route = 'MTN_SN' AND status = 'failed'
  AND created_at >= now() - INTERVAL '24 hours'
GROUP BY error_code
ORDER BY count DESC;

-- Action: Disable route or contact provider
```

### High Latency Issues

```sql
-- Identify slow routes
SELECT * FROM v_slow_routes WHERE p95_latency_ms > 3000;

-- Check latency distribution
SELECT
  route,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) as p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99
FROM charge_routing_logs
WHERE route = 'SEPA_FR'
  AND created_at >= now() - INTERVAL '24 hours'
GROUP BY route;
```

### Missing Logs

```php
// Check PHP logger configuration
var_dump(get_option('molam_api_key'));  // Should not be empty
var_dump(get_option('molam_merchant_id'));

// Test logging manually
Molam_Routing_Logger::log_success('test-tx', 'TEST_ROUTE', 10.00, 'USD', 100);

// Check server logs
tail -f /var/log/apache2/error.log | grep "Molam Routing Logger"
```

---

# Sous-Brique 116bis — Smart Auto-Routing by Sira

Extension de 116 pour décisions automatiques de routing par Sira en temps réel.

## Objectif

**Routing automatique intelligent** : Sira choisit automatiquement le meilleur rail de paiement sans intervention Ops, basé sur l'historique de performance.

### Garanties Additionnelles (116bis)

- ✅ Décision automatique en <100ms
- ✅ Scoring multi-critères (succès, latence, coût)
- ✅ Confidence score pour chaque décision
- ✅ Fallback automatique
- ✅ Override manuel par Ops
- ✅ Analyse de précision de Sira

## Schema Extension

```sql
CREATE TABLE routing_decisions (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  candidate_routes JSONB NOT NULL,    -- {"VISA_US": 0.92, "MTN_SN": 0.87}
  chosen_route TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL,   -- 0-1
  fallback_route TEXT,
  sira_version TEXT NOT NULL,
  override_by TEXT,                   -- Ops override
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## API Endpoints (116bis)

### POST /api/charges/auto-route
Get Sira's automatic routing decision

**Request:**
```json
{
  "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
  "merchant_id": "merchant-123",
  "method": "card",
  "amount": 100.00,
  "currency": "USD"
}
```

**Response:**
```json
{
  "route": "VISA_US",
  "confidence": 0.92,
  "fallback": "MASTERCARD_US",
  "candidates": {
    "VISA_US": 0.92,
    "MASTERCARD_US": 0.88,
    "AMEX_US": 0.75
  },
  "sira_version": "v2.1"
}
```

### GET /api/routing/decisions/:merchantId
Get routing decisions history

### GET /api/routing/sira-performance
Get Sira accuracy metrics

### POST /api/routing/decisions/:id/override
Override Sira decision manually (Ops)

## PHP Integration (116bis)

### Get Auto-Route Decision

```php
<?php
// Get Sira's automatic routing decision
$decision = Molam_Routing_Logger::get_auto_route(
    $transaction_id,
    100.00,
    'USD',
    'card'
);

if ($decision['success']) {
    $route = $decision['route'];
    $confidence = $decision['confidence'];
    $fallback = $decision['fallback'];

    echo "Sira recommends: {$route} (confidence: " . ($confidence * 100) . "%)";

    // Process payment with recommended route
    $result = process_payment($transaction_id, $route, $amount);

    // If fails, try fallback
    if (!$result['success'] && $fallback) {
        $result = process_payment($transaction_id, $fallback, $amount);
    }
}
```

### Helper Function

```php
<?php
$decision = molam_get_auto_route($transaction_id, 100.00, 'USD', 'card');
```

## React Dashboard (116bis)

### Access

```
http://localhost:3000/ops/auto-routing
```

### Features

- **Sira Performance Metrics** - Accuracy, confidence, total decisions
- **Decisions History** - All auto-routing decisions with results
- **Correctness Tracking** - Was Sira right? (vs actual outcome)
- **Override Tracking** - Manual overrides by Ops

## Example: Complete Auto-Routing Flow

```php
<?php
// Step 1: Get Sira's recommendation
$decision = molam_get_auto_route($tx_id, 50.00, 'XOF', 'wallet');

if (!$decision['success']) {
    // Fallback to default route
    $route = 'MTN_SN';
} else {
    $route = $decision['route'];
    echo "Sira suggests: {$route} with {$decision['confidence']}% confidence\n";
}

// Step 2: Process payment with recommended route
$start = microtime(true);
try {
    $result = process_payment_via_route($tx_id, $route, 50.00, 'XOF');
    $latency = (microtime(true) - $start) * 1000;

    // Step 3: Log result (116)
    if ($result['success']) {
        Molam_Routing_Logger::log_success($tx_id, $route, 50.00, 'XOF', $latency);
    } else {
        // Try fallback
        if ($decision['fallback']) {
            $result = process_payment_via_route($tx_id, $decision['fallback'], 50.00, 'XOF');
        }
        Molam_Routing_Logger::log_failure($tx_id, $route, 50.00, 'XOF', $result['error'], $latency, $decision['fallback']);
    }
} catch (Exception $e) {
    error_log("Payment failed: " . $e->getMessage());
}
```

## Sira Scoring Algorithm

```sql
-- Simplified scoring formula
SELECT
  route,
  -- 60% success rate
  (AVG(CASE WHEN status = 'success' THEN 1.0 ELSE 0.0 END) * 0.6) +
  -- 30% speed (inverse latency)
  ((1000.0 / (AVG(latency_ms) + 1)) * 0.3) +
  -- 10% recency bonus
  (EXTRACT(EPOCH FROM (now() - MAX(created_at))) / 86400.0 * 0.1)
  as score
FROM charge_routing_logs
WHERE merchant_id = 'merchant-123'
  AND method = 'card'
  AND currency = 'USD'
GROUP BY route
ORDER BY score DESC;
```

## Sira Performance Analysis

```sql
-- Check Sira accuracy
SELECT * FROM analyze_sira_accuracy('v2.1');

-- Result:
-- sira_version | total_decisions | correct | accuracy_pct | avg_confidence
-- v2.1         | 5000           | 4650    | 93.00        | 87.50

-- Decisions with high confidence (>80%)
SELECT * FROM v_routing_decisions_with_results
WHERE confidence > 0.8
  AND was_correct IS NOT NULL
ORDER BY created_at DESC;
```

## Deployment (116bis)

```bash
# 1. Run migration
psql -d molam -f brique-116/migrations/002_smart_auto_routing.sql

# 2. API already extended in routing.js

# 3. PHP helper already in molam-routing-logger.php

# 4. Deploy React UI
cd brique-116/src/components
npm run build
```

---

# Sous-Brique 116ter: Predictive Routing Simulator (Sira)

**Extension de 116bis pour simuler le routing avant exécution réelle**

## Concept

Permet de **prévisualiser** les résultats de chaque route disponible **avant** d'exécuter le paiement:
- **Évite les échecs** en identifiant les routes à risque
- **Compare les options** (success rate, latency, fees)
- **Aide à la décision** pour Ops et marchands
- **Valide les prédictions** de Sira avec les résultats réels

## Database Schema

### Table: `routing_simulations`

```sql
CREATE TABLE routing_simulations (
  id BIGSERIAL PRIMARY KEY,
  simulation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  method TEXT NOT NULL,                    -- 'wallet' | 'card' | 'bank'
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  simulated_routes JSONB NOT NULL,         -- Prédictions pour chaque route
  chosen_route TEXT,                       -- Route finalement exécutée
  actual_outcome TEXT,                     -- 'success' | 'failed'
  was_prediction_correct BOOLEAN,          -- Précision de Sira
  sira_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  executed_at TIMESTAMPTZ
);
```

### Prédictions par Route (JSONB)

```json
{
  "VISA_US": {
    "predicted_success_rate_pct": 95.5,
    "predicted_latency_ms": 1200,
    "predicted_fees_usd": 2.95,
    "confidence": 0.92,
    "risk_level": "low",
    "recommendation": "recommended"
  },
  "MTN_SN": {
    "predicted_success_rate_pct": 87.0,
    "predicted_latency_ms": 2500,
    "predicted_fees_usd": 1.00,
    "confidence": 0.78,
    "risk_level": "medium",
    "recommendation": "acceptable"
  },
  "SEPA_FR": {
    "predicted_success_rate_pct": 65.0,
    "predicted_latency_ms": 5000,
    "predicted_fees_usd": 0.50,
    "confidence": 0.45,
    "risk_level": "high",
    "recommendation": "caution"
  }
}
```

## API Endpoints

### POST `/api/charges/simulate-routing`
Simule les résultats pour toutes les routes disponibles.

**Request:**
```json
{
  "merchant_id": "merchant-uuid",
  "user_id": "user-uuid",
  "method": "card",
  "amount": 100.00,
  "currency": "USD",
  "country_code": "US"
}
```

**Response:**
```json
{
  "simulation_id": "sim-uuid-123",
  "merchant_id": "merchant-uuid",
  "method": "card",
  "amount": 100.00,
  "currency": "USD",
  "simulated_at": "2025-01-19T10:30:00Z",
  "sira_version": "v2.1-simulator",
  "routes": {
    "VISA_US": {
      "predicted_success_rate_pct": 95.5,
      "predicted_latency_ms": 1200,
      "predicted_fees_usd": 2.95,
      "confidence": 0.92,
      "risk_level": "low",
      "recommendation": "recommended"
    },
    "MASTERCARD_US": { /* ... */ }
  },
  "recommendation": {
    "route": "VISA_US",
    "predicted_success_rate_pct": 95.5,
    "predicted_latency_ms": 1200,
    "predicted_fees_usd": 2.95,
    "risk_level": "low",
    "confidence": 0.92
  }
}
```

### POST `/api/routing/simulations/:simulationId/execute`
Enregistre le résultat réel après exécution.

**Request:**
```json
{
  "chosen_route": "VISA_US",
  "actual_outcome": "success"
}
```

**Response:**
```json
{
  "ok": true,
  "simulation_id": "sim-uuid-123",
  "chosen_route": "VISA_US",
  "actual_outcome": "success",
  "was_prediction_correct": true
}
```

### GET `/api/routing/simulations/:merchantId`
Historique des simulations pour un marchand.

### GET `/api/routing/simulation-accuracy`
Métriques de précision des prédictions de Sira.

**Response:**
```json
{
  "overall_accuracy": [
    {
      "sira_version": "v2.1-simulator",
      "total_simulations": 1000,
      "executed_simulations": 850,
      "correct_predictions": 782,
      "accuracy_pct": 92.00,
      "avg_preview_duration_sec": 45.5
    }
  ],
  "accuracy_by_route": [
    {
      "chosen_route": "VISA_US",
      "total_predictions": 250,
      "correct_predictions": 235,
      "accuracy_pct": 94.00,
      "avg_predicted_success_pct": 93.5,
      "avg_actual_success_pct": 95.0
    }
  ]
}
```

## PHP Integration

### Simulate Before Payment

```php
<?php
// Step 1: Run simulation to preview all routes
$simulation = molam_simulate_routing(100.00, 'USD', 'card', 'US');

if (!$simulation['success']) {
    // Handle error - fallback to default route
    $route = 'VISA_US';
} else {
    echo "Simulation ID: {$simulation['simulation_id']}\n";

    // Display all route options to user/ops
    foreach ($simulation['routes'] as $route_name => $route_data) {
        echo "{$route_name}: ";
        echo "{$route_data['predicted_success_rate_pct']}% success, ";
        echo "{$route_data['predicted_latency_ms']}ms, ";
        echo "\${$route_data['predicted_fees_usd']} fees ";
        echo "({$route_data['risk_level']} risk)\n";
    }

    // Use recommended route
    $route = $simulation['recommendation']['route'];
    echo "\nRecommended: {$route}\n";
}

// Step 2: Execute payment with chosen route
$tx_id = wp_generate_uuid4();
$result = process_payment_via_route($tx_id, $route, 100.00, 'USD');

// Step 3: Record actual outcome to validate Sira's prediction
$outcome = $result['success'] ? 'success' : 'failed';
molam_record_simulation_outcome(
    $simulation['simulation_id'],
    $route,
    $outcome
);

// This allows Sira to learn: was the prediction accurate?
```

### Compare Routes Before Decision

```php
<?php
// For high-value transactions, compare options
$simulation = molam_simulate_routing(10000.00, 'EUR', 'bank', 'FR');

$routes = $simulation['routes'];

// Filter by low risk only
$safe_routes = array_filter($routes, function($route_data) {
    return $route_data['risk_level'] === 'low' &&
           $route_data['predicted_success_rate_pct'] >= 95.0;
});

// Among safe routes, find cheapest
usort($safe_routes, function($a, $b) {
    return $a['predicted_fees_usd'] <=> $b['predicted_fees_usd'];
});

$best_route = array_key_first($safe_routes);
echo "Best route for €10k: {$best_route}\n";
```

## SQL Functions

### `simulate_routing()`
Calcule les prédictions pour toutes les routes disponibles.

```sql
SELECT * FROM simulate_routing(
  'merchant-uuid',
  'card',
  100.00,
  'USD',
  'US'
)
ORDER BY predicted_success_rate_pct DESC;
```

**Result:**
| route | predicted_success_rate_pct | predicted_latency_ms | predicted_fees_usd | confidence | risk_level | recommendation |
|-------|---------------------------|---------------------|-------------------|-----------|-----------|---------------|
| VISA_US | 95.50 | 1200 | 2.95 | 0.92 | low | recommended |
| MASTERCARD_US | 93.00 | 1350 | 3.10 | 0.88 | low | recommended |
| AMEX_US | 78.00 | 2200 | 3.50 | 0.65 | medium | acceptable |

### `record_simulation_outcome()`
Enregistre le résultat réel pour validation.

```sql
SELECT record_simulation_outcome(
  'sim-uuid-123',
  'VISA_US',
  'success'
) as was_correct;
-- Returns: true (if success rate was >80%)
```

### `analyze_simulation_accuracy()`
Analyse la précision des prédictions.

```sql
SELECT * FROM analyze_simulation_accuracy('v2.1-simulator', 30);
```

## React UI Component

```tsx
import RoutingSimulator from './components/RoutingSimulator';

<RoutingSimulator merchantId="merchant-uuid" />
```

**Features:**
- Configure simulation (amount, currency, method)
- Preview all routes with metrics
- Highlighted recommended route
- Simulation history with accuracy tracking
- Visual risk levels and confidence scores

## Risk Levels

| Risk Level | Success Rate | Recent Failures | Action |
|-----------|-------------|----------------|--------|
| **low** | ≥ 95% | 0 | ✅ Recommended |
| **medium** | 85-95% | ≤ 2 | ⚠️ Acceptable |
| **high** | 70-85% | 3-4 | ⚠️ Caution |
| **critical** | < 70% or ≥5 failures | Use with extreme caution |

## Simulation Accuracy Validation

Sira apprend de ses erreurs:

```sql
-- Prédictions correctes vs incorrectes
SELECT
  was_prediction_correct,
  COUNT(*) as total
FROM routing_simulations
WHERE executed_at IS NOT NULL
GROUP BY was_prediction_correct;

-- Result:
-- was_prediction_correct | total
-- true                  | 782
-- false                 | 68
-- Accuracy: 92%
```

## Use Cases

### 1. Ops Dashboard - Route Selection
Avant de forcer un paiement sur une route spécifique, simuler pour voir les risques.

### 2. Merchant Preview
Afficher aux marchands les options disponibles avec fees estimés.

### 3. High-Value Transactions
Pour montants >€5000, toujours simuler avant exécution.

### 4. Sira Validation
Comparer prédictions vs résultats pour améliorer le modèle.

### 5. A/B Testing
Comparer performance de nouvelles routes avant déploiement complet.

## Deployment (116ter)

```bash
# 1. Run migration
psql -d molam -f brique-116/migrations/003_predictive_routing_simulator.sql

# 2. API already extended in routing.js (lines 568-835)

# 3. PHP helpers already in molam-routing-logger.php

# 4. Deploy React UI
cd brique-116/src/components
npm run build
```

## Performance Considerations

- Simulations are **read-only** queries (fast)
- Non-blocking: simulation doesn't affect actual payment flow
- Cache simulation results for 5 minutes to avoid redundant queries
- Async recording of outcomes (fire-and-forget)

---

# Sous-Brique 116quater: AI Adaptive Routing Over Time (Sira)

**Extension de 116ter pour intelligence évolutive temporelle**

## Concept

L'intelligence de routing de Molam Connect **évolue dans le temps** :
- **Adapte** continuellement selon saisonnalité, marchés, comportements clients
- **Apprend** des patterns temporels (Noël, Ramadan, Black Friday, etc.)
- **Corrige** dynamiquement si une route devient instable ou chère
- **Prédit** les performances futures basées sur l'historique

## Database Schema

### Table: `routing_performance_history`

```sql
CREATE TABLE routing_performance_history (
  id BIGSERIAL PRIMARY KEY,
  route TEXT NOT NULL,
  merchant_id UUID NOT NULL,
  method TEXT NOT NULL,
  currency TEXT NOT NULL,
  period DATE NOT NULL,                    -- Granularité journalière
  total_txn INT DEFAULT 0,
  success_txn INT DEFAULT 0,
  fail_txn INT DEFAULT 0,
  avg_latency_ms NUMERIC(10,2),
  p95_latency_ms NUMERIC(10,2),
  avg_fee_percent NUMERIC(5,4),
  total_volume NUMERIC(18,2) DEFAULT 0,
  anomaly_score NUMERIC(5,4) DEFAULT 0,    -- 0-1
  seasonal_factor NUMERIC(5,4) DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(route, merchant_id, method, currency, period)
);
```

### Table: `routing_seasonal_patterns`

```sql
CREATE TABLE routing_seasonal_patterns (
  id BIGSERIAL PRIMARY KEY,
  route TEXT NOT NULL,
  merchant_id UUID,
  pattern_type TEXT NOT NULL,              -- 'weekly' | 'monthly' | 'yearly' | 'holiday'
  pattern_name TEXT,                       -- 'black_friday' | 'ramadan' | 'christmas'
  start_period DATE NOT NULL,
  end_period DATE NOT NULL,
  impact_factor NUMERIC(5,4) NOT NULL,     -- Multiplicateur de performance
  confidence NUMERIC(5,4) NOT NULL
);
```

## API Endpoints

### POST `/api/routing/performance/update`
Met à jour les performances quotidiennes pour une route.

**Request:**
```json
{
  "route": "VISA_US",
  "merchant_id": "merchant-uuid",
  "method": "card",
  "currency": "USD",
  "success": true,
  "latency_ms": 1200,
  "fee_percent": 0.029,
  "amount": 100.00
}
```

### GET `/api/routing/adaptive-recommendation/:merchantId`
Obtient la recommandation adaptative basée sur l'historique.

**Request:**
```
GET /api/routing/adaptive-recommendation/merchant-123?method=card&currency=USD&days_back=30
```

**Response:**
```json
{
  "merchant_id": "merchant-123",
  "method": "card",
  "currency": "USD",
  "recommended_route": "VISA_US",
  "adaptive_score": 0.92,
  "success_rate_pct": 95.5,
  "avg_latency_ms": 1200,
  "trend": "improving",
  "alternatives": {...},
  "days_analyzed": 30
}
```

### GET `/api/routing/heatmap/:merchantId`
Heatmap de performance sur 7 jours.

**Response:**
```json
{
  "merchant_id": "merchant-123",
  "heatmap": {
    "VISA_US": [
      {
        "date": "2025-01-19",
        "success_rate": 95.5,
        "latency": 1200,
        "total_txn": 150,
        "anomaly_score": 0.05,
        "health_status": "normal"
      }
    ]
  },
  "period": "last_7_days"
}
```

### GET `/api/routing/trends/:merchantId`
Analyse des tendances et scores adaptatifs.

### POST `/api/routing/detect-anomalies`
Déclenche la détection d'anomalies manuellement.

### POST `/api/routing/seasonal-pattern`
Ajoute un pattern saisonnier.

**Request:**
```json
{
  "route": "MTN_SN",
  "merchant_id": "merchant-uuid",
  "pattern_type": "holiday",
  "pattern_name": "ramadan_2025",
  "start_period": "2025-03-01",
  "end_period": "2025-03-30",
  "impact_factor": 1.25,
  "confidence": 0.85
}
```

## SQL Functions

### `update_daily_performance()`
Met à jour automatiquement les performances quotidiennes.

```sql
SELECT update_daily_performance(
  'VISA_US',
  'merchant-uuid',
  'card',
  'USD',
  true,        -- success
  1200,        -- latency_ms
  0.029,       -- fee_percent
  100.00       -- amount
);
```

### `calculate_adaptive_score()`
Calcule le score adaptatif pour une route.

```sql
SELECT * FROM calculate_adaptive_score(
  'merchant-uuid',
  'card',
  'USD',
  'VISA_US',
  30  -- days_back
);
```

**Result:**
| route | adaptive_score | success_rate_pct | avg_latency | trend | seasonal_boost |
|-------|---------------|------------------|-------------|--------|----------------|
| VISA_US | 0.92 | 95.5 | 1200 | improving | 1.0 |

### `get_adaptive_route_recommendation()`
Retourne la meilleure route adaptative.

```sql
SELECT * FROM get_adaptive_route_recommendation(
  'merchant-uuid',
  'card',
  'USD',
  30
);
```

### `detect_daily_anomalies()`
Détecte les anomalies statistiques (z-score > 2 sigma).

```sql
SELECT detect_daily_anomalies();
-- Returns: nombre d'anomalies détectées
```

## Scoring Algorithm

Le **score adaptatif** combine plusieurs facteurs :

```
adaptive_score = (
  (success_rate * 0.50) +                    -- 50% taux de succès
  ((1000 / (latency + 1)) * 0.30) +          -- 30% vitesse
  ((1 - fee_percent) * 0.15) +               -- 15% coût
  (trend_bonus) +                             -- 5% tendance (+0.05 improving, -0.05 degrading)
) * seasonal_factor
```

## Trend Detection

Les tendances sont détectées en comparant :
- **Derniers 7 jours** vs **8-30 jours**
- Si différence > 5% → tendance détectée

**Tendances:**
- `improving` 📈 - Performance en amélioration
- `degrading` 📉 - Performance en dégradation
- `stable` ➡️ - Performance stable

## Anomaly Detection

Détection automatique basée sur z-score :

```sql
anomaly_score = ABS((actual_success_rate - avg_30d) / stddev_30d)

IF anomaly_score > 2.0 THEN
  -- Anomalie détectée (2 sigma)
  -- Envoyer alerte Ops
END IF
```

**Health Status:**
- `normal` - Anomaly score < 0.5
- `warning` - Anomaly score 0.5-0.7
- `critical` - Anomaly score > 0.7

## React UI Component

```tsx
import RoutingHeatmap from './components/RoutingHeatmap';

<RoutingHeatmap merchantId="merchant-uuid" />
```

**Features:**
- Heatmap visuelle de performance (7 jours)
- Indicateurs d'anomalies
- Tableau de tendances avec scores adaptatifs
- Recommandation Sira en temps réel
- Filtres par méthode et devise

## Use Cases

### 1. Black Friday Optimization
Configurer un pattern saisonnier pour booster certaines routes pendant Black Friday :

```sql
INSERT INTO routing_seasonal_patterns (
  route, pattern_type, pattern_name,
  start_period, end_period, impact_factor, confidence
) VALUES (
  'VISA_US', 'holiday', 'black_friday_2025',
  '2025-11-28', '2025-11-30', 1.20, 0.90
);
```

### 2. Ramadan Mobile Money
Durant le Ramadan, les paiements mobile money augmentent en Afrique :

```sql
INSERT INTO routing_seasonal_patterns (
  route, pattern_type, pattern_name,
  start_period, end_period, impact_factor, confidence
) VALUES (
  'MTN_SN', 'yearly', 'ramadan_2025',
  '2025-03-01', '2025-03-30', 1.35, 0.95
);
```

### 3. Automatic Anomaly Alerts
Configurer un cron job pour détecter quotidiennement les anomalies :

```bash
# Cron: Tous les jours à 2h du matin
0 2 * * * curl -X POST https://api.molam.com/api/routing/detect-anomalies \
  -H "X-User-Role: sira_ai"
```

### 4. Merchant Dashboard
Afficher aux marchands leurs meilleures routes avec tendances :

```javascript
const response = await fetch(`/api/routing/trends/${merchantId}?method=card&currency=USD`);
const { trends, best_route } = await response.json();

console.log(`Best route: ${best_route} with adaptive score ${trends[0].adaptive_score}`);
```

## Deployment (116quater)

```bash
# 1. Run migration
psql -d molam -f brique-116/migrations/004_adaptive_routing_over_time.sql

# 2. API already extended in routing.js (lines 837-1171)

# 3. Deploy React UI
cd brique-116/src/components
npm run build

# 4. Configure cron job for daily anomaly detection
echo "0 2 * * * curl -X POST http://localhost:3000/api/routing/detect-anomalies -H 'X-User-Role: sira_ai'" | crontab -
```

## Integration Example

```javascript
// Auto-update performance after each transaction
async function processPayment(transaction_id, route, merchant_id, amount, currency, method) {
  const start = Date.now();

  try {
    const result = await executePayment(transaction_id, route, amount);
    const latency = Date.now() - start;

    // Update daily performance
    await fetch('/api/routing/performance/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route: route,
        merchant_id: merchant_id,
        method: method,
        currency: currency,
        success: result.success,
        latency_ms: latency,
        fee_percent: 0.029,
        amount: amount
      })
    });

    return result;
  } catch (error) {
    // Log failure
    await fetch('/api/routing/performance/update', {
      method: 'POST',
      body: JSON.stringify({
        route: route,
        merchant_id: merchant_id,
        method: method,
        currency: currency,
        success: false,
        latency_ms: Date.now() - start,
        fee_percent: 0.029,
        amount: amount
      })
    });

    throw error;
  }
}
```

## Performance Considerations

- Daily aggregation reduces database load
- Heatmap limited to 7 days for quick rendering
- Anomaly detection runs asynchronously (cron job)
- Seasonal patterns cached in memory
- Index on `(route, merchant_id, period)` for fast queries

## Future Enhancements

- [ ] Machine learning model for route prediction
- [ ] Cost optimization (select cheapest successful route)
- [ ] Geographic routing optimization (latency by region)
- [ ] A/B testing framework for new routes
- [ ] Automatic failover configuration
- [ ] Provider SLA tracking and reporting
- [ ] Real-time route capacity prediction
- [ ] Multi-currency fee comparison

## License

MIT License - Molam Engineering

## Support

- GitHub Issues: https://github.com/molam/brique-116/issues
- Slack: #ops-routing
- Email: ops@molam.com
