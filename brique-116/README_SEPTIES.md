# Brique 116septies — AI Anomaly-Based Failover (Sira)

## 🎯 Objectif

Détection automatique des anomalies (dégradations, pannes) sur les connecteurs de paiement et **failover automatique** intelligent orchestré par Sira.

## ✨ Fonctionnalités Essentielles

- 🔍 **Détection d'anomalies** en temps réel (latence, taux d'échec)
- 🤖 **Recommandations Sira** avec score de confiance
- ⚡ **Failover automatique** si confiance > seuil
- 👥 **Approbation Ops** pour failover manuel
- 🔒 **Idempotence** et traçabilité complète
- ⏱️ **Cooldown** pour éviter thrashing
- 📊 **Audit trail** complet

---

## 🗄️ Architecture Simplifiée

```
┌──────────────┐
│  Connectors  │  (Banques, PSP, Rails)
│  Health Data │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Sira Anomaly     │  (Python Daemon)
│ Detector         │  - Heuristiques simples
│                  │  - Score d'anomalie 0-1
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ anomaly_events   │  (DB)
│ + sira_decision  │
└──────┬───────────┘
       │
       ├─→ Confiance ≥ 80% → Auto-failover
       └─→ Confiance < 80% → Ops approval

       ▼
┌──────────────────┐
│ failover_actions │  (DB)
│ status: pending  │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Executor         │  (API)
│ - Update routing │
│ - Log history    │
└──────────────────┘
```

---

## 🗄️ Base de Données (Essentiel)

### Tables Principales

```sql
-- État de santé des connecteurs
CREATE TABLE connector_health (
    connector_name TEXT,
    region TEXT,
    currency TEXT,
    success_rate NUMERIC,
    avg_latency_ms NUMERIC,
    status TEXT  -- ok | degraded | down
);

-- Anomalies détectées
CREATE TABLE anomaly_events (
    connector_name TEXT,
    anomaly_type TEXT,
    anomaly_score NUMERIC,  -- 0-1
    sira_decision JSONB,    -- {candidate, confidence, reason}
    processed BOOLEAN
);

-- Actions de failover
CREATE TABLE failover_actions (
    action_ref TEXT UNIQUE,
    connector_from TEXT,
    connector_to TEXT,
    requested_by TEXT,  -- 'sira_auto' ou user_id
    status TEXT         -- pending | executing | executed | failed
);
```

---

## 🤖 Sira Detector (Python)

### Fonctionnement

```python
# Heuristiques de détection
if success_rate < 80%:
    anomaly_score = 0.95  # Critique
elif success_rate < 90%:
    anomaly_score = 0.75  # Élevé
elif latency > 2000ms:
    anomaly_score = 0.85  # Critique
elif latency > 1000ms:
    anomaly_score = 0.65  # Élevé
```

### Exécution

```bash
# Mode daemon (toutes les 60 secondes)
python src/sira/anomaly-detector.py
```

### Politique Auto-Failover

- **Confiance ≥ 80%** → Failover automatique
- **Confiance < 80%** → Escalade à Ops
- **Cooldown** : 15 minutes entre failovers du même connecteur

---

## 🌐 API REST

### Anomalies

```http
# Liste des anomalies en attente
GET /api/failover/anomalies/pending

# Approuver failover manuel
POST /api/failover/anomalies/:id/approve
```

### Actions

```http
# Liste des actions
GET /api/failover/actions

# Exécuter un failover
POST /api/failover/actions/:id/execute
```

### Santé des Connecteurs

```http
# État de santé
GET /api/failover/connectors/health?region=SN&currency=XOF

# Mettre à jour santé
POST /api/failover/connectors/:name/health
{
  "region": "SN",
  "currency": "XOF",
  "success_rate": 0.98,
  "avg_latency_ms": 450,
  "status": "ok"
}
```

---

## 📊 Interface Ops

### Composant React

```tsx
import FailoverConsole from './components/FailoverConsole';

<FailoverConsole apiBaseUrl="/api/failover" />
```

### Fonctionnalités

- ✅ Vue anomalies en temps réel avec score Sira
- ✅ Bouton "Approuver Failover"
- ✅ Liste des actions avec statut
- ✅ Historique complet
- ✅ Auto-refresh toutes les 10s

---

## 🚀 Déploiement

### 1. Base de Données

```bash
psql -U postgres -d molam_connect -f brique-116/migrations/007_anomaly_failover.sql
```

### 2. Sira Detector (Daemon)

```bash
# En production: systemd service
python brique-116/src/sira/anomaly-detector.py
```

### 3. API

```bash
cd brique-116
npm install
npm start
```

---

## 🔧 Configuration

### Politique de Failover

```sql
-- Modifier seuil d'auto-failover
UPDATE ops_failover_policies
SET config = '{"auto_threshold": 0.85, "cooldown_minutes": 20}'
WHERE name = 'auto_failover';
```

---

## 📈 Exemples d'Utilisation

### Scénario 1 : Panne de Banque

```
1. bank_bci success_rate chute à 75%
2. Sira détecte anomaly_score = 0.95
3. Recommande failover → bank_coris
4. Confiance 95% > seuil 80%
5. Failover automatique créé et exécuté
6. Routing basculé en 60 secondes
```

### Scénario 2 : Latence Élevée

```
1. stripe_eu latency monte à 1500ms
2. Sira détecte anomaly_score = 0.65
3. Recommande failover → adyen_eu
4. Confiance 65% < seuil 80%
5. Escalade à Ops pour approbation manuelle
6. Ops approuve → Failover exécuté
```

---

## 🔒 Sécurité

- ✅ **Idempotence** via `action_ref` unique
- ✅ **Cooldown** pour éviter thrashing
- ✅ **Audit trail** complet dans `failover_history`
- ✅ **Approbation Ops** configurable
- ✅ **Rollback** possible (status: rolled_back)

---

## 📊 Métriques Clés

| Métrique | Cible |
|----------|-------|
| Détection → Décision | < 30s |
| Exécution failover | < 60s |
| Faux positifs | < 1% |
| Cooldown défaut | 15 min |

---

## 🎯 Améliorations Futures

- [ ] ML avancé (Isolation Forest, LSTM)
- [ ] Kafka pour streaming temps réel
- [ ] Prometheus metrics
- [ ] Grafana dashboards
- [ ] Rollback automatique
- [ ] Multi-region failover

---

## 📚 Fichiers

- [Migration SQL](./migrations/007_anomaly_failover.sql)
- [Sira Detector](./src/sira/anomaly-detector.py)
- [API Routes](./src/routes/failover.ts)
- [UI Console](./src/components/FailoverConsole.tsx)

---

## 🏆 Avantages

✅ **Proactif** : Détecte avant impact majeur
✅ **Automatique** : Pas d'intervention 24/7
✅ **Sûr** : Cooldown + approbations
✅ **Traçable** : Audit complet
✅ **Flexible** : Auto ou manuel

---

**Brique 116septies** — Production Ready 🚀
**Molam Connect** — AI-Powered Failover Intelligence
