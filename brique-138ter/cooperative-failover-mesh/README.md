# Brique 138ter — Cooperative Failover Mesh (SIRA)

## Vue d'ensemble

Système de maillage coopératif pour routage bancaire distribué piloté par SIRA. Permet le failover prédictif cross-région avec orchestration automatique, continuité de service garantie, et traçabilité complète.

## Objectif

Créer un mesh coopératif qui:
- **Partage les signaux de santé** entre banques/PSP/rails par région
- **Orchestre les failovers cross-region** automatiquement ou avec approbation
- **Garantit la continuité** des paiements même en cas de panne régionale
- **Optimise coûts et risques** via routage intelligent SIRA
- **Respecte les contraintes réglementaires** (compliance, cross-border limits)
- **Conserve traçabilité complète** avec idempotence et reconciliation

## Fonctionnalités

### Mesh Régional
- **Régions prédéfinies**: CEDEAO, EU, US, GLOBAL
- **Membres**: Banques/PSP avec rôles (primary, secondary, tertiary, observer)
- **Capacités**: Max amount, daily volume, currencies, SLA uptime
- **Status**: active, disabled, suspended, pending_approval

### Health Predictions (SIRA)
- **Scoring 0-100**: Santé prédite avec fenêtre temporelle
- **Confidence**: Niveau de confiance de la prédiction (0-1)
- **Risk Factors**: latency_spike, volume_surge, settlement_delay
- **Recommended Action**: failover, prepare_failover, monitor
- **Signature JWT**: Intégrité des prédictions SIRA

### Routing Proposals
- **Séquence optimale**: Ordre de banques recommandé par score
- **Scope**: Currency + amount range
- **Simulation**: Estimation cost delta, latency delta, affected payouts
- **Workflow**: proposed → simulated → approved → applied → rolled_back
- **Auto-failover**: Configurable par région avec seuil de confiance

### Policies Configurables
- `auto_failover_enabled`: Activer failover automatique
- `approval_required_threshold`: Montant nécessitant approbation Ops
- `max_cascading_depth`: Profondeur max de failover en cascade
- `min_confidence_for_auto`: Confidence minimale pour auto (défaut: 0.8)
- `allowed_crossborder`: Autoriser transferts cross-border
- `rollback_window_hours`: Fenêtre de rollback (défaut: 24h)
- `max_cost_increase_pct`: Augmentation coût max toléré (10%)

### Reconciliation
- **Tracking complet**: Original vs rerouted bank
- **Amounts & FX**: Conversion automatique si changement devise
- **Costs**: Estimated vs actual avec delta
- **Timing**: Estimated vs actual settlement time
- **Status**: pending, matched, unmatched, disputed, resolved
- **Ledger entries**: Liaison avec double-entry bookkeeping

### Safety & Idempotence
- **Idempotency keys**: Toutes les actions mesh
- **Action logs immutables**: Audit trail complet (WAL + S3)
- **Signatures JWT**: SIRA proposals signées
- **mTLS**: Communication broker sécurisée
- **Rollback support**: Via snapshots + logs

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Mesh Broker (Kafka)                   │
│  Topics: mesh.health, mesh.predictions, mesh.proposals  │
└─────────────────────────────────────────────────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Bank Connectors  │  │  SIRA Cluster    │  │ Mesh Controller  │
│  (Health Logs)   │  │  (Predictions)   │  │   (Failover)     │
└──────────────────┘  └──────────────────┘  └──────────────────┘
                                                      │
                                                      ▼
                                            ┌──────────────────┐
                                            │ Treasury Service │
                                            │  (B34/B35)       │
                                            └──────────────────┘
