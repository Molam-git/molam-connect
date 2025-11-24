# 🚀 Quick Start - Briques 137 & 138ter

## ⚡ Démarrage en 3 Étapes

### 1️⃣ Configuration Minimale

```bash
# Brique 137 - Merchant Dashboard
cd brique-137/merchant-dashboard
cp .env.example .env
# Éditer .env: DATABASE_URL, REDIS_URL, KAFKA_BROKERS

# Brique 138ter - Mesh
cd brique-138ter/cooperative-failover-mesh
cp .env.example .env
# Éditer .env: DATABASE_URL, KAFKA_BROKERS, SIRA_API_URL
```

### 2️⃣ Migrations Database

```bash
# Exécuter les migrations
cd brique-137/merchant-dashboard
npm run migrate

cd ../..
psql $DATABASE_URL -f brique-138ter/cooperative-failover-mesh/migrations/2025_01_19_create_mesh_system.sql
```

### 3️⃣ Lancer les Services

**Windows**:
```cmd
start-briques-137-138ter.bat
```

**Linux/Mac**:
```bash
./start-briques-137-138ter.sh
```

**Manuel (3 terminaux)**:
```bash
# Terminal 1
cd brique-137/merchant-dashboard && npm run dev

# Terminal 2
cd brique-137/merchant-dashboard && npm run worker

# Terminal 3
cd brique-138ter/cooperative-failover-mesh && npm run dev
```

---

## 🌐 URLs d'Accès

| Service | URL | Health Check |
|---------|-----|--------------|
| **Merchant Dashboard** | http://localhost:3001 | http://localhost:3001/health |
| **Mesh Controller** | http://localhost:3138 | http://localhost:3138/health |

---

## 📡 Endpoints Essentiels

### Brique 137 - Dashboard

```bash
# KPIs du mois
curl http://localhost:3001/api/merchant/summary?period=mtd&currency=XOF

# Transactions récentes
curl http://localhost:3001/api/merchant/transactions?limit=50

# Payouts
curl http://localhost:3001/api/merchant/payouts
```

### Brique 138ter - Mesh

```bash
# Régions mesh
curl http://localhost:3138/api/mesh/regions

# Prédictions santé
curl http://localhost:3138/api/mesh/predictions

# Propositions routage
curl http://localhost:3138/api/mesh/proposals
```

---

## 🔧 Variables d'Environnement Critiques

### Brique 137

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/molam_connect
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092
JWT_PUBLIC_KEY_URL=https://id.molam.io/.well-known/jwks.json
RISK_AWARE_APPROVALS_URL=http://localhost:3136
SIRA_API_URL=http://localhost:8000
```

### Brique 138ter

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/molam_connect
KAFKA_BROKERS=localhost:9092
SIRA_API_URL=http://localhost:8000
SIRA_SIGNING_KEY=your-secret-key
MESH_REGION=CEDEAO
```

---

## 📊 Monitoring

### Prometheus Metrics

**Brique 137**:
- http://localhost:3001/metrics

**Brique 138ter**:
- http://localhost:3138/metrics

### Logs

```bash
# Merchant Dashboard
tail -f brique-137/merchant-dashboard/logs/app.log

# KPI Worker
tail -f brique-137/merchant-dashboard/logs/worker.log

# Mesh Controller
tail -f brique-138ter/cooperative-failover-mesh/logs/app.log
```

---

## 🐛 Troubleshooting Rapide

### Services ne démarrent pas?

1. **Vérifier PostgreSQL**:
   ```bash
   psql $DATABASE_URL -c "SELECT 1"
   ```

2. **Vérifier Redis**:
   ```bash
   redis-cli ping
   ```

3. **Vérifier Kafka**:
   ```bash
   kafka-topics.sh --list --bootstrap-server localhost:9092
   ```

### KPIs pas à jour?

1. Vérifier KPI Worker tourne
2. Check Kafka topics existent
3. Refresh materialized view:
   ```sql
   REFRESH MATERIALIZED VIEW mv_merchant_tx_agg;
   ```

### Mesh routing pas appliqué?

1. Vérifier policy mode:
   ```sql
   SELECT * FROM mesh_policies WHERE mesh_region_id = 'region_cedeao';
   ```

2. Check SIRA confidence >= threshold
3. Vérifier idempotency key unique

---

## 📚 Documentation Complète

- **Guide Intégration**: [BRIQUE_137_138TER_INTEGRATION.md](BRIQUE_137_138TER_INTEGRATION.md)
- **Statut Complet**: [BRIQUE_137_138TER_STATUS.md](BRIQUE_137_138TER_STATUS.md)
- **Brique 137 README**: [brique-137/merchant-dashboard/README.md](brique-137/merchant-dashboard/README.md)
- **Brique 138ter README**: [brique-138ter/cooperative-failover-mesh/README.md](brique-138ter/cooperative-failover-mesh/README.md)

---

## ✅ Checklist Pré-démarrage

- [ ] PostgreSQL 14+ installé et accessible
- [ ] Redis installé et tourne
- [ ] Kafka installé et topics créés
- [ ] Node.js 18+ installé
- [ ] Variables `.env` configurées
- [ ] Migrations DB exécutées
- [ ] S3 bucket créé (pour Brique 137 uploads)

---

**Status**: ✅ Production-Ready
**Build**: ✅ No TypeScript Errors
**Dependencies**: ✅ Installed
