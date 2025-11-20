# Runbook — Brique 143ter: Auto-Translation Layer (SIRA)

## 📘 Vue d'ensemble complète

Système de traduction automatique en temps réel avec cache intelligent, apprentissage continu SIRA, et support offline-first pour toute la Super App Molam.

### Objectifs clés
- ✅ **Traduction temps réel**: P95 < 150ms (cached), < 500ms (uncached)
- ✅ **Cache hit ratio**: > 80% pour UI labels
- ✅ **Apprentissage continu**: Feedback loop vers SIRA training
- ✅ **Privacy-first**: Consent, PII redaction, data retention
- ✅ **Offline-first**: Cache local (IndexedDB) + fallback
- ✅ **Cross-module**: Même système pour Pay, Shop, Talk, Eats, Ads

## 🏗️ Architecture

```
┌─────────────────┐
│  Client (Web)   │
│  - LocalStorage │──┐
│  - IndexedDB    │  │
│  - Detection    │  │
└─────────────────┘  │
         │           │
         ▼           ▼
┌─────────────────────────────────┐
│     CDN / API Gateway           │
│  - Rate limiting                │
│  - Routing to nearest worker    │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Translation Service (Node/TS)  │
│  - Fast cache lookup (Redis)    │
│  - Glossary enforcement         │
│  - Quality scoring              │
└─────────────────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌─────────────────┐
│ Redis  │ │ PostgreSQL      │
│ Cache  │ │ - translation_  │
│        │ │   cache         │
└────────┘ │ - glossary      │
           │ - feedback      │
           └─────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Translation Worker (Async)     │
│  - LibreTranslate (self-hosted) │
│  - M2M-100 (future)             │
│  - External API (fallback)      │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  SIRA Training Pipeline         │
│  - Feedback aggregation         │
│  - Active learning              │
│  - Model retraining             │
└─────────────────────────────────┘
```

## 🚀 Phase 1: Open-Source Stack (MVP - Gratuit)

### LibreTranslate (Self-Hosted)

**Installation Docker**:
```bash
# Run LibreTranslate locally
docker run -ti --rm -p 5000:5000 libretranslate/libretranslate

# Or with persistence
docker run -d \
  -p 5000:5000 \
  -e LT_LOAD_ONLY=en,fr,ar \
  --name molam-translate \
  libretranslate/libretranslate
```

**Avantages**:
- ✅ Gratuit et open-source
- ✅ Données restent on-premise
- ✅ Pas de limite API
- ✅ Support 200+ langues (via Argos Translate)

**Limitations**:
- ⚠️ Qualité moyenne (BLEU ~35-45)
- ⚠️ Latence variable (200-800ms)
- ⚠️ Nécessite GPU pour bonnes perfs

### Redis Cache Layer

```bash
# Redis pour cache traductions
docker run -d \
  -p 6379:6379 \
  --name molam-redis \
  redis:7-alpine \
  redis-server --save 60 1 --loglevel warning
```

**TTL Strategy**:
- UI labels: 30 jours
- User content: 7 jours
- Errors: 1 jour

### Language Detection (Fast)

**Client-side (Instant)**:
```typescript
// Simple heuristic detection
function detectLanguageFast(text: string): string {
  const arabicRegex = /[\u0600-\u06FF]/;
  const frenchWords = /\b(le|la|les|un|une|de|et|est|dans)\b/i;

  if (arabicRegex.test(text)) return 'ar';
  if (frenchWords.test(text)) return 'fr';
  // Check Wolof common words
  if (/\b(dafa|laa|di|ak|bu)\b/i.test(text)) return 'wo';

  return 'en'; // default
}
```

**Server-side (Accurate)**:
```bash
# franc-min (Node.js) - très rapide
npm install franc-min

# Usage
import { franc } from 'franc-min';
const lang = franc('Ceci est un texte en français'); // 'fra'
```

## 📊 Base de données

### Tables principales

1. **translation_cache**: Traductions canoniques
   - `key`: SHA256(source + source_lang + target_lang + namespace)
   - `quality_score`: 0.0-1.0 (confiance)
   - `translation_method`: cache, model_local, api_external, human

2. **translation_jobs**: Queue asynchrone
   - `status`: pending, processing, done, failed
   - `priority`: 0-100 (checkout=90, UI=50, logs=10)

3. **translation_feedback**: Corrections utilisateur
   - Stocke original + correction + raison
   - Flag `incorporated` quand ajouté au training

4. **translation_glossary**: Termes métier
   - `mandatory`: true pour brand names (Molam Pay)
   - Context-aware per namespace

5. **translation_stats**: Métriques quotidiennes
   - Cache hit/miss ratio
   - Latence moyenne par namespace
   - Erreurs

## 🔧 Implementation détaillée

### Service Translation (Node/TypeScript)

