# Brique 136ter — AI Risk-Aware Approval (SIRA-driven multi-sig)

## Vue d'ensemble

Système d'approbation intelligent qui utilise le moteur de scoring IA SIRA pour déterminer automatiquement le niveau d'approbation requis selon le risque. Le nombre d'approbateurs et les exigences de preuve s'adaptent dynamiquement au score de risque.

## Fonctionnalités

- **Scoring SIRA Automatique**: Appel au moteur IA SIRA pour chaque action avec fallback heuristique
- **Approbations Dynamiques**:
  - Score <25: Auto-approbation
  - Score 25-60: 1 approbateur
  - Score 60-85: 2 approbateurs
  - Score 85+: 3 approbateurs + preuves obligatoires
- **Sélection Intelligente**: Pools d'approbateurs configurables par pays, module, montant
- **Tokens One-Click**: Liens signés HMAC SHA256 pour approve/reject
- **Intégration Multi-Canal**: Envoi automatique via B136bis (Email + Slack + Push)
- **Override Admin**: Super admins peuvent forcer approve/reject avec raison
- **Worker Asynchrone**: CronJob K8s pour auto-approval, expiration, événements
- **Audit Complet**: Trail immutable de tous les votes et décisions

## Architecture

### Flux de Décision SIRA

```
1. Action créée (ex: payout.freeze $500k XOF)
   ↓
2. Appel SIRA API → Score: 78/100
   Tags: ["high_amount", "business_hours"]
   Reason: "Montant élevé nécessite approbation"
   ↓
3. Lookup Policy (country, module, action_type)
   Policy: min_score_double = 60, max_approvals = 3
   ↓
4. Détermination: Score 78 → 2 approbateurs requis
   ↓
5. Sélection Approvers (pools avec country + module match)
   → Approver A: ops_lead_CI
   → Approver B: finance_approver_CI
   ↓
6. Génération Tokens HMAC + Envoi Multi-Canal
   Email + Slack + Push → Chaque approbateur
   ↓
7. Approver A clique "Approve" (token consommé)
   → approved_count: 1/2 (status: pending)
   ↓
8. Approver B clique "Approve" (token consommé)
   → approved_count: 2/2 (status: approved)
   ↓
9. Worker détecte status = approved, notified = false
   → Publie event approval.completed
   → Marque notified = true
   ↓
10. Calling service (Pay, Treasury) reçoit event
    → Execute l'action (freeze payout)
```

### Matrice de Décision

| Score SIRA | Approbateurs Requis | Preuves | Délai TTL |
|------------|---------------------|---------|-----------|
| 0-24       | 0 (auto)            | Non     | Immédiat  |
| 25-59      | 1                   | Non     | 60 min    |
| 60-84      | 2                   | Non     | 60 min    |
| 85-100     | 3                   | Oui     | 90 min    |

## Tables Base de Données

### approvals_action
Actions nécessitant approbation avec scoring SIRA
- `id` - UUID de l'approbation
- `action_type` - Type d'action (payout.freeze, bank_add, refund.large)
- `origin_module` - Module origine (pay, wallet, treasury)
- `origin_entity_id` - ID de l'entité (merchant_id, payout_id)
- `payload` - Payload JSONB pour SIRA
- `created_by` - UUID du créateur
- `status` - pending | approved | rejected | held | overridden | auto_approved | expired
- `sira_score` - Score SIRA 0-100
- `sira_tags` - Tags SIRA (high_amount, cross_country, etc.)
- `sira_reason` - Raison textuelle de SIRA
- `required_approvals` - Nombre d'approbateurs requis
- `approved_count` - Nombre d'approbations reçues
- `evidence_required` - Preuves obligatoires si TRUE
- `expires_at` - Expiration de la demande
- `decided_at` - Timestamp de la décision
- `override_by` - UUID admin si override
- `override_reason` - Raison de l'override
- `notified` - TRUE si event publié

### approvals_pool
Pools d'approbateurs configurables
- `name` - Nom du pool (ex: "CI Ops Approvers")
- `roles` - Rôles Molam ID (ops_approver, finance_lead, compliance_lead)
- `country` - Filtre par pays (CI, SN, ML, null)
- `module` - Filtre par module (pay, wallet, treasury, null)
- `min_amount` / `max_amount` - Plage de montants
- `priority` - Ordre de sélection (1 = highest)
- `active` - Actif/inactif