```

### Composants

**1. Mesh Broker (Kafka)**
- Topics: `mesh.health`, `mesh.predictions`, `mesh.proposals`, `mesh.actions`
- mTLS + JWT authentication
- Partition par mesh_region_id pour parallélisme

**2. SIRA Prediction Engine**
- Modèles ML pour prédiction santé bancaire
- Génère `bank_health_predictions` avec confidence intervals
- Publie routing proposals optimisés
- Signature JWT pour intégrité

**3. Mesh Controller**
- Consomme proposals SIRA
- Applique routing atomiquement avec idempotence
- Gère cascading failover (max depth configurable)
- Intégration Treasury API pour holds + transfers

**4. Regional Connectors**
- Publish health signals (latency, success_rate, volume)
- Accept routing updates
- Report settlement status

**5. Ops UI**
- Vue mesh régional avec heatmap
- Approval workflow pour proposals
- Simulation mode (dry-run)
- Manual override + rollback

## Base de Données

### mesh_regions
Régions géographiques ou logiques du mesh
- Pays membres
- Auto-failover enabled
- Approval threshold
- Crossborder allowed

### mesh_members
Banques/PSP participants au mesh
- Rôle (primary, secondary, tertiary)
- Prefer order (priorité)
- Capabilities (currencies, limits, SLA)
- Current health score
- Compliance status (KYC, contract)

### bank_health_predictions
Prédictions SIRA de santé bancaire
- Predicted score (0-100)
- Confidence (0-1)
- Prediction window (minutes)
- Risk factors
- Recommended action
- SIRA signature

### mesh_routing_proposals
Propositions de routage SIRA
- Sequence (liste ordonnée de banques)
- Currency + amount range
- Status (proposed, simulated, approved, applied, rolled_back)
- Simulation results
- SIRA signature

### mesh_action_logs
Audit trail immutable de toutes actions
- Action type (apply_route, rollback, override, failover)
- Actor (sira, user, system)
- Affected payouts + banks
- Result (success, failed, partial)
- Duration + idempotency key

### mesh_reconciliations
Suivi des transfers cross-region
- Original vs rerouted bank
- Amounts + FX rate
- Cost delta
- Settlement time delta
- Reconciliation status
- Ledger entries

### mesh_policies
Règles configurables par région
- Auto-failover rules
- Approval thresholds
- Compliance checks
- Rollback window

### mesh_liquidity_pools
Mutualisation liquidité inter-banks
- Total available + reserved
- Participants
- Auto-rebalance enabled
- Draw limits

## API Endpoints

### GET /api/mesh/regions
Liste des régions mesh

**Response:**
```json
{
  "ok": true,
  "regions": [
    {
      "id": "uuid",
      "name": "CEDEAO",
      "countries": ["CI", "SN", "ML", "BF", ...],
      "auto_failover_enabled": false,
      "approval_threshold": 10000
    }
  ]
}
```

### GET /api/mesh/regions/:id/members
Membres d'une région

**Response:**
```json
{
  "ok": true,
  "members": [
    {
      "id": "uuid",
      "bank_profile_id": "uuid",
      "bank_name": "Banque Atlantique CI",
      "role": "primary",
      "prefer_order": 1,
      "current_health_score": 95.5,
      "status": "active"
    }
  ]
}
```

### POST /api/mesh/members
Ajouter membre au mesh (require multi-sig)

**Request:**
```json
{
  "mesh_region_id": "uuid",
  "bank_profile_id": "uuid",
  "role": "secondary",
  "prefer_order": 10,
  "capabilities": {
    "max_amount_per_txn": 10000000,
    "daily_volume_limit": 100000000,
    "supported_currencies": ["XOF", "EUR"],
    "cross_border_enabled": true,
    "settlement_time_hours": 24
  }
}
```

### POST /api/mesh/predictions/generate
Générer prédiction SIRA pour une banque

**Request:**
```json
{
  "bank_profile_id": "uuid",
  "mesh_region_id": "uuid"
}
```

**Response:**
```json
{
  "ok": true,
  "prediction": {
    "id": "uuid",
    "predicted_score": 87.5,
    "confidence": 0.92,
    "prediction_window_minutes": 60,
    "risk_factors": ["volume_surge"],
    "recommended_action": "monitor",
    "sira_model_version": "v2.5.1"
  }
}
```

### POST /api/mesh/proposals/generate
Générer routing proposal

**Request:**
```json
{
  "mesh_region_id": "uuid",
  "currency": "XOF",
  "min_amount": 0,
  "max_amount": 1000000,
  "reason": "Predicted latency spike on primary bank"
}
```

**Response:**
```json
{
  "ok": true,
  "proposal": {
    "id": "uuid",
    "proposal": {
      "sequence": [
        {
          "bank_profile_id": "uuid",
          "bank_name": "Bank B",
          "score": 95,
          "confidence": 0.92,
          "estimated_cost": 1500
        },
        {
          "bank_profile_id": "uuid",
          "bank_name": "Bank A",
          "score": 72,
          "confidence": 0.88,
          "estimated_cost": 1200
        }
      ],
      "reason": "Optimized routing based on health predictions"
    }
  }
}
```

### POST /api/mesh/proposals/:id/simulate
Simuler impact d'une proposal

**Response:**
```json
{
  "ok": true,
  "simulation": {
    "affected_payouts": 45,
    "estimated_cost_delta": -250,
    "estimated_latency_delta_seconds": -120,
    "new_bank_profile_id": "uuid",
    "new_bank_name": "Bank B",
    "confidence": 0.92
  }
}
```

### POST /api/mesh/proposals/:id/approve
Approuver et appliquer proposal

**Response:**
```json
{
  "ok": true,
  "message": "Proposal approved and applied"
}
```

### POST /api/mesh/proposals/:id/reject
Rejeter proposal

**Request:**
```json
{
  "reason": "Cost increase too high"
}
```

### POST /api/mesh/proposals/:id/rollback
Rollback proposal appliquée

**Request:**
```json
{
  "reason": "Higher than expected settlement delays"
}
```

### GET /api/mesh/actions
Logs d'actions

**Query Params:**
- `mesh_region_id` - Filtrer par région
- `action_type` - apply_route, rollback, override, failover
- `limit` - Max results (défaut: 100)

**Response:**
```json
{
  "ok": true,
  "actions": [
    {
      "id": "uuid",
      "action_type": "apply_route",
      "mesh_region_id": "uuid",
      "routing_proposal_id": "uuid",
      "affected_payouts": ["uuid1", "uuid2", ...],
      "result": "success",
      "duration_ms": 245,
      "created_at": "2025-01-19T10:00:00Z"
    }
  ]
}
```

### GET /api/mesh/reconciliations
Reconciliations cross-region

**Query Params:**
- `status` - pending, matched, unmatched, disputed, resolved
- `limit` - Max results

## Flux d'Exécution

### 1. Health Monitoring
```
Bank Connector → Kafka (mesh.health) → Mesh Controller
  → Update mesh_members.current_health_score