```typescript
// src/services/translationService.ts
import crypto from 'crypto';
import Redis from 'ioredis';
import { pool } from '../db';

const redis = new Redis(process.env.REDIS_URL);

function makeCacheKey(sourceText: string, sourceLang: string, targetLang: string, namespace: string): string {
  return crypto.createHash('sha256')
    .update(`${sourceText}|${sourceLang}|${targetLang}|${namespace}`)
    .digest('hex');
}

export async function translateFast(
  sourceText: string,
  sourceLang: string,
  targetLang: string,
  namespace: string
): Promise<{ translatedText: string; qualityScore: number; method: string }> {

  // 1. Redis cache (fastest)
  const key = makeCacheKey(sourceText, sourceLang, targetLang, namespace);
  const cached = await redis.get(`trans:${key}`);
  if (cached) {
    const data = JSON.parse(cached);
    return { ...data, method: 'redis_cache' };
  }

  // 2. PostgreSQL cache
  const { rows } = await pool.query(
    `SELECT translated_text, quality_score FROM translation_cache WHERE key = $1`,
    [key]
  );

  if (rows[0]) {
    // Warm Redis
    await redis.set(`trans:${key}`, JSON.stringify(rows[0]), 'EX', 86400);
    return { translatedText: rows[0].translated_text, qualityScore: rows[0].quality_score, method: 'pg_cache' };
  }

  // 3. Check glossary
  const glossary = await getGlossaryTranslation(sourceText, sourceLang, targetLang, namespace);
  if (glossary) {
    await cacheTranslation(key, sourceText, sourceLang, targetLang, namespace, glossary, 1.0, 'glossary');
    return { translatedText: glossary, qualityScore: 1.0, method: 'glossary' };
  }

  // 4. Enqueue async job & return best-effort
  await pool.query(
    `INSERT INTO translation_jobs(key, source_text, source_lang, target_lang, namespace, priority)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [key, sourceText, sourceLang, targetLang, namespace, getPriority(namespace)]
  );

  // Best-effort: return source text with indicator
  return { translatedText: `[${targetLang}] ${sourceText}`, qualityScore: 0.3, method: 'pending' };
}

function getPriority(namespace: string): number {
  const priorities: Record<string, number> = {
    'checkout.labels': 90,
    'error.message': 85,
    'ui.labels': 50,
    'talk.message': 40,
    'log.entry': 10,
  };
  return priorities[namespace] || 50;
}
```

### Worker Translation (Async)

```typescript
// workers/translationWorker.ts
import fetch from 'node-fetch';

const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || 'http://localhost:5000';

export async function processTranslationJobs() {
  // Pick up to 20 pending jobs
  const { rows } = await pool.query(`
    UPDATE translation_jobs
    SET status = 'processing', assigned_worker = $1, updated_at = now()
    WHERE id IN (
      SELECT id FROM translation_jobs
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 20
    )
    RETURNING *
  `, [process.env.HOSTNAME || 'worker-1']);

  for (const job of rows) {
    try {
      // Call LibreTranslate
      const response = await fetch(`${LIBRETRANSLATE_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: job.source_text,
          source: job.source_lang,
          target: job.target_lang,
          format: 'text',
        }),
        timeout: 10000,
      });

      if (!response.ok) throw new Error(`LibreTranslate error: ${response.status}`);

      const result = await response.json();
      const translatedText = result.translatedText;

      // Store in cache
      await pool.query(`
        INSERT INTO translation_cache(key, source_text, source_lang, target_lang, namespace, translated_text, quality_score, translation_method)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (key) DO UPDATE
        SET translated_text = EXCLUDED.translated_text,
            quality_score = EXCLUDED.quality_score,
            updated_at = now()
      `, [job.key, job.source_text, job.source_lang, job.target_lang, job.namespace, translatedText, 0.7, 'libretranslate']);

      // Update Redis
      await redis.set(`trans:${job.key}`, JSON.stringify({ translated_text: translatedText, quality_score: 0.7 }), 'EX', 86400);

      // Mark job complete
      await pool.query(`UPDATE translation_jobs SET status = 'done', result = $2, completed_at = now() WHERE id = $1`, [job.id, translatedText]);

      // Publish WebSocket update
      await publishTranslationUpdate(job.key, translatedText);

    } catch (error: any) {
      const attempts = job.attempts + 1;
      const status = attempts >= job.max_attempts ? 'failed' : 'pending';

      await pool.query(`
        UPDATE translation_jobs
        SET status = $2, last_error = $3, attempts = $4, updated_at = now()
        WHERE id = $1
      `, [job.id, status, error.message, attempts]);
    }
  }
}

// Run worker loop
setInterval(processTranslationJobs, 2000); // Every 2 seconds
```

### React Hook (Client)

```typescript
// web/src/hooks/useTranslator.tsx
import { useEffect, useState } from 'react';
import { useAdaptiveUIContext } from '../AdaptiveUIProvider';

export function useTranslator(namespace: string = 'ui.labels') {
  const { profile } = useAdaptiveUIContext();
  const [cache, setCache] = useState<Map<string, string>>(new Map());

  const targetLang = profile?.lang || 'en';

  async function translate(sourceText: string): Promise<string> {
    // Check local cache
    const cacheKey = `${sourceText}:${targetLang}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }

    try {
      const response = await fetch('/api/i18n/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText,
          source: 'auto',
          target: targetLang,
          namespace,
        }),
      });

      const data = await response.json();
      const translated = data.translatedText;

      // Update cache
      setCache(prev => new Map(prev).set(cacheKey, translated));

      return translated;
    } catch (error) {
      console.error('[Translator] Error:', error);
      return sourceText; // Fallback
    }
  }

  // Subscribe to WebSocket updates
  useEffect(() => {
    const ws = new WebSocket(`${process.env.WS_URL}/translations`);

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      // Update cache with improved translation
      setCache(prev => new Map(prev).set(update.key, update.translatedText));
    };

    return () => ws.close();
  }, []);

  return { translate, targetLang };
}

