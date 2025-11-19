# Brique 111-1: Self-Healing Plugins (SIRA) - Industrial-grade

**Sous-brique industrielle pour auto-surveillance, détection d'anomalies, auto-patch avec staging, et intégration SIRA ML.**

## 📋 Vue d'ensemble

Brique 111-1 étend la brique 111 avec des capacités industrielles de self-healing :

- ✅ **Heartbeat & Telemetry** : Plugins envoient heartbeat + télémetry toutes les 2 minutes
- ✅ **Détection d'anomalies** : Règles standard + modèle SIRA (anomalies temporelles, drift d'erreurs)
- ✅ **Auto-Patch** : Correctifs automatisés avec staging sandbox + smoke tests
- ✅ **Rollback automatique** : Si déploiement génère erreurs > seuil
- ✅ **Approval multi-signature** : Pour patches majeurs ou impact élevé
- ✅ **Audit immuable** : Toutes les actions journalisées
- ✅ **Kill switch Ops** : Désactivation globale ou whitelist merchants
- ✅ **SIRA Learning Loop** : Feedback pour améliorer les décisions ML

## 🏗️ Architecture

```
brique-111-1/
├── migrations/
│   └── 001_self_healing_sira.sql      # 5 tables + fonctions
├── plugin-client/
│   └── heartbeat.js                   # Snippet pour plugins
├── src/
│   ├── server.ts                      # Serveur Express (port 8112)
│   ├── routes/
│   │   ├── plugins.ts                 # /api/plugins/heartbeat
│   │   └── ops.ts                     # Ops endpoints
│   ├── workers/
│   │   ├── incident-processor.ts       # Core self-healing logic
│   │   └── patch-utils.ts             # Staging, apply, rollback
│   ├── sira/
│   │   └── decider.ts                 # SIRA API integration
│   ├── ops/
│   │   └── policy.ts                  # Ops policy management
│   └── utils/
│       ├── pluginAuth.ts              # Plugin authentication
│       ├── queue.ts                   # Message queue
│       └── audit.ts                   # Audit logging
├── web/
│   └── src/
│       └── OpsPluginIncidents.tsx     # Ops dashboard
├── workers/
│   └── incident-processor.ts         # Worker entry point
└── tests/
    └── incident-processor.test.ts    # Unit tests
```

## 🗄️ Schéma de Base de Données

### Tables principales

1. **plugin_incidents** - Incidents détectés
   - Type, sévérité, télémetry snapshot
   - Décision SIRA (action, patch_version, confidence)

2. **plugin_autopatch_attempts** - Tentatives de patch (log immuable)
   - Versions (from/to), méthode, statut
   - Résultats staging + production
   - Logs détaillés

3. **ops_policy** - Configuration globale (single row)
   - Kill switch, whitelist, seuils
   - Multi-sig requirements
   - Staging/health check config

4. **sira_learning_feedback** - Feedback pour apprentissage
   - Input/output SIRA
   - Outcome réel (success/failed/rolled_back)

5. **plugin_agent_commands** - Queue de commandes pour plugins
   - Types: update, rollback, config_update
   - Statut, retry logic

## 🚀 Installation

### 1. Prérequis

- Node.js 18+
- PostgreSQL 12+
- SIRA API (ou mock pour dev)

### 2. Installation

```bash
cd brique-111-1
npm install
```

### 3. Configuration

```env
DATABASE_URL=postgresql://user:password@localhost:5432/molam_connect
MOLAM_ID_JWT_PUBLIC=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
SIRA_API_URL=http://localhost:8000
SIRA_API_TOKEN=your-token
STAGING_RUNNER_URL=http://localhost:9000
STAGING_RUNNER_TOKEN=your-token
PORT=8112
LOG_LEVEL=info
```

### 4. Migrations

```bash
npm run migrate
```

### 5. Démarrer

```bash
# Serveur API
npm run dev

# Worker incident processor
npm run worker:incident-processor
```

## 📡 API Endpoints

### Plugin Heartbeat

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/plugins/heartbeat` | Receive heartbeat + telemetry |
| POST | `/api/plugins/commands/:id/ack` | Acknowledge command |
| POST | `/api/plugins/commands/:id/fail` | Report command failure |

### Ops Endpoints

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/ops/plugin-incidents` | List incidents | pay_admin |
| GET | `/api/ops/autopatch-attempts` | List patch attempts | pay_admin |
| POST | `/api/ops/plugin-incidents/:id/approve` | Approve patch | pay_admin |
| POST | `/api/ops/plugin-incidents/:id/manual-action` | Manual action | pay_admin |