```

### 2. SIRA Prediction
```
SIRA Engine:
  1. Fetch historical health logs
  2. Call SIRA API ou fallback heuristique
  3. Generate prediction avec confidence
  4. Sign with JWT
  5. Store in bank_health_predictions
  6. Publish to Kafka (mesh.predictions)
```

### 3. Routing Proposal
```
SIRA Engine:
  1. Get active mesh members pour région + currency
  2. Get recent predictions pour chaque member
  3. Calculate estimated costs
  4. Sort by health score (highest first)
  5. Create proposal avec sequence
  6. Sign with JWT
  7. Store in mesh_routing_proposals
  8. Publish to Kafka (mesh.proposals)
```

### 4. Auto-Failover (si enabled)
```
Mesh Controller:
  1. Receive proposal from Kafka
  2. Verify SIRA signature
  3. Load policy for region
  4. If auto_failover_enabled AND confidence >= threshold:
     a. Call applyRoutingAtomically()
     b. BEGIN transaction
     c. Lock affected payouts (FOR UPDATE)
     d. Get treasury account for new bank
     e. Update payouts.treasury_account_id
     f. Create mesh_reconciliations records
     g. Log mesh_action_logs
     h. COMMIT
     i. Publish action log to Kafka
  5. Else:
     a. Create Ops approval ticket
```

### 5. Manual Approval
```
Ops:
  1. View proposal in UI
  2. Run simulation (dry-run)
  3. Review cost delta, latency delta, confidence
  4. Approve ou Reject
  5. If approved → Mesh Controller applies atomically
```

### 6. Rollback
```
Ops ou System:
  1. POST /api/mesh/proposals/:id/rollback
  2. Mesh Controller:
     a. BEGIN transaction
     b. Get mesh_reconciliations for proposal
     c. Restore original treasury_account_id for each payout
     d. Update proposal status = 'rolled_back'
     e. Log action
     f. COMMIT
```

## Configuration

**Variables d'environnement:**

```bash
# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/molam_mesh

# Kafka
KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
KAFKA_CLIENT_ID=mesh-controller
KAFKA_SSL=true
KAFKA_SASL_USERNAME=mesh
KAFKA_SASL_PASSWORD=secret

# SIRA
SIRA_API_URL=http://sira-service:3000
SIRA_API_KEY=sira-api-key
SIRA_MODEL_VERSION=v2.5.1
SIRA_SIGNING_KEY=sira-jwt-secret

# Treasury
TREASURY_API_URL=http://treasury-service:3000
SERVICE_TOKEN=internal-jwt-token

# Controller
ENABLE_CONTROLLER=true

