# Molam Pay Entry Service

## Overview
Industrial-grade entry point service for Molam Pay Super App with AI-driven routing, multi-platform support, and complete observability.

## Features
- **JWT Authentication**: RS256 verification with Molam ID integration
- **SIRA Integration**: AI-powered module recommendations and auto-redirect
- **Multi-Platform**: Support for Mobile, Web/PWA, Desktop
- **Audit Trail**: Immutable audit logs for all preference changes
- **Prometheus Metrics**: Full observability with custom metrics
- **Rate Limiting**: Protection against abuse (600 req/min)
- **Health Checks**: Kubernetes-ready liveness and readiness probes
- **Graceful Shutdown**: Proper signal handling and connection draining
- **Type Safe**: Full TypeScript implementation
- **Tested**: Jest unit and integration tests with >80% coverage

## Architecture

**Stack:**
- Node.js 20+ with TypeScript
- Express.js for HTTP server
- PostgreSQL for data persistence
- Prometheus for metrics
- Winston for structured logging
- Helmet + CORS for security
- Rate limiting with express-rate-limit

**Security:**
- RS256 JWT validation
- mTLS for internal service communication
- Rate limiting per IP and per user
- Helmet security headers
- Input validation and sanitization
- Audit logging for all mutations

## Database Schema

### user_pay_entry_preferences
User module preferences
- `user_id` (UUID, PK) - Molam ID
- `preferred_module` - Preferred module for auto-redirect
- `last_module_used` - Last accessed module
- `modules_enabled` (JSONB) - Array of enabled modules
- `auto_redirect` (BOOLEAN) - Enable SIRA auto-routing
- `country`, `currency`, `lang` - User context
- `updated_by`, `updated_at` - Audit fields

### pay_entry_audit_log
Immutable audit trail
- `user_id` - User who changed preferences
- `action` - create, update, delete
- `old_values`, `new_values` (JSONB) - Change tracking
- `changed_by` - Who made the change
- `ip_address`, `user_agent` - Request context

## API Endpoints

### GET /api/pay/entry
Get user pay entry configuration

**Headers:**
```
Authorization: Bearer <JWT>
```

**Response:**
```json
{
  "user_id": "uuid",
  "preferred_module": "wallet",
  "last_module_used": "wallet",
  "modules_enabled": ["wallet", "connect"],
  "auto_redirect": false,
  "country": "SN",
  "currency": "XOF",
  "lang": "fr"
}
```

**SIRA Integration:**
- If `auto_redirect=true`, SIRA hint may override `preferred_module`
- Non-blocking call with 2s timeout
- Falls back to local recommendation on failure

### POST /api/pay/entry
Update user preferences

**Headers:**
```
Authorization: Bearer <JWT>
Content-Type: application/json
```

**Request Body:**
```json
{
  "preferred_module": "connect",
  "modules_enabled": ["wallet", "connect", "eats"],
  "auto_redirect": true
}
```

**Response:** Same as GET

**Validation:**
- `modules_enabled` must be array
- `preferred_module` must be string or null
- Changes are audited automatically

### GET /healthz
Health check endpoint

**Response:**
```json
{
  "status": "healthy",
  "database": "up",
  "version": "1.0.0"
}
```

### GET /readyz
Readiness probe for Kubernetes

### GET /metrics
Prometheus metrics endpoint

## Environment Variables

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `MOLAM_ID_JWT_PUBLIC` - RS256 public key for JWT verification

**Optional:**
- `PORT` (default: 8082)
- `NODE_ENV` (default: development)
- `LOG_LEVEL` (default: info)
- `SIRA_URL` - SIRA service endpoint
- `CORS_ORIGIN` (default: *)
- `RATE_LIMIT_MAX` (default: 600)
- `DB_POOL_MAX` (default: 20)

## Development

### Setup
```bash
npm install
cp .env.example .env
# Edit .env with your configuration
```

### Run locally
```bash
npm run dev
```

### Run tests
```bash
npm test
npm run test:watch
npm run test:integration
```

### Lint and type check
```bash
npm run lint
npm run typecheck
```

### Build
```bash
npm run build
npm start
```

## Docker

### Build image
```bash
docker build -t pay-entry-service .
```

