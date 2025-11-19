# Brique 136 — Approval Notifications & Signed Email Links

## Vue d'ensemble
Service de notifications par email avec liens signés JWT pour approuver/rejeter des actions critiques Molam Pay directement depuis l'email. Sécurisé, audité et avec expiration courte.

## Fonctionnalités
- **Liens Email Signés**: Tokens JWT signés avec expiration (10 min par défaut)
- **One-Click Approve/Reject**: Validation directe depuis l'email
- **Audit Immutable**: Traçabilité complète de tous les envois et clics
- **Templates HTML**: Emails responsive et localisés (FR)
- **Anti-Replay**: Un token ne peut être utilisé qu'une fois
- **Révocation**: Possibilité de révoquer les tokens
- **Tracking**: Suivi des clics, IP, User-Agent
- **Notifications Multi-Types**: Demande d'approbation, avertissement expiration, décision
- **Intégration SMTP**: Support Nodemailer avec TLS

## Architecture

### Backend Service (notifications-service)
- **Port**: 8086
- **Framework**: Express.js + TypeScript
- **Database**: PostgreSQL
- **Email**: Nodemailer (SMTP)
- **Templates**: Handlebars
- **Metrics**: Prometheus
- **Logging**: Winston (structured JSON)

## Tables Base de Données

### notification_audit
Historique immuable de toutes les notifications envoyées
- `approval_request_id` - Lien vers approval_requests (B135)
- `recipient_email`, `recipient_id`, `recipient_role` - Destinataire
- `notification_type` - approval_request | expiry_warning | approved | rejected
- `template_used` - Template HTML utilisé
- `smtp_message_id` - ID message SMTP
- `status` - sent | failed | bounced
- `sent_at` - Horodatage envoi

### email_action_tokens
Tokens signés JWT pour actions email
- `approval_request_id` - Demande liée
- `token_hash` - SHA256 du JWT (stockage sécurisé)
- `action` - approve | reject
- `recipient_id`, `recipient_email` - Destinataire
- `expires_at` - Expiration (10 min)
- `used_at` - Horodatage utilisation (one-time)
- `used_by_ip`, `used_by_user_agent` - Tracking
- `revoked` - Révocation manuelle

### email_click_audit
Audit de tous les clics sur liens email
- `token_id` - Lien vers email_action_tokens
- `approval_request_id` - Demande liée
- `action` - approve | reject
- `ip_address`, `user_agent` - Tracking
- `result` - success | expired | invalid | already_used | revoked
- `clicked_at` - Horodatage

### notification_preferences
Préférences utilisateur pour notifications
- `user_id` - Utilisateur
- `email_enabled`, `sms_enabled`, `push_enabled` - Canaux
- `approval_request_email`, `expiry_warning_email` - Types
- `language`, `timezone` - Localisation

## API Endpoints

### POST /api/notifications/verify-token
Vérifier et utiliser un token email

