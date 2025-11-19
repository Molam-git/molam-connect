# 🏗️ Template Universel - Création de Brique MoLam Connect

## 📋 Prompt Universel pour Nouvelle Brique

```markdown
# CONTEXTE
Je souhaite créer la Brique [NUMERO] - [NOM] pour MoLam Connect.

# SPÉCIFICATIONS FONCTIONNELLES
[Coller ici les spécifications en français ou anglais]

# ARCHITECTURE STANDARD À SUIVRE

## Structure de Dossier
brique-[numero]/
├── migrations/
│   └── 001_create_[nom]_tables.sql
├── src/
│   ├── db.ts
│   ├── redis.ts (si cache requis)
│   ├── server.ts
│   ├── services/
│   │   ├── [service_principal].ts
│   │   └── sira[Nom].ts (si ML/SIRA requis)
│   ├── middleware/
│   │   └── [middleware].ts
│   ├── routes/
│   │   └── [routes].ts
│   └── workers/
│       └── [worker].ts (si CRON requis)
├── tests/
│   └── [service].test.ts
├── package.json
├── tsconfig.json
├── .env.example
└── README.md

## Composants Standards Requis

### 1. SQL Schema (migrations/001_create_[nom]_tables.sql)
- Tables principales avec UUID primary keys
- Indexes sur colonnes fréquemment requêtées
- Triggers pour updated_at automatique
- Triggers pour audit automatique
- Fonctions helper pour logique métier
- Views pour dashboards Ops
- Données par défaut (seed)
- JSONB pour flexibilité
- Comments sur tables/colonnes

### 2. Database Connection (src/db.ts)
```typescript
import { Pool } from 'pg';
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export async function query<T>(text: string, params?: any[]): Promise<QueryResult<T>>;
export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
export async function healthCheck(): Promise<boolean>;
```

### 3. Redis Client (src/redis.ts) - SI CACHE REQUIS
```typescript
export function getRedisClient(): Redis;
export const CacheKeys = { /* key builders */ };
export const CacheTTL = { /* TTL configs */ };
export async function setCache(key: string, value: any, ttl: number): Promise<void>;
export async function getCache<T>(key: string): Promise<T | null>;
export async function deleteCache(pattern: string): Promise<number>;
```

### 4. Service Principal (src/services/[nom].ts)
- Logique métier principale
- Opérations CRUD
- Idempotency avec idempotencyKey
- Gestion d'erreurs robuste
- Logging structuré
- Types TypeScript stricts

### 5. SIRA Integration (src/services/sira[Nom].ts) - SI ML REQUIS
```typescript
export interface Sira[Nom]Input { /* facteurs de risque */ }
export interface Sira[Nom]Decision {
  score: number;              // 0-1
  action: string;            // auto_approve, manual_review, reject
  confidence: number;        // 0-1
  reasoning: string[];
  modelVersion: string;
}
export async function callSira[Nom]Evaluation(input): Promise<Decision>;
```

### 6. REST API Routes (src/routes/[nom].ts)
- Validation avec Zod
- Gestion d'erreurs
- Documentation inline
- Idempotency support
- Health endpoints

### 7. Express Server (src/server.ts)
```typescript
// Port principal + port metrics
const PORT = parseInt(process.env.PORT || '30XX', 10);
const METRICS_PORT = parseInt(process.env.METRICS_PORT || '90XX', 10);
// CORS, JSON parsing, logging, health check, metrics endpoint
```

### 8. CRON Workers (src/workers/[nom]Worker.ts) - SI REQUIS
```typescript
export function start[Nom]Worker(): void {
  cron.schedule('[schedule]', async () => { /* logic */ });
}
export async function run[Nom]WorkerNow(): Promise<void>; // Manual trigger
```

### 9. Package.json
```json
{
  "name": "@molam/brique-[numero]-[nom]",
  "version": "1.0.0",
  "scripts": {
    "start": "node dist/server.js",
    "dev": "ts-node src/server.ts",
    "build": "tsc",
    "test": "jest",
    "worker": "ts-node src/workers/[worker].ts"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "pg": "^8.11.3",
    "dotenv": "^16.3.1",
    "zod": "^3.22.4",
    "prom-client": "^15.1.0"
    // + ioredis si cache
    // + node-cron si workers
    // + axios si appels externes
  }
}
```

### 10. README.md Structure
```markdown
# Brique [Numero] - [Nom]

## 📋 Status: [%] COMPLETE

## 🎯 Overview
[Description en 2-3 phrases]

### Key Features
- ✅ Feature 1
- ✅ Feature 2

## 📊 Database Schema (✅ COMPLETE)
[Liste des tables]

