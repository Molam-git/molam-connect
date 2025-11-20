# 🔔 Molam Notifications Center — Brique 144

Industrial multi-tenant notification system for Molam Connect supporting Email, SMS, and Push notifications.

## 📋 Features

- **Multi-channel**: Email (SMTP/SES), SMS (Twilio), Push (FCM/APNs)
- **Multi-tenant**: Isolated notification configs per tenant
- **Multi-language**: Template resolution with fallback chain (tenant → global → en → fr)
- **Idempotency**: Duplicate prevention with idempotency keys
- **Retry & DLQ**: Exponential backoff with dead letter queue
- **Audit trail**: Immutable delivery logs for compliance
- **Templates**: Mustache templating with versioning
- **Provider management**: Dynamic provider selection and failover

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis (for rate limiting - optional)

### 1. Environment Setup

```bash
cp backend/.env.example backend/.env
```

Configure:
```bash
DATABASE_URL=postgres://molam:molam@localhost:5432/molam
PORT=3000

# SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASS=pass
SMTP_FROM=noreply@molam.com

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_FROM=+221770000000

# Firebase FCM
FIREBASE_SERVICE_ACCOUNT=./firebase-service-account.json
```

### 2. Database Migration

```bash
cd backend
npm install
npm run migrate
```

### 3. Start Services

```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Dispatch Worker
npm run worker
```

Services available at:
- **API**: http://localhost:3000
- **Health**: http://localhost:3000/healthz

## 📡 API Endpoints

### Emit Notification

```bash
POST /api/notifications/emit
Content-Type: application/json

{
  "tenant_type": "merchant",
  "tenant_id": "uuid-merchant",
  "user_id": "uuid-user",
  "type": "payment.succeeded",
  "template_key": "payment.succeeded",
  "template_lang": "fr",
  "params": {
    "amount": "1500",
    "currency": "XOF",
    "merchant_name": "Ma Boutique",
    "tx_id": "TX-12345"
  },
  "target": {
    "email": "client@example.com",
    "phone": "+221770000000",
    "push_tokens": ["fcm-token-1", "fcm-token-2"]
  },
  "idempotency_key": "pay-TX-12345-notif"
}
```

### List DLQ

```bash
GET /api/notifications/dlq
```

### Requeue Failed Notification

```bash
POST /api/notifications/dlq/{id}/requeue
```

### List Templates

```bash
GET /api/notifications/templates
```

### Create Template

```bash
POST /api/notifications/templates
Content-Type: application/json

{
  "tenant_type": "global",
  "key": "welcome_email",
  "lang": "en",
  "subject": "Welcome to {{app_name}}!",
  "body_text": "Hello {{name}}, welcome to {{app_name}}!",
  "body_html": "<p>Hello <strong>{{name}}</strong>, welcome to <strong>{{app_name}}</strong>!</p>"
}
```

### List Providers

```bash
GET /api/notifications/providers
```

### Toggle Provider

```bash
PATCH /api/notifications/providers/{id}
Content-Type: application/json

{
  "enabled": false
}
```

### Get Stats

```bash
GET /api/notifications/stats

# Response:
{
  "sent_24h": 1523,
  "failed_24h": 12,
  "pending": 45,
  "quarantined": 3
}
```

## 🎨 Template System

Templates use Mustache syntax with multi-tenant fallback:

**Resolution order:**
1. Tenant-specific template (e.g., `merchant:uuid-123` + `payment.succeeded` + `fr`)
2. Global template with same language (`global` + `payment.succeeded` + `fr`)
3. Global English template (`global` + `payment.succeeded` + `en`)
4. Global French template (`global` + `payment.succeeded` + `fr`)

**Example template:**

```
Subject: Paiement de {{amount}} {{currency}} réussi
Body: Bonjour {{name}}, votre paiement de {{amount}} {{currency}} a été effectué avec succès. Transaction: {{tx_id}}
```

## 🔧 Provider Configuration

### SMTP Example

```sql
INSERT INTO notification_providers(tenant_type, provider_key, type, priority, enabled, metadata)
VALUES (
  'global',
  'smtp:sendgrid',
  'smtp',
  100,
  true,
  '{"host":"smtp.sendgrid.net","port":587,"secure":false,"from":"noreply@molam.com"}'::jsonb
);
```

### Twilio Example

```sql
INSERT INTO notification_providers(tenant_type, provider_key, type, priority, enabled, metadata)
VALUES (
  'global',
  'twilio:primary',
  'twilio',
  100,
  true,
  '{"from":"+221770000000"}'::jsonb
);
```

## 🔄 Worker & Retry Logic

The dispatch worker uses exponential backoff:

- **Attempt 1**: Retry after 1 min
- **Attempt 2**: Retry after 5 min
- **Attempt 3**: Retry after 15 min
- **Attempt 4**: Retry after 1 hour
- **Attempt 5**: Retry after 6 hours
- **After 5 attempts**: Move to DLQ (quarantined)

## 🧪 Testing

```bash
npm test
```

## 🐳 Docker

```bash
docker-compose up --build
```

## 📊 Monitoring

### Key Metrics

- **Delivery rate**: `sent / (sent + failed)`
- **DLQ size**: Count of quarantined notifications
- **Processing latency**: Time from enqueue to delivery
- **Per-channel stats**: Email/SMS/Push success rates

### Queries

```sql
-- Recent failures
SELECT * FROM notifications WHERE status='failed' AND created_at > NOW() - INTERVAL '1 hour';

-- DLQ size
SELECT COUNT(*) FROM notifications WHERE status='quarantined';

-- Delivery stats by channel
SELECT
  channel,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status='sent') as sent
FROM notification_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY channel;
```

## 🔐 Security

- **JWT Authentication**: Requires Molam ID JWT for admin endpoints
- **RBAC**: Role-based access (`ops_notifications`, `pay_admin`)
- **Secrets Management**: Provider credentials stored in Vault (not DB)
- **Audit Trail**: Immutable logs for compliance
- **Rate Limiting**: Redis-based per-tenant limits (coming soon)

## 📚 Architecture

```
Producer (modules) → API → notifications table
                              ↓
                        Dispatch Worker
                              ↓
                    ┌─────────┼─────────┐
                    ↓         ↓         ↓
                 Email       SMS      Push
                 (SMTP)   (Twilio)   (FCM)
                    ↓         ↓         ↓
              notification_logs (audit)
```

## 🛠️ Troubleshooting

### Worker not processing

```bash
# Check worker logs
npm run worker

# Check pending notifications
psql $DATABASE_URL -c "SELECT * FROM notifications WHERE status='pending' LIMIT 10;"
```

### Email not sending

```bash
# Test SMTP connection
telnet $SMTP_HOST $SMTP_PORT

# Check provider config
psql $DATABASE_URL -c "SELECT * FROM notification_providers WHERE type='smtp';"
```

### High DLQ size

```sql
-- Analyze error patterns
SELECT last_error, COUNT(*) FROM notifications WHERE status='quarantined' GROUP BY last_error;

-- Requeue all
UPDATE notifications SET status='pending', attempts=0, next_attempt_at=now() WHERE status='quarantined';
```

## 📞 Support

- **Slack**: #molam-notifications
- **Docs**: https://docs.molam.com/notifications

---

**Last updated**: 2025-01-19
**Version**: 1.0.0