**Public** (pas d'auth requise - sécurisé par signature JWT)

**Request:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (Succès):**
```json
{
  "valid": true,
  "action": "approve",
  "approval_request_id": "uuid",
  "message": "Votre approbation a été enregistrée avec succès."
}
```

**Response (Erreur):**
```json
{
  "valid": false,
  "error": "token_expired"
}
```

**Codes d'erreur:**
- `token_required` - Token manquant
- `token_expired` - Token expiré (>10 min)
- `token_invalid` - Signature invalide
- `token_not_found` - Token inconnu en BDD
- `token_revoked` - Token révoqué manuellement
- `token_already_used` - Token déjà utilisé (one-time)

### POST /api/notifications/send-approval-request
Envoyer email de demande d'approbation

**Auth**: Service interne (SERVICE_TOKEN)

**Request:**
```json
{
  "approval_request_id": "uuid",
  "ops_log_id": "uuid",
  "action_type": "execute_plan",
  "description": "Exécution du plan de rerouting pour 1,234 payouts",
  "amount": 1234567.89,
  "currency": "XOF",
  "quorum": 2,
  "recipient_id": "uuid",
  "recipient_email": "ops@molam.com",
  "recipient_name": "Jean Dupont",
  "expires_at": "2025-01-19T12:00:00Z"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Email sent successfully"
}
```

### GET /api/notifications/audit
Récupérer historique des notifications

**Auth**: Service interne

**Query Params:**
- `approval_request_id` - Filtrer par demande
- `recipient_id` - Filtrer par destinataire
- `limit` - Nombre max résultats (défaut: 50)
- `offset` - Pagination (défaut: 0)

**Response:**
```json
{
  "ok": true,
  "notifications": [
    {
      "id": "uuid",
      "approval_request_id": "uuid",
      "recipient_email": "ops@molam.com",
      "notification_type": "approval_request",
      "status": "sent",
      "sent_at": "2025-01-19T10:00:00Z",
      "smtp_message_id": "<xxx@molam.com>"
    }
  ]
}
```

## Flux de Notification

### 1. Création de Demande d'Approbation (B135)
- Service Approvals crée une demande
- Identifie les approbateurs (roles requis)
- Appelle `/api/notifications/send-approval-request` pour chaque approbateur

### 2. Génération de Tokens Signés
- Service génère 2 tokens JWT par destinataire:
  - Token "approve" valide 10 min
  - Token "reject" valide 10 min
- Hash SHA256 stocké en BDD
- Tokens intégrés dans les liens email

### 3. Envoi Email
- Template Handlebars rendu avec données
- Email envoyé via SMTP (Nodemailer)
- Log dans `notification_audit`
- Liens format: `https://ops.molam.com/approvals?token=xxx`

### 4. Clic sur Lien Email
- Utilisateur clique sur "Approuver" ou "Rejeter"
- Frontend appelle `/api/notifications/verify-token`
- Service vérifie:
  - Signature JWT valide
  - Token non expiré (<10 min)
  - Token non utilisé
  - Token non révoqué
- Si valide: soumet vote au service Approvals (B135)
- Log dans `email_click_audit`

### 5. Soumission du Vote
- Service Notifications appelle `/api/approvals/requests/:id/vote`
- Utilise header `X-On-Behalf-Of` pour identifier l'utilisateur
- Token marqué `used_at = now()`
- Réponse renvoyée à l'utilisateur

## Sécurité

**Signature JWT:**
- Algorithme HS256
- Secret: `APPROVAL_SECRET_KEY` (env var, min 32 chars)
- Expiration: 10 minutes
- JTI (JWT ID) unique pour tracking

**Stockage Tokens:**
- Hash SHA256 en BDD (pas le token en clair)
- One-time use (marqué `used_at`)
- Révocation possible

**Protection Anti-Replay:**
- Contrainte unique (request_id, approver_id) dans approval_votes (B135)
- Token marked `used_at` après première utilisation
- Audit complet des tentatives

**HTTPS Obligatoire:**
- Tokens transmis uniquement via HTTPS
- Emails contiennent liens HTTPS uniquement

**Rate Limiting:**
- 200 req/min par IP (configurable)

## Templates Email

### approval_request.html
Email de demande d'approbation avec:
- Header Molam Pay avec logo
- Description de l'action
- Détails (montant, quorum, ID)
- Boutons "Approuver" (vert) et "Rejeter" (rouge)
- Avertissement expiration
- Footer avec mention légale

### expiry_warning.html
Avertissement d'expiration imminente:
- Bannière orange avec ⚠️
- ID demande
- Date/heure expiration
- Lien vers dashboard

### approval_decision.html
Confirmation de décision:
- Bannière verte (approuvé) ou rouge (rejeté)
- ID demande
- Statut final

## Configuration

**Variables d'environnement requises:**

```bash
# Database
DATABASE_URL=postgres://user:pass@host:5432/molam

# SMTP
SMTP_HOST=smtp.molam.com
SMTP_PORT=587
SMTP_USER=no-reply@molam.com
SMTP_PASS=secure-password
SMTP_FROM=Molam Pay Ops <no-reply@molam.com>

# JWT Signing
APPROVAL_SECRET_KEY=your-very-secure-secret-key-min-32-chars

# Token Expiration
TOKEN_EXPIRATION_MINUTES=10

# Frontend URL
FRONTEND_URL=https://ops.molam.com/approvals

# Integration
APPROVALS_SERVICE_URL=http://approvals-service
SERVICE_TOKEN=internal-service-token

# Server
PORT=8086
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=https://ops.molam.com
RATE_LIMIT_MAX=200
```

## Déploiement

### Docker
```bash
docker build -t notifications-service .
docker run -p 8086:8086 \
  -e DATABASE_URL=postgres://... \
  -e SMTP_HOST=smtp.molam.com \
  -e SMTP_USER=no-reply@molam.com \
  -e SMTP_PASS=... \
  -e APPROVAL_SECRET_KEY=... \
  notifications-service
```

### Kubernetes
```bash
kubectl apply -f k8s/deployment.yaml
```

**Secrets requis:**
```bash
kubectl create secret generic notifications-secrets \
  --from-literal=DATABASE_URL=postgres://... \
  --from-literal=SMTP_PASS=... \
  --from-literal=APPROVAL_SECRET_KEY=... \
  --from-literal=SERVICE_TOKEN=... \
  -n molam-pay
```

## Métriques Prometheus

```
molam_notifications_emails_sent_total{notification_type, status}
molam_notifications_token_verifications_total{result}
```

## Runbook

### Test de l'envoi d'email
```bash
curl -X POST https://api.molam.com/api/notifications/send-approval-request \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approval_request_id": "test-123",
    "ops_log_id": "ops-123",
    "action_type": "execute_plan",
    "description": "Test email",
    "quorum": 2,
    "recipient_id": "user-123",
    "recipient_email": "test@molam.com",
    "recipient_name": "Test User",
    "expires_at": "2025-01-19T12:00:00Z"
  }'
```

### Vérification d'un token
```bash
curl -X POST https://api.molam.com/api/notifications/verify-token \
  -H "Content-Type: application/json" \
  -d '{"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'
```

### Révoquer tous les tokens d'une demande
```sql
UPDATE email_action_tokens
SET revoked = true
WHERE approval_request_id = 'request-uuid'
  AND used_at IS NULL;
```

### Vérifier les tokens expirés non utilisés
```sql
SELECT
  id,
  approval_request_id,
  action,
  recipient_email,
  expires_at,
  created_at
FROM email_action_tokens
WHERE used_at IS NULL
  AND expires_at < now()
  AND NOT revoked
ORDER BY created_at DESC
LIMIT 100;
```

### Audit des clics échoués
```sql
SELECT
  approval_request_id,
  action,
  result,
  error_message,
  COUNT(*) as count
FROM email_click_audit
WHERE result != 'success'
  AND clicked_at > now() - interval '24 hours'
GROUP BY approval_request_id, action, result, error_message
ORDER BY count DESC;
```

## Monitoring

**Health Checks:**
- `/healthz` - Liveness probe
- `/readyz` - Readiness probe (vérifie DB)
- `/metrics` - Métriques Prometheus

**Alertes recommandées:**
- Email send failures >5% sur 5 min
- Token verification failures >10% sur 5 min
- SMTP connection errors
- Database unavailable

**SLOs:**
- Email delivery P95 < 3s
- Token verification P95 < 100ms
- Email send success rate > 99%

## Intégration

### Avec Brique 135 (Approvals)
1. Service Approvals crée demande → Event `approval.request.created`
2. Notifications écoute event → Envoie email avec tokens signés
3. Utilisateur clique lien → Notifications vérifie token + soumet vote à Approvals
4. Approvals évalue quorum → Exécution si approuvé

### Event Bus
**Events écoutés:**
- `approval.request.created` → Envoyer email approbation
- `approval.request.expiring_soon` → Envoyer avertissement (24h avant)
- `approval.request.approved` → Envoyer confirmation
- `approval.request.rejected` → Envoyer notification

## Version
**1.0.0** | Statut: ✅ Production Ready

## Points d'Intégration
- **Approvals Service (B135)** - Soumission des votes
- **Event Bus** - Écoute événements approbations
- **SMTP Server** - Envoi emails
- **Frontend Ops** - Landing page pour liens email
