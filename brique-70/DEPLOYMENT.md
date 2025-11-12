# Brique 70 - Deployment Guide

## Production Deployment

### Prerequisites
- PostgreSQL 14+ (production instance)
- Redis 6+ (for caching)
- Node.js 20+ LTS
- Reverse proxy (Nginx/Caddy)
- SSL certificate

### Step 1: Database Setup

```sql
-- Create database
CREATE DATABASE molam_marketing;

-- Create user
CREATE USER molam_marketing_user WITH ENCRYPTED PASSWORD 'strong_password_here';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE molam_marketing TO molam_marketing_user;
```

Run migrations:
```bash
DATABASE_URL="postgresql://molam_marketing_user:password@localhost:5432/molam_marketing" npm run migrate
```

### Step 2: Environment Configuration

Create production `.env`:
```env
# Database
DATABASE_URL=postgresql://molam_marketing_user:password@db-host:5432/molam_marketing
DB_POOL_MAX=20

# Redis
REDIS_URL=redis://redis-host:6379

# Server
PORT=8083
NODE_ENV=production

# JWT / Auth
JWT_SECRET=<generate-strong-secret>
MOLAM_ID_PUBLIC_KEY_URL=https://id.molam.io/.well-known/jwks.json

# Subscriptions Worker
SUBSCRIPTION_CHECK_INTERVAL=3600000  # 1 hour
SUBSCRIPTION_GRACE_PERIOD_DAYS=3

# SIRA Integration
SIRA_ENABLED=true
SIRA_API_URL=https://sira.molam.io

# Marketing Config
PROMO_CODE_MAX_USAGE=10000
```

### Step 3: Build Application

```bash
# Install production dependencies
npm ci --production=false

# Build TypeScript
npm run build

# Build web UI
npm run web:build

# Remove dev dependencies
npm prune --production
```

### Step 4: Process Management

#### Using PM2

Install PM2:
```bash
npm install -g pm2
```

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'marketing-api',
      script: './dist/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'subscription-worker',
      script: './dist/jobs/subscriptionWorker.js',
      instances: 1,
      cron_restart: '0 * * * *', // Restart every hour
    },
  ],
};
```

Start services:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Using Systemd

Create `/etc/systemd/system/molam-marketing-api.service`:
```ini
[Unit]
Description=Molam Marketing API
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=molam
WorkingDirectory=/opt/molam/brique-70
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/molam/brique-70/.env

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/molam-marketing-worker.service`:
```ini
[Unit]
Description=Molam Subscription Worker
After=network.target postgresql.service

[Service]
Type=simple
User=molam
WorkingDirectory=/opt/molam/brique-70
ExecStart=/usr/bin/node dist/jobs/subscriptionWorker.js
Restart=always
RestartSec=30
Environment=NODE_ENV=production
EnvironmentFile=/opt/molam/brique-70/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable molam-marketing-api
sudo systemctl enable molam-marketing-worker
sudo systemctl start molam-marketing-api
sudo systemctl start molam-marketing-worker
```

### Step 5: Nginx Configuration

```nginx
upstream marketing_api {
    least_conn;
    server 127.0.0.1:8083;
    # Add more instances if using multiple processes
    # server 127.0.0.1:8084;
}

