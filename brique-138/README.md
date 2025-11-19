<p align="center">
  <img src="https://img.shields.io/badge/Brique-138-blueviolet?style=for-the-badge" alt="Brique 138" />
</p>

# Brique 138 — Agent Dashboard (Sales / Float / Commissions)

Tableau de bord sécurisé pour les agents internes Molam couvrant :

- 💳 Suivi des ventes par devise et par région
- 💰 Pilotage du float (réserves opérationnelles) synchronisé Wallet/Treasury
- 🧮 Calculs de commissions et alertes d’anomalies
- 🛡️ RBAC Molam ID (Agent, Ops, Finance, Admin)
- 🧠 Insights SIRA (optimisation float, détection de patterns suspects)

## Architecture

```
┌──────────────────────────┐
│ Agent Dashboard (React)  │  — Brique 138 UI (`ui/AgentDashboard.tsx`)
└────────────▲─────────────┘
             │ fetch / SSE
┌────────────┴─────────────┐
│ API Express `/api/v1`    │  — routes intégrées dans `server.js`
│ • Sales / Float / Comm   │
│ • Insights SIRA          │
│ • Overview multi-agents  │
└────────────▲─────────────┘
             │ SQL (pg Pool)
┌────────────┴─────────────┐
│ PostgreSQL               │
│ • `agents`               │
│ • `agent_sales`          │
│ • `agent_float`          │
│ • `agent_commissions`    │
└────────────┬─────────────┘
             │
        SIRA Engine
```

## Base de données

Embarquée dans `database/setup.sql` + répliquée dans `database/schema.sql` :

```sql
CREATE TABLE agents (...);
CREATE TABLE agent_sales (...);
CREATE TABLE agent_float (...);
CREATE TABLE agent_commissions (...);
CREATE INDEX idx_agent_sales_date ON agent_sales(sale_date DESC);
CREATE INDEX idx_agent_commissions_date ON agent_commissions(created_at DESC);
```

Les montants utilisent `NUMERIC(18,2)` pour éviter les erreurs d’arrondi, les tables sont liées par clé étrangère à `agents`.

## API (Express)

| Méthode | Endpoint                           | Rôle minimum | Description |
|---------|------------------------------------|--------------|-------------|
| GET     | `/api/v1/agents/:id/sales`         | Agent        | 100 dernières ventes (filtrage devise / région) |
| GET     | `/api/v1/agents/:id/float`         | Agent        | Solde float courant (devise optionnelle) |
| GET     | `/api/v1/agents/:id/commissions`   | Finance      | Historique commissions (filtrage devise / source) |
| GET     | `/api/v1/agents/:id/insights`      | Agent        | Insights SIRA (float coverage, alertes commissions) |
| GET     | `/api/v1/agents/overview`          | Ops          | Vue multi-agents (top ventes, métadonnées) |

### RBAC

- `Agent` → accès strict à `:id = me` (ou header `x-agent-id`)
- `Ops` → accès cross-agents (sales + insights)
- `Finance` → accès complet (commissions, float, overview)
- `Admin` → bypass

Les rôles sont saisis via `x-role` (header) et contrôlés par `authMiddleware` / `requireRole`.

### SIRA Insights

- Calcul **avg_daily_sales** vs **float balance** ⇒ recommandations (recharge / optimiser)
- Détection d’anomalies commissions (±50 % vs moyenne glissante)
- Score SIRA synthétique (0-100) avec niveau (`faible/moyen/élevé`)

## UI (React + Tailwind + Recharts)

Implémentation de référence dans `ui/AgentDashboard.tsx` :

- Cartes KPI (float disponible, MTD sales, commissions)
- Graphiques `LineChart` (ventes) et `BarChart` (commissions)
- Bannière Insights SIRA + toast alertes
- Hooks `useEffect` pour synchronisation en temps réel (polling)

## Sécurité & Observabilité

Voir `docs/security.md` pour le détail :

- RBAC Molam ID + scope agent
- Journalisation Winston (`req.id`, `agent_id`, `role`)
- Rate limiting existant (`/api` limiter)
- Healthcheck `/health` + futurs métriques Prometheus

## Synchronisation écosystème Molam

- **Wallet** : float mis à jour par `agent_float` (API Treasury)
- **Connect** : ventes importées via webhooks PaymentIntent
- **Treasury** : commissions / payouts ventilés par `source`
- **SIRA** : micro-service scoring branché via `buildAgentInsights`

## Sous-brique — AI Float Optimizer (SIRA)

La sous-brique SIRA est livrée dans `brique-138/ai-float-optimizer/` :

- Migrations SQL (`migrations/*.sql`) pour `float_recommendations`, `float_actions_log` et métadonnées `bank_profiles`.
- Worker Node/TS (`src/sira/float_optimizer.ts`) + backtest (`src/sira/backtest.ts`) et scoring (`src/sira/score.ts`).
- Helpers routing/ledger/events + API `bank_profiles` pour mise à jour du `risk_score`.
- Tests Jest d’intégration (`src/sira/__tests__/sira.integration.test.ts`) + README d’exécution.

Voir `README_TESTS.md` pour lancer les migrations et tests en mode `simulate`.

## Tests

1. `npm run db:setup`
2. `npm start`
3. Appeler les endpoints avec headers :

```bash
curl -H "x-role: Finance" -H "x-agent-id: 00000000-0000-0000-0000-00000000000A" \
  http://localhost:3000/api/v1/agents/me/insights
```

4. Lancer le composant React dans une app Next/CRA et vérifier les graphes.

---

📞 Support interne : `#ops-agent-dashboard` (Slack) / ops@molam.io

