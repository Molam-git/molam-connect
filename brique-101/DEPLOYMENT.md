# Molam Form Universal SDK - Deployment Guide

**Version**: 1.0.0
**Status**: Production Ready
**Last Updated**: 2025-01-15

Complete guide for deploying Molam Form Universal SDK to production environments.

---

## Table of Contents

- [Overview](#overview)
- [Frontend SDK Deployment](#frontend-sdk-deployment)
- [Backend Webhook Deployment](#backend-webhook-deployment)
- [Security Checklist](#security-checklist)
- [Production Configuration](#production-configuration)
- [Monitoring & Logging](#monitoring--logging)
- [Scaling & Performance](#scaling--performance)
- [Troubleshooting](#troubleshooting)

---

## Overview

### Deployment Architecture

```
┌─────────────────┐
│   Your Website  │
│  (Frontend SDK) │
└────────┬────────┘
         │
         ├──────────────────┐
         │                  │
         ▼                  ▼
┌─────────────────┐  ┌─────────────────┐
│  Molam Checkout │  │  Your Webhook   │
│  (Hosted Page)  │  │     Server      │
└────────┬────────┘  └────────▲────────┘
         │                    │
         └────────────────────┘
                  │
                  ▼
         ┌─────────────────┐
         │   Molam API     │
         └─────────────────┘
```

### Components to Deploy

1. **Frontend SDK** - JavaScript library on your website
2. **Webhook Server** - Backend server to receive payment events
3. **SSL/TLS Certificates** - HTTPS required for production
4. **Environment Variables** - API keys and secrets

---

## Frontend SDK Deployment

### Option 1: CDN Hosting (Recommended)

**Pros**: Fast loading, automatic caching, global distribution
**Cons**: Dependency on external CDN

#### Using Molam's Official CDN

```html
<!-- Production -->
<script src="https://cdn.molam.com/sdk/v1/molam-checkout.js"></script>

<!-- Specific version (recommended for stability) -->
<script src="https://cdn.molam.com/sdk/v1.0.0/molam-checkout.js"></script>
```

**SRI (Subresource Integrity) for Security**:

```html
<script
  src="https://cdn.molam.com/sdk/v1.0.0/molam-checkout.js"
  integrity="sha384-HASH_HERE"
  crossorigin="anonymous">
</script>
```

#### Using Your Own CDN

1. **Upload SDK to your CDN**:
   ```bash
   # Download SDK
   npm install @molam/checkout

   # Upload to CDN
   aws s3 cp node_modules/@molam/checkout/js/molam-checkout.js \
     s3://your-bucket/molam-checkout.js \
     --acl public-read \
     --cache-control "public, max-age=31536000"
   ```

2. **Configure CloudFront/CDN**:
   - Set Cache-Control headers: `public, max-age=31536000`
   - Enable gzip/brotli compression
   - Set CORS headers if needed

### Option 2: Self-Hosted

**Pros**: Full control, no external dependencies
**Cons**: Manual updates, hosting costs

#### NPM Installation

```bash
npm install @molam/checkout
```

#### Webpack/Vite/Rollup Integration

**Webpack**:
```javascript
import MolamCheckout from '@molam/checkout';

const checkout = new MolamCheckout({
  publicKey: process.env.MOLAM_PUBLIC_KEY
});
```

**Vite**:
```javascript
import MolamCheckout from '@molam/checkout';

export default {
  build: {
    rollupOptions: {
      external: ['@molam/checkout']
    }
  }
};
```

#### Static File Hosting

```bash
# Copy SDK to public directory
cp node_modules/@molam/checkout/js/molam-checkout.js public/js/

# Include in HTML
<script src="/js/molam-checkout.js"></script>
```

### CSP (Content Security Policy) Configuration

Add these directives to your CSP header:

```
Content-Security-Policy:
  script-src 'self' https://cdn.molam.com;
  connect-src 'self' https://api.molam.com https://api.sandbox.molam.com;
  frame-src https://checkout.molam.com https://checkout.sandbox.molam.com;
```

**Nginx Example**:
```nginx
add_header Content-Security-Policy "script-src 'self' https://cdn.molam.com; connect-src 'self' https://api.molam.com; frame-src https://checkout.molam.com;";
```

**Apache Example**:
```apache
Header set Content-Security-Policy "script-src 'self' https://cdn.molam.com; connect-src 'self' https://api.molam.com; frame-src https://checkout.molam.com;"
```

---

## Backend Webhook Deployment

### Node.js Deployment

#### 1. Prepare Application

```bash
cd server/node
npm install --production
```

#### 2. Environment Variables

Create `.env` file:
```bash
MOLAM_WEBHOOK_SECRET=whsec_your_production_secret
PORT=3000
NODE_ENV=production
MOLAM_WEBHOOK_PATH=/molam/webhook
```

**NEVER commit `.env` to version control!**

#### 3. Process Manager (PM2)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start index.js --name molam-webhook

# Configure auto-restart on boot
pm2 startup
pm2 save

# Monitor
pm2 monit

# View logs
pm2 logs molam-webhook
```

**PM2 Ecosystem File** (`ecosystem.config.js`):
```javascript
module.exports = {
  apps: [{
    name: 'molam-webhook',
    script: './index.js',
    instances: 2,
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '500M'
  }]
};
```

Start with:
```bash
pm2 start ecosystem.config.js --env production
```

#### 4. Reverse Proxy (Nginx)

```nginx
upstream molam_webhook {
    server 127.0.0.1:3000;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location /molam/webhook {
        proxy_pass http://molam_webhook;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://molam_webhook;
        access_log off;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

#### 5. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal (cron)
sudo certbot renew --dry-run
```

#### 6. Systemd Service (Alternative to PM2)

Create `/etc/systemd/system/molam-webhook.service`:

```ini
[Unit]
Description=Molam Webhook Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/molam-webhook
Environment=NODE_ENV=production
Environment=MOLAM_WEBHOOK_SECRET=whsec_xxxxx
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=molam-webhook

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable molam-webhook
sudo systemctl start molam-webhook
sudo systemctl status molam-webhook
```

### PHP Deployment

#### 1. Server Requirements

- PHP >= 7.4
- OpenSSL extension
- JSON extension
- Apache/Nginx with mod_rewrite

#### 2. Apache Configuration

**.htaccess**:
```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule ^webhook$ index.php [L]
</IfModule>

# Security headers
<IfModule mod_headers.c>
    Header set X-Content-Type-Options "nosniff"
    Header set X-Frame-Options "DENY"
    Header set X-XSS-Protection "1; mode=block"
</IfModule>
```

**VirtualHost** (`/etc/apache2/sites-available/molam-webhook.conf`):
```apache
<VirtualHost *:443>
    ServerName api.yourdomain.com
    DocumentRoot /var/www/molam-webhook

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/api.yourdomain.com/privkey.pem

    <Directory /var/www/molam-webhook>
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/molam-webhook-error.log
    CustomLog ${APACHE_LOG_DIR}/molam-webhook-access.log combined
</VirtualHost>
```

Enable site:
```bash
sudo a2ensite molam-webhook
sudo a2enmod ssl rewrite headers
sudo systemctl reload apache2
```

#### 3. Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;
    root /var/www/molam-webhook;
    index index.php;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location /molam/webhook {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

#### 4. Environment Variables

Create `.env` file:
```bash
MOLAM_WEBHOOK_SECRET=whsec_your_production_secret
```

**Load in PHP**:
```php
<?php
// Load environment variables
if (file_exists(__DIR__ . '/.env')) {
    $lines = file(__DIR__ . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos($line, '#') !== 0) {
            putenv(trim($line));
        }
    }
}
```

### Python Deployment

#### 1. Virtual Environment

```bash
cd server/python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### 2. Production WSGI Server (Gunicorn)

```bash
pip install gunicorn
```

**Start Gunicorn**:
```bash
gunicorn --bind 0.0.0.0:8000 --workers 4 app:app
```

**Systemd Service** (`/etc/systemd/system/molam-webhook.service`):
```ini
[Unit]
Description=Molam Webhook Flask App
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/molam-webhook
Environment="PATH=/var/www/molam-webhook/venv/bin"
Environment="MOLAM_WEBHOOK_SECRET=whsec_xxxxx"
ExecStart=/var/www/molam-webhook/venv/bin/gunicorn \
    --workers 4 \
    --bind 0.0.0.0:8000 \
    app:app

[Install]
WantedBy=multi-user.target
```

#### 3. Nginx Reverse Proxy

```nginx
upstream molam_flask {
    server 127.0.0.1:8000;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://molam_flask;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Go Deployment

#### 1. Build Binary

```bash
cd server/go
go build -o molam-webhook main.go
```

#### 2. Systemd Service

```ini
[Unit]
Description=Molam Webhook Go Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/molam-webhook
Environment=MOLAM_WEBHOOK_SECRET=whsec_xxxxx
Environment=PORT=8080
ExecStart=/var/www/molam-webhook/molam-webhook
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

---

## Security Checklist

### Pre-Deployment

- [ ] All secrets stored in environment variables (not in code)
- [ ] `.env` file added to `.gitignore`
- [ ] Production API keys obtained from Molam Dashboard
- [ ] Webhook secret configured
- [ ] SSL/TLS certificates installed
- [ ] HTTPS enforced (HTTP redirects to HTTPS)
- [ ] CSP headers configured
- [ ] Rate limiting enabled
- [ ] Firewall rules configured

### API Keys

- [ ] Use live keys (`pk_live_`, `sk_live_`) in production
- [ ] Never expose secret keys in frontend code
- [ ] Rotate keys periodically (quarterly recommended)
- [ ] Store keys in secure vault (AWS Secrets Manager, HashiCorp Vault, etc.)

### Webhook Security

- [ ] HMAC signature verification enabled
- [ ] Timestamp validation enabled (5-minute window)
- [ ] HTTPS-only endpoints
- [ ] Idempotency handling implemented
- [ ] Raw body parsing (no JSON middleware before signature verification)
- [ ] Webhook secret stored securely

### Network Security

- [ ] Firewall configured (only ports 80, 443 open)
- [ ] SSH key-based authentication (disable password auth)
- [ ] Fail2ban or similar intrusion prevention
- [ ] Regular security updates applied
- [ ] DDoS protection enabled (Cloudflare, AWS Shield, etc.)

### Application Security

- [ ] Input validation on all user inputs
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output escaping)
- [ ] CSRF tokens for state-changing operations
- [ ] Session management secure
- [ ] Error messages don't leak sensitive info

---

## Production Configuration

### Environment Variables

**Node.js**:
```bash
NODE_ENV=production
MOLAM_WEBHOOK_SECRET=whsec_live_xxxxx
MOLAM_PUBLIC_KEY=pk_live_xxxxx
MOLAM_SECRET_KEY=sk_live_xxxxx
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost/molam_prod
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
```

**PHP**:
```bash
MOLAM_WEBHOOK_SECRET=whsec_live_xxxxx
MOLAM_PUBLIC_KEY=pk_live_xxxxx
MOLAM_SECRET_KEY=sk_live_xxxxx
APP_ENV=production
APP_DEBUG=false
```

**Python**:
```bash
FLASK_ENV=production
MOLAM_WEBHOOK_SECRET=whsec_live_xxxxx
SECRET_KEY=random_flask_secret_key
DATABASE_URI=postgresql://user:pass@localhost/molam_prod
```

### Database Configuration

**PostgreSQL Connection Pooling**:
```javascript
// Node.js (pg)
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
```

**Indexes for Performance**:
```sql
-- Webhook deliveries
CREATE INDEX idx_webhook_deliveries_event_id ON webhook_deliveries(event_id);
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);

-- Orders/Payments
CREATE INDEX idx_orders_payment_intent_id ON orders(payment_intent_id);
CREATE INDEX idx_orders_status ON orders(status);
```

### Redis for Idempotency (Recommended)

**Node.js**:
```javascript
const redis = require('redis');
const client = redis.createClient({ url: process.env.REDIS_URL });

async function isEventProcessed(eventId) {
  const exists = await client.exists(`event:${eventId}`);
  return exists === 1;
}

async function markEventProcessed(eventId) {
  await client.setex(`event:${eventId}`, 86400, '1'); // 24h TTL
}
```

---

## Monitoring & Logging

### Application Logging

**Node.js (Winston)**:
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

**Log Webhook Events**:
```javascript
logger.info('Webhook received', {
  event_id: event.id,
  event_type: event.type,
  payment_id: event.data.id,
  amount: event.data.amount
});
```

### Health Checks

**Endpoint**:
```javascript
app.get('/health', async (req, res) => {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'unknown',
    redis: 'unknown'
  };

  // Check database
  try {
    await db.query('SELECT 1');
    checks.database = 'healthy';
  } catch (error) {
    checks.database = 'unhealthy';
    checks.status = 'unhealthy';
  }

  // Check Redis
  try {
    await redis.ping();
    checks.redis = 'healthy';
  } catch (error) {
    checks.redis = 'unhealthy';
  }

  const statusCode = checks.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(checks);
});
```

**Monitor with Uptime Robot, Pingdom, or StatusCake**.

### Error Tracking

**Sentry Integration**:
```javascript
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});

// Error handler
app.use(Sentry.Handlers.errorHandler());
```

### Metrics & Analytics

**Prometheus + Grafana**:
```javascript
const promClient = require('prom-client');

const webhookCounter = new promClient.Counter({
  name: 'molam_webhooks_total',
  help: 'Total number of webhooks received',
  labelNames: ['event_type', 'status']
});

const webhookDuration = new promClient.Histogram({
  name: 'molam_webhook_duration_seconds',
  help: 'Webhook processing duration',
  labelNames: ['event_type']
});
```

---

## Scaling & Performance

### Horizontal Scaling

**Load Balancer (Nginx)**:
```nginx
upstream molam_backends {
    least_conn;
    server backend1.local:3000;
    server backend2.local:3000;
    server backend3.local:3000;
}

server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://molam_backends;
    }
}
```

### Database Optimization

**Connection Pooling**:
- Min connections: 5
- Max connections: 20 (adjust based on server specs)
- Idle timeout: 30s

**Query Optimization**:
- Use indexes on frequently queried columns
- Avoid N+1 queries
- Use prepared statements
- Cache frequently accessed data

### Caching Strategy

**Redis Cache**:
```javascript
async function getPaymentIntent(intentId) {
  const cacheKey = `intent:${intentId}`;

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Fetch from API
  const intent = await molam.retrievePaymentIntent(intentId);

  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(intent));

  return intent;
}
```

### Rate Limiting

**Express Rate Limit**:
```javascript
const rateLimit = require('express-rate-limit');

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many webhook requests'
});

app.post('/molam/webhook', webhookLimiter, webhookHandler);
```

---

## Troubleshooting

### Common Issues

#### 1. Webhook Not Received

**Check**:
- Is webhook URL publicly accessible? (Not localhost)
- Is HTTPS enabled?
- Is webhook secret correct?
- Check firewall rules
- Check server logs

**Debug**:
```bash
# Test webhook endpoint
curl -X POST https://api.yourdomain.com/molam/webhook \
  -H "Content-Type: application/json" \
  -H "Molam-Signature: t=123,v1=abc,kid=v1" \
  -d '{"test": "data"}'
```

#### 2. Signature Verification Fails

**Common Causes**:
- Wrong webhook secret
- Middleware modifying request body
- Timestamp drift

**Fix**:
```javascript
// Use raw body parser
app.use(bodyParser.raw({ type: 'application/json' }));

// NOT this:
// app.use(bodyParser.json()) // ❌
```

#### 3. Payment Intent Not Found

**Possible Causes**:
- Using test key in production (or vice versa)
- Intent ID typo
- Intent expired

**Debug**:
```javascript
try {
  const intent = await checkout.retrievePaymentIntent(intentId);
  console.log('Intent status:', intent.status);
} catch (error) {
  console.error('Error:', error.message);
}
```

#### 4. CORS Errors

**Fix**:
```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://yourdomain.com');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
```

#### 5. High Memory Usage

**Causes**:
- Memory leaks
- Large payloads
- Too many connections

**Solutions**:
- Restart application periodically
- Use PM2 `max_memory_restart`
- Optimize database queries
- Implement pagination

### Log Analysis

**Find Failed Webhooks**:
```bash
grep "Invalid signature" /var/log/molam-webhook/error.log
```

**Count Events by Type**:
```bash
grep "Webhook received" combined.log | jq '.event_type' | sort | uniq -c
```

### Performance Debugging

**Node.js Profiling**:
```bash
node --prof index.js
node --prof-process isolate-*.log > profile.txt
```

**Memory Leaks**:
```bash
node --inspect index.js
# Open chrome://inspect in Chrome
```

---

## Disaster Recovery

### Backup Strategy

**Database Backups**:
```bash
# Automated daily backups
0 2 * * * pg_dump molam_prod | gzip > /backups/molam_$(date +\%Y\%m\%d).sql.gz

# Retention: 30 days
find /backups -name "molam_*.sql.gz" -mtime +30 -delete
```

**Configuration Backups**:
- Store in version control (Git)
- Use infrastructure as code (Terraform, Ansible)

### Rollback Plan

1. **Identify Issue**: Check logs, monitoring
2. **Stop Service**: `pm2 stop molam-webhook`
3. **Restore Backup**: `git checkout previous-version`
4. **Restart Service**: `pm2 start molam-webhook`
5. **Verify**: Check health endpoint, test payment

### Incident Response

1. **Alert**: Receive alert from monitoring
2. **Investigate**: Check logs, metrics
3. **Communicate**: Notify team, stakeholders
4. **Mitigate**: Apply hotfix or rollback
5. **Resolve**: Fix root cause
6. **Post-Mortem**: Document learnings

---

## Deployment Checklist

### Pre-Deployment

- [ ] Code reviewed and tested
- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Database migrations run
- [ ] Backup created
- [ ] Monitoring configured
- [ ] Load testing completed

### Deployment

- [ ] Deploy to staging first
- [ ] Run smoke tests
- [ ] Deploy to production
- [ ] Verify health check
- [ ] Monitor logs for errors
- [ ] Test critical flows

### Post-Deployment

- [ ] Verify webhooks working
- [ ] Check error rates
- [ ] Monitor performance metrics
- [ ] Notify team of successful deployment
- [ ] Update documentation

---

## Support & Resources

**Documentation**: https://docs.molam.com/sdk
**API Reference**: https://docs.molam.com/api
**Dashboard**: https://dashboard.molam.com
**Support**: support@molam.co
**Status Page**: https://status.molam.com

---

**Version**: 1.0.0
**Last Updated**: 2025-01-15
**Status**: Production Ready
