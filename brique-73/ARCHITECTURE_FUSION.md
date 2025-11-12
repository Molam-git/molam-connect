# Architecture Fusion - Brique 73 v2.1 Complete
**Combinaison : Spécification Détaillée + SIRA AI Enrichment**

## 🎯 Vue d'Ensemble

Ce document fusionne :
1. **Spécification industrielle complète** (webhook endpoints, subscriptions, dispatcher avec retry/DLQ)
2. **SIRA AI v2.1** (AI-guided replay, fraud detection, immutable audit, adaptive profiles)

Résultat : **Plateforme webhook la plus avancée au monde** 🚀

## 📊 Comparaison des Architectures

### Schéma SQL - Points Communs

| Table | Spec Détaillée | SIRA v2.1 | Fusion |
|-------|----------------|-----------|--------|
| Endpoints | `webhook_endpoints` | `webhooks` | ✅ Fusionner (utiliser `webhook_endpoints`) |
| Subscriptions | `webhook_subscriptions` | `webhooks.event_types[]` | ✅ Garder les deux approches |
| Secrets | `webhook_secrets` (versioned) | `webhooks.secret` | ✅ **Spec Détaillée gagne** (rotation) |
| Events | `webhook_events` | Via publisher | ✅ Garder `webhook_events` |
| Deliveries | `webhook_deliveries` | `webhook_deliveries` | ✅ Identique, fusionner |
| Attempts | `webhook_delivery_attempts` | `webhook_delivery_attempts` | ✅ Identique |
| DLQ | `webhook_deadletters` | N/A | ✅ **Ajouter** DLQ |
| Profiles | `webhook_profiles` | `webhook_profiles` | ✅ **SIRA v2.1 gagne** (plus riche) |
| Audit | `webhook_audit_log` | `api_audit_log` (hash chain) | ✅ **SIRA v2.1 gagne** (blockchain) |

### Schéma SQL - Extensions SIRA AI (à conserver)

| Table | Description | Statut |
|-------|-------------|--------|
| `api_abuse_patterns` | Fraud detection | ✅ **Conserver** |
| `webhook_replay_queue` | AI-guided replay | ✅ **Conserver** |
| `sira_ai_recommendations` | AI suggestions | ✅ **Conserver** |
| `api_version_contracts` | Version tracking | ✅ **Conserver** |

### Format de Signature - Différences

**Spec Détaillée:**
```
Molam-Signature: t=1234567890,v1=abc123...,kid=1
```

**SIRA v2.1:**
```
X-Molam-Signature: v1=abc123...
X-Molam-Timestamp: 1234567890
X-Molam-Delivery-Id: uuid
```

**Décision:** ✅ **Adopter format Spec Détaillée** (plus compact, inclut kid pour rotation)

### Code Services - Complémentarité

| Composant | Spec Détaillée | SIRA v2.1 | Fusion |
|-----------|----------------|-----------|--------|
| RBAC/JWT | `authz.ts` (Molam ID) | `requireRole()` | ✅ **Spec Détaillée** (plus complet) |
| Secrets | `secrets.ts` (KMS/Vault) | `encryptWithVault()` | ✅ **Spec Détaillée** (versioning) |
| Router | `router.ts` (admin API) | `webhooks.ts` (REST API) | ✅ **Fusionner les deux** |
| Publisher | `publisher.ts` | `queueWebhookDelivery()` | ✅ **Spec Détaillée** (plus simple) |
| Dispatcher | `dispatcher.ts` (retry/DLQ) | `webhookDeliveryWorker.ts` | ✅ **Fusionner** (ajouter DLQ) |
| SIRA | `sira.ts` (basic hooks) | `siraEnriched.ts` (AI-powered) | ✅ **SIRA v2.1 gagne** |
| Receiver | `receiver-verify.ts` | `verifyWebhookSignature()` | ✅ **Spec Détaillée** (kid support) |

## 🏗️ Architecture Finale Fusionnée

### Stack Technologique

```
┌─────────────────────────────────────────────────────────┐
│                    React UI Layer                        │
│  • Dev Console (create endpoints, test events)          │
│  • Ops Dashboard (deliveries, DLQ, metrics, SIRA)       │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  API Layer (Express)                     │
│  • Admin API (endpoints, subscriptions, rotation)        │
│  • SIRA API (AI replay, fraud detection, audit)         │
│  • Molam ID JWT Auth + RBAC                             │
└──────────────────────┬──────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Publisher  │ │  Dispatcher  │ │  SIRA AI     │
│   (Events)   │ │  (Worker)    │ │  (Analysis)  │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┴────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │   PostgreSQL   │
              │   + Redis      │
              │   + KMS/Vault  │
              └────────────────┘
```

