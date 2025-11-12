# Corrections Brique 72 - Account Capabilities & Limits

## 🔧 Corrections Identifiées

### 1. Routes API - Conflits de Chemins ❌

**Problème dans `src/routes/limits.ts`:**
```typescript
// Ligne ~125: GET /api/capabilities/:userId
router.get('/:userId', async (req, res) => { ... });

// Ligne ~200: GET /api/limits/:userId
router.get('/:userId', async (req, res) => { ... });

// CONFLIT: Même chemin dans le même router!
```

**Solution:**
Séparer en deux routers distincts ou utiliser des préfixes explicites.

---

### 2. SQL Schema - Extension PostgreSQL Manquante

**Problème dans `migrations/001_create_limits_tables.sql`:**
```sql
CREATE TABLE capability_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- ❌ Nécessite pgcrypto
```

**Solution à ajouter en début de migration:**
```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- OU
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

---

### 3. Mapping Colonnes - CamelCase vs Snake_Case

**Problème dans `src/services/enforcement.ts`:**
```typescript
// Ligne ~100
const result = await pool.query<UserCapability>(
  `SELECT capability_key, enabled, effective_from, effective_to, origin
   FROM account_capabilities ...`
);

// ❌ Les colonnes SQL sont en snake_case mais l'interface TypeScript attend camelCase
interface UserCapability {
  capabilityKey: string;  // ❌ Devrait être capability_key
  effectiveFrom: Date | null;  // ❌ Devrait être effective_from
}
```

**Solution:**
Soit ajouter des alias SQL, soit changer l'interface TypeScript.

---

### 4. Fonction SQL - Référence à Table Users Inexistante

**Problème dans `src/services/siraLimits.ts`:**
```typescript
// Ligne ~450
const result = await pool.query(
  `SELECT u.kyc_level, ...
   FROM users u  -- ❌ Table 'users' non définie dans la migration
   LEFT JOIN transactions t ON u.id = t.user_id
```

**Solution:**
La fonction assume l'existence de tables externes (users, transactions). Documenter cette dépendance.

---

### 5. Validation Zod - Currency Uppercase

**Problème mineur dans `src/routes/limits.ts`:**
```typescript
const EnforceRequestSchema = z.object({
  currency: z.string().length(3).toUpperCase(),  // ❌ toUpperCase() n'existe pas sur Zod
});
```

**Solution:**
```typescript
currency: z.string().length(3).transform(val => val.toUpperCase()),
```

---

## 🔨 Fichiers de Correction

### CORRECTION 1: Routes API Séparées

**Créer `src/routes/capabilities.ts`:**
```typescript
import { Router } from 'express';
import { hasCapability } from '../services/enforcement';
import { pool } from '../db';

const router = Router();

// POST /api/capabilities/check
router.post('/check', async (req, res) => { ... });

// GET /api/capabilities/:userId
router.get('/:userId', async (req, res) => { ... });

// POST /api/capabilities/set
router.post('/set', async (req, res) => { ... });

export default router;
```

**Modifier `src/server.ts`:**
```typescript
import limitsRouter from './routes/limits';
import capabilitiesRouter from './routes/capabilities';
import siraRouter from './routes/sira';

app.use('/api/limits', limitsRouter);
app.use('/api/capabilities', capabilitiesRouter);
app.use('/api/sira', siraRouter);
```

---

### CORRECTION 2: Migration SQL Complète

**Ajouter au début de `migrations/001_create_limits_tables.sql`:**
```sql
/**
 * Brique 72 - Account Capabilities & Limits Management
 * Version: 1.0.0
 * Dependencies: PostgreSQL 14+
 */

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Check PostgreSQL version
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 140000 THEN
    RAISE EXCEPTION 'PostgreSQL 14+ required (current: %)', version();
  END IF;
END $$;

-- Continue with tables...
```

---

### CORRECTION 3: Interface TypeScript avec Snake_Case

**Option A: Modifier l'interface (Recommandé)**
```typescript
// src/services/enforcement.ts
export interface UserCapability {
  capability_key: string;      // Snake_case comme en SQL
  enabled: boolean;
  effective_from: Date | null;
  effective_to: Date | null;
  origin: string;
}

// Puis utiliser:
capabilities[row.capability_key] = row;
```

**Option B: Ajouter des alias SQL**
```typescript
const result = await pool.query<UserCapability>(
  `SELECT
     capability_key AS "capabilityKey",
     enabled,
     effective_from AS "effectiveFrom",
     effective_to AS "effectiveTo",
     origin
   FROM account_capabilities ...`
);
```

---

### CORRECTION 4: Documentation des Dépendances

**Ajouter à `README.md`:**
```markdown
## 🔗 External Dependencies

### Required Tables (from other briques)
The following tables must exist in the database:

1. **users** (from Molam ID or User Service)
   - id UUID PRIMARY KEY
   - kyc_level TEXT
   - status TEXT
   - created_at TIMESTAMPTZ
   - last_activity_at TIMESTAMPTZ

2. **transactions** (from Payment/Wallet Service)
   - id UUID PRIMARY KEY
   - user_id UUID
   - amount NUMERIC
   - status TEXT
   - created_at TIMESTAMPTZ

### Mock Tables for Testing
```sql
-- Create mock tables if not available
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_level TEXT DEFAULT 'P0',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  amount NUMERIC(18,2),
  status TEXT DEFAULT 'success',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
```

---

### CORRECTION 5: Validation Zod Fixée

**Créer `src/validation/schemas.ts`:**
```typescript
import { z } from 'zod';

// Currency validator with uppercase transform
export const CurrencySchema = z.string()
  .length(3, 'Currency code must be 3 characters')
  .regex(/^[A-Z]{3}$/, 'Currency must be uppercase (e.g., USD, EUR, XOF)')
  .transform(val => val.toUpperCase());

// UUID validator
export const UuidSchema = z.string().uuid('Invalid UUID format');

// Positive amount validator
export const AmountSchema = z.number()
  .positive('Amount must be positive')
  .max(999999999.99, 'Amount exceeds maximum');

// Reusable schemas
export const EnforceRequestSchema = z.object({
  userId: UuidSchema,
  limitKey: z.string().min(1),
  amount: AmountSchema,
  currency: CurrencySchema,
  context: z.record(z.any()).optional(),
  idempotencyKey: z.string().optional(),
});

export const CapabilityCheckSchema = z.object({
  userId: UuidSchema,
  capabilityKey: z.string().min(1),
});

export const RecordUsageSchema = z.object({
  userId: UuidSchema,
  limitKey: z.string().min(1),
  amount: AmountSchema,
  currency: CurrencySchema,
  idempotencyKey: z.string().optional(),
});

export const SetLimitSchema = z.object({
  userId: UuidSchema,
  limitKey: z.string().min(1),
  limitValue: z.number().nonnegative(),
  currency: CurrencySchema,
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
  origin: z.enum(['ops', 'sira', 'kyc']),
  actorId: UuidSchema.optional(),
  expiresAt: z.string().datetime().optional(),
});

export const SetCapabilitySchema = z.object({
  userId: UuidSchema,
  capabilityKey: z.string().min(1),
  enabled: z.boolean(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
  origin: z.enum(['default', 'kyc', 'sira', 'ops_override']),
  reason: z.string().optional(),
});
```

---

## ✅ Checklist de Corrections

### Priorité HAUTE (Bloquer)
- [ ] **CORRECTION 1**: Séparer les routes capabilities/limits/sira
- [ ] **CORRECTION 2**: Ajouter extensions PostgreSQL à la migration
- [ ] **CORRECTION 3**: Fixer le mapping camelCase/snake_case

### Priorité MOYENNE (Important)
- [ ] **CORRECTION 4**: Documenter dépendances tables externes
- [ ] **CORRECTION 5**: Fixer validation Zod currency
- [ ] Ajouter tests unitaires pour enforcement
- [ ] Ajouter tests d'intégration pour API

### Priorité BASSE (Nice to have)
- [ ] Créer mock tables pour tests
- [ ] Ajouter types stricts pour toutes les queries SQL
- [ ] Implémenter circuit breaker pour Redis
- [ ] Ajouter retry logic pour SIRA calls

---

## 📝 Instructions d'Application

### Étape 1: Corrections Critiques
```bash
# 1. Modifier la migration SQL
vim brique-72/migrations/001_create_limits_tables.sql
# Ajouter en ligne 1-15: Extensions et checks version

# 2. Créer fichiers de validation
vim brique-72/src/validation/schemas.ts
# Copier le code de CORRECTION 5

# 3. Séparer les routers
vim brique-72/src/routes/capabilities.ts
vim brique-72/src/routes/sira.ts
# Extraire les routes appropriées

# 4. Modifier server.ts
vim brique-72/src/server.ts
# Importer et monter les 3 routers séparés
```

### Étape 2: Fixer les Interfaces
```bash
# Option recommandée: Snake_case partout
find brique-72/src -name "*.ts" -exec sed -i 's/capabilityKey/capability_key/g' {} \;
find brique-72/src -name "*.ts" -exec sed -i 's/effectiveFrom/effective_from/g' {} \;
find brique-72/src -name "*.ts" -exec sed -i 's/effectiveTo/effective_to/g' {} \;
```

### Étape 3: Documenter Dépendances
```bash
# Ajouter section dans README
vim brique-72/README.md
# Copier la section "External Dependencies"
```

### Étape 4: Tests
```bash
# Créer tests unitaires
vim brique-72/tests/enforcement.test.ts
vim brique-72/tests/sira.test.ts

# Lancer tests
npm test
```

---

## 🚀 Impact des Corrections

### Sans Corrections
- ❌ Conflits de routes → 500 errors
- ❌ Migration SQL échoue → Base de données non créée
- ❌ Mapping colonnes incorrect → Runtime errors
- ❌ Validation currency → Mauvaises données

### Avec Corrections
- ✅ Routes fonctionnelles et bien séparées
- ✅ Migration SQL réussit du premier coup
- ✅ Mapping correct → Pas d'erreurs runtime
- ✅ Validation stricte → Données propres

---

## 📊 Estimation Temps de Correction

| Correction | Temps Estimé | Difficulté |
|------------|--------------|------------|
| Séparer routes | 30 min | Facile |
| Fix migration SQL | 15 min | Facile |
| Fix interfaces | 45 min | Moyenne |
| Documentation | 30 min | Facile |
| Validation Zod | 20 min | Facile |
| **TOTAL** | **~2h20** | **Moyenne** |

---

## 📚 Références

- [PostgreSQL Extensions](https://www.postgresql.org/docs/current/contrib.html)
- [Zod Validation](https://zod.dev/)
- [Express Router Best Practices](https://expressjs.com/en/guide/routing.html)
- [TypeScript Naming Conventions](https://google.github.io/styleguide/tsguide.html)

---

**Version:** 1.0.0
**Date:** 2025-11-11
**Status:** Corrections identifiées, prêtes à être appliquées