### approvals_vote
Votes individuels (immutable audit trail)
- `approval_id` - Référence approvals_action
- `approver_id` - UUID approbateur (Molam ID)
- `decision` - approve | reject
- `comment` - Commentaire (ou preuve si evidence_required)
- `voted_at` - Timestamp du vote
- `ip_address` - IP de l'approbateur
- UNIQUE(approval_id, approver_id) - Un seul vote par approbateur

### approvals_tokens
Tokens one-click HMAC (one-time use)
- `approval_id` - Référence approvals_action
- `approver_id` - UUID approbateur
- `decision` - approve | reject
- `token_hash` - SHA256 hash du token (jamais plaintext)
- `expires_at` - Expiration token (10 min)
- `used` - TRUE si consommé
- `used_at` - Timestamp d'utilisation
- `used_by_ip` - IP qui a consommé le token

### approvals_policy
Policies configurables par ops_admin
- `name` - Nom de la policy
- `country` / `module` / `action_type` - Filtres (null = match all)
- `min_score_auto` - Score minimum auto-approval (défaut: 25)
- `min_score_single` - Score minimum 1 approbateur (défaut: 60)
- `min_score_double` - Score minimum 2 approbateurs (défaut: 85)
- `max_approvals` - Maximum approbateurs (défaut: 3)
- `timeout_minutes` - TTL de la demande (défaut: 60)
- `evidence_required_score` - Score nécessitant preuves (défaut: 85)

### approvals_evidence
Preuves uploadées pour high-risk approvals
- `approval_id` - Référence approvals_action
- `uploaded_by` - UUID qui a uploadé
- `file_url` - URL S3 de la preuve
- `file_type` - Type MIME
- `description` - Description textuelle
- `uploaded_at` - Timestamp

### sira_scoring_audit
Audit de tous les appels SIRA
- `approval_id` - Référence approvals_action (nullable)
- `payload` - Payload envoyé à SIRA
- `score` - Score retourné
- `tags` - Tags retournés
- `reason` - Raison textuelle
- `response_time_ms` - Temps de réponse SIRA
- `error` - Erreur si échec
- `scored_at` - Timestamp

## API Endpoints

### POST /api/approvals

Créer une demande d'approbation avec scoring SIRA automatique.

**Auth**: Service interne (SERVICE_TOKEN)

**Request:**
```json
{
  "action_type": "payout.freeze",
  "origin_module": "pay",
  "origin_entity_id": "payout-uuid",
  "payload": {
    "amount": 500000,
    "currency": "XOF",
    "origin_country": "CI",
    "account_country": "CI",
    "business_hours": true,
    "description": "Freeze payout due to fraud alert"
  },
  "created_by": "user-uuid",
  "expires_in_minutes": 60
}
```

**Response:**
```json
{
  "ok": true,
  "approval_id": "uuid",
  "status": "pending",
  "sira_score": 78,
  "required_approvals": 2,
  "approvers": [
    { "id": "approver-1", "email": "ops@molam.com" },
    { "id": "approver-2", "email": "finance@molam.com" }
  ]
}
```

### POST /api/approvals/:id/consume

Consommer un token one-click (approve ou reject).

**Auth**: Aucune (token signé dans body)

**Request:**
```json
{
  "token": "approval-uuid|approver-uuid|approve|timestamp|nonce",
  "evidence": "Vérifié avec le merchant, transaction légitime"
}
```

**Response:**
```json
{
  "ok": true,
  "status": "approved",
  "approved_count": 2,
  "required_approvals": 2,
  "decision": "approve"
}
```

**Erreurs:**
- `400 token_not_found` - Token invalide ou inexistant
- `400 token_already_used` - Token déjà consommé (replay attack)
- `400 token_expired` - Token expiré (>10 min)
- `404 approval_not_found` - Approbation introuvable
- `409 approval_already_decided` - Approbation déjà décidée
- `409 already_voted` - Approbateur a déjà voté
- `409 evidence_required` - Preuves obligatoires mais non fournies
- `409 approval_expired` - Demande expirée (TTL dépassé)

### POST /api/approvals/:id/override

Override super admin (bypass quorum).

**Auth**: Molam ID JWT avec rôle super_admin

**Headers:**
```
Authorization: Bearer <jwt>
X-User-Id: admin-uuid
```

**Request:**
```json
{
  "decision": "approve",
  "reason": "Emergency override - fraud confirmed negative after investigation"
}
```

**Response:**
```json
{
  "ok": true
}
```

### GET /api/approvals

Lister les demandes d'approbation avec filtres.

**Query Params:**
- `status` - Filtrer par statut (pending, approved, rejected, etc.)
- `origin_module` - Filtrer par module (pay, wallet, treasury)
- `created_by` - Filtrer par créateur
- `limit` - Pagination (défaut: 50)
- `offset` - Pagination (défaut: 0)

