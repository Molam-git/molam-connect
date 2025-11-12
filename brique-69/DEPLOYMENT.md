# Deployment Guide - Brique 69 Analytics

## Pre-Deployment Checklist

- [ ] PostgreSQL 16+ database provisioned
- [ ] Redis 7+ instance available
- [ ] Kafka cluster running
- [ ] Environment variables configured
- [ ] Database migrations ready
- [ ] SSL certificates (if using HTTPS)
- [ ] Monitoring stack (Prometheus/Grafana)

## Deployment Steps

### 1. Database Setup

```bash
# Create database
createdb molam_analytics

# Set connection string
export DATABASE_URL="postgresql://user:pass@host:5432/molam_analytics"

# Run migrations
npm run migrate

# Verify tables created
psql $DATABASE_URL -c "\dt"
```

### 2. Seed Initial Data

```bash
# Import FX rates
psql $DATABASE_URL < data/fx_rates_seed.sql

# Import country-region mappings
psql $DATABASE_URL < data/country_regions_seed.sql
```

### 3. Configure Environment

```bash
# Production .env
cat > .env << EOF
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
KAFKA_BROKERS=kafka1:9092,kafka2:9092,kafka3:9092
JWT_SECRET=<secure-random-string>
SIRA_ENABLED=true
SIRA_API_URL=https://sira.molam.io
PORT=8082
EOF
```

### 4. Build Application

```bash
# Install dependencies
npm ci --only=production

# Build TypeScript
npm run build

# Verify build
ls -la dist/
```

### 5. Docker Deployment

```bash
# Build Docker image
docker build -t molam/analytics:1.0.0 .

# Push to registry
docker push molam/analytics:1.0.0

# Run with Docker Compose
docker-compose up -d

# Check health
curl http://localhost:8082/health
```

### 6. Kubernetes Deployment

```bash
# Create namespace
kubectl create namespace molam

# Create secrets
kubectl create secret generic analytics-secrets \
  --from-literal=database-url=$DATABASE_URL \
  --from-literal=redis-url=$REDIS_URL \
  --from-literal=jwt-secret=$JWT_SECRET \
  -n molam

# Create config map
kubectl create configmap analytics-config \
  --from-literal=kafka-brokers=$KAFKA_BROKERS \
  -n molam

# Apply deployments
kubectl apply -f kubernetes/deployment.yaml

# Check pods
kubectl get pods -n molam -l brique=69

# Check logs
kubectl logs -f deployment/analytics-api -n molam
```

### 7. Setup Monitoring

```bash
# Import Grafana dashboard
curl -X POST http://grafana:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @grafana/dashboard_analytics.json

# Configure Prometheus scraping
# Add to prometheus.yml:
# - job_name: 'molam-analytics'
#   static_configs:
#     - targets: ['analytics-api:8082']
```

### 8. Setup Cron Jobs

```bash
# Materialized view refresh (every 5 minutes)
cat > /etc/cron.d/analytics-mv-refresh << EOF
*/5 * * * * postgres psql $DATABASE_URL -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_txn_daily_agg;"
EOF
```

Or use Kubernetes CronJob:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: mv-refresh
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: refresh
            image: postgres:16
            command: ["psql", "$(DATABASE_URL)", "-c", "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_txn_daily_agg;"]
```

### 9. Verify Deployment

```bash
# Health checks
curl http://analytics-api/health
curl http://analytics-api/metrics

# Test API endpoints
curl -H "Authorization: Bearer $TOKEN" \
  "http://analytics-api/api/analytics/kpis?from=2025-07-01&to=2025-07-15"

# Check consumer is running
kubectl logs -f deployment/analytics-consumer -n molam

# Verify data ingestion
psql $DATABASE_URL -c "SELECT COUNT(*) FROM txn_hourly_agg WHERE created_at > NOW() - INTERVAL '1 hour';"
```

### 10. Post-Deployment

- [ ] Configure alert rules via API
- [ ] Set up backup schedule for PostgreSQL
- [ ] Configure log aggregation
- [ ] Set up on-call rotation
- [ ] Document any environment-specific configurations

## Rollback Procedure

```bash
# Kubernetes rollback
kubectl rollout undo deployment/analytics-api -n molam
kubectl rollout undo deployment/analytics-consumer -n molam

# Docker rollback
docker-compose down
docker-compose -f docker-compose.v1.0.0.yml up -d

# Database rollback (if needed)
# Restore from backup
pg_restore -d molam_analytics backup.dump
```

## Scaling

### Horizontal Scaling

```bash
# Scale API
kubectl scale deployment analytics-api --replicas=5 -n molam

# Scale consumer
kubectl scale deployment analytics-consumer --replicas=4 -n molam
```

### Vertical Scaling

Update resource limits in `kubernetes/deployment.yaml`:

```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

## Performance Tuning

### Database

```sql
-- Increase work_mem for complex queries
ALTER SYSTEM SET work_mem = '256MB';

-- Adjust shared_buffers
ALTER SYSTEM SET shared_buffers = '4GB';

-- Enable parallel queries
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;

SELECT pg_reload_conf();
```

### Connection Pool

```bash
# Increase pool size
export DB_POOL_MAX=20
```

### Redis

```bash
# Increase max memory
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

## Troubleshooting

See [Runbook](./runbooks/analytics_runbook.md) for detailed troubleshooting.

### Common Deployment Issues

**Container won't start**
- Check environment variables
- Verify database connectivity
- Review logs: `docker logs analytics-api`

**High memory usage**
- Reduce connection pool size
- Adjust Node.js heap: `NODE_OPTIONS=--max-old-space-size=2048`

**Consumer not processing**
- Verify Kafka connectivity
- Check consumer group assignment
- Review topic permissions

## Security Considerations

- Use SSL/TLS for all connections (database, Redis, Kafka)
- Rotate JWT secrets regularly
- Implement rate limiting on API
- Use network policies in Kubernetes
- Enable audit logging
- Regularly update dependencies

## Backup & Recovery

```bash
# Database backup
pg_dump $DATABASE_URL > analytics_backup_$(date +%Y%m%d).sql

# Automated backup (cron)
0 2 * * * pg_dump $DATABASE_URL | gzip > /backups/analytics_$(date +\%Y\%m\%d).sql.gz

# Restore
psql $DATABASE_URL < analytics_backup_20250715.sql
```

---

For questions or issues, contact: ops@molam.io