### Run container
```bash
docker run -p 8082:8082 \
  -e DATABASE_URL=postgres://... \
  -e MOLAM_ID_JWT_PUBLIC=... \
  pay-entry-service
```

## Kubernetes Deployment

### Apply manifests
```bash
kubectl apply -f k8s/deployment.yaml
```

### Secrets required
```bash
kubectl create secret generic pay-entry-secrets \
  --from-literal=DATABASE_URL=postgres://... \
  --from-literal=MOLAM_ID_JWT_PUBLIC=... \
  -n molam-pay
```

### ConfigMap
```bash
kubectl create configmap pay-entry-config \
  --from-literal=SIRA_URL=http://sira-service \
  --from-literal=CORS_ORIGIN=https://app.molam.com \
  -n molam-pay
```

## Prometheus Metrics

**Request Metrics:**
- `molam_pay_entry_requests_total{method, endpoint, status}` - Counter
- `molam_pay_entry_request_duration_seconds{method, endpoint}` - Histogram

**HTTP Metrics:**
- `http_request_duration_seconds{method, route, status}` - Histogram
- `process_*` - Node.js process metrics
- `nodejs_*` - Node.js runtime metrics

**Database Metrics:**
- `pg_pool_size` - Connection pool size
- `pg_pool_idle` - Idle connections

## SLOs

- **Availability:** 99.9%
- **Latency P95:** <150ms
- **Latency P99:** <500ms
- **Error Rate:** <0.1%
- **Database Health:** >99.99%

## Monitoring & Alerting

**Critical Alerts:**
- Service down for >2 minutes → PagerDuty
- Error rate >1% for 5 minutes → Ops
- Database connection failures → Ops
- P95 latency >500ms for 10 minutes → Warning

**Dashboards:**
- Grafana: Pay Entry Service Overview
- Prometheus: service=pay-entry-service

## Runbook

### Deploy New Version
```bash
# Build and push image
docker build -t registry.molam.io/pay-entry-service:v1.2.3 .
docker push registry.molam.io/pay-entry-service:v1.2.3

# Update Kubernetes deployment
kubectl set image deployment/pay-entry-service \
  pay-entry=registry.molam.io/pay-entry-service:v1.2.3 \
  -n molam-pay

# Watch rollout
kubectl rollout status deployment/pay-entry-service -n molam-pay
```

### Rollback
```bash
kubectl rollout undo deployment/pay-entry-service -n molam-pay
kubectl rollout status deployment/pay-entry-service -n molam-pay
```

### Scale
```bash
kubectl scale deployment pay-entry-service --replicas=5 -n molam-pay
```

### View Logs
```bash
kubectl logs -f deployment/pay-entry-service -n molam-pay
```

### Database Migration
```bash
# Connect to database
psql $DATABASE_URL

# Run migration
\i migrations/2025_01_18_create_user_pay_entry_preferences.sql
```

### Feature Flag Toggle
Update ConfigMap to enable/disable SIRA integration:
```bash
kubectl edit configmap pay-entry-config -n molam-pay
# Set SIRA_URL to empty string to disable
```

### Emergency Shutdown
```bash
kubectl scale deployment pay-entry-service --replicas=0 -n molam-pay
```

## Troubleshooting

**High Latency:**
1. Check database connection pool: `SELECT * FROM pg_stat_activity;`
2. Check SIRA service health
3. Review slow query logs
4. Check Prometheus dashboard for bottlenecks

**Database Errors:**
1. Verify DATABASE_URL is correct
2. Check connection pool settings
3. Verify database is reachable
4. Check for migration issues

**SIRA Timeouts:**
- Non-critical, service will use local fallback
- Check SIRA service health
- Review SIRA timeout settings (2s default)

**JWT Verification Failures:**
1. Verify MOLAM_ID_JWT_PUBLIC is correct RS256 public key
2. Check token expiration
3. Verify token issuer is "molam-id"

## Security Considerations

- **Secrets Management**: Use Kubernetes secrets or Vault
- **Network Policies**: Restrict egress to database and SIRA only
- **RBAC**: Service account with minimal permissions
- **mTLS**: Enable for service-to-service communication
- **Rate Limiting**: Per-IP and per-user limits enforced
- **Audit Logging**: All mutations are audited

## License
PROPRIETARY - Molam Engineering

## Version
**1.0.0** | Status: ✅ Production Ready
