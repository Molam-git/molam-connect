# Brique 111-2 — Multi-Signature Integration

## Vue d'ensemble

L'intégration multisig ajoute un système d'approbation multi-signature configurable par politique pour toutes les recommandations AI. Ce système permet de:

- **Contrôler l'auto-application** via des politiques configurables par type de cible et priorité
- **Exiger des signatures multiples** pour les changements critiques
- **Tracer tous les votes** avec signatures cryptographiques HSM
- **Gérer les rejets** avec raisons documentées
- **Verrouiller les opérations** pour éviter les conflits concurrents

---

## Composants ajoutés

### 1. Tables SQL (3 nouvelles)

#### `multisig_policies`
Définit les politiques d'approbation par type de cible et priorité.

```sql
CREATE TABLE multisig_policies (
  target_type TEXT,          -- 'plugin','webhook','checkout','treasury','merchant_setting'
  priority TEXT,             -- 'low','medium','high','critical'
  required_signatures INT,   -- Nombre de signatures requises
  approver_roles TEXT[],     -- Rôles autorisés à approuver
  auto_apply_threshold NUM,  -- Seuil de confiance pour auto-apply
  auto_apply_allowed BOOL    -- Auto-application autorisée?
);
```

**Politiques par défaut** :
- **Webhook low**: 1 signature (ops), auto-apply ≥97%
- **Webhook high**: 2 signatures (ops + pay_admin/compliance), pas d'auto-apply
- **Treasury**: 2-3 signatures (finance_ops + pay_admin + compliance), **jamais** d'auto-apply
- **Checkout**: 1-3 signatures selon priorité, pas d'auto-apply

#### `config_approvals`
Stocke chaque vote d'approbation/rejet avec signature cryptographique.

```sql
CREATE TABLE config_approvals (
  recommendation_id UUID,
  approver_user_id UUID,
  approver_roles TEXT[],    -- Rôles de l'approbateur au moment du vote
  decision TEXT,            -- 'approve' | 'reject'
  comment TEXT,
  signature TEXT,           -- JWT signé par HSM
  UNIQUE(recommendation_id, approver_user_id)  -- Un vote par utilisateur
);
```

#### `recommendation_locks`
Verrous pour éviter les applications concurrentes.

```sql
CREATE TABLE recommendation_locks (
  recommendation_id UUID PRIMARY KEY,
  locked_by UUID,
  locked_at TIMESTAMPTZ
);
```

### 2. Fonctions PostgreSQL

- **`count_unique_approvers(rec_id)`** : Compte les approbateurs uniques
- **`has_required_signatures(rec_id)`** : Vérifie si assez de signatures
- **`has_rejection(rec_id)`** : Vérifie s'il y a eu un rejet

### 3. Module `utils/multisig.js`

Logique métier complète pour la multisig :

```javascript
// Récupérer politique
await multisig.getPolicy(targetType, priority);

// Ajouter un vote
await multisig.addApproval(recId, userId, userRoles, 'approve', comment);

// Vérifier auto-apply
await multisig.canAutoApply(targetType, priority, confidence);

// Obtenir statut d'approbation
await multisig.getApprovalStatus(recId);

// Gérer les locks
await multisig.acquireLock(recId, userId);
await multisig.releaseLock(recId);
```

### 4. Module `utils/hsm.js`

Signature cryptographique des approbations :

```javascript
// Signer un vote (JWT avec HSM/Vault)
const signature = await signWithHSM({
  rec: recommendationId,
  approver: userId,
  decision: 'approve',
  iat: timestamp
});

// Vérifier signature
const { valid, payload } = await verifySignature(signature);
```

---

## Flux de travail

### Flux 1: Auto-Application (Low Risk)

```
SIRA → POST /api/ai-recommendations
  {
    targetType: 'webhook',
    priority: 'low',
    confidence: 0.97
  }

↓ Système vérifie policy (webhook/low)
  - required_signatures: 1
  - auto_apply_allowed: true
  - auto_apply_threshold: 0.97

↓ Confidence ≥ threshold → AUTO-APPLY
  1. Créer snapshot
  2. Exécuter recommendation
  3. Status → 'applied'

✅ Appliqué automatiquement
```

### Flux 2: Multi-Signature (High Risk)

