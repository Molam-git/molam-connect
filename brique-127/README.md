# Brique 127 — Bank Failover & Routing Logic (SIRA recommended)

## Overview
Intelligent bank routing system with automatic failover, circuit breakers, health monitoring, and SIRA AI-enhanced decision making for optimal cost and reliability.

## Features
- **Smart Routing**: Cost-based selection (fees + FX + retry cost)
- **SIRA Integration**: AI-enhanced scoring for optimal routing
- **Circuit Breakers**: Automatic bank exclusion after failures
- **Health Monitoring**: Continuous bank connector health checks
- **Risk Automation**: Health monitor auto-adjusts `risk_score` + triggers alerts
- **Predictive Failover**: SIRA prévoit les dégradations et reroute avant incident
- **Automatic Failover**: Stuck payout rerouting (30min timeout)
- **Ops Adjustments**: Manual weight overrides and bank pinning
- **Idempotency**: Decision replay protection
- **Audit Trail**: Full routing decision history

## Database Tables
- `bank_routing_decisions` - Routing history with full context
- `bank_health_metrics` - Real-time health status
- `bank_health_logs` - Raw probe latencies + anomalies
- `bank_health_predictions` - Fenêtres prédites (risk & success) générées par SIRA
- `bank_circuit_breakers` - Circuit breaker states
- `bank_routing_adjustments` - Ops manual overrides
- `payout_confirmations` - Settlement confirmations

## Routing Algorithm

**Cost Model:**
```
Total Cost = Bank Fee + Expected FX + Retry Cost + Health Penalty

Where:
- Bank Fee = amount × fee_percent + fee_fixed
- Expected FX = SIRA estimate
- Retry Cost = (1 - success_rate) × 0.01 × amount
- Health Penalty = (1 - success_rate) × 10
```

**Selection Criteria (in order):**
1. Lowest total cost
2. Highest success rate
3. Highest SIRA score
4. Exclude banks with open circuit breakers

## Circuit Breaker States
- **Closed**: Normal operation
- **Open**: 5+ failures, excluded from routing for 5 minutes
- **Half-Open**: Probing after timeout

## API Endpoints

### GET /api/treasury/routing/decisions
List recent routing decisions.

### GET /api/treasury/routing/health
Get bank health status and circuit breaker states.

### POST /api/treasury/routing/override/:decisionId
Override routing decision (Ops only).
```json
{
  "bank_profile_id": "uuid",
  "reason": "manual_override"
}
```

### POST /api/treasury/routing/adjustments
Create routing weight adjustment.
```json
{
  "bank_profile_id": "uuid",
  "scope": "global|country:SN|merchant:uuid",
  "weight": 1.5,
  "expires_at": "2025-12-31T23:59:59Z"
}
```

### POST /api/treasury/routing/test
Test routing selection.
```json
{
  "amount": 1000,
  "currency": "USD",
  "country": "US"
}
```

## Workers

### Bank Health Monitor Worker
Runs every 5 minutes (cron / job):
```bash
npx ts-node brique-127/src/workers/bankHealthMonitor.ts
```
(ou compilez via tsc + node)

Responsibilities:
- Ping each bank heartbeat URL (or fallback heartbeat)
- Insert raw logs (`bank_health_logs`) with latency/success/anomalies
- Auto-adjust `risk_score` upwards/downwards based on SLA
- Open circuit + emit `bank_health` / `bank_failover` alerts when thresholds crossed
- Feed SIRA routing (risk_score + success rate)

### Health Check Worker (legacy probe)
Still available for on-demand sweeps:
```bash
node src/services/health.ts
```

### Failover Worker
Runs every 60 seconds:
```bash
node src/workers/failover-worker.ts
```

Processing:
1. Find payouts sent > 30min without confirmation
2. Check if bank circuit is open
3. Select new bank route
4. Create new settlement instruction
5. Mark payout as rerouted

### Predictive Failover (Brique 138bis)

SIRA alimente `bank_health_predictions` en continu (signals latence, SLA, FX, contexte externe).  
Sélection du mode via `FAILOVER_MODE` :

| Mode | Description |
| --- | --- |
| `reactive` | comportement historique (défaut) |
| `predictive` | `selectBankForPayout` priorise les banques avec `predicted_risk_score` faible & `predicted_success_rate` élevé |
| `hybrid` | SIRA propose, Ops peut overrider (raison `predictive_hybrid`) |

Les décisions stockent `predictive_*` dans `candidate_banks` + `metadata.routing_mode`.  
Alertes enrichies : « SIRA prédit une panne Bank A <30 min, failover auto vers Bank B ».

## SIRA Integration

SIRA provides per-bank scoring hints:
- **sira_score** (0-1): Overall bank quality
- **expected_fx**: FX cost estimate
- **expected_settlement_days**: Settlement time
- **fraud_risk** (0-1): Risk assessment

Feedback loop:
- Send routing outcomes to SIRA
- SIRA learns and improves future scores

## Ops Adjustments

**Scope types:**
- `global` - Applies to all payouts
- `country:XX` - Country-specific (e.g., `country:SN`)
- `merchant:uuid` - Merchant-specific

**Weight multiplier:**
- `< 1.0` - Favor this bank (lower cost)
- `> 1.0` - Penalize this bank (higher cost)

## Monitoring & Alerts

**Metrics (Prometheus):**
- `routing_decision_count` - Total decisions
- `routing_failover_count` - Failover events
- `circuit_breaker_open` - Open circuits
- `avg_routing_latency_ms` - Decision time

**Alert Triggers:**
- Failover rate > 5/hour
- Circuit open > 10 minutes
- Bank health down > 3 consecutive checks
- Risk score > 0.5 (`bank_health` warning)
- Risk score > 0.8 or success < 75% (`bank_failover` critical)

## UI Component

`TreasuryRouting.tsx` - Ops dashboard showing:
- Bank health status table
- Active circuit breakers
- Recent routing decisions
- Override controls

## Security & Compliance
- RBAC enforcement (finance_ops, pay_admin)
- Immutable routing decisions
- Full audit trail
- Secrets in Vault
- mTLS for bank connectors

## Integration Points
- **Brique 121** - Bank connectors
- **Brique 126** - Payout processing
- **SIRA** - AI scoring engine
- **Ledger** - Cost tracking

**Version**: 1.0.0 | **Status**: ✅ Ready
