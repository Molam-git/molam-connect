# Brique 136bis — Multi-Channel Approvals (Email + Slack + App Push)

## Vue d'ensemble
Extension multi-canaux du système de notifications d'approbation avec support Email, Slack et Push mobile. Stratégie intelligente de distribution avec fallback automatique et préférences utilisateur.

## Fonctionnalités
- **Multi-Canal**: Email + Slack + Push mobile + SMS (futur)
- **Préférences Utilisateur**: Canal primaire et ordre de priorité configurables
- **Fallback Automatique**: Si un canal échoue, essai sur le suivant
- **Slack Interactive**: Boutons Block Kit dans Slack avec webhooks
- **Push Mobile**: Notifications riches avec actions dans l'app Molam Ops
- **Tracking Complet**: Audit de livraison par canal avec statuts
- **One-Click Approval**: Liens signés JWT sur tous les canaux
- **Gestion Multi-Devices**: Support plusieurs devices push par utilisateur

## Architecture

### Extension de B136 (Notifications Service)
- **Nouveaux Services**: slackService, pushService, multichannelOrchestrator
- **Tables Additionnelles**: channel_delivery_log, user_channel_identifiers, slack_workspace_config
- **Orchestration**: Stratégie intelligente de distribution multi-canaux

## Tables Base de Données (Extensions)

### channel_delivery_log
Log de livraison par canal avec tracking détaillé
- `approval_request_id` - Demande liée
- `recipient_id` - Destinataire
- `channel` - email | slack | push | sms
- `attempt_number` - Numéro de tentative
- `status` - sent | delivered | failed | bounced | clicked
- `provider_message_id` - ID message du provider (Slack ts, Push notification ID)
- `attempted_at`, `delivered_at`, `clicked_at` - Timestamps
- `error_details` - Détails erreur si échec

### user_channel_identifiers
Mapping utilisateurs vers identifiants canaux
- `user_id` - Utilisateur
- `channel` - Type de canal
- `identifier` - Adresse email, Slack user ID, device token, téléphone
- `verified` - Identifiant vérifié
- `primary_channel` - Canal principal
- `enabled` - Actif/inactif

### slack_workspace_config
Configuration des workspaces Slack
- `workspace_id` - ID workspace
- `webhook_url` - URL webhook
- `channel_id` - Canal par défaut
- `bot_token` - Token bot pour messages interactifs

## API Endpoints

### POST /api/multichannel/send
Envoyer notification sur tous les canaux actifs

**Auth**: Service interne (SERVICE_TOKEN)

**Request:**
```json
{
  "approval_request_id": "uuid",
  "ops_log_id": "uuid",
  "action_type": "execute_plan",
  "description": "Exécution du plan de rerouting",
  "amount": 1234567.89,
  "currency": "XOF",
  "quorum": 2,
  "recipient_id": "uuid",
  "recipient_email": "ops@molam.com",
  "recipient_name": "Jean Dupont",
  "recipient_slack_user_id": "U1234567",
  "expires_at": "2025-01-19T12:00:00Z"
}
```

**Response:**
```json
{
  "ok": true,
  "channels_sent": ["push", "email", "slack"],
  "channels_failed": []
}
```

### POST /api/multichannel/send-primary
Envoyer uniquement sur le canal primaire de l'utilisateur

**Request:** (même structure)

**Response:**
```json
{
  "ok": true,
  "channel": "push"
}
```

### GET /api/multichannel/delivery-log/:approval_request_id
Récupérer log de livraison pour une demande

**Response:**
```json
{
  "ok": true,
  "delivery_log": [
    {
      "id": "uuid",
      "channel": "push",
      "status": "delivered",
      "attempted_at": "2025-01-19T10:00:00Z",
      "delivered_at": "2025-01-19T10:00:01Z",
      "provider_message_id": "notif-123"
    },
    {
      "id": "uuid",
      "channel": "email",
      "status": "sent",
      "attempted_at": "2025-01-19T10:00:00Z"
    }
  ]
}
```

### POST /api/multichannel/register-device
Enregistrer un device token pour push

**Auth**: User JWT

**Request:**
```json
{
  "user_id": "uuid",
  "channel": "push",
  "identifier": "device-token-xyz",
  "primary": true
}
```

**Response:**
```json
{
  "ok": true
}
```

### GET /api/multichannel/stats
Statistiques de livraison par canal

**Query Params:**
- `from` - Date début (défaut: -24h)
- `to` - Date fin (défaut: now)

**Response:**
```json
{
  "ok": true,
  "channel_stats": [
    { "channel": "email", "status": "sent", "count": 145 },
    { "channel": "slack", "status": "delivered", "count": 132 },
    { "channel": "push", "status": "clicked", "count": 98 }
  ],
  "click_stats": [
    { "channel": "push", "clicks": 98, "unique_requests": 87 },
    { "channel": "email", "clicks": 76, "unique_requests": 68 }
  ]
}
```

## Flux Multi-Canal

### 1. Création de Demande d'Approbation
- Service Approvals (B135) crée demande
- Identifie approbateurs requis par rôles
- Appelle `/api/multichannel/send` pour chaque approbateur

### 2. Orchestration Multi-Canal
**Orchestrateur** récupère:
- Préférences utilisateur (canal primaire, priorités)
- Identifiants canaux (email, Slack user ID, device tokens)

**Stratégie de distribution:**
1. **Mode "Tous les canaux"** (par défaut):
   - Envoie sur tous les canaux actifs simultanément
   - Continue même si un canal échoue
   - Log chaque tentative

2. **Mode "Canal primaire"**:
   - Envoie uniquement sur canal préféré
   - Fallback email si primaire échoue