## 🏗️ Architecture
[Diagramme ASCII]

## 💡 Implementation Status
[Tableau % completion]

## 🚀 Quick Start
[Commandes installation]

## 📚 API Endpoints
[Liste endpoints avec exemples]

## 🔧 Configuration
[Variables env]

## 🧪 Testing
[Commandes test]

## 📋 Deployment Checklist
[Checklist production]

## 🎯 Success Metrics
[KPIs attendus]
```

## Standards de Code

### TypeScript Strict Mode
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

### Patterns Obligatoires

#### 1. Idempotency Pattern
```typescript
if (idempotencyKey) {
  const existing = await pool.query(
    `SELECT id FROM [table] WHERE idempotency_key = $1`,
    [idempotencyKey]
  );
  if (existing.rows.length > 0) {
    return { ...existing.rows[0], isDuplicate: true };
  }
}
```

#### 2. Transaction Pattern
```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // operations
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

#### 3. Audit Trail Pattern
```typescript
await client.query(
  `INSERT INTO [table]_audit (entity_id, actor_id, action, payload, created_at)
   VALUES ($1, $2, $3, $4, NOW())`,
  [entityId, actorId, action, JSON.stringify(payload)]
);
```

#### 4. Cache Pattern (si Redis)
```typescript
const cacheKey = CacheKeys.entity(id);
let data = await getCache<DataType>(cacheKey);
if (!data) {
  data = await loadFromDatabase(id);
  await setCache(cacheKey, data, CacheTTL.entity);
}
return data;
```

#### 5. SIRA Integration Pattern
```typescript
// Calcul score avec facteurs pondérés
let riskScore = 0;
riskScore += factor1 * 0.30;  // Weight 30%
riskScore += factor2 * 0.25;  // Weight 25%
// ...

// Décision basée sur seuils
if (riskScore < 0.20) return 'auto_approve';
else if (riskScore < 0.60) return 'manual_review';
else return 'reject';
```

## Triggers SQL Standards

### 1. Auto-update timestamp
```sql
CREATE OR REPLACE FUNCTION update_[table]_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_[table]_updated
  BEFORE UPDATE ON [table]
  FOR EACH ROW
  EXECUTE FUNCTION update_[table]_updated_at();
```

### 2. Auto-audit on change
```sql
CREATE OR REPLACE FUNCTION audit_[table]_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO [table]_audit (entity_id, action, old_value, new_value)
  VALUES (NEW.id, TG_OP, row_to_json(OLD), row_to_json(NEW));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_audit_[table]
  AFTER INSERT OR UPDATE ON [table]
  FOR EACH ROW
  EXECUTE FUNCTION audit_[table]_change();
```

## Conventions de Nommage

### Tables
- Snake_case
- Pluriel pour tables principales: `users`, `transactions`
- Suffixe pour tables secondaires: `user_audit`, `user_config`

### Colonnes
- Snake_case
- Timestamps: `created_at`, `updated_at`, `deleted_at`
- Foreign keys: `[table]_id` (ex: `user_id`, `payment_id`)
- Montants: `NUMERIC(18,2)` pour devise, `NUMERIC(28,8)` pour crypto
- Statuts: `TEXT` avec CHECK constraint ou enum

### Fonctions TypeScript
- camelCase
- Verbes d'action: `createUser`, `updateLimit`, `enforceRule`
- Préfixes async: toutes les fonctions async

### Variables d'environnement
- SCREAMING_SNAKE_CASE
- Préfixes: `DB_`, `REDIS_`, `SIRA_`, `PORT`

## Checklist de Création

### Phase 1: Foundation (Jour 1)
- [ ] Créer structure de dossiers
- [ ] SQL schema complet avec triggers
- [ ] Database connection (db.ts)
- [ ] Redis client (si requis)
- [ ] Package.json et tsconfig.json
- [ ] .env.example

### Phase 2: Core Services (Jour 2-3)
- [ ] Service principal avec logique métier
- [ ] SIRA integration (si ML requis)
- [ ] Idempotency implementation
- [ ] Transaction handling
- [ ] Audit trail

### Phase 3: API Layer (Jour 3-4)
- [ ] REST routes avec validation Zod
- [ ] Middleware d'enforcement
- [ ] Express server avec health checks
- [ ] Error handling

### Phase 4: Workers (Jour 4-5, si requis)
- [ ] CRON workers
- [ ] Batch processing
- [ ] Error recovery

### Phase 5: Testing & Docs (Jour 5-6)
- [ ] Unit tests
- [ ] Integration tests
- [ ] README complet
- [ ] API documentation
- [ ] Deployment guide

