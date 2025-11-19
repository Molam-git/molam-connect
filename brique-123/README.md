# Brique 123 — Float Snapshots & Auto-Sweep Rules

## 🎯 Objectif
Système industriel de **gestion automatique des balances** (float management) avec snapshots temps réel, règles de sweep automatiques, et intégration SIRA pour optimisation coût/risque.

## 📊 Fonctionnalités

### Core Features
- ✅ **Snapshot horaire/EOD** - Tracking balances en temps réel
- ✅ **Règles auto-sweep** - Top-up/sweep-to-reserve/sweep-to-hot
- ✅ **Multi-pays/devises** - Support global
- ✅ **Approval workflow** - Multi-sig pour montants élevés
- ✅ **SIRA integration** - Optimisation intelligente
- ✅ **Audit trail** - Ledger double-entry
- ✅ **Dashboard Ops** - UI Apple-like

## 🗄️ Schema

### Tables
- `treasury_float_snapshots` - Snapshots horaires
- `sweep_rules` - Règles configurables
- `sweep_plans` - Plans proposés/approuvés
- `sweep_executions` - Logs d'exécution

## 💻 Worker

### Snapshot Collector
```typescript
await collectSnapshots(); // Run every hour
```

### Rule Evaluator
```typescript
await evaluateRules(); // Check rules and create plans
```

### Plan Executor
```typescript
await executePlan(planId, userId); // Execute with approval
```

## 🎨 UI Ops (React)
Dashboard Apple-like pour :
- Voir snapshots en temps réel
- Approuver/rejeter plans
- Exécuter manuellement
- Monitoring alertes

## 🔗 API Endpoints
```
GET  /api/treasury/float_snapshots
GET  /api/treasury/sweep_rules
POST /api/treasury/sweep_rules
POST /api/treasury/sweep_plan/propose
POST /api/treasury/sweep_plan/:id/approve
POST /api/treasury/sweep_plan/:id/execute
```

## 📈 Metrics
- `molam_float_snapshot_count`
- `molam_sweep_plans_proposed_total`
- `molam_sweep_executions_success_total`

## 🔐 Security
- Multi-sig approvals
- Ledger holds before external calls
- Idempotency keys
- Vault credentials
- mTLS connections

**Version**: 1.0.0 | **Status**: ✅ Production Ready