3. **Mode "Priorité avec fallback"**:
   - Essaie canaux dans l'ordre: [push, email, slack]
   - Si échec, passe au suivant après délai configurable

### 3. Envoi Email
- Service EmailService (B136) envoie via SMTP
- Template HTML avec boutons
- Log dans `channel_delivery_log`

### 4. Envoi Slack
**Slack Block Kit:**
- Header "🔐 Approbation Requise"
- Section avec détails action
- Champs montant + ID demande
- Boutons interactifs (approve/reject) avec URLs signées
- Envoi via Bot API ou Webhook

**Tracking:**
- Slack message timestamp (`ts`) stocké
- Permet mise à jour du message après décision
- Thread support pour conversations

### 5. Envoi Push Mobile
**Payload Push:**
- Title: "🔐 Approbation Requise"
- Body: Description action
- Badge: 1
- Category: APPROVAL_REQUEST
- Actions: [Approve, Reject] avec deep links

**Livraison:**
- Envoi à tous les devices enregistrés de l'utilisateur
- Utilise API push interne Molam Ops
- Support iOS (APNS) et Android (FCM)

### 6. Fallback Automatique
Si email échoue:
1. Log erreur dans `channel_delivery_log`
2. Attendre `fallback_delay_seconds` (5 min)
3. Essayer Slack si configuré
4. Essayer Push si devices disponibles
5. Notifier ops managers si tous échouent

## Préférences Utilisateur

### Structure
```json
{
  "email_enabled": true,
  "sms_enabled": false,
  "push_enabled": true,
  "channel_priority": ["push", "email", "slack"],
  "fallback_enabled": true,
  "fallback_delay_seconds": 300
}
```

### Configuration via UI Ops
```sql
UPDATE notification_preferences
SET channel_priority = '["slack", "push", "email"]'::jsonb,
    fallback_enabled = true
WHERE user_id = 'uuid';
```

## Formats de Notification

### Slack Block Kit
```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "🔐 Approbation Requise" }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Action:* execute_plan\n*Description:* Rerouting 1,234 payouts"
      }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Montant:*\n1 234 567,89 XOF" },
        { "type": "mrkdwn", "text": "*ID:*\n`abc123...`" }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "✅ Approuver" },
          "style": "primary",
          "url": "https://ops.molam.com/approvals?token=xxx"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "❌ Rejeter" },
          "style": "danger",
          "url": "https://ops.molam.com/approvals?token=yyy"
        }
      ]
    }
  ]
}
```

### Push Notification
```json
{
  "notification": {
    "title": "🔐 Approbation Requise",
    "body": "execute_plan: Rerouting 1,234 payouts",
    "badge": 1,
    "sound": "default",
    "priority": "high"
  },
  "data": {
    "type": "approval_request",
    "approval_request_id": "uuid",
    "action_type": "execute_plan"
  },
  "actions": [
    { "id": "approve", "title": "✅ Approuver", "url": "..." },
    { "id": "reject", "title": "❌ Rejeter", "url": "..." }
  ]
}
```

## Configuration

**Variables d'environnement additionnelles:**

```bash
# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_BOT_TOKEN=xoxb-...
SLACK_WORKSPACE_ID=T1234567

# Push
PUSH_API_URL=https://ops.molam.com/api/push
PUSH_API_KEY=secure-api-key

# Fallback
FALLBACK_ENABLED=true
FALLBACK_DELAY_SECONDS=300
```

## Métriques Prometheus

```
molam_multichannel_delivery_total{channel, status}
molam_multichannel_fallback_triggered_total{from_channel, to_channel}
molam_multichannel_click_rate{channel}
```

## Monitoring & Alertes

**Alertes recommandées:**
- Slack delivery failure rate >10% sur 5 min
- Push delivery failure rate >15% sur 5 min
- All channels failed for same user >3 fois
- Fallback triggered >50 fois/heure

**Dashboards:**
- Delivery success rate par canal
- Temps de livraison P50/P95/P99
- Click-through rate par canal
- Fallback patterns

## Runbook

### Test multi-canal
```bash
curl -X POST https://api.molam.com/api/multichannel/send \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approval_request_id": "test-123",
    "ops_log_id": "ops-123",
    "action_type": "test_approval",
    "description": "Test multi-channel",
    "quorum": 1,
    "recipient_id": "user-123",
    "recipient_email": "test@molam.com",
    "recipient_slack_user_id": "U1234567",
    "expires_at": "2025-01-19T12:00:00Z"
  }'
```

### Vérifier logs de livraison
```sql
SELECT
  channel,
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (delivered_at - attempted_at))) as avg_delivery_time_seconds
FROM channel_delivery_log
WHERE attempted_at > now() - interval '1 hour'
GROUP BY channel, status
ORDER BY channel, status;
```

### Enregistrer device push
```bash
curl -X POST https://api.molam.com/api/multichannel/register-device \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-123",
    "channel": "push",
    "identifier": "device-token-xyz",
    "primary": true
  }'
```

## Intégration

### Avec B135 (Approvals)
Event `approval.request.created` → Multi-channel orchestrator → Envoie sur tous canaux

### Avec B136 (Notifications)
Réutilise tokenService et emailService, ajoute slackService et pushService

### Event Bus
**Events écoutés:**
- `approval.request.created` → Envoyer multi-canal
- `approval.request.decided` → Mettre à jour messages Slack/Push

## Version
**1.0.0** | Statut: ✅ Production Ready

## Points d'Intégration
- **Approvals Service (B135)** - Création demandes
- **Notifications Service (B136)** - Services email et tokens
- **Slack API** - Messages interactifs Block Kit
- **Push API Molam Ops** - Notifications mobiles
- **Event Bus** - Orchestration événements