### Phase 6: Production Readiness (Jour 7+)
- [ ] Prometheus metrics
- [ ] RBAC middleware
- [ ] Load testing
- [ ] Security review
- [ ] Ops UI (si requis)

## Intégrations Standard

### Molam ID (Authentication)
```typescript
// JWT verification
const publicKey = await fetch(process.env.MOLAM_ID_PUBLIC_KEY_URL);
const decoded = jwt.verify(token, publicKey);
req.auth = { userId: decoded.sub, role: decoded.role, kycLevel: decoded.kyc_level };
```

### SIRA ML Service
```typescript
const response = await axios.post(
  `${process.env.SIRA_API_URL}/api/sira/[domain]/evaluate`,
  input,
  { headers: { 'Authorization': `Bearer ${process.env.SIRA_API_KEY}` } }
);
```

### Message Queue (Webhooks)
```typescript
await axios.post(
  `${process.env.MQ_URL}/publish`,
  {
    topic: '[domain].[event]',
    payload: { eventType, data },
    idempotencyKey
  }
);
```

### Prometheus Metrics
```typescript
import { Counter, Histogram, Gauge, register } from 'prom-client';

const requestCounter = new Counter({
  name: '[domain]_requests_total',
  help: 'Total requests',
  labelNames: ['method', 'endpoint', 'status']
});
```

## Estimation de Lignes de Code

| Composant | Lines (Simple) | Lines (Complex) |
|-----------|----------------|-----------------|
| SQL Schema | 300-500 | 500-800 |
| DB Connection | 100-150 | 150-200 |
| Redis Client | 150-200 | 200-300 |
| Service Principal | 400-600 | 600-1000 |
| SIRA Service | 300-500 | 500-800 |
| Routes API | 300-500 | 500-800 |
| Middleware | 200-300 | 300-500 |
| Server | 150-200 | 200-300 |
| Workers | 200-300 | 300-500 |
| Tests | 200-400 | 400-800 |
| README | 400-600 | 600-1000 |
| **TOTAL** | **2,700-4,250** | **4,250-7,000** |

## Temps d'Implémentation Estimé

- **Brique Simple** (ex: Config Service): 3-5 jours
- **Brique Moyenne** (ex: Limits Service): 5-10 jours
- **Brique Complexe** (ex: KYC Service): 10-20 jours

## Exemple d'Utilisation du Template

### Pour créer une nouvelle brique, copier ce prompt:

```
Je souhaite créer la Brique 73 - Notification Service.

SPÉCIFICATIONS:
- Service de notifications multi-canal (email, SMS, push, webhook)
- Templates de messages avec variables
- Priorité et retry logic
- Désabonnement (unsubscribe)
- Tracking des ouvertures/clics
- Rate limiting par canal
- Support multilingue
- Audit trail complet

ARCHITECTURE À SUIVRE:
- Utiliser le template universel (BRIQUE-TEMPLATE.md)
- SQL: tables notifications, templates, subscriptions, delivery_logs
- Redis: cache pour templates, rate limiting
- SIRA: scoring de priorité des notifications
- Worker: retry failed notifications (every 5 minutes)
- API: send notification, manage templates, subscription management

INTÉGRATIONS REQUISES:
- Email: SendGrid ou AWS SES
- SMS: Twilio
- Push: Firebase Cloud Messaging
- Webhook: HTTP POST

IMPLEMENTATION:
Suivre strictement le template standard avec tous les patterns obligatoires.
Créer uniquement les composants Core (Phase 1-3) dans ce premier passage.
```

## Notes Importantes

### Économie de Tokens
1. **Utiliser ce template** au lieu de répéter les mêmes instructions
2. **Référencer les briques existantes** comme exemples: "Suivre la structure de Brique 72"
3. **Incrémenter progressivement**: Core → API → Workers → UI
4. **Un composant à la fois**: Ne pas tout demander en une fois

### Patterns à Réutiliser
- Brique 70octies: Loyalty, SIRA ML, workers
- Brique 70nonies: Refunds, risk evaluation
- Brique 71: KYC, multi-sig, document management
- Brique 72: Limits, Redis cache, enforcement

### Standards de Qualité
- ✅ TypeScript strict mode
- ✅ Zod validation
- ✅ Idempotency keys
- ✅ Audit trail
- ✅ Health checks
- ✅ Error handling
- ✅ Logging structuré
- ✅ Comments en anglais
- ✅ Documentation complète

---

**Version du Template:** 1.0.0
**Dernière mise à jour:** 2025-11-11
**Maintenu par:** MoLam Connect Platform Team