// Usage
function CheckoutButton() {
  const { translate } = useTranslator('checkout.labels');
  const [label, setLabel] = useState('Pay Now');

  useEffect(() => {
    translate('Pay Now').then(setLabel);
  }, []);

  return <button>{label}</button>;
}
```

## 📈 Métriques & Observabilité

### Prometheus Metrics

```typescript
// src/services/metrics.ts
import { Counter, Histogram, Gauge } from 'prom-client';

export const translationRequests = new Counter({
  name: 'molam_translation_requests_total',
  help: 'Total translation requests',
  labelNames: ['namespace', 'source', 'target', 'method'],
});

export const translationLatency = new Histogram({
  name: 'molam_translation_latency_seconds',
  help: 'Translation latency in seconds',
  labelNames: ['namespace', 'method'],
  buckets: [0.01, 0.05, 0.1, 0.15, 0.25, 0.5, 1, 2, 5],
});

export const cacheHits = new Counter({
  name: 'molam_translation_cache_hit_total',
  help: 'Translation cache hits',
  labelNames: ['cache_type'], // redis, postgres, glossary
});

export const translationErrors = new Counter({
  name: 'molam_translation_failures_total',
  help: 'Translation failures',
  labelNames: ['error_type'],
});

export const activeJobs = new Gauge({
  name: 'molam_translation_jobs_active',
  help: 'Active translation jobs',
});
```

### Grafana Dashboard Queries

```promql
# Cache hit ratio (last 1h)
sum(rate(molam_translation_cache_hit_total[1h]))
/ sum(rate(molam_translation_requests_total[1h]))

# P95 latency by namespace
histogram_quantile(0.95,
  sum(rate(molam_translation_latency_seconds_bucket[5m])) by (le, namespace)
)

# Error rate
rate(molam_translation_failures_total[5m])
/ rate(molam_translation_requests_total[5m])

# Queue depth
molam_translation_jobs_active
```

## 🎯 SLOs & Alertes

| Métrique | Target | Alert Threshold |
|----------|--------|-----------------|
| Cache Hit Ratio | ≥ 80% | < 70% |
| P95 Latency (cached) | < 150ms | > 200ms |
| P95 Latency (uncached) | < 500ms | > 800ms |
| Error Rate | < 0.1% | > 1% |
| Queue Depth | < 1000 | > 5000 |

## 🔐 Privacy & Compliance

### Consent Management

```typescript
// Check translation consent before processing PII
async function canTranslate(userId: string, content: string): Promise<boolean> {
  // Check consent in Molam ID
  const consent = await getUserConsent(userId, 'translation');
  if (!consent) return false;

  // Check if content contains PII
  if (containsPII(content)) {
    // Require explicit PII consent
    return await getUserConsent(userId, 'translation_pii');
  }

  return true;
}
```

### Data Retention

- **UI labels**: Permanent
- **User content**: 90 days
- **Feedback**: 2 years (for training)
- **Logs**: 30 days

## 🚀 Phase 2: Modèles Maison (Post-Launch)

### M2M-100 (Facebook)

```bash
# Hugging Face Transformers
pip install transformers torch

# Load model
from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer

model = M2M100ForConditionalGeneration.from_pretrained("facebook/m2m100_418M")
tokenizer = M2M100Tokenizer.from_pretrained("facebook/m2m100_418M")
```

**Avantages**:
- ✅ 100 langues dont Wolof (avec fine-tuning)
- ✅ Qualité supérieure (BLEU 50-60)
- ✅ Contrôle total

**Requirements**:
- GPU: NVIDIA T4 minimum (16GB VRAM)
- CPU: 8 cores minimum
- RAM: 32GB

## ✅ Checklist Déploiement

- [ ] Deploy PostgreSQL avec indexes
- [ ] Deploy Redis cluster (3 nodes)
- [ ] Deploy LibreTranslate (Docker ou K8s)
- [ ] Deploy Translation Worker (K8s with autoscale)
- [ ] Setup Prometheus + Grafana
- [ ] Configure CDN pour cache headers
- [ ] Test failover vers external API
- [ ] Setup alerts (PagerDuty)
- [ ] Load test (10K req/s target)
- [ ] Security audit (OWASP)

## 📞 Support & Runbooks

- **Slack**: #translation-ops
- **Runbook**: [Translation Incidents](https://docs.molam.com/runbooks/translation)
- **On-call**: PagerDuty rotation

---

**Dernière mise à jour**: 2025-01-18

**Version**: 1.0.0 (MVP - LibreTranslate)