```
SIRA → POST /api/ai-recommendations
  {
    targetType: 'webhook',
    priority: 'high',
    confidence: 0.98
  }

↓ Système vérifie policy (webhook/high)
  - required_signatures: 2
  - auto_apply_allowed: false

↓ Status → 'awaiting_approvals'

OPS User 1 → POST /api/ai-recommendations/:id/approve
  { decision: 'approve', comment: 'Reviewed telemetry' }

↓ 1 approbation, need 2
  Status reste 'awaiting_approvals'

OPS User 2 → POST /api/ai-recommendations/:id/approve
  { decision: 'approve', comment: 'LGTM' }

↓ 2 approbations → Status → 'approved'

OPS Admin → POST /api/ai-recommendations/:id/apply

✅ Appliqué avec multisig
```

### Flux 3: Rejet

```
Recommendation → 'awaiting_approvals'

User → POST /api/ai-recommendations/:id/approve
  { decision: 'reject', comment: 'Not applicable' }

↓ Status → 'rejected' (immédiat)

❌ Recommendation rejetée
```

---

## API Endpoints

### Nouvelle route: Approuver/Rejeter

```http
POST /api/ai-recommendations/:id/approve
Content-Type: application/json

{
  "decision": "approve",  // ou "reject"
  "comment": "Reviewed and approved"
}
```

**Réponse** :
```json
{
  "ok": true,
  "status": "approved",  // ou "pending"
  "approvals": 2,
  "required": 2
}
```

### Nouvelle route: Statut d'approbation

```http
GET /api/ai-recommendations/:id/approvals
```

**Réponse** :
```json
{
  "recommendation_id": "uuid",
  "status": "awaiting_approvals",
  "approvals": 1,
  "rejections": 0,
  "required_signatures": 2,
  "approver_roles": ["ops", "pay_admin"],
  "approval_list": [
    {
      "approver_id": "user-1",
      "decision": "approve",
      "comment": "Looks good",
      "created_at": "2025-01-18T10:30:00Z"
    }
  ]
}
```

### Nouvelles routes: Gestion des politiques

```http
# Lister toutes les politiques
GET /api/ai-recommendations/policies/list

# Obtenir politique spécifique
GET /api/ai-recommendations/policies/:targetType/:priority

# Mettre à jour politique (ops admin seulement)
PATCH /api/ai-recommendations/policies/:targetType/:priority
{
  "required_signatures": 3,
  "auto_apply_threshold": 0.98
}
```

---

## Interface Ops

### Changements UI

1. **Boutons Approve/Reject** au lieu d'un seul bouton "Approve"
   - Approve : Vote positif avec signature
   - Reject : Vote négatif avec raison obligatoire

2. **Filtre "Awaiting Approvals"** dans le dropdown de status

3. **Section "Approvals & Signatures"** dans le modal de détails
   - Statut d'approbation
   - Compteur d'approbations (ex: 1/2)
   - Liste des signatures avec:
     - ✓ pour approve
     - ✗ pour reject
     - Commentaire
     - Timestamp

4. **Alertes contextuelles**
   - "Approval recorded. Still need X more signature(s)"
   - "Recommendation approved! (2/2 signatures)"
   - "Rejection reason is required"

---

## Sécurité

### Signatures cryptographiques

Chaque vote d'approbation est signé avec un JWT :

```javascript
{
  rec: "recommendation-uuid",
  approver: "user-uuid",
  decision: "approve",
  iat: 1705573800,
  iss: "molam-ai-advisor",
  exp: 1705577400  // 1 heure
}
```

**Signé avec** :
- Production: HSM via Vault Transit
- Dev: JWT secret (`APPROVAL_SIGNING_SECRET`)

### Audit Trail

Toutes les actions sont tracées :
- `config_recommendation_audit` : Actions système
- `config_approvals` : Votes individuels avec signatures
- Immuable : Aucune suppression autorisée

### Locks

Empêche les conflits d'application concurrente :
- Lock acquis avant `apply`
- Lock libéré après exécution
- Erreur 409 si déjà locké

---

## Configuration des Politiques

### Exemple: Politique stricte pour Treasury

```sql
UPDATE multisig_policies
SET
  required_signatures = 3,
  approver_roles = ARRAY['finance_ops', 'pay_admin', 'compliance'],
  auto_apply_allowed = false
WHERE target_type = 'treasury' AND priority = 'critical';
```

### Exemple: Activer auto-apply pour webhooks low

```sql
UPDATE multisig_policies
SET
  auto_apply_allowed = true,
  auto_apply_threshold = 0.97
WHERE target_type = 'webhook' AND priority = 'low';
```

### Via API

```bash
curl -X PATCH http://localhost:3000/api/ai-recommendations/policies/webhook/low \
  -H "Content-Type: application/json" \
  -d '{
    "auto_apply_allowed": true,
    "auto_apply_threshold": 0.98
  }'
```

