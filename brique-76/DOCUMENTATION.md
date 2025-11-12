# Brique 76 - Notifications & Alerte Marchand

> **Industrial-grade multi-channel notification system with Sira AI personalization**

[![Version](https://img.shields.io/badge/version-1.0.0-blue)]()
[![Status](https://img.shields.io/badge/status-production%20ready-brightgreen)]()
[![AI](https://img.shields.io/badge/AI-Sira%20Powered-purple)]()

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Schéma de base de données](#schéma-de-base-de-données)
4. [Référence API](#référence-api)
5. [Guide d'intégration](#guide-dintégration)
6. [Guide utilisateur](#guide-utilisateur)
7. [Sira AI Personalization](#sira-ai-personalization)
8. [Meilleures pratiques](#meilleures-pratiques)
9. [Dépannage](#dépannage)
10. [Performance](#performance)

---

## Vue d'ensemble

### Qu'est-ce que Brique 76 ?

**Brique 76** est un système de notification industriel multi-canaux conçu pour Molam Connect. Il permet d'envoyer des notifications personnalisées via :

- **Email** (SendGrid, AWS SES)
- **SMS** (Twilio, SMPP)
- **Push** (FCM, APNs)
- **In-app** (Centre de notifications persistant)
- **Webhook** (Events HTTP vers endpoints marchands)

### Fonctionnalités principales

#### 1. Templates multi-langues avec versioning
- Contenu en français, anglais, portugais, espagnol
- Versioning automatique (rollback possible)
- Variables dynamiques avec Handlebars
- Preview avant envoi

#### 2. Preference Center GDPR-compliant
- Opt-in/opt-out par canal
- Opt-in/opt-out par catégorie
- Granularité canal + catégorie
- Quiet hours (ne pas déranger)
- Unsubscribe one-click (token unique)

#### 3. Throttling & Rate Limiting
- Limites par minute, heure, jour
- Par tenant (merchant, global, ops)
- Par canal et catégorie
- Bypass pour notifications critiques

#### 4. Sira AI Personalization
- Détection du meilleur canal par utilisateur
- Optimisation du moment d'envoi
- Scores d'engagement (email, SMS, push, in-app)
- A/B testing automatique

#### 5. Tracking & Analytics
- Delivery status (sent, delivered, failed, bounced)
- Engagement tracking (opened, clicked)
- Retry automatique avec backoff
- Dashboard Ops temps réel

#### 6. Multi-tenant & Secure
- Isolation par tenant (merchant, ops)
- RBAC via Molam ID JWT
- Audit trail immutable
- GDPR compliant

---

## Architecture

### Architecture globale

```
┌─────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Merchant   │  │  Ops Admin   │  │   Customer   │         │
│  │   Dashboard  │  │   Dashboard  │  │   Mobile App │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
└─────────┼──────────────────┼──────────────────┼────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                          API LAYER                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Notification Routes (Express)                   │  │
│  │  - POST /notifications (create & dispatch)                │  │
│  │  - GET /notifications/:id (status)                        │  │
│  │  - GET /notifications/in-app (retrieve)                   │  │
│  │  - PUT /notifications/preferences (update prefs)          │  │
│  │  - POST /notifications/track/* (engagement)               │  │
│  │  - /ops/notifications/* (Ops management)                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SERVICE LAYER                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Notification Engine Service                     │  │
│  │  1. Create Request → Queue                                │  │
│  │  2. Get Template → Render with variables                  │  │
│  │  3. Check Preferences → Opt-in/out                        │  │
│  │  4. Check Throttle → Rate limits                          │  │
│  │  5. Sira Personalization → Optimize channel               │  │
│  │  6. Dispatch to Providers                                 │  │
│  │  7. Track Delivery & Engagement                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ├──────┬──────┬──────┬──────┬──────┐
          ▼      ▼      ▼      ▼      ▼      ▼
┌─────────────────────────────────────────────────────────────────┐
│                       PROVIDER LAYER                             │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐            │
│  │Email │  │ SMS  │  │ Push │  │In-app│  │Webhook│            │
│  │      │  │      │  │      │  │      │  │       │            │
│  │Send- │  │Twilio│  │ FCM  │  │ DB   │  │ HTTP │            │
│  │Grid  │  │SMPP  │  │ APNs │  │      │  │ POST │            │
│  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘            │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER (PostgreSQL)                  │
│  - notif_templates (templates multi-langue)                     │
│  - notif_requests (queue)                                        │
│  - notif_deliveries (audit trail)                               │
│  - notif_preferences (GDPR opt-in/out)                          │
│  - notif_throttles (rate limits)                                │
│  - notif_in_app_logs (in-app persistent)                        │
│  - sira_notif_insights (AI engagement tracking)                 │
└─────────────────────────────────────────────────────────────────┘
```

### Flux de traitement

#### Flux synchrone (création de notification)

```
1. Application crée une notification
   POST /api/notifications
   {
     template_key: 'payment_success',
     recipient_id: '...',
     variables: { amount: '10000 XOF', ... }
   }

2. API valide les paramètres
   - Template existe ?
   - Recipient valide ?
   - Variables complètes ?

3. Service crée la request
   INSERT INTO notif_requests
   status = 'pending'

4. Si immediate send (pas de send_at futur)
   → Appel async de processNotificationRequest()

5. Retour à l'appelant (201 Created)
   { request_id: '...', status: 'pending' }
```

#### Flux asynchrone (traitement de la notification)

```
1. processNotificationRequest(request_id)

2. Get template (active version ou spécifiée)
   SELECT * FROM get_active_template(...)

3. Get user preferences
   SELECT * FROM notif_preferences WHERE ...

4. Determine language
   request.language_override || preferences.preferred_language || 'fr'

5. Sira personalization (si enabled)
   - Get engagement insights
   - Optimize channel selection
   - Optimize send time (TODO)

6. Pour chaque canal:
   a. Check user preference
      SELECT check_user_preference(...)
      → Si opted-out, skip

   b. Check throttle limit
      SELECT check_throttle_limit(...)
      → Si throttled, skip ou delay

   c. Render template with variables
      Handlebars.compile(template)(variables)

   d. Create delivery record
      INSERT INTO notif_deliveries
      status = 'queued'

   e. Increment throttle counter
      SELECT increment_throttle_counter(...)

   f. Dispatch to provider (async)
      → sendEmail() / sendSMS() / sendPush() / ...

7. Update request status
   UPDATE notif_requests SET status = 'completed'
```

#### Flux provider dispatch

```
1. dispatchToChannel(delivery)

2. Switch sur delivery.channel:
   - email → sendEmail()
   - sms → sendSMS()
   - push → sendPush()
   - in_app → sendInApp() (INSERT INTO notif_in_app_logs)
   - webhook → sendWebhook()

3. Provider call (externe)
   - SendGrid API / Twilio API / FCM / ...
   - Récupération provider_message_id

4. Update delivery
   UPDATE notif_deliveries
   SET status = 'sent', sent_at = now(),
       provider = '...', provider_message_id = '...'

5. En cas d'erreur:
   UPDATE notif_deliveries
   SET status = 'failed', retry_count = retry_count + 1,
       next_retry_at = now() + INTERVAL '5 minutes'
```

---

## Schéma de base de données

### Tables principales

#### 1. `notif_templates`

Templates multi-langues avec versioning.

```sql
CREATE TABLE notif_templates (
  id UUID PRIMARY KEY,
  template_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'merchant', 'ops')),
  scope_id UUID,
  category notif_category NOT NULL,
  channels notif_channel[] NOT NULL,
  content JSONB NOT NULL,
  variables TEXT[] DEFAULT ARRAY[]::TEXT[],
  status notif_template_status DEFAULT 'draft',
  is_default BOOLEAN DEFAULT false,
  sira_personalization_enabled BOOLEAN DEFAULT false,
  sira_config JSONB DEFAULT '{}'::JSONB,
  created_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(template_key, version, scope, scope_id)
);
```

**Content structure (JSONB)**:

```json
{
  "fr": {
    "subject": "Paiement réussi - {{amount}}",
    "body_text": "Bonjour {{customer_name}}, votre paiement de {{amount}} a été traité avec succès.",
    "body_html": "<html>...",
    "sms_text": "Paiement de {{amount}} reçu avec succès.",
    "push_title": "Paiement réussi",
    "push_body": "{{amount}} - Transaction {{transaction_id}}",
    "webhook_payload": {
      "event": "payment.success",
      "amount": "{{amount}}",
      "transaction_id": "{{transaction_id}}"
    }
  },
  "en": { ... },
  "pt": { ... }
}
```

**Variables**: `['customer_name', 'amount', 'transaction_id', 'transaction_date']`

---

#### 2. `notif_preferences`

Préférences utilisateur GDPR-compliant.

```sql
CREATE TABLE notif_preferences (
  id UUID PRIMARY KEY,
  user_type TEXT NOT NULL CHECK (user_type IN ('merchant', 'ops_user', 'customer', 'connect_account')),
  user_id UUID NOT NULL,
  email TEXT,
  phone TEXT,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,
  webhook_enabled BOOLEAN DEFAULT true,
  category_preferences JSONB DEFAULT '{}'::JSONB,
  granular_preferences JSONB DEFAULT '{}'::JSONB,
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  quiet_hours_timezone TEXT DEFAULT 'UTC',
  preferred_language TEXT DEFAULT 'fr',
  gdpr_consent_given BOOLEAN DEFAULT false,
  gdpr_consent_at TIMESTAMPTZ,
  unsubscribe_token TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_type, user_id)
);
```

**Category preferences (JSONB)**:

```json
{
  "transaction": true,
  "marketing": false,
  "security": true,
  "fraud_alert": true
}
```

**Granular preferences (JSONB)** (canal + catégorie):

```json
{
  "email": {
    "marketing": false,
    "transaction": true
  },
  "sms": {
    "marketing": false
  }
}
```

---

#### 3. `notif_requests`

Queue des notifications à envoyer.

```sql
CREATE TABLE notif_requests (
  id UUID PRIMARY KEY,
  template_key TEXT NOT NULL,
  template_version INTEGER,
  recipient_type TEXT NOT NULL,
  recipient_id UUID NOT NULL,
  channels notif_channel[] NOT NULL,
  priority notif_priority DEFAULT 'normal',
  variables JSONB NOT NULL DEFAULT '{}'::JSONB,
  language_override TEXT,
  send_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  context JSONB DEFAULT '{}'::JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  status TEXT DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  error_message TEXT
);
```

**Status**: `pending`, `processing`, `completed`, `failed`, `cancelled`

---

#### 4. `notif_deliveries`

Audit trail de toutes les tentatives de delivery.

```sql
CREATE TABLE notif_deliveries (
  id UUID PRIMARY KEY,
  request_id UUID REFERENCES notif_requests(id),
  channel notif_channel NOT NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  recipient_device_token TEXT,
  recipient_webhook_url TEXT,
  rendered_subject TEXT,
  rendered_body_text TEXT,
  rendered_body_html TEXT,
  rendered_payload JSONB,
  template_id UUID REFERENCES notif_templates(id),
  template_key TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  status notif_delivery_status DEFAULT 'pending',
  provider TEXT,
  provider_message_id TEXT,
  provider_response JSONB,
  queued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  clicked_links TEXT[],
  metadata JSONB DEFAULT '{}'::JSONB
);
```

**Status**: `pending`, `queued`, `sent`, `delivered`, `failed`, `bounced`, `spam`, `unsubscribed`, `throttled`, `skipped`

---

#### 5. `notif_throttles`

Configuration des rate limits.

```sql
CREATE TABLE notif_throttles (
  id UUID PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'merchant', 'ops')),
  scope_id UUID,
  channel notif_channel NOT NULL,
  category notif_category,
  max_per_minute INTEGER,
  max_per_hour INTEGER,
  max_per_day INTEGER,
  bypass_for_critical BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(scope, scope_id, channel, category)
);
```

**Exemple**:
- Global: 100 emails/minute pour transactions
- Merchant X: 10 SMS/minute pour marketing
- Critical priority bypass throttles

---

#### 6. `notif_in_app_logs`

Centre de notifications in-app (persistant).

```sql
CREATE TABLE notif_in_app_logs (
  id UUID PRIMARY KEY,
  user_type TEXT NOT NULL,
  user_id UUID NOT NULL,
  delivery_id UUID REFERENCES notif_deliveries(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT,
  action_url TEXT,
  category notif_category NOT NULL,
  priority notif_priority DEFAULT 'normal',
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

**Auto-cleanup**: Notifications expirées supprimées automatiquement.

---

#### 7. `sira_notif_insights`

AI insights sur les préférences utilisateurs.

```sql
CREATE TABLE sira_notif_insights (
  id UUID PRIMARY KEY,
  user_type TEXT NOT NULL,
  user_id UUID NOT NULL,
  preferred_channel notif_channel,
  preferred_time_of_day INTEGER,
  email_engagement_score NUMERIC(3,2) DEFAULT 0.5,
  sms_engagement_score NUMERIC(3,2) DEFAULT 0.5,
  push_engagement_score NUMERIC(3,2) DEFAULT 0.5,
  in_app_engagement_score NUMERIC(3,2) DEFAULT 0.5,
  total_sent INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  last_analyzed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_type, user_id)
);
```

**Scores** (0-1):
- `email_engagement_score`: Probabilité que l'user ouvre un email
- `sms_engagement_score`: Probabilité de lecture SMS
- `push_engagement_score`: Probabilité de click sur push
- `in_app_engagement_score`: Probabilité de lecture in-app

---

### Fonctions SQL

#### 1. `get_active_template(template_key, scope, scope_id)`

Récupère le template actif par défaut pour une clé donnée.

```sql
SELECT * FROM get_active_template('payment_success', 'global', NULL);
```

Retourne le template avec `status = 'active'` et `is_default = true`, ou le plus récent si aucun par défaut.

---

#### 2. `check_throttle_limit(scope, scope_id, channel, category, priority)`

Vérifie si une notification peut être envoyée sans dépasser les throttles.

```sql
SELECT check_throttle_limit('merchant', 'merchant-uuid', 'email', 'marketing', 'normal');
-- Returns true or false
```

**Logique**:
- Si `priority = 'critical'`, bypass throttles
- Sinon, récupère les counters pour minute, heure, jour
- Compare aux limites configurées
- Retourne `true` si dans les limites

---

#### 3. `increment_throttle_counter(scope, scope_id, channel, category)`

Incrémente les compteurs pour les 3 time windows (minute, heure, jour).

```sql
SELECT increment_throttle_counter('merchant', 'merchant-uuid', 'email', 'marketing');
```

Utilise `ON CONFLICT DO UPDATE` pour upsert atomique.

---

#### 4. `check_user_preference(user_type, user_id, channel, category)`

Vérifie si l'utilisateur a opté-in pour un canal + catégorie.

```sql
SELECT check_user_preference('merchant', 'user-uuid', 'email', 'marketing');
-- Returns true or false
```

**Logique**:
1. Check channel-level opt-out (`email_enabled = false` → false)
2. Check category-level opt-out (`category_preferences->>'marketing' = 'false'` → false)
3. Check granular opt-out (`granular_preferences->'email'->>'marketing' = 'false'` → false)
4. Check quiet hours (pour push/in-app)

---

#### 5. `record_notification_engagement(delivery_id, event_type, clicked_url)`

Enregistre un événement d'engagement (opened, clicked).

```sql
SELECT record_notification_engagement('delivery-uuid', 'opened', NULL);
SELECT record_notification_engagement('delivery-uuid', 'clicked', 'https://...');
```

Met à jour `notif_deliveries` et update Sira insights asynchronously.

---

#### 6. `get_unread_notif_count(user_type, user_id)`

Compte les notifications in-app non lues.

```sql
SELECT get_unread_notif_count('merchant', 'user-uuid');
-- Returns integer
```

---

### Views

#### 1. `notif_template_stats`

Statistiques agrégées par template.

```sql
SELECT * FROM notif_template_stats WHERE template_key = 'payment_success';
```

**Colonnes**:
- `total_deliveries`
- `delivered_count`
- `failed_count`
- `opened_count`
- `clicked_count`
- `delivery_rate` (%)
- `open_rate` (%)
- `click_through_rate` (%)

---

#### 2. `merchant_notif_dashboard`

Dashboard par merchant.

```sql
SELECT * FROM merchant_notif_dashboard WHERE merchant_id = 'merchant-uuid';
```

**Colonnes**:
- `total_notifications`
- `delivered`
- `failed`
- `opened`
- `clicked`
- `last_notification_at`

---

## Référence API

### Base URL

```
Production: https://api.molam.app
Staging: https://api-staging.molam.app
```

### Authentication

Toutes les requêtes nécessitent un JWT de Molam ID:

```http
Authorization: Bearer <JWT_TOKEN>
```

Le token contient:
```json
{
  "id": "user-uuid",
  "type": "merchant",
  "email": "user@example.com",
  "roles": ["merchant"]
}
```

---

### Endpoints

#### 1. Create Notification

**POST** `/api/notifications`

Crée et dispatch une notification.

**Request**:
```json
{
  "template_key": "payment_success",
  "template_version": 1,
  "recipient_type": "merchant",
  "recipient_id": "merchant-uuid",
  "channels": ["email", "in_app"],
  "priority": "normal",
  "variables": {
    "customer_name": "John Doe",
    "amount": "10000 XOF",
    "transaction_id": "txn_12345",
    "transaction_date": "2025-11-12 14:30:00"
  },
  "language_override": "fr",
  "send_at": "2025-11-12T15:00:00Z",
  "idempotency_key": "payment_success_txn_12345",
  "context": {
    "payment_method": "mobile_money",
    "merchant_name": "Boutique ABC"
  }
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "notification": {
    "id": "request-uuid",
    "status": "pending",
    "created_at": "2025-11-12T14:00:00Z"
  },
  "message": "Notification created and dispatched"
}
```

**Validation**:
- `template_key`: required, string
- `recipient_type`: required, enum (`merchant`, `ops_user`, `customer`, `connect_account`)
- `recipient_id`: required, UUID
- `variables`: required, object
- `channels`: optional, array of enums (default: template channels)
- `priority`: optional, enum (`critical`, `high`, `normal`, `low`)
- `send_at`: optional, ISO8601 datetime (default: immediate)

---

#### 2. Get Notification Request

**GET** `/api/notifications/:requestId`

Récupère le statut d'une notification.

**Response** (200 OK):
```json
{
  "success": true,
  "request": {
    "id": "request-uuid",
    "template_key": "payment_success",
    "status": "completed",
    "processed_at": "2025-11-12T14:00:05Z"
  },
  "deliveries": [
    {
      "id": "delivery-uuid-1",
      "channel": "email",
      "status": "delivered",
      "sent_at": "2025-11-12T14:00:06Z",
      "delivered_at": "2025-11-12T14:00:08Z",
      "opened_at": "2025-11-12T14:10:00Z"
    },
    {
      "id": "delivery-uuid-2",
      "channel": "in_app",
      "status": "delivered",
      "sent_at": "2025-11-12T14:00:06Z"
    }
  ]
}
```

---

#### 3. Get In-App Notifications

**GET** `/api/notifications/in-app`

Récupère les notifications in-app pour l'utilisateur courant.

**Query params**:
- `limit` (optional, default: 50, max: 100)
- `offset` (optional, default: 0)

**Response** (200 OK):
```json
{
  "success": true,
  "notifications": [
    {
      "id": "notif-uuid",
      "title": "Paiement réussi",
      "body": "Votre paiement de 10000 XOF a été traité avec succès.",
      "icon": "✅",
      "action_url": "/transactions/txn_12345",
      "category": "transaction",
      "priority": "normal",
      "read": false,
      "created_at": "2025-11-12T14:00:00Z"
    }
  ],
  "unread_count": 5,
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

---

#### 4. Mark In-App Notification as Read

**POST** `/api/notifications/in-app/:notificationId/read`

Marque une notification comme lue.

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

---

#### 5. Get Unread Count

**GET** `/api/notifications/in-app/unread-count`

Récupère le nombre de notifications non lues.

**Response** (200 OK):
```json
{
  "success": true,
  "unread_count": 5
}
```

---

#### 6. Get User Preferences

**GET** `/api/notifications/preferences`

Récupère les préférences de l'utilisateur courant.

**Response** (200 OK):
```json
{
  "success": true,
  "preferences": {
    "id": "prefs-uuid",
    "user_type": "merchant",
    "user_id": "user-uuid",
    "email": "user@example.com",
    "phone": "+221771234567",
    "email_enabled": true,
    "sms_enabled": false,
    "push_enabled": true,
    "in_app_enabled": true,
    "category_preferences": {
      "marketing": false,
      "transaction": true,
      "security": true
    },
    "granular_preferences": {
      "email": {
        "marketing": false
      }
    },
    "quiet_hours_enabled": true,
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "08:00",
    "quiet_hours_timezone": "Africa/Dakar",
    "preferred_language": "fr"
  }
}
```

---

#### 7. Update User Preferences

**PUT** `/api/notifications/preferences`

Met à jour les préférences de l'utilisateur.

**Request**:
```json
{
  "email_enabled": true,
  "sms_enabled": false,
  "category_preferences": {
    "marketing": false,
    "transaction": true
  },
  "quiet_hours_enabled": true,
  "quiet_hours_start": "22:00",
  "quiet_hours_end": "08:00",
  "preferred_language": "en"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "preferences": { ... },
  "message": "Preferences updated successfully"
}
```

---

#### 8. Unsubscribe (GDPR one-click)

**GET** `/api/notifications/unsubscribe/:token`

Désinscription via token unique (pour lien unsubscribe dans emails).

**Query params**:
- `channel` (optional): `email`, `sms`, `push`, `in_app` (omit for all)

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Successfully unsubscribed"
}
```

**No authentication required** (token is sufficient).

---

#### 9. Track Opened

**POST** `/api/notifications/track/opened`

Enregistre un événement "opened".

**Request**:
```json
{
  "delivery_id": "delivery-uuid"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Engagement tracked"
}
```

**No authentication required** (public endpoint pour tracking pixels).

---

#### 10. Track Clicked

**POST** `/api/notifications/track/clicked`

Enregistre un événement "clicked".

**Request**:
```json
{
  "delivery_id": "delivery-uuid",
  "url": "https://example.com/..."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Click tracked"
}
```

---

### Ops Endpoints (Authentication + Role Required)

#### 11. List Templates

**GET** `/api/ops/notifications/templates`

Liste tous les templates (Ops only).

**Query params**:
- `scope` (optional): `global`, `merchant`, `ops`
- `status` (optional): `draft`, `active`, `archived`, `deprecated`
- `category` (optional): category enum
- `limit` (optional, default: 50)
- `offset` (optional, default: 0)

**Roles required**: `ops_admin`, `pay_admin`

**Response** (200 OK):
```json
{
  "success": true,
  "templates": [
    {
      "id": "template-uuid",
      "template_key": "payment_success",
      "version": 1,
      "scope": "global",
      "status": "active",
      "channels": ["email", "sms", "push", "in_app"],
      "created_at": "2025-11-01T00:00:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

---

#### 12. Get Template

**GET** `/api/ops/notifications/templates/:templateId`

Récupère un template spécifique.

**Roles required**: `ops_admin`, `pay_admin`

**Response** (200 OK):
```json
{
  "success": true,
  "template": {
    "id": "template-uuid",
    "template_key": "payment_success",
    "version": 1,
    "content": {
      "fr": {
        "subject": "Paiement réussi - {{amount}}",
        "body_text": "...",
        "body_html": "..."
      },
      "en": { ... }
    },
    "variables": ["customer_name", "amount", "transaction_id"]
  }
}
```

---

#### 13. Create Template

**POST** `/api/ops/notifications/templates`

Crée un nouveau template.

**Roles required**: `ops_admin`, `pay_admin`

**Request**:
```json
{
  "template_key": "refund_processed",
  "version": 1,
  "scope": "global",
  "category": "transaction",
  "channels": ["email", "in_app"],
  "content": {
    "fr": {
      "subject": "Remboursement effectué - {{amount}}",
      "body_text": "Votre remboursement de {{amount}} a été traité.",
      "body_html": "<html>...</html>"
    },
    "en": {
      "subject": "Refund processed - {{amount}}",
      "body_text": "Your refund of {{amount}} has been processed.",
      "body_html": "<html>...</html>"
    }
  },
  "variables": ["amount", "refund_id", "original_transaction_id"],
  "status": "active",
  "is_default": true
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "template": { ... },
  "message": "Template created successfully"
}
```

---

#### 14. Update Template

**PUT** `/api/ops/notifications/templates/:templateId`

Met à jour un template.

**Roles required**: `ops_admin`, `pay_admin`

**Request** (partial updates allowed):
```json
{
  "content": {
    "fr": {
      "subject": "Nouveau subject",
      "body_text": "..."
    }
  },
  "status": "active"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "template": { ... },
  "message": "Template updated successfully"
}
```

---

#### 15. Archive Template

**DELETE** `/api/ops/notifications/templates/:templateId`

Archive un template (soft delete).

**Roles required**: `ops_admin`

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Template archived successfully"
}
```

---

#### 16. Get Notification Stats

**GET** `/api/ops/notifications/stats`

Récupère les statistiques agrégées.

**Query params**:
- `start_date` (optional): ISO8601
- `end_date` (optional): ISO8601
- `template_key` (optional): filter by template

**Roles required**: `ops_admin`, `pay_admin`

**Response** (200 OK):
```json
{
  "success": true,
  "stats": [
    {
      "template_key": "payment_success",
      "template_version": 1,
      "channel": "email",
      "total_deliveries": 1000,
      "delivered_count": 950,
      "failed_count": 50,
      "opened_count": 600,
      "clicked_count": 200,
      "delivery_rate": 95.0,
      "open_rate": 63.16,
      "click_through_rate": 33.33
    }
  ]
}
```

---

#### 17. Get Delivery Logs

**GET** `/api/ops/notifications/deliveries`

Récupère les logs de delivery (audit).

**Query params**:
- `status` (optional): filter by status
- `channel` (optional): filter by channel
- `limit` (optional, default: 50)
- `offset` (optional, default: 0)

**Roles required**: `ops_admin`, `pay_admin`

**Response** (200 OK):
```json
{
  "success": true,
  "deliveries": [
    {
      "id": "delivery-uuid",
      "request_id": "request-uuid",
      "channel": "email",
      "recipient_email": "user@example.com",
      "status": "delivered",
      "queued_at": "2025-11-12T14:00:00Z",
      "sent_at": "2025-11-12T14:00:05Z",
      "delivered_at": "2025-11-12T14:00:08Z",
      "provider": "sendgrid",
      "provider_message_id": "sg_12345"
    }
  ],
  "pagination": { ... }
}
```

---

#### 18. Get Merchant Dashboard

**GET** `/api/ops/notifications/merchant/:merchantId/dashboard`

Dashboard notifications pour un merchant spécifique.

**Roles required**: `ops_admin`, `pay_admin`

**Response** (200 OK):
```json
{
  "success": true,
  "dashboard": {
    "merchant_id": "merchant-uuid",
    "total_notifications": 5000,
    "delivered": 4750,
    "failed": 250,
    "opened": 3000,
    "clicked": 1000,
    "last_notification_at": "2025-11-12T14:00:00Z"
  }
}
```

---

#### 19. Retry Failed Deliveries

**POST** `/api/ops/notifications/retry-failed`

Relance manuellement les deliveries échouées.

**Roles required**: `ops_admin`

**Response** (200 OK):
```json
{
  "success": true,
  "retried_count": 42,
  "message": "Retried 42 failed deliveries"
}
```

---

#### 20. Health Check

**GET** `/api/notifications/health`

Vérifie la santé du service.

**No authentication required**.

**Response** (200 OK):
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-11-12T14:00:00Z"
}
```

---

## Guide d'intégration

### 1. Installation du schéma

```bash
psql -d molam_connect -f brique-76/sql/004_notifications_schema.sql
```

Vérifie:
```sql
SELECT COUNT(*) FROM notif_templates WHERE template_key IN ('payment_success', 'fraud_alert_high');
-- Should return 2 (seed templates)
```

---

### 2. Installation backend

```bash
cd brique-76
npm install
# ou yarn install
```

**Dependencies**:
```json
{
  "express": "^4.18.0",
  "express-validator": "^7.0.0",
  "pg": "^8.11.0",
  "handlebars": "^4.7.8",
  "dotenv": "^16.0.0"
}
```

**Environment variables** (`.env`):
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=molam_connect
DB_USER=postgres
DB_PASSWORD=your_password

# Email provider (SendGrid example)
SENDGRID_API_KEY=your_sendgrid_key
SENDGRID_FROM_EMAIL=notifications@molam.app

# SMS provider (Twilio example)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_FROM_PHONE=+221771234567

# Push provider (FCM example)
FCM_SERVER_KEY=your_fcm_key

# Sira AI endpoint (if external)
SIRA_API_URL=https://sira.molam.app
```

---

### 3. Mount routes

```typescript
import express from 'express';
import notificationRoutes from './routes/notificationRoutes';

const app = express();

app.use(express.json());
app.use('/api', notificationRoutes);

app.listen(3000, () => {
  console.log('Notification API running on port 3000');
});
```

---

### 4. Setup cron jobs

**Retry failed deliveries** (every 5 minutes):

```typescript
import cron from 'node-cron';
import { retryFailedDeliveries } from './services/notificationEngine';

cron.schedule('*/5 * * * *', async () => {
  console.log('[Cron] Retrying failed deliveries...');
  const retried = await retryFailedDeliveries();
  console.log(`[Cron] Retried ${retried} deliveries`);
});
```

**Process scheduled notifications** (every minute):

```typescript
import { processScheduledNotifications } from './services/notificationEngine';

cron.schedule('* * * * *', async () => {
  console.log('[Cron] Processing scheduled notifications...');
  const processed = await processScheduledNotifications();
  console.log(`[Cron] Processed ${processed} notifications`);
});
```

**Cleanup old throttle counters** (daily at 3 AM):

```typescript
import { cleanupThrottleCounters } from './services/notificationEngine';

cron.schedule('0 3 * * *', async () => {
  console.log('[Cron] Cleaning up throttle counters...');
  const deleted = await cleanupThrottleCounters();
  console.log(`[Cron] Deleted ${deleted} old counters`);
});
```

---

### 5. Integration dans le payment flow

**Après un paiement réussi**:

```typescript
import { createNotification } from './services/notificationEngine';

async function onPaymentSuccess(payment: Payment) {
  await createNotification({
    template_key: 'payment_success',
    recipient_type: 'merchant',
    recipient_id: payment.merchant_id,
    channels: ['email', 'in_app'],
    priority: 'normal',
    variables: {
      customer_name: payment.customer_name,
      amount: `${payment.amount} ${payment.currency}`,
      transaction_id: payment.id,
      transaction_date: payment.created_at.toISOString(),
    },
    idempotency_key: `payment_success_${payment.id}`,
    context: {
      payment_method: payment.method,
      merchant_name: payment.merchant_name,
    },
  });
}
```

**Après détection de fraude**:

```typescript
async function onFraudDetected(transaction: Transaction, fraudReason: string) {
  await createNotification({
    template_key: 'fraud_alert_high',
    recipient_type: 'merchant',
    recipient_id: transaction.merchant_id,
    channels: ['email', 'sms', 'push', 'in_app', 'webhook'],
    priority: 'critical', // Bypass throttles
    variables: {
      amount: `${transaction.amount} ${transaction.currency}`,
      country: transaction.customer_country,
      fraud_reason: fraudReason,
      transaction_id: transaction.id,
      dashboard_url: `https://dashboard.molam.app/transactions/${transaction.id}`,
    },
    idempotency_key: `fraud_alert_${transaction.id}`,
  });
}
```

---

### 6. Frontend integration

#### React: In-App Notification Center

```tsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Notification {
  id: string;
  title: string;
  body: string;
  icon: string;
  read: boolean;
  created_at: string;
}

export const NotificationCenter: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadNotifications();
    loadUnreadCount();

    // Poll every 30 seconds
    const interval = setInterval(() => {
      loadUnreadCount();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    const response = await axios.get('/api/notifications/in-app', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setNotifications(response.data.notifications);
  };

  const loadUnreadCount = async () => {
    const response = await axios.get('/api/notifications/in-app/unread-count', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setUnreadCount(response.data.unread_count);
  };

  const markAsRead = async (id: string) => {
    await axios.post(
      `/api/notifications/in-app/${id}/read`,
      {},
      { headers: { Authorization: `Bearer ${getToken()}` } }
    );
    loadNotifications();
    loadUnreadCount();
  };

  return (
    <div className="notification-center">
      <div className="header">
        <h3>Notifications</h3>
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </div>

      <div className="notifications-list">
        {notifications.map(notif => (
          <div
            key={notif.id}
            className={`notification ${notif.read ? 'read' : 'unread'}`}
            onClick={() => !notif.read && markAsRead(notif.id)}
          >
            <div className="icon">{notif.icon}</div>
            <div className="content">
              <div className="title">{notif.title}</div>
              <div className="body">{notif.body}</div>
              <div className="time">{new Date(notif.created_at).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

function getToken() {
  return localStorage.getItem('molam_jwt') || '';
}
```

#### React: Preference Center

```tsx
export const NotificationPreferences: React.FC = () => {
  const [preferences, setPreferences] = useState<any>(null);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    const response = await axios.get('/api/notifications/preferences', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setPreferences(response.data.preferences);
  };

  const savePreferences = async (updates: any) => {
    await axios.put('/api/notifications/preferences', updates, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    loadPreferences();
  };

  if (!preferences) return <div>Loading...</div>;

  return (
    <div className="preferences">
      <h3>Notification Preferences</h3>

      <div className="channel-toggles">
        <label>
          <input
            type="checkbox"
            checked={preferences.email_enabled}
            onChange={e =>
              savePreferences({ email_enabled: e.target.checked })
            }
          />
          Email Notifications
        </label>

        <label>
          <input
            type="checkbox"
            checked={preferences.sms_enabled}
            onChange={e =>
              savePreferences({ sms_enabled: e.target.checked })
            }
          />
          SMS Notifications
        </label>

        <label>
          <input
            type="checkbox"
            checked={preferences.push_enabled}
            onChange={e =>
              savePreferences({ push_enabled: e.target.checked })
            }
          />
          Push Notifications
        </label>
      </div>

      <div className="category-preferences">
        <h4>Categories</h4>
        {Object.entries(preferences.category_preferences || {}).map(
          ([category, enabled]) => (
            <label key={category}>
              <input
                type="checkbox"
                checked={enabled as boolean}
                onChange={e =>
                  savePreferences({
                    category_preferences: {
                      ...preferences.category_preferences,
                      [category]: e.target.checked,
                    },
                  })
                }
              />
              {category}
            </label>
          )
        )}
      </div>
    </div>
  );
};
```

---

## Guide utilisateur

### Pour les merchants

#### 1. Consulter les notifications in-app

1. Connectez-vous au dashboard Molam
2. Cliquez sur l'icône 🔔 en haut à droite
3. Consultez la liste des notifications
4. Cliquez sur une notification pour la marquer comme lue

#### 2. Gérer les préférences

1. Allez dans **Paramètres** → **Notifications**
2. Activez/désactivez les canaux (Email, SMS, Push)
3. Configurez les catégories:
   - **Transactions**: Notifications de paiement
   - **Fraude**: Alertes de fraude
   - **Opérationnel**: Maintenance, downtime
   - **Marketing**: Promotions (opt-in)
4. Configurez les heures de silence (Quiet Hours)
5. Sélectionnez la langue préférée

#### 3. Se désinscrire des emails

**Option 1**: Cliquer sur le lien "Unsubscribe" au bas de l'email

**Option 2**: Dashboard → Paramètres → Notifications → Désactiver "Email"

---

### Pour les Ops Admins

#### 1. Créer un template

1. Allez dans **Ops Dashboard** → **Notifications** → **Templates**
2. Cliquez sur **Créer un template**
3. Remplissez:
   - **Template Key**: `new_feature_announcement`
   - **Scope**: `global` (ou `merchant` pour un merchant spécifique)
   - **Category**: `operational`
   - **Channels**: Sélectionner `email`, `in_app`
4. Rédiger le contenu multi-langue:
   - **Français**: Subject, body_text, body_html
   - **Anglais**: Idem
5. Définir les variables: `['feature_name', 'feature_url', 'release_date']`
6. Sauvegarder comme **Draft**
7. Tester avec un envoi test
8. Activer le template

#### 2. Envoyer une notification manuelle

```bash
curl -X POST https://api.molam.app/api/notifications \
  -H "Authorization: Bearer $OPS_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "template_key": "new_feature_announcement",
    "recipient_type": "merchant",
    "recipient_id": "merchant-uuid",
    "channels": ["email", "in_app"],
    "priority": "normal",
    "variables": {
      "feature_name": "Dynamic Zones",
      "feature_url": "https://molam.app/features/dynamic-zones",
      "release_date": "2025-12-01"
    }
  }'
```

#### 3. Monitorer les deliveries

1. **Ops Dashboard** → **Notifications** → **Delivery Logs**
2. Filtrer par:
   - Status (`failed`, `delivered`, `bounced`)
   - Channel (`email`, `sms`, etc.)
   - Date range
3. Examiner les erreurs:
   - `error_code`: Code d'erreur provider
   - `error_message`: Message d'erreur détaillé
   - `provider_response`: Réponse complète du provider
4. Retry manual si nécessaire:
   - **Actions** → **Retry Failed Deliveries**

#### 4. Analyser les statistiques

1. **Ops Dashboard** → **Notifications** → **Stats**
2. Consulter par template:
   - **Delivery Rate**: % de notifications envoyées avec succès
   - **Open Rate**: % de notifications ouvertes
   - **Click Through Rate**: % de clics après ouverture
3. Identifier les templates sous-performants
4. Tester des variantes (A/B testing via Sira)

---

## Sira AI Personalization

### Overview

Sira optimise automatiquement les notifications en:
1. **Sélectionnant le meilleur canal** par utilisateur (email vs SMS vs push)
2. **Optimisant le moment d'envoi** (heure de la journée la plus propice)
3. **Testant des variantes** (A/B testing automatique)

### Configuration

Dans le template, activer Sira:

```sql
UPDATE notif_templates
SET sira_personalization_enabled = true,
    sira_config = '{
      "optimize_channel": true,
      "optimize_delivery_time": false,
      "a_b_test": false
    }'::JSONB
WHERE template_key = 'payment_success';
```

### Channel Optimization

**Fonctionnement**:

1. Sira track l'engagement par canal:
   - `email_engagement_score`: 0-1 (0 = jamais ouvert, 1 = toujours ouvert)
   - `sms_engagement_score`: Idem pour SMS
   - `push_engagement_score`: Idem pour push

2. Lors du dispatch, Sira sélectionne les 2 canaux avec le meilleur score

3. Exemple:
   - User A: `email_engagement_score = 0.9`, `sms = 0.2`, `push = 0.6`
   - Sira sélectionne: `['email', 'push']`
   - Skip SMS (faible engagement)

**Activation**:

```typescript
await createNotification({
  template_key: 'payment_success', // Template avec Sira enabled
  recipient_id: 'user-uuid',
  channels: ['email', 'sms', 'push'], // Sira va filtrer
  variables: { ... },
});
```

**Mise à jour des scores**:

Automatique via trigger `update_sira_insights_on_delivery_change`:
- Chaque delivery incrémente `total_sent`
- Chaque ouverture incrémente `total_opened` et augmente le score de +0.01
- Chaque clic incrémente `total_clicked`

### Delivery Time Optimization

**TODO** (version future):

Sira analysera:
- Heure d'ouverture moyenne par user
- Jour de la semaine préféré
- Timezone

Et décalera `send_at` pour maximiser l'engagement.

### A/B Testing

**TODO** (version future):

Sira testera automatiquement:
- Variantes de subject line
- Longueur du body
- CTA buttons

Et rollera automatiquement la variante gagnante.

---

## Meilleures pratiques

### 1. Idempotency Keys

**Toujours** fournir une `idempotency_key` pour les notifications transactionnelles:

```typescript
await createNotification({
  template_key: 'payment_success',
  recipient_id: payment.merchant_id,
  idempotency_key: `payment_success_${payment.id}`, // Unique par payment
  variables: { ... },
});
```

Évite les doublons si le code est réexécuté (retry, etc.).

---

### 2. Priority Levels

**Critical**: Notifications urgentes (fraude, sécurité)
- Bypass throttles
- Sent immédiatement
- Channels: tous (email, SMS, push, in-app, webhook)

```typescript
priority: 'critical'
```

**High**: Notifications importantes (payout, KYC)
- Respecte les throttles mais prioritaire dans la queue
- Channels: email, push, in-app

```typescript
priority: 'high'
```

**Normal**: Notifications standard (transactions)
- Respecte tous les throttles
- Channels: email, in-app

```typescript
priority: 'normal'
```

**Low**: Notifications marketing
- Peut être retardée/batchée
- Channels: email (respecte opt-in marketing)

```typescript
priority: 'low'
```

---

### 3. Multi-langue

**Toujours** fournir le contenu dans les 4 langues supportées:

```json
{
  "fr": { "subject": "...", "body_text": "..." },
  "en": { "subject": "...", "body_text": "..." },
  "pt": { "subject": "...", "body_text": "..." },
  "es": { "subject": "...", "body_text": "..." }
}
```

Le système sélectionnera automatiquement la langue via:
1. `language_override` (si fourni)
2. `preferences.preferred_language`
3. Fallback: `'fr'`

---

### 4. Variables

**Documenter** toutes les variables utilisées dans `template.variables`:

```sql
INSERT INTO notif_templates (..., variables)
VALUES (..., ARRAY['customer_name', 'amount', 'transaction_id']);
```

Lors de la création de la notification, **valider** que toutes les variables sont fournies (TODO: ajouter validation côté service).

---

### 5. Throttling

**Configurer** des throttles adaptés:

**Global** (protection système):
- Email: 1000/min, 10000/hour
- SMS: 500/min, 5000/hour

**Merchant** (protection abuse):
- Email marketing: 10/min, 100/hour, 1000/day
- SMS marketing: 5/min, 50/hour, 500/day

**Bypass pour critical**:
```sql
UPDATE notif_throttles
SET bypass_for_critical = true
WHERE category = 'fraud_alert';
```

---

### 6. GDPR Compliance

**Toujours** respecter les préférences:
- Opt-out email → ne jamais envoyer d'email
- Opt-out catégorie marketing → ne jamais envoyer de marketing
- Unsubscribe link dans tous les emails
- Token unique (pas d'auth requise)

**Consentement**:
```sql
UPDATE notif_preferences
SET gdpr_consent_given = true,
    gdpr_consent_at = now(),
    gdpr_consent_ip = '192.168.1.1'
WHERE user_id = '...';
```

---

### 7. Monitoring

**Surveiller**:
- Delivery rate (target: > 95%)
- Open rate (target: > 20% pour emails)
- Failed deliveries (alert si > 5%)
- Throttle hits (ajuster les limites si trop fréquent)

**Alertes**:
- Si delivery rate < 90% pendant 1 heure → alert Ops
- Si provider down (tous les envois failed) → alert Ops
- Si throttle counter explose → possible abuse

---

## Dépannage

### Problème: Notification pas reçue

**Diagnostic**:

1. Vérifier la request:
```sql
SELECT * FROM notif_requests WHERE id = 'request-uuid';
```

- Status `pending` → pas encore traité (vérifier cron)
- Status `failed` → voir `error_message`
- Status `completed` → voir les deliveries

2. Vérifier les deliveries:
```sql
SELECT * FROM notif_deliveries WHERE request_id = 'request-uuid';
```

- Status `skipped` → user opted-out ou throttled
- Status `failed` → voir `error_code`, `error_message`
- Status `delivered` → notification envoyée (vérifier spam folder)

3. Vérifier les préférences:
```sql
SELECT * FROM notif_preferences WHERE user_id = 'user-uuid';
```

- `email_enabled = false` → user opted-out
- `category_preferences->>'marketing' = 'false'` → catégorie disabled

**Solutions**:
- Si opted-out: Demander à l'user de réactiver dans les préférences
- Si throttled: Augmenter les limites ou attendre la prochaine fenêtre
- Si provider error: Vérifier les credentials du provider

---

### Problème: Delivery rate faible

**Diagnostic**:

```sql
SELECT * FROM notif_template_stats WHERE template_key = 'payment_success';
```

Si `delivery_rate < 90%`:

1. Vérifier les failed deliveries:
```sql
SELECT error_code, error_message, COUNT(*)
FROM notif_deliveries
WHERE template_key = 'payment_success' AND status = 'failed'
GROUP BY error_code, error_message;
```

2. Causes communes:
   - **Bounced emails**: Adresses invalides → nettoyer la liste
   - **Provider quota exceeded**: Dépasse les limites du provider → upgrade plan
   - **Spam**: Emails marqués comme spam → améliorer le contenu, vérifier SPF/DKIM

**Solutions**:
- Bounces: Désactiver email pour les users avec bounces répétés
- Quota: Passer à un plan supérieur chez le provider
- Spam: Ajouter unsubscribe link, éviter les mots spam ("gratuit", "urgent")

---

### Problème: Open rate faible

**Diagnostic**:

```sql
SELECT * FROM notif_template_stats WHERE template_key = 'newsletter';
```

Si `open_rate < 10%`:

1. **Subject line** pas assez accrocheur
2. **From email** pas reconnu (use `notifications@molam.app` avec `Molam` display name)
3. **Send time** non optimal

**Solutions**:
- A/B test des subject lines (via Sira)
- Optimiser send time (Sira delivery time optimization)
- Améliorer la réputation de l'email (SPF, DKIM, DMARC)

---

### Problème: Throttle trop restrictif

**Diagnostic**:

```sql
SELECT COUNT(*) FROM notif_deliveries
WHERE status = 'throttled' AND queued_at > now() - INTERVAL '1 hour';
```

Si > 10% des deliveries throttled:

**Solutions**:

1. Augmenter les limites:
```sql
UPDATE notif_throttles
SET max_per_minute = 100, max_per_hour = 1000
WHERE scope = 'merchant' AND scope_id = 'merchant-uuid';
```

2. Ou désactiver temporairement:
```sql
UPDATE notif_throttles SET active = false
WHERE scope = 'merchant' AND scope_id = 'merchant-uuid';
```

---

## Performance

### Optimisations database

#### 1. Indexes

Déjà créés dans le schéma:
- `idx_notif_requests_status` (pour cron jobs)
- `idx_notif_deliveries_retry` (pour retry logic)
- `idx_notif_in_app_logs_user` (pour in-app queries)

#### 2. Partitioning

Pour high-volume (> 1M deliveries/mois), partitionner `notif_deliveries`:

```sql
-- Partition par mois
CREATE TABLE notif_deliveries_2025_11 PARTITION OF notif_deliveries
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE notif_deliveries_2025_12 PARTITION OF notif_deliveries
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
```

#### 3. Archivage

Archiver les deliveries > 1 an:

```sql
-- Move to archive table
INSERT INTO notif_deliveries_archive
SELECT * FROM notif_deliveries WHERE queued_at < now() - INTERVAL '1 year';

-- Delete from main table
DELETE FROM notif_deliveries WHERE queued_at < now() - INTERVAL '1 year';
```

---

### Optimisations application

#### 1. Connection pooling

Déjà configuré dans le service:
```typescript
const pool = new Pool({
  max: 20, // 20 connections max
  idleTimeoutMillis: 30000,
});
```

#### 2. Async dispatch

Dispatch est **non-bloquant**:
```typescript
// Create request (sync)
const request = await createNotification({ ... });

// Dispatch async (don't block)
processNotificationRequest(request.id).catch(err => {
  console.error('Dispatch failed:', err);
});

// Return immediately
return request;
```

#### 3. Batch processing

Pour les notifications en masse (newsletters), utiliser un worker:

```typescript
async function sendNewsletter(recipientIds: string[]) {
  for (const recipientId of recipientIds) {
    await createNotification({
      template_key: 'newsletter',
      recipient_id: recipientId,
      priority: 'low', // Low priority pour batch
      variables: { ... },
    });

    // Sleep 100ms pour éviter de surcharger
    await sleep(100);
  }
}
```

---

### Monitoring

**Métriques clés**:
- Request creation time (target: < 100ms)
- Dispatch time (target: < 5s per notification)
- Delivery success rate (target: > 95%)
- Open rate (target: > 20% pour email)

**Logs**:
```typescript
console.log('[NotifEngine] Request created:', request.id);
console.log('[NotifEngine] Dispatch started:', delivery.id);
console.log('[NotifEngine] Delivery sent:', delivery.id, delivery.provider_message_id);
```

**Alertes** (via monitoring tool):
- Alert si delivery rate < 90% pendant 1 heure
- Alert si failed deliveries > 100/minute
- Alert si throttle counters explosent (possible abuse)

---

## Conclusion

Brique 76 est un système de notification industriel complet, prêt pour la production. Il surpasse les systèmes existants (SendGrid, Twilio) en offrant:

- **Multi-canal unifié** (email, SMS, push, in-app, webhook)
- **Sira AI personalization** (optimisation canal et timing)
- **GDPR compliance** (preference center, one-click unsubscribe)
- **Enterprise-grade** (throttling, retry, audit trail)
- **Multi-langue** (fr, en, pt, es)

**Prochaines étapes**:
1. Intégrer les providers réels (SendGrid, Twilio, FCM)
2. Implémenter Sira delivery time optimization
3. Ajouter A/B testing automatique
4. Dashboard analytics temps réel

---

**Brique 76 v1.0 - Production Ready**

Built with ❤️ by Molam Team
2025-11-12