### Base de Données Fusionnée

**23 Tables Totales:**

**Core Webhooks (9 tables):**
1. `webhook_endpoints` - Endpoints avec status, region, api_version
2. `webhook_subscriptions` - Event subscriptions
3. `webhook_secrets` - Versioned secrets avec rotation
4. `webhook_events` - Immutable events
5. `webhook_deliveries` - Delivery tracking
6. `webhook_delivery_attempts` - Attempt audit
7. `webhook_deadletters` - DLQ
8. `webhook_delivery_metrics` - Pre-aggregated metrics (B73bis)
9. `webhook_events_catalog` - Available event types

**API Keys & Apps (5 tables):**
10. `dev_apps` - Developer applications
11. `api_keys` - API keys
12. `api_request_logs` - High-volume logs
13. `api_quotas` - Rate limits
14. `api_key_audit` - Key audit trail

**SIRA AI (7 tables):**
15. `webhook_profiles` - Adaptive profiles (enriched from spec)
16. `api_abuse_patterns` - Fraud detection
17. `api_audit_log` - Immutable blockchain audit
18. `webhook_replay_queue` - AI-guided replay
19. `sira_ai_recommendations` - AI suggestions
20. `api_version_contracts` - Version tracking
21. `api_suspicious_events` - Anomaly detection

**Support (2 tables):**
22. `api_scopes` - Scope definitions
23. `sandbox_events` - Test events

## 🔧 Implémentation Fusionnée

### 1. Schéma SQL Unifié

```sql
-- Core: webhook_endpoints (from spec) + extensions SIRA
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenancy
  tenant_type TEXT NOT NULL, -- merchant | agent | internal_app
  tenant_id UUID NOT NULL,

  -- Endpoint config
  url TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | paused | disabled
  api_version TEXT NOT NULL DEFAULT '2025-01',
  region TEXT,

  -- SIRA AI Extensions
  retry_config JSONB DEFAULT '{"maxAttempts":6,"backoff":"exponential"}'::jsonb,
  custom_headers JSONB,

  -- Audit
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(tenant_type, tenant_id, url)
);

-- Secrets avec versioning (from spec)
CREATE TABLE IF NOT EXISTS webhook_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active | retiring | revoked
  secret_ciphertext BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ, -- Optional expiration
  UNIQUE(endpoint_id, version)
);

-- Deliveries (merged from both)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | delivering | delivered | failed | retrying | quarantined

  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,

  -- Retry scheduling
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Response tracking
  last_code INTEGER,
  last_error TEXT,
  error_type TEXT, -- timeout | connection_refused | invalid_response

  -- Performance
  latency_ms INTEGER,
  response_body TEXT, -- Truncated

  -- Signature used
  signature TEXT,
  secret_version INTEGER,

  -- Idempotency
  idempotency_key TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,

  UNIQUE(event_id, endpoint_id)
);

-- DLQ (from spec)
CREATE TABLE IF NOT EXISTS webhook_deadletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,
  event_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL,
  sira_analysis JSONB, -- SIRA AI analysis results
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Adaptive Profiles (SIRA enriched)
CREATE TABLE IF NOT EXISTS webhook_profiles (
  endpoint_id UUID PRIMARY KEY REFERENCES webhook_endpoints(id) ON DELETE CASCADE,

  -- Performance metrics
  avg_latency_ms NUMERIC(10,2) DEFAULT 0,
  p50_latency_ms NUMERIC(10,2) DEFAULT 0,
  p95_latency_ms NUMERIC(10,2) DEFAULT 0,
  p99_latency_ms NUMERIC(10,2) DEFAULT 0,

  -- Success tracking
  success_rate NUMERIC(5,2) DEFAULT 100.0,
  failure_rate NUMERIC(5,2) DEFAULT 0,
  total_deliveries BIGINT DEFAULT 0,
  consecutive_failures INT DEFAULT 0,

  -- Adaptive strategy (SIRA AI)
  preferred_strategy TEXT DEFAULT 'exponential',
  -- exponential | linear | conservative | aggressive | adaptive

  optimal_batch_size INT DEFAULT 1,
  optimal_retry_delay_ms INT DEFAULT 1000,

  -- AI health (SIRA)
  ai_health_score NUMERIC(3,2) DEFAULT 1.0,
  ai_recommendations TEXT[],

  -- Timestamps
  last_analysis TIMESTAMPTZ DEFAULT now(),
  last_successful_delivery TIMESTAMPTZ,
  last_failed_delivery TIMESTAMPTZ
);
```