---

## Tests

### Test: Workflow multisig complet

```javascript
test('High priority requires 2 approvals', async () => {
  // 1. Create recommendation
  const rec = await createRecommendation({ priority: 'high' });
  expect(rec.status).toBe('awaiting_approvals');

  // 2. First approval
  await approve(rec.id, 'user1', ['ops'], 'approve');
  let updated = await getRecommendation(rec.id);
  expect(updated.status).toBe('awaiting_approvals');

  // 3. Second approval
  await approve(rec.id, 'user2', ['pay_admin'], 'approve');
  updated = await getRecommendation(rec.id);
  expect(updated.status).toBe('approved');

  // 4. Apply
  const result = await apply(rec.id);
  expect(result.ok).toBe(true);
});
```

### Test: Rejet immédiat

```javascript
test('Single rejection marks as rejected', async () => {
  const rec = await createRecommendation();

  await approve(rec.id, 'user1', ['ops'], 'reject', 'Security issue');

  const updated = await getRecommendation(rec.id);
  expect(updated.status).toBe('rejected');
});
```

---

## Migration depuis version précédente

### Étape 1: Exécuter la migration SQL

```bash
.\setup-all-schemas.ps1
```

Cela créera:
- 3 nouvelles tables
- 3 fonctions helper
- Politiques par défaut

### Étape 2: Aucun changement de code requis

Le système est **rétrocompatible** :
- Anciennes recommandations continuent de fonctionner
- Nouvelles utilisent automatiquement multisig
- Pas de breaking changes dans l'API

### Étape 3: Configurer les politiques

Ajuster les politiques selon les besoins :

```sql
-- Exemple: Activer auto-apply pour low priority plugins
UPDATE multisig_policies
SET auto_apply_allowed = true
WHERE target_type = 'plugin' AND priority = 'low';
```

---

## Métriques & Monitoring

### Prometheus Metrics (à implémenter)

```
# Recommandations auto-appliquées
sira_auto_apply_total{target_type,priority}

# Approbations par rôle
sira_approvals_total{role,decision}

# Rejets
sira_rejections_total{target_type}

# Locks timeout
sira_lock_timeout_total
```

### Alertes suggérées

```yaml
- alert: HighRejectionRate
  expr: rate(sira_rejections_total[24h]) > 0.3
  annotations:
    summary: "Taux de rejet élevé (>30%)"

- alert: MultisigBottleneck
  expr: count(config_recommendations{status="awaiting_approvals"}) > 10
  annotations:
    summary: "10+ recommendations en attente d'approbation"
```

---

## Runbook Ops

### Débloquer une recommendation bloquée

```sql
-- Vérifier le lock
SELECT * FROM recommendation_locks WHERE recommendation_id = 'uuid';

-- Forcer le déblocage si nécessaire (avec prudence!)
DELETE FROM recommendation_locks WHERE recommendation_id = 'uuid';
```

### Voir toutes les approbations en attente

```sql
SELECT
  r.id,
  r.priority,
  r.target_type,
  count_unique_approvers(r.id) as current_approvals,
  mp.required_signatures,
  r.created_at
FROM config_recommendations r
LEFT JOIN multisig_policies mp
  ON r.target_type = mp.target_type AND r.priority = mp.priority
WHERE r.status = 'awaiting_approvals'
ORDER BY r.created_at;
```

### Auditer les votes d'un utilisateur

```sql
SELECT
  ca.recommendation_id,
  ca.decision,
  ca.comment,
  ca.created_at,
  r.target_type,
  r.priority
FROM config_approvals ca
JOIN config_recommendations r ON ca.recommendation_id = r.id
WHERE ca.approver_user_id = 'user-uuid'
ORDER BY ca.created_at DESC;
```

---

## Résumé des changements

✅ **3 nouvelles tables SQL** avec indexes et contraintes
✅ **Module multisig.js** avec logique complète d'approbation
✅ **Module hsm.js** pour signatures cryptographiques
✅ **Routes API** pour approve/reject et gestion des politiques
✅ **UI mise à jour** avec boutons approve/reject et affichage des signatures
✅ **Tests** pour workflows multisig
✅ **20 politiques par défaut** pré-configurées
✅ **Rétrocompatible** avec recommandations existantes
✅ **Documentation complète** (ce fichier)

---

**Date**: 2025-01-18
**Version**: Brique 111-2 avec intégration multisig complète