**Response:**
```json
{
  "ok": true,
  "approvals": [
    {
      "id": "uuid",
      "action_type": "payout.freeze",
      "status": "approved",
      "sira_score": 78,
      "required_approvals": 2,
      "approved_count": 2,
      "created_at": "2025-01-19T10:00:00Z",
      "decided_at": "2025-01-19T10:05:23Z"
    }
  ]
}
```

### GET /api/approvals/:id

Détails d'une approbation avec votes et preuves.

**Response:**
```json
{
  "ok": true,
  "approval": {
    "id": "uuid",
    "action_type": "payout.freeze",
    "origin_module": "pay",
    "payload": { ... },
    "status": "approved",
    "sira_score": 78,
    "sira_tags": ["high_amount"],
    "sira_reason": "Montant élevé nécessite approbation",
    "required_approvals": 2,
    "approved_count": 2,
    "evidence_required": false,
    "created_at": "2025-01-19T10:00:00Z",
    "decided_at": "2025-01-19T10:05:23Z"
  },
  "votes": [
    {
      "approver_id": "uuid-1",
      "decision": "approve",
      "comment": null,
      "voted_at": "2025-01-19T10:02:15Z"
    },
    {
      "approver_id": "uuid-2",
      "decision": "approve",
      "comment": null,
      "voted_at": "2025-01-19T10:05:23Z"
    }
  ],
  "evidence": []
}
```

### GET /api/approvals/:id/votes

Récupérer uniquement les votes d'une approbation.

**Response:**
```json
{
  "ok": true,
  "votes": [...]
}
```

## Service SIRA

### Scoring Payload

Le payload envoyé à SIRA contient:

```typescript
interface SiraScorePayload {
  amount?: number;
  currency?: string;
  origin_country?: string;
  account_country?: string;
  business_hours?: boolean;
  merchant_type?: string;
  recurrence?: boolean;
  description?: string;
}
```

### Réponse SIRA

```json
{
  "score": 78,
  "tags": ["high_amount", "business_hours"],
  "reason": "Montant élevé nécessite approbation, mais en heures ouvrables",
  "recommended_approvals": 2,
  "recommended_channels": ["email", "push", "slack"],
  "confidence": 0.92,
  "model_version": "sira-v2.3.1"
}
```

### Fallback Heuristique

Si SIRA est indisponible ou timeout (<5s), le service utilise un scoring heuristique:

**Règles:**
- Montant >1M: +60 points, tag "very_high_amount"
- Montant >100k: +40 points, tag "high_amount"
- Montant >10k: +20 points, tag "medium_amount"
- Cross-country: +15 points, tag "cross_country"
- Hors heures ouvrables: +10 points, tag "off_hours"
- Merchant type "high_risk": +25 points, tag "high_risk_merchant"
- Récurrence: -5 points, tag "recurring"

**Confidence**: 0.6 (heuristique vs 0.9+ pour SIRA)

## Worker Asynchrone

### CronJob K8s

Le worker s'exécute toutes les 2 minutes et traite:

**1. Auto-Approvals (required_approvals = 0)**
- Publie event `approval.completed` avec status `auto_approved`
- Marque `notified = TRUE`

**2. Approved Actions (quorum atteint)**
- Publie event `approval.completed` avec status `approved`
- Marque `notified = TRUE`

**3. Rejected Actions**
- Publie event `approval.rejected`
- Marque `notified = TRUE`

**4. Expired Approvals (expires_at < now())**
- Marque status = `expired`
- Publie event `approval.expired`
- Ops managers notifiés pour escalation

### Events Publiés

**approval.completed:**
```json
{
  "event_type": "approval.completed",
  "payload": {
    "approval_id": "uuid",
    "action_type": "payout.freeze",
    "origin_module": "pay",
    "origin_entity_id": "payout-uuid",
    "status": "approved",
    "sira_score": 78,
    "approved_count": 2,
    "required_approvals": 2,
    "decided_at": "2025-01-19T10:05:23Z"
  }
}
```

**approval.rejected:**
```json
{
  "event_type": "approval.rejected",
  "payload": {
    "approval_id": "uuid",
    "action_type": "payout.freeze",
    "origin_module": "pay",
    "origin_entity_id": "payout-uuid",
    "status": "rejected",
    "sira_score": 78,
    "decided_at": "2025-01-19T10:03:12Z"
  }
}
```