## 🔄 Flux Self-Healing

### 1. Heartbeat → Détection

```
Plugin → Heartbeat (errors_last_24h=50, webhook_fail_rate=0.6)
  → Incident créé (severity=medium, type=webhook_fail_rate)
  → Enqueue pour traitement
```

### 2. SIRA Decision

```
Incident Processor
  → Call SIRA API
  → SIRA retourne: {action: 'patch', patch_version: '1.2.3', confidence: 0.87}
  → Update incident.sira_decision
```

### 3. Auto-Patch (si autorisé)

```
Check Ops Policy
  → autopatch_enabled? whitelist? severity threshold?
  → Run staging smoke tests
  → Apply to production
  → Health check (90s)
  → Success → Notify merchant
  → Failure → Auto-rollback → Notify Ops
```

### 4. Learning Loop

```
Record feedback
  → sira_learning_feedback table
  → SIRA training data
  → Improve future decisions
```

## 🎨 Ops Dashboard

Le composant `OpsPluginIncidents.tsx` fournit :

- ✅ Liste incidents avec sévérité, statut
- ✅ Décisions SIRA (action, confidence, explanation)
- ✅ Approbation patches
- ✅ Actions manuelles
- ✅ Historique auto-patch attempts
- ✅ Détails incidents (télémetry snapshot)

## 🧪 Tests

```bash
npm test
```

### Exemples de tests

- ✅ Autopatch path success
- ✅ Staging failure → create attempt fail
- ✅ Rollback on health check failure
- ✅ Ops policy enforcement

## 📊 Observabilité & KPIs

### Métriques cibles

- **Autopatch success rate** : >95%
- **Autopatch rollback rate** : <2%
- **MTTD (Mean Time To Detect)** : <2 minutes
- **MTTR (Mean Time To Remediate)** : <10 minutes (minor fixes)
- **SIRA confidence distribution** : Track confidence levels

### Monitoring

- Nombre d'incidents par type/sévérité
- Taux de succès auto-patch
- Taux de rollback
- Latence p95 auto-patch
- SIRA confidence moyenne

## 🔐 Sécurité

- ✅ **Plugin Authentication** : Secrets chiffrés, mTLS pour agent
- ✅ **Multi-signature** : Approbations pour patches majeurs
- ✅ **Audit Trail** : Toutes actions immuables
- ✅ **Kill Switch** : Désactivation globale Ops
- ✅ **Sandbox** : Tests staging avant production
- ✅ **Health Checks** : Rollback automatique si échec

## 🚨 Runbook

### Canary Rollout

1. **Phase 1** : Whitelist 5 merchants (1 semaine)
2. **Phase 2** : 20% merchants (2 semaines)
3. **Phase 3** : 50% merchants (2 semaines)
4. **Phase 4** : 100% (si rollback rate <2%)

### Kill Switch

```sql
UPDATE ops_policy SET autopatch_enabled = false WHERE id = 1;
```

### Emergency Rollback

```sql
-- Rollback all pending patches
UPDATE plugin_autopatch_attempts 
SET status = 'cancelled' 
WHERE status IN ('pending', 'staging', 'applying');
```

## 📝 Exemple de Flux Concret

1. **Plugin envoie heartbeat** : `webhook_fail_rate = 60%`
2. **Incident créé** : `severity=medium`, `type=webhook_fail_rate`
3. **SIRA propose** : `patch 1.2.3` (confidence 0.87)
4. **Ops policy autorise** : Merchant en whitelist
5. **Staging smoke tests** : ✅ OK
6. **Apply patch prod** : ✅ Health check OK (60s)
7. **Enregistrement** : `plugin_autopatch_attempts.status='success'`
8. **Notification** : Merchant & Ops notifiés
9. **SIRA learning** : Feedback positif enregistré

## 🔗 Intégrations

### Services requis

- **SIRA API** : `/api/sira/decide` pour décisions ML
- **Staging Runner** : Sandbox pour smoke tests
- **Plugin Agent Gateway** : MQ pour commandes plugins
- **Webhook System** : Notifications merchant/ops

### Briques liées

- **Brique 111** : Merchant Config UI (base)
- **Brique 73** : SIRA AI model
- **Brique 45** : Webhooks delivery
- **Brique 68** : RBAC & permissions

## 📄 License

ISC

## 👥 Contact

Molam Team - [GitHub](https://github.com/Molam-git)

---

**Status**: ✅ Complete - Ready for canary deployment  
**Version**: 1.0.0  
**Dependencies**: PostgreSQL 12+, Node.js 18+, SIRA API, Staging Runner



