# Brique 124 — Treasury Ops UI: Generate/Execute/Rollback

## 🎯 Objectif
Interface Ops Apple-like pour gérer la trésorerie avec génération de plans, approbations multi-signature, exécution idempotente et rollback.

## 📊 Features
- ✅ **Generate Plans** - Création manuelle/automatique
- ✅ **Multi-sig Approval** - Workflow configurable
- ✅ **Idempotent Execution** - Intégration ledger
- ✅ **Rollback** - Compensation/annulation
- ✅ **Apple-like UI** - Simple et accessible
- ✅ **SIRA Integration** - Optimisation intelligente

## 🗄️ Schema
- `treasury_plans` - Plans avec statut workflow
- `treasury_plan_items` - Items d'action
- `treasury_plan_executions` - Logs d'exécution
- `treasury_plan_approvals` - Approbations multi-sig

## 🌐 API Endpoints
```
POST /api/treasury/plans/generate
POST /api/treasury/plans/:id/approve
POST /api/treasury/plans/:id/execute
POST /api/treasury/plans/:id/rollback
GET  /api/treasury/plans
```

## 🎨 UI Components
- Plan list avec filtres
- Approve/Execute buttons
- Rollback actions
- Real-time updates

## 🔐 Security
- Role-based access (pay_admin, finance_ops, compliance)
- Multi-sig approvals
- Idempotency keys
- Audit trail immutable

**Version**: 1.0.0 | **Status**: ✅ Ready