**approval.expired:**
```json
{
  "event_type": "approval.expired",
  "payload": {
    "approval_id": "uuid",
    "action_type": "payout.freeze",
    "origin_module": "pay",
    "origin_entity_id": "payout-uuid",
    "status": "expired",
    "sira_score": 78,
    "approved_count": 1,
    "required_approvals": 2,
    "expired_at": "2025-01-19T11:00:00Z"
  }
}
```

## Configuration

**Variables d'environnement:**

```bash
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/molam_approvals

# SIRA Service
SIRA_URL=http://sira-service:3000
SIRA_API_KEY=secure-api-key
SIRA_TIMEOUT=5000

# Tokens
TOKEN_SECRET=secure-hmac-secret-256-bits

# Multi-Channel Notifications (B136bis)
MULTICHANNEL_SERVICE_URL=http://multichannel-service:3000

# Event Bus
EVENT_BUS_URL=http://event-bus:3000

# Service Auth
SERVICE_TOKEN=internal-service-jwt

# Worker
WORKER_INTERVAL_MS=60000

# Logging
LOG_LEVEL=info
```

## Métriques Prometheus

```
molam_approvals_created_total{action_type, status}
molam_approvals_decided_total{status}
molam_approvals_sira_score (histogram avec buckets 0,25,50,60,70,80,85,90,95,100)
molam_approvals_http_request_duration_ms{method, route, status_code}
```

## Monitoring & Alertes

**Alertes recommandées:**
- SIRA API failure rate >10% sur 5 min → Switch to heuristic fallback
- Approval expiration rate >20% sur 1h → Review timeout policies
- Override usage >5 fois/jour → Investigate abuse
- Auto-approval rate >80% → Review SIRA thresholds
- Pending approvals stuck >90 min → Escalate to ops managers

**Dashboards:**
- SIRA score distribution (0-25, 25-60, 60-85, 85-100)
- Approval latency P50/P95/P99 (request → decision)
- Approvers response time par pool
- Override reasons word cloud
- Expiration root causes

## Runbook

### Déploiement

```bash
# Build image
docker build -t molam/risk-aware-approvals:latest .

# Push to registry
docker push molam/risk-aware-approvals:latest

# Apply K8s manifests
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/cronjob.yaml

# Verify deployment
kubectl get pods -l app=risk-aware-approvals
kubectl logs -l app=risk-aware-approvals --tail=50

# Check worker
kubectl get cronjobs
kubectl get jobs
```

### Migrations

```bash
# Run migrations
psql $DATABASE_URL -f migrations/2025_01_19_create_risk_aware_approvals.sql

# Verify tables
psql $DATABASE_URL -c "\dt approvals_*"
```

### Test SIRA Scoring

```bash
curl -X POST http://localhost:3000/api/approvals \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action_type": "payout.freeze",
    "origin_module": "pay",
    "origin_entity_id": "test-payout-123",
    "payload": {
      "amount": 500000,
      "currency": "XOF",
      "origin_country": "CI",
      "account_country": "CI",
      "business_hours": true,
      "description": "Test approval with SIRA scoring"
    },
    "created_by": "test-user-uuid",
    "expires_in_minutes": 60
  }'
```

### Consommer un Token

```bash
# Extract token from notification email/slack/push
TOKEN="approval-uuid|approver-uuid|approve|1234567890|abc123nonce"

curl -X POST http://localhost:3000/api/approvals/approval-uuid/consume \
  -H "Content-Type: application/json" \
  -d "{
    \"token\": \"$TOKEN\",
    \"evidence\": \"Verified with merchant team\"
  }"
```

### Override Admin

```bash
curl -X POST http://localhost:3000/api/approvals/approval-uuid/override \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "X-User-Id: admin-uuid" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "approve",
    "reason": "Emergency override after investigation"
  }'
```

### Query Approvals

