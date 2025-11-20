# 🌍 Molam Translation Service

Industrial-grade translation system for Molam Connect with self-hosted LibreTranslate, caching, ops overrides, and SIRA training pipeline integration.

## 📋 Overview

This brique provides:

- **Multi-tier caching**: Overrides → PostgreSQL cache → LibreTranslate API
- **Ops-editable glossary**: Manual corrections via dashboard
- **User feedback loop**: Collect corrections for SIRA training
- **Immutable audit trail**: Track all ops actions
- **Self-hosted translation**: LibreTranslate (open-source, free)
- **Prometheus metrics**: Cache hit ratio, latency, errors
- **Multi-namespace**: Separate translations for Pay, Shop, Talk, etc.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL (via Docker)

### 1. Environment Setup

```bash
cp backend/.env.example backend/.env
```

Edit `.env` and configure:

```bash
DATABASE_URL=postgres://molam:molam@localhost:5432/molam
TRANSLATION_API=http://localhost:5000/translate
MOLAM_ID_PUBLIC="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

### 2. Start Services

```bash
# Start all services (DB, LibreTranslate, Backend, Frontend)
docker-compose up --build
```

Services will be available at:
- **Backend API**: http://localhost:8080
- **Frontend Dashboard**: http://localhost:3000
- **LibreTranslate**: http://localhost:5000
- **Metrics**: http://localhost:8080/metrics

### 3. Run Database Migration

```bash
# From backend directory
cd backend
npm install
npm run migrate
```

Or directly:

```bash
psql postgres://molam:molam@localhost:5432/molam -f database/migrations/001_init_translation.sql
```

### 4. Development

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## 📡 API Endpoints

### Public Endpoints

#### POST /api/translate
Translate text with caching.

```bash
curl -X POST http://localhost:8080/api/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "sourceLang": "en",
    "targetLang": "fr",
    "namespace": "default"
  }'

# Response:
# { "text": "Bonjour le monde" }
```

#### POST /api/feedback
Submit translation correction.

```bash
curl -X POST http://localhost:8080/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "sourceText": "Hello",
    "wrongTranslation": "Salut",
    "correctedTranslation": "Bonjour",
    "targetLang": "fr",
    "userId": "user123"
  }'
```

### Admin Endpoints (Requires Authentication)

#### GET /api/admin/overrides
List translation overrides.

```bash
curl -X GET "http://localhost:8080/api/admin/overrides?namespace=default" \
  -H "Authorization: Bearer $TOKEN"
```

#### POST /api/admin/overrides
Create translation override.

```bash
curl -X POST http://localhost:8080/api/admin/overrides \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "default",
    "source_text": "Molam Pay",
    "target_lang": "fr",
    "override_text": "Molam Pay"
  }'
```

#### DELETE /api/admin/overrides/:id
Delete override.

```bash
curl -X DELETE http://localhost:8080/api/admin/overrides/abc-123 \
  -H "Authorization: Bearer $TOKEN"
```

#### GET /api/admin/audit
View audit trail.

```bash
curl -X GET "http://localhost:8080/api/admin/audit?namespace=default&limit=100" \
  -H "Authorization: Bearer $TOKEN"
```

## 🎨 Frontend Usage

### React Hook

```tsx
import { useTranslator } from './hooks/useTranslator';

function MyComponent() {
  const { translated, loading, error } = useTranslator(
    "Welcome to Molam",
    "en",
    "fr",
    "ui.labels"
  );

  return <h1>{translated}</h1>;
}
```

### Component

```tsx
import TranslateText from './components/TranslateText';