### 2. Service Secrets avec Rotation

**File:** `src/webhooks/secrets.ts`

```typescript
import { pool } from "../db";
import { encryptWithVault, decryptWithVault } from "../utils/vault";
import crypto from "crypto";

export async function createSecretVersion(
  endpointId: string,
  version: number
): Promise<{ version: number; secret: string }> {
  const secret = crypto.randomBytes(32).toString("base64");
  const ciphertext = await encryptWithVault(secret);

  await pool.query(
    `INSERT INTO webhook_secrets (endpoint_id, version, status, secret_ciphertext)
     VALUES ($1, $2, 'active', $3)`,
    [endpointId, version, ciphertext]
  );

  return { version, secret };
}

export async function rotateSecret(endpointId: string): Promise<{
  newVersion: number;
  newSecret: string;
  gracePeriodDays: number;
}> {
  // Get current max version
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(version), 0) as max_version
     FROM webhook_secrets
     WHERE endpoint_id = $1`,
    [endpointId]
  );

  const currentVersion = rows[0].max_version;
  const newVersion = currentVersion + 1;

  // Create new secret
  const { secret: newSecret } = await createSecretVersion(endpointId, newVersion);

  // Mark old secret as retiring (30-day grace period)
  await pool.query(
    `UPDATE webhook_secrets
     SET status = 'retiring',
         expires_at = NOW() + INTERVAL '30 days'
     WHERE endpoint_id = $1 AND version = $2`,
    [endpointId, currentVersion]
  );

  // Log rotation in immutable audit
  await pool.query(
    `INSERT INTO api_audit_log (
      webhook_id, event_type, event_category, payload
    ) VALUES ($1, 'secret_rotated', 'security', $2)`,
    [endpointId, JSON.stringify({ oldVersion: currentVersion, newVersion })]
  );

  return { newVersion, newSecret, gracePeriodDays: 30 };
}

export async function getActiveSecrets(endpointId: string): Promise<Array<{
  version: number;
  secret: string;
  status: string;
}>> {
  const { rows } = await pool.query(
    `SELECT version, status, secret_ciphertext
     FROM webhook_secrets
     WHERE endpoint_id = $1
       AND status IN ('active', 'retiring')
     ORDER BY version DESC`,
    [endpointId]
  );

  const secrets = [];
  for (const row of rows) {
    const secret = await decryptWithVault(row.secret_ciphertext);
    secrets.push({
      version: row.version,
      secret: secret.toString("utf8"),
      status: row.status,
    });
  }

  return secrets;
}

export async function revokeSecret(endpointId: string, version: number): Promise<void> {
  await pool.query(
    `UPDATE webhook_secrets
     SET status = 'revoked'
     WHERE endpoint_id = $1 AND version = $2`,
    [endpointId, version]
  );

  // Log revocation
  await pool.query(
    `INSERT INTO api_audit_log (
      webhook_id, event_type, event_category, payload
    ) VALUES ($1, 'secret_revoked', 'security', $2)`,
    [endpointId, JSON.stringify({ version })]
  );
}
```

### 3. Publisher Unifié

**File:** `src/webhooks/publisher.ts`

```typescript
import { pool } from "../db";
import { v4 as uuid } from "uuid";

