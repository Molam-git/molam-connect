# FX Aggregator — Real-Time Multi-Provider FX Engine

## Architecture complète

### 📊 Base de données
- **fx_rate_providers** - Registry des fournisseurs (REST, WebSocket, etc.)
- **fx_live_rates** - Taux live avec TTL et confidence scoring
- **fx_quotes_cache** - Cache des quotes agrégés
- **fx_provider_audit** - Audit trail immuable

### 🔧 Services Core
- **fx-service.ts** - Agrégation SIRA-weighted, cache Redis (P50 < 5ms)
- **db.ts** - Connection pool PostgreSQL
- **app.ts** - Express application setup
- **server.ts** - Entry point serveur HTTP

### 🛣️ API REST
```
GET  /api/fx-agg/quote?base=USD&quote=XOF
POST /api/fx-agg/convert { base, quote, amount }
GET  /healthz
```

### ⚙️ Workers & Background
- **aggregator.ts** - Refresh périodique des taux (10s interval)
- **ws/server.ts** - WebSocket server pour streaming temps-réel (port 8081)

### 🔐 Sécurité & Utils
- **authz.ts** - Middleware d'authentification (API key, JWT stub)
- **sira.ts** - SIRA AI integration pour provider weighting

### 🎨 UI
- **FXSimulator.tsx** - Dashboard Ops avec provider breakdown

### 🧪 Tests
- **fx.test.ts** - Tests d'intégration quote/convert

## Flux de données

1. **Provider Fetcher** → `fx_live_rates` (normalisation des formats)
2. **SIRA Weighting** → Calcul du meilleur taux pondéré
3. **Redis Cache** → 5s TTL pour latence ultra-faible
4. **PostgreSQL Cache** → `fx_quotes_cache` pour audit
5. **WebSocket Push** → Streaming temps-réel vers clients

## Déploiement

```bash
# Installation
npm install

# Development
npm run dev         # API server
npm run worker      # Aggregator worker
npm run ws          # WebSocket server

# Production
npm run build
npm start
```

## Variables d'environnement

```bash
DATABASE_URL=postgresql://...
REDIS_URL=redis://127.0.0.1:6379
FX_AGG_PORT=3001
FX_WS_PORT=8081
FX_API_KEY=your_secret_key
```

## SLOs

- **Latency**: P50 < 5ms (cached), P95 < 50ms
- **Freshness**: 3-5s TTL pour hot pairs
- **Availability**: Fallback graceful si provider down
- **Audit**: 100% des taux logged dans `fx_provider_audit`

## Intégrations

- **Brique 125** - Alimente les quotes FX pour exécution multi-devises
- **SIRA** - Provider reliability scoring & hedging recommendations
- **Vault** - Stockage sécurisé des API keys fournisseurs
- **Redis Pub/Sub** - Distribution temps-réel des updates

## Prochaines étapes

1. Connecter vrais providers (Fixer.io, ECB, banques)
2. Implémenter SIRA gRPC client
3. Ajouter metrics Prometheus
4. Configurer alerting (stale rates, provider down)
5. WebSocket authentication & rate limiting

**Status**: ✅ Core Ready | **Version**: 1.0.0
