# Brique 125 — Multi-currency FX Execution & Cost Evaluation

## 🎯 Objectif
Orchestration multi-devises avec conversion FX intelligente, évaluation des coûts en temps réel, et intégration SIRA pour optimisation.

## 📊 Features
- ✅ **FX Internal/External** - Netting automatique + providers bancaires
- ✅ **Real-time Cost Evaluation** - Spread, fees, network costs
- ✅ **Multi-bank Comparison** - SIRA FX Recommender
- ✅ **Ledger Double-entry** - Respect comptabilité
- ✅ **Dynamic Routing** - SIRA choix optimal (cost/SLA/risk)
- ✅ **Compliance** - Logs immuables, limites réglementaires

## 🗄️ Schema
- `fx_quotes` - Devis multi-providers
- `fx_executions` - Exécutions avec ledger

## 🌐 API
```
POST /api/fx/quote       # Get best quote (SIRA)
POST /api/fx/execute     # Execute FX with ledger
```

## 🎨 UI
- Quote comparator
- Real-time cost display
- Execute/Rollback controls
- Multi-currency selector

## 💡 SIRA Integration
Choisit automatiquement le meilleur provider basé sur :
- Cost total (spread + fees)
- SLA garanties
- Risk score
- Historical performance

**Version**: 1.0.0 | **Status**: ✅ Ready