function App() {
  return (
    <TranslateText
      text="Pay now"
      sourceLang="en"
      targetLang="fr"
      namespace="default"
    />
  );
}
```

## 📊 Database Schema

### Tables

1. **translation_cache**: Cached translations with confidence scores
2. **translation_overrides**: Ops-editable manual corrections
3. **translation_feedback**: User-submitted corrections
4. **translation_audit**: Immutable audit trail

### Lookup Priority

1. **Overrides** (highest priority - manual Ops corrections)
2. **Cache** (previous translations)
3. **LibreTranslate API** (fallback)
4. **Source text** (graceful degradation on error)

## 🔍 Monitoring

### Prometheus Metrics

Available at `/metrics`:

- `molam_translation_requests_total`: Total translation requests
- `molam_translation_cache_hits_total`: Cache hits
- `molam_translation_latency_seconds`: Translation latency histogram
- `molam_translation_errors_total`: Translation errors

### Grafana Queries

**Cache Hit Ratio:**
```promql
sum(rate(molam_translation_cache_hits_total[5m]))
/
sum(rate(molam_translation_requests_total[5m]))
```

**P95 Latency:**
```promql
histogram_quantile(0.95,
  sum(rate(molam_translation_latency_seconds_bucket[5m])) by (le, source, target)
)
```

**Error Rate:**
```promql
sum(rate(molam_translation_errors_total[5m]))
/
sum(rate(molam_translation_requests_total[5m]))
```

## 🧪 Testing

```bash
cd backend
npm test
```

Tests cover:
- Translation service with caching
- Override priority
- Graceful degradation
- Database operations

## 🔐 Security

### RBAC Integration

All admin endpoints require Molam ID JWT with roles:
- `pay_admin`: Full access
- `translation_ops`: Manage overrides
- `billing_ops`: View overrides
- `auditor`: View audit logs

### Authentication Flow

```typescript
// Middleware checks JWT signature with MOLAM_ID_PUBLIC
requireRole(["pay_admin", "translation_ops"])
```

## 🌐 Supported Languages

- `en`: English
- `fr`: French
- `wo`: Wolof
- `ar`: Arabic
- `es`: Spanish
- `pt`: Portuguese

Add more in LibreTranslate config: `LT_LOAD_ONLY=en,fr,wo,ar,es,pt`

## 📦 Production Deployment

### Docker Compose (Production)

```yaml
services:
  libretranslate:
    image: libretranslate/libretranslate:latest
    environment:
      - LT_LOAD_ONLY=en,fr,ar,es,pt,wo
      - LT_THREADS=8
    deploy:
      resources:
        limits:
          memory: 4G
```

### Kubernetes

See `k8s/` directory for deployment manifests.

### Environment Variables

**Required:**
- `DATABASE_URL`: PostgreSQL connection string
- `TRANSLATION_API`: LibreTranslate endpoint
- `MOLAM_ID_PUBLIC`: Public key for JWT verification

**Optional:**
- `PORT`: Backend port (default: 8080)
- `NODE_ENV`: Environment (production/development)

## 📈 Performance Targets

- **Cache hit ratio**: ≥ 80%
- **P95 latency (cached)**: < 50ms
- **P95 latency (uncached)**: < 500ms
- **Error rate**: < 0.1%

## 🛠️ Troubleshooting

### LibreTranslate not starting

```bash
# Check logs
docker-compose logs libretranslate

# Verify it's downloading language models (first start is slow)
```

### Database connection failed

```bash
# Check PostgreSQL is running
docker-compose ps db

# Test connection
psql postgres://molam:molam@localhost:5432/molam -c "SELECT 1"
```

### Frontend can't reach backend

```bash
# Check backend is running
curl http://localhost:8080/healthz

# Check CORS configuration in backend/src/server.ts
```

## 📞 Support

- **Slack**: #molam-translation
- **Docs**: https://docs.molam.com/translation
- **Issues**: Create issue in repo

## 🔄 Roadmap

- [ ] M2M-100 model integration (higher quality)
- [ ] Real-time WebSocket updates for improved translations
- [ ] Automatic glossary extraction from feedback
- [ ] A/B testing for translation models
- [ ] CDN caching layer
- [ ] Offline-first mobile SDK

---

**Last updated**: 2025-01-19