server {
    listen 80;
    server_name marketing.molam.io;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name marketing.molam.io;

    ssl_certificate /etc/ssl/certs/marketing.molam.io.crt;
    ssl_certificate_key /etc/ssl/private/marketing.molam.io.key;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # API
    location /api/ {
        proxy_pass http://marketing_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check
    location /health {
        proxy_pass http://marketing_api;
        access_log off;
    }

    # Web UI (static files)
    location / {
        root /opt/molam/brique-70/web/dist;
        try_files $uri $uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

### Step 6: Monitoring

#### Prometheus Metrics

Add to `server.ts` (if not present):
```typescript
import promClient from 'prom-client';

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

#### Health Checks

Configure monitoring to check:
```bash
# API health
curl https://marketing.molam.io/health

# Expected response:
# {"status":"healthy","service":"brique-70-marketing","timestamp":"..."}
```

#### Log Aggregation

Using journalctl:
```bash
# View API logs
journalctl -u molam-marketing-api -f

# View worker logs
journalctl -u molam-marketing-worker -f
```

Or configure log shipping to ELK/Datadog/etc.

### Step 7: Backup Strategy

#### Database Backups

Daily automated backups:
```bash
#!/bin/bash
# /opt/molam/scripts/backup-marketing-db.sh

BACKUP_DIR="/backup/molam-marketing"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="marketing_db_${DATE}.sql.gz"

pg_dump -h localhost -U molam_marketing_user molam_marketing | gzip > "${BACKUP_DIR}/${FILENAME}"

# Keep last 30 days
find ${BACKUP_DIR} -name "marketing_db_*.sql.gz" -mtime +30 -delete
```

Cron job:
```cron
0 2 * * * /opt/molam/scripts/backup-marketing-db.sh
```

#### Application Backups

- Configuration files (.env)
- SSL certificates
- Custom code changes

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build
RUN cd web && npm ci && npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --production

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/migrations ./migrations

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:8083/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 8083

CMD ["node", "dist/server.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  marketing-api:
    build: .
    ports:
      - "8083:8083"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/molam_marketing
      REDIS_URL: redis://redis:6379
      NODE_ENV: production
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  subscription-worker:
    build: .
    command: node dist/jobs/subscriptionWorker.js
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/molam_marketing
      NODE_ENV: production
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: molam_marketing
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:6-alpine
    restart: unless-stopped

volumes:
  postgres-data:
```

## Kubernetes Deployment

### Deployment YAML

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: marketing-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: marketing-api
  template:
    metadata:
      labels:
        app: marketing-api
    spec:
      containers:
      - name: marketing-api
        image: molam/marketing:latest
        ports:
        - containerPort: 8083
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: marketing-secrets
              key: database-url
        - name: REDIS_URL
          value: redis://redis-service:6379
        - name: NODE_ENV
          value: production
        livenessProbe:
          httpGet:
            path: /health
            port: 8083
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8083
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: marketing-api-service
spec:
  selector:
    app: marketing-api
  ports:
  - port: 80
    targetPort: 8083
  type: LoadBalancer
```

## Security Checklist

- [ ] Strong JWT secret (min 32 characters)
- [ ] Database credentials rotated
- [ ] SSL/TLS enabled
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Security headers configured (helmet)
- [ ] Input validation on all endpoints
- [ ] RBAC enforced
- [ ] Secrets stored in environment variables (not code)
- [ ] Regular security updates

## Performance Tuning

### Database
- Connection pooling (max 20 connections)
- Indexes on frequently queried columns
- Regular VACUUM and ANALYZE

### API
- Cluster mode (multiple processes)
- Nginx load balancing
- Response caching where appropriate

### Worker
- Batch processing (100 subscriptions per run)
- Graceful error handling
- Retry logic with exponential backoff

## Troubleshooting

### API not starting
```bash
# Check logs
journalctl -u molam-marketing-api -n 100

# Check database connection
psql $DATABASE_URL -c "SELECT 1"

# Check port availability
netstat -tlnp | grep 8083
```

### Worker not processing subscriptions
```bash
# Check worker logs
journalctl -u molam-marketing-worker -n 100

# Manually run worker
NODE_ENV=production node dist/jobs/subscriptionWorker.js

# Check for stuck subscriptions
psql $DATABASE_URL -c "SELECT * FROM subscriptions WHERE status = 'active' AND current_period_end < NOW() LIMIT 10"
```

### High memory usage
```bash
# Check Node.js heap usage
pm2 monit

# Restart service
pm2 restart marketing-api
```

## Rollback Procedure

If deployment fails:

1. Stop new version
```bash
pm2 stop marketing-api
```

2. Restore previous version
```bash
cd /opt/molam/brique-70
git checkout <previous-tag>
npm ci --production
npm run build
```

3. Rollback database (if migrations were run)
```bash
# Restore from backup
gunzip < /backup/molam-marketing/marketing_db_YYYYMMDD_HHMMSS.sql.gz | psql $DATABASE_URL
```

4. Restart service
```bash
pm2 restart marketing-api
```

## Maintenance Windows

For zero-downtime deployments:

1. Deploy new version on separate port
2. Run health checks
3. Switch Nginx upstream
4. Gracefully shutdown old version

Recommended maintenance window: Off-peak hours (2-4 AM)