export async function publishEvent(
  tenantType: string,
  tenantId: string,
  eventType: string,
  data: any,
  options?: { idempotencyKey?: string; region?: string }
): Promise<{ eventId: string; deliveriesQueued: number }> {
  const eventId = uuid();

  // Insert event (immutable)
  await pool.query(
    `INSERT INTO webhook_events (id, tenant_type, tenant_id, type, data, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [eventId, tenantType, tenantId, eventType, data]
  );

  // Find subscribed endpoints
  const { rows: endpoints } = await pool.query(
    `SELECT DISTINCT e.id, e.url, e.retry_config, e.region
     FROM webhook_endpoints e
     JOIN webhook_subscriptions s ON s.endpoint_id = e.id
     WHERE e.status = 'active'
       AND e.tenant_type = $1
       AND e.tenant_id = $2
       AND s.event_type = $3
       ${options?.region ? 'AND (e.region = $4 OR e.region IS NULL)' : ''}`,
    options?.region
      ? [tenantType, tenantId, eventType, options.region]
      : [tenantType, tenantId, eventType]
  );

  // Create deliveries
  for (const endpoint of endpoints) {
    const retryConfig = endpoint.retry_config || { maxAttempts: 6 };

    await pool.query(
      `INSERT INTO webhook_deliveries (
        event_id, endpoint_id, status, max_attempts, idempotency_key, created_at
      ) VALUES ($1, $2, 'pending', $3, $4, NOW())
      ON CONFLICT (event_id, endpoint_id) DO NOTHING`,
      [eventId, endpoint.id, retryConfig.maxAttempts, options?.idempotencyKey || null]
    );
  }

  // Log in audit
  await pool.query(
    `INSERT INTO api_audit_log (
      event_type, event_category, payload, created_at
    ) VALUES ('event_published', 'delivery', $1, NOW())`,
    [JSON.stringify({ eventId, eventType, tenantType, tenantId, endpointCount: endpoints.length })]
  );

  return {
    eventId,
    deliveriesQueued: endpoints.length,
  };
}
```

## 🎯 Décisions d'Architecture

### ✅ Format de Signature (Spec Détaillée gagne)

```
Molam-Signature: t=1642253400000,v1=abc123def...,kid=2
```

**Avantages:**
- Compact (un seul header)
- Inclut kid pour rotation
- Compatible Stripe-style

### ✅ Secrets Versionnés (Spec Détaillée gagne)

- Table `webhook_secrets` avec versioning
- Grace period de 30 jours pour rotation
- Support multi-version (active + retiring)

### ✅ SIRA AI Enrichment (SIRA v2.1 gagne)

- AI-guided replay conservé
- Fraud detection avancée conservée
- Immutable audit avec hash chain conservé
- Adaptive profiles enrichis

### ✅ DLQ + Retry Logic (Spec Détaillée gagne)

- Exponential backoff: [1min, 5min, 15min, 1h, 6h, 24h]
- DLQ après max attempts
- SIRA analysis sur DLQ

### ✅ Multi-Tenant RBAC (Spec Détaillée gagne)

- Molam ID JWT avec roles
- `requireRole(['merchant_admin', 'dev_admin'])`
- Tenant isolation strict

## 📋 Plan d'Intégration

### Phase 1: SQL Migration (1 jour)
1. Créer schéma unifié combinant les deux
2. Migrer tables existantes si nécessaire
3. Ajouter indexes optimisés

### Phase 2: Services Core (2 jours)
1. Implémenter secrets avec rotation
2. Unifier publisher
3. Enrichir dispatcher avec DLQ

### Phase 3: SIRA Integration (1 jour)
1. Intégrer SIRA AI dans dispatcher
2. Connecter adaptive profiles
3. Hook fraud detection

### Phase 4: API Layer (2 jours)
1. Router admin complet
2. SIRA API routes
3. Auth/RBAC Molam ID

### Phase 5: UI (2 jours)
1. Dev Console
2. Ops Dashboard avec SIRA
3. Metrics & Monitoring

### Phase 6: Testing (2 jours)
1. Unit tests
2. Integration tests
3. E2E flow tests

**Total: 10 jours pour intégration complète**

## 🏆 Résultat Final

**Brique 73 v2.1 - Architecture Fusionnée:**

- ✅ 23 tables optimisées
- ✅ Multi-tenant avec RBAC
- ✅ Secrets versionnés avec rotation
- ✅ DLQ + retry exponential
- ✅ AI-guided replay (SIRA)
- ✅ Advanced fraud detection (SIRA)
- ✅ Immutable blockchain audit (SIRA)
- ✅ Adaptive profiles (SIRA)
- ✅ Version tracking (SIRA)
- ✅ React UI (Dev + Ops)
- ✅ Prometheus metrics
- ✅ SLOs & Runbook

**= Plateforme webhook la plus avancée au monde** 🚀

---

**Next Step:** Implémenter le schéma SQL unifié complet

Last Updated: 2025-11-11