```sql
-- Approvals en attente
SELECT
  id,
  action_type,
  sira_score,
  approved_count,
  required_approvals,
  expires_at,
  created_at
FROM approvals_action
WHERE status = 'pending'
ORDER BY sira_score DESC, created_at ASC;

-- Distribution des scores SIRA
SELECT
  CASE
    WHEN sira_score < 25 THEN '0-24 (auto)'
    WHEN sira_score < 60 THEN '25-59 (single)'
    WHEN sira_score < 85 THEN '60-84 (double)'
    ELSE '85+ (triple+evidence)'
  END as score_range,
  COUNT(*) as count,
  AVG(sira_score) as avg_score
FROM approvals_action
WHERE created_at > now() - interval '7 days'
GROUP BY score_range
ORDER BY score_range;

-- Temps de réponse des approbateurs
SELECT
  approver_id,
  COUNT(*) as votes_count,
  AVG(EXTRACT(EPOCH FROM (voted_at - aa.created_at))) as avg_response_time_seconds
FROM approvals_vote av
JOIN approvals_action aa ON av.approval_id = aa.id
WHERE av.voted_at > now() - interval '30 days'
GROUP BY approver_id
ORDER BY avg_response_time_seconds ASC;

-- Taux d'expiration par module
SELECT
  origin_module,
  COUNT(*) FILTER (WHERE status = 'expired') as expired_count,
  COUNT(*) as total_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'expired') / COUNT(*), 2) as expiration_rate_pct
FROM approvals_action
WHERE created_at > now() - interval '30 days'
GROUP BY origin_module
ORDER BY expiration_rate_pct DESC;
```

## Intégration

### Avec B136bis (Multi-Channel Notifications)

Après création d'une approbation avec `required_approvals > 0`, le service appelle automatiquement `/api/multichannel/send` pour chaque approbateur avec:
- Approve token
- Reject token
- Métadonnées (amount, action_type, expires_at)
- Canaux: Email + Slack + Push selon préférences utilisateur

### Avec Event Bus

**Events écoutés:** Aucun (service initie les approbations)

**Events publiés:**
- `approval.completed` - Quorum atteint ou auto-approved
- `approval.rejected` - Au moins un reject
- `approval.expired` - TTL dépassé sans quorum

### Avec Calling Services (Pay, Treasury, Wallet)

**Intégration côté calling service:**

```typescript
// 1. Create approval request
const approval = await axios.post('http://risk-aware-approvals:3000/api/approvals', {
  action_type: 'payout.freeze',
  origin_module: 'pay',
  origin_entity_id: payout.id,
  payload: {
    amount: payout.amount,
    currency: payout.currency,
    origin_country: payout.merchant.country,
    account_country: payout.account.country,
    business_hours: isBusinessHours(),
    description: `Freeze payout ${payout.id} due to fraud alert`
  },
  created_by: user.id,
  expires_in_minutes: 60
});

// 2. If auto-approved, execute immediately
if (approval.status === 'auto_approved') {
  await executePayout(payout.id);
  return;
}

// 3. Otherwise, wait for event approval.completed
eventBus.on('approval.completed', async (event) => {
  if (event.payload.origin_entity_id === payout.id && event.payload.status === 'approved') {
    await executePayout(payout.id);
  }
});

// 4. Handle rejection
eventBus.on('approval.rejected', async (event) => {
  if (event.payload.origin_entity_id === payout.id) {
    await cancelPayout(payout.id);
  }
});

// 5. Handle expiration (optional escalation)
eventBus.on('approval.expired', async (event) => {
  if (event.payload.origin_entity_id === payout.id) {
    await notifyOpsManagers(payout.id);
  }
});
```

## Modèle de Sécurité

**1. Tokens HMAC SHA256**
- Secret 256-bit stocké dans K8s secret
- Format: `approval_id|approver_id|decision|timestamp|nonce`
- Hash stocké en DB (jamais plaintext)
- One-time use avec `used = TRUE`
- Expiration 10 minutes
- IP tracking pour audit

**2. Molam ID Integration**
- JWT RS256 pour override admin
- Rôles: super_admin, ops_admin, ops_approver, finance_lead, compliance_lead
- Vérification rôle via Molam ID API

**3. Immutable Audit**
- Tous les votes insérés (never UPDATE/DELETE)
- IP + timestamp enregistrés
- Override tracking avec admin_id + reason
- SIRA scoring audit complet

**4. Anti-Replay**
- Token consommé une seule fois
- UNIQUE(approval_id, approver_id) sur votes
- Token expiration 10 min

**5. Rate Limiting**
- /api/approvals: 100 req/min par service
- /api/approvals/:id/consume: 10 req/min par IP
- /api/approvals/:id/override: 5 req/min par admin

## Version

**1.0.0** | Statut: ✅ Production Ready

## Points d'Intégration

- **SIRA Service** - Scoring IA avec fallback heuristique
- **Multi-Channel Service (B136bis)** - Notifications Email/Slack/Push
- **Event Bus** - Publication des décisions
- **Molam ID** - Auth admin JWT RS256
- **Calling Services (Pay, Treasury, Wallet)** - Création approbations

## Équipe

- **Dev Lead**: AI Risk-Aware Approval System
- **Ops Contact**: ops@molam.com
- **Compliance**: compliance@molam.com

## License

Propriétaire Molam Pay © 2025