# Logging
LOG_LEVEL=info
```

## Déploiement

### Build & Push
```bash
docker build -t molam/cooperative-failover-mesh:latest .
docker push molam/cooperative-failover-mesh:latest
```

### Apply K8s Manifests
```bash
kubectl apply -f k8s/deployment.yaml
```

### Migrations
```bash
psql $DATABASE_URL -f migrations/2025_01_19_create_mesh_system.sql
```

### Vérification
```bash
kubectl get pods -l app=mesh-controller
kubectl logs -l app=mesh-controller --tail=100
kubectl get hpa mesh-controller-hpa
```

## Métriques Prometheus

```
molam_mesh_failover_applied_total{region, currency}
molam_mesh_prediction_confidence (histogram)
molam_mesh_crossborder_volume_total{from_region, to_region, currency}
```

## Monitoring & Alertes

**Alertes recommandées:**
- Auto-failover triggered > 5 fois/heure
- Prediction confidence < 0.7 pour primary bank
- Reconciliation unmatched > 10 sur 1h
- Rollback triggered without ops approval
- Crossborder transfer failed > 5%

**Dashboards Grafana:**
- Mesh health heatmap par région
- Prediction accuracy (predicted vs actual)
- Failover frequency timeline
- Cost optimization (estimated vs actual)
- Reconciliation match rate

## Sécurité & Compliance

**Multi-Signature:**
- Ajout nouveau membre au mesh require 2 approvals
- Changement policy `approval_threshold` require ops_admin
- Manual override > threshold require multi-sig

**Audit Trail:**
- `mesh_action_logs` immutable (WAL + S3)
- Tous les proposals signés SIRA (JWT)
- IP tracking pour manual overrides

**Compliance:**
- Cross-border checks automatiques
- KYC verification required pour nouveaux membres
- Regulatory flags par country respectés

**SIRA Explainability:**
- Raison textuelle pour chaque prédiction
- Risk factors listés
- Model version tracked
- Confidence intervals

## Tests

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
# Seed mesh regions + members
psql $DATABASE_URL -c "INSERT INTO mesh_regions..."

# Generate prediction
curl -X POST .../mesh/predictions/generate -d '{"bank_profile_id":"uuid"}'

# Generate proposal
curl -X POST .../mesh/proposals/generate -d '{"mesh_region_id":"uuid","currency":"XOF"}'

# Simulate
curl -X POST .../mesh/proposals/uuid/simulate

# Verify simulation results
```

### Chaos Testing
```bash
# Simulate connector outage
kubectl delete pod -l app=bank-connector-ci

# Verify cascading failover triggered
curl .../mesh/actions?action_type=failover

# Verify payouts rerouted
psql $DATABASE_URL -c "SELECT * FROM mesh_reconciliations WHERE reconciliation_status='pending'"
```

## Runbook

### Activer auto-failover pour une région
```sql
UPDATE mesh_regions
SET auto_failover_enabled = TRUE
WHERE name = 'CEDEAO';

UPDATE mesh_policies
SET rules = rules || '{"auto_failover_enabled": true}'::jsonb
WHERE mesh_region_id = (SELECT id FROM mesh_regions WHERE name = 'CEDEAO');
```

### Ajouter banque au mesh (avec approval)
```bash
curl -X POST /api/mesh/members \
  -H "Content-Type: application/json" \
  -d '{
    "mesh_region_id": "uuid",
    "bank_profile_id": "uuid",
    "role": "secondary",
    "prefer_order": 20,
    "capabilities": {...}
  }'

# Ops approve via UI ou:
psql $DATABASE_URL -c "UPDATE mesh_members SET status='active' WHERE id='uuid'"
```

### Forcer failover manuel (override)
```bash
curl -X POST /api/mesh/proposals/generate \
  -d '{
    "mesh_region_id": "uuid",
    "currency": "XOF",
    "reason": "Emergency: Primary bank outage"
  }'

# Get proposal_id from response, then:
curl -X POST /api/mesh/proposals/{proposal_id}/approve
```

### Rollback failover
```bash
curl -X POST /api/mesh/proposals/{proposal_id}/rollback \
  -d '{"reason": "Higher settlement delays than expected"}'
```

### Debug reconciliation mismatch
```sql
SELECT
  mr.*,
  p.reference_code,
  p.status as payout_status,
  bp_orig.name as original_bank,
  bp_new.name as rerouted_bank
FROM mesh_reconciliations mr
JOIN payouts p ON mr.payout_id = p.id
JOIN bank_profiles bp_orig ON mr.original_bank_profile_id = bp_orig.id
JOIN bank_profiles bp_new ON mr.rerouted_bank_profile_id = bp_new.id
WHERE mr.reconciliation_status = 'unmatched'
ORDER BY mr.created_at DESC;
```

## Version

**1.0.0** | Statut: ✅ Production Ready

## Points d'Intégration

- **SIRA Service**: Predictions + routing optimization
- **Treasury Service (B34/B35)**: Ledger holds + payout updates
- **Bank Connectors**: Health signals + routing updates
- **B136ter (Approvals)**: Approval workflow pour proposals > threshold
- **Event Bus**: Publication mesh events
- **Kafka**: Communication mesh distribuée

## Équipe

- **Dev Lead**: Cooperative Failover Mesh
- **Ops**: mesh-ops@molam.com
- **SIRA**: sira-team@molam.com

## License

Propriétaire Molam Pay © 2025
