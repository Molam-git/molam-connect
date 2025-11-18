# Molam Form Core - Installation Guide

## Quick Start (Docker - Recommended)

The fastest way to get started with Molam Form Core:

```bash
# 1. Navigate to project directory
cd brique-94

# 2. Copy environment file
cp .env.example .env

# 3. Start all services
docker-compose up -d

# 4. Check health
curl http://localhost:3000/health
```

**That's it!** The following services are now running:
- API Server: [http://localhost:3000](http://localhost:3000)
- Merchant Dashboard: [http://localhost:3001](http://localhost:3001)
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

---

## Manual Installation

### Prerequisites

Ensure you have the following installed:
- **Node.js** 18 or higher
- **PostgreSQL** 14 or higher
- **npm** or **yarn**

### Step 1: Install Dependencies

```bash
cd brique-94
npm install
```

### Step 2: Database Setup

```bash
# Create database
createdb molam_form

# Or using psql
psql -U postgres -c "CREATE DATABASE molam_form;"

# Run migrations
psql -U postgres -d molam_form -f migrations/001_b94_molam_form_core.sql
```

### Step 3: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env file with your settings
nano .env  # or use your preferred editor
```

**Important settings to configure:**
```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=molam_form
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password_here

# Security
JWT_SECRET=change_this_to_a_random_string

# CORS (add your frontend domain)
CORS_ORIGIN=http://localhost:3001,https://yourdomain.com
```

### Step 4: Build and Start

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

The API server will start on [http://localhost:3000](http://localhost:3000).

---

## Verify Installation

### 1. Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected"
}
```

### 2. Create Test API Key

First, you need to generate API keys. You can do this via the merchant dashboard or directly in the database:

```sql
-- Connect to database
psql -U postgres -d molam_form

-- Insert a test merchant plugin
INSERT INTO merchant_plugins (merchant_id, plugin_type, version, status)
VALUES ('merchant_test_123', 'universal', '1.0.0', 'active');

-- Generate API key using the helper function
SELECT * FROM generate_api_key('merchant_test_123', 'publishable', 'test');
```

### 3. Test API Endpoint

```bash
curl -X POST http://localhost:3000/form/payment-intents \
  -H "Authorization: Bearer pk_test_YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100.00,
    "currency": "USD",
    "customer_email": "test@example.com",
    "description": "Test payment"
  }'
```

---

## SDK Installation

### Web SDK

Add to your HTML file:

```html
<!-- Option 1: Local development -->
<script src="http://localhost:3000/sdk/web/molam-form.js"></script>

<!-- Option 2: Production CDN -->
<script src="https://cdn.molam.com/molam-form.js"></script>
```

### Flutter SDK

Add to `pubspec.yaml`:

```yaml
dependencies:
  molam_form:
    path: ../brique-94/src/sdk/mobile/flutter
```

Then run:
```bash
flutter pub get
```

### Node.js Server SDK

```bash
npm install molam-sdk
```

Or for local development:
```bash
cd your-project
npm install ../brique-94/src/sdk/server/node
```

### PHP Server SDK

```bash
composer require molam/molam-sdk
```

Or copy directly:
```bash
cp brique-94/src/sdk/server/php/MolamSDK.php your-project/vendor/
```

### Python Server SDK

```bash
pip install molam-sdk
```

Or for local development:
```bash
pip install -e ../brique-94/src/sdk/server/python
```

### Go Server SDK

```bash
go get github.com/molam/molam-sdk-go
```

Or copy directly:
```bash
cp brique-94/src/sdk/server/go/molam.go your-project/
```

---

## Merchant Dashboard Setup

The merchant dashboard is a React application that provides a UI for managing API keys, viewing logs, and configuring checkout settings.

### Development

```bash
cd src/ui/merchant-dashboard
npm install
npm start
```

Dashboard will be available at [http://localhost:3001](http://localhost:3001).

### Production Build

```bash
cd src/ui/merchant-dashboard
npm run build
```

Serve the `build/` directory with your web server (nginx, Apache, etc.).

---

## Troubleshooting

### Database Connection Failed

**Problem:** API shows `database: disconnected` in health check.

**Solution:**
1. Verify PostgreSQL is running: `pg_isready`
2. Check credentials in `.env` file
3. Ensure database exists: `psql -l | grep molam_form`
4. Check PostgreSQL logs: `tail -f /var/log/postgresql/postgresql-14-main.log`

### Port Already in Use

**Problem:** `Error: listen EADDRINUSE :::3000`

**Solution:**
1. Find process using port: `lsof -i :3000` (Mac/Linux) or `netstat -ano | findstr :3000` (Windows)
2. Kill the process or change `PORT` in `.env`

### Migration Errors

**Problem:** SQL migration fails with errors.

**Solution:**
1. Drop and recreate database:
   ```sql
   DROP DATABASE molam_form;
   CREATE DATABASE molam_form;
   ```
2. Run migration again:
   ```bash
   psql -U postgres -d molam_form -f migrations/001_b94_molam_form_core.sql
   ```

### CORS Errors in Browser

**Problem:** Browser shows CORS policy errors.

**Solution:**
1. Add your frontend domain to `CORS_ORIGIN` in `.env`:
   ```env
   CORS_ORIGIN=http://localhost:3001,http://localhost:8080
   ```
2. Restart the server

---

## Production Deployment Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Generate strong `JWT_SECRET` (at least 32 random characters)
- [ ] Configure production database credentials
- [ ] Set up HTTPS/TLS certificates
- [ ] Configure `CORS_ORIGIN` with your production domain
- [ ] Set up database backups
- [ ] Configure log rotation
- [ ] Set up monitoring (Prometheus, Sentry, etc.)
- [ ] Review rate limits in `.env`
- [ ] Test with production API keys
- [ ] Set up webhook endpoints
- [ ] Configure CDN for SDK hosting

---

## Next Steps

1. **Generate API Keys:** Visit [http://localhost:3001](http://localhost:3001) (dashboard) or use the API
2. **Integrate SDK:** Choose Web, Mobile, or Server SDK and follow the examples in [README.md](README.md#-sdks)
3. **Test Payments:** Use test cards from [README.md](README.md#-testing)
4. **Customize Checkout:** Configure branding and settings via dashboard
5. **Go Live:** Switch to live API keys when ready

---

## Support

For issues or questions:
- 📚 Documentation: [README.md](README.md)
- 🐛 Issues: [GitHub Issues](https://github.com/molam/molam-form-core/issues)
- 📧 Email: support@molam.com

---

**Happy building! 🚀**
