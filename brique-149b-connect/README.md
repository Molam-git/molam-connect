# Molam Connect - Merchant Dashboard (Brique 149b)

Complete merchant analytics and reporting platform with real-time transaction aggregation.

## Architecture

```
┌──────────────────┐
│ Payment Events   │──┐
│ (API/Webhook)    │  │
└──────────────────┘  │
                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Transaction      │──│  Aggregation     │──│   PostgreSQL     │
│ Events Table     │  │  Worker          │  │   Aggregates     │
└──────────────────┘  └──────────────────┘  └──────────────────┘
                                                       │
                                                       ▼
                      ┌──────────────────┐  ┌──────────────────┐
                      │  Dashboard API   │──│  React Dashboard │
                      │  (Express)       │  │  (Web UI)        │
                      └──────────────────┘  └──────────────────┘
```

## Features

### Backend (Node.js/TypeScript)
- ✅ JWT + API Key Authentication
- ✅ Transaction Event Ingestion (single & batch)
- ✅ Real-time Aggregation Worker
- ✅ Daily & Hourly Aggregates
- ✅ Payment Method Analytics
- ✅ Product Performance Tracking
- ✅ Customer Analytics
- ✅ RESTful Dashboard API

### Aggregation Worker
- ✅ Polls unprocessed transaction events
- ✅ Atomic aggregate updates
- ✅ Handles daily/hourly rollups
- ✅ Tracks payment methods, products, customers
- ✅ Graceful shutdown support
- ✅ Auto-retry on errors

### Dashboard UI (React)
- ✅ Real-time KPI cards
- ✅ Revenue trend charts
- ✅ Transaction volume analytics
- ✅ Payment method breakdown
- ✅ Top products leaderboard
- ✅ Responsive design
- ✅ Date range filtering

### Infrastructure
- ✅ Docker Multi-stage Builds
- ✅ Separate Worker Container
- ✅ Docker Compose for local dev
- ✅ Production-ready PostgreSQL schema
- ✅ Health checks

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Docker & Docker Compose

### Local Development

1. **Clone and Install**
```bash
git clone <repo-url>
cd brique-149b-connect

# Server
cd server
npm install

# Web
cd ../web
npm install
```

2. **Setup Environment**
```bash
cp .env.example .env
# Edit .env with your values
```

3. **Start with Docker Compose**
```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5433
- Connect API on port 8081
- Aggregation Worker (background)
- Dashboard UI on port 3001

4. **Run Migrations**
```bash
cd server
npm run migrate
```

5. **Access**
- API: http://localhost:8081
- Dashboard: http://localhost:3001
- Health: http://localhost:8081/healthz

### Manual Development

**API Server:**
```bash
cd server
npm run dev
```

**Aggregation Worker:**
```bash
cd server
npm run dev:worker
```

**Dashboard UI:**
```bash
cd web
npm start
```

## API Endpoints

### Authentication

#### JWT (Web Dashboard)
```
Authorization: Bearer <molam-id-jwt>
```

#### API Key (Server-to-Server)
```
X-API-Key: <merchant-api-key>
```

### Dashboard Endpoints

#### GET /api/dashboard/overview
High-level metrics for today and this month.

**Response:**
```json
{
  "today": {
    "transactions": 1234,
    "successful_transactions": 1200,
    "revenue": 50000.00,
    "fees": 1500.00,
    "net_revenue": 48500.00,
    "avg_transaction": 40.55,
    "transaction_growth": "5.20",
    "revenue_growth": "8.40"
  },
  "month": {
    "transactions": 35000,
    "revenue": 1500000.00,
    "customers": 2500
  }
}
```

#### GET /api/dashboard/analytics
Detailed analytics for date range.

**Query Parameters:**
- `start_date` (required): YYYY-MM-DD
- `end_date` (required): YYYY-MM-DD
- `granularity` (optional): "daily" | "hourly" (default: daily)

**Response:**
```json
{
  "granularity": "daily",
  "data": [
    {
      "date": "2025-01-15",
      "transactions": 450,
      "successful": 440,
      "failed": 10,
      "revenue": 18500.00,
      "net_revenue": 17900.00,
      "customers": 120,
      "new_customers": 15
    }
  ]
}
```

#### GET /api/dashboard/payment-methods
Payment method breakdown.

**Query Parameters:**
- `days` (optional): number of days (default: 30)

**Response:**
```json
{
  "period_days": 30,
  "payment_methods": [
    {
      "method": "mobile_money",
      "count": 1500,
      "amount": 750000.00
    },
    {
      "method": "card",
      "count": 800,
      "amount": 450000.00
    }
  ]
}
```

#### GET /api/dashboard/top-products
Top selling products.

**Query Parameters:**
- `days` (optional): number of days (default: 30)
- `limit` (optional): max results (default: 10)

**Response:**
```json
{
  "period_days": 30,
  "products": [
    {
      "product_id": "prod-123",
      "product_name": "Premium Package",
      "transactions": 350,
      "amount": 175000.00
    }
  ]
}
```

#### GET /api/dashboard/customers
Customer analytics and top spenders.

**Query Parameters:**
- `limit` (optional): max customers to return (default: 50)

**Response:**
```json
{
  "summary": {
    "total_customers": 2500,
    "avg_transactions": "4.50",
    "avg_spend": "600.00"
  },
  "top_customers": [
    {
      "customer_id": "cust-456",
      "transactions": 25,
      "total_spent": 15000.00,
      "first_transaction": "2024-06-01T10:00:00Z",
      "last_transaction": "2025-01-15T14:30:00Z"
    }
  ]
}
```

### Event Ingestion Endpoints

#### POST /api/events/transaction
Ingest single transaction event.

**Headers:**
```
X-API-Key: <your-api-key>
```

**Request Body:**
```json
{
  "transaction_id": "txn-789",
  "customer_id": "cust-456",
  "event_type": "payment_succeeded",
  "amount": 1000.00,
  "currency": "XOF",
  "fee": 30.00,
  "payment_method": "mobile_money",
  "product_id": "prod-123",
  "product_name": "Premium Package"
}
```

**Response:**
```json
{
  "ok": true,
  "event_id": "evt-uuid",
  "queued": true,
  "message": "Event queued for processing"
}
```

#### POST /api/events/transaction/batch
Ingest multiple events (max 1000).

**Request Body:**
```json
[
  {
    "transaction_id": "txn-1",
    "event_type": "payment_succeeded",
    "amount": 500.00,
    "currency": "XOF"
  },
  {
    "transaction_id": "txn-2",
    "event_type": "payment_failed",
    "amount": 750.00,
    "currency": "XOF"
  }
]
```

**Response:**
```json
{
  "ok": true,
  "total": 2,
  "ingested": 2,
  "duplicates": 0
}
```

## Database Schema

### merchants
Core merchant information.

### transaction_events
Raw transaction events queue for processing.

### merchant_daily_aggregates
Pre-computed daily metrics per merchant.

### merchant_hourly_aggregates
Real-time hourly metrics.

### merchant_product_stats
Product performance tracking.

### merchant_customer_stats
Customer lifetime value and behavior.

### merchant_api_keys
API key authentication for event ingestion.

## Aggregation Worker

The worker continuously polls for unprocessed transaction events and updates aggregates.

### How It Works

1. **Poll**: Fetch unprocessed events (batch of 100)
2. **Process**: For each event:
   - Update daily aggregates
   - Update hourly aggregates
   - Update product stats (if applicable)
   - Update customer stats (if applicable)
3. **Mark Processed**: Atomically mark event as processed
4. **Repeat**: Sleep 5 seconds, then repeat

### Running the Worker

```bash
# Development
npm run dev:worker

# Production
npm run start:worker

# Docker
docker-compose up worker
```

### Worker Metrics

- Processes events in batches of 100
- 5-second poll interval
- Graceful shutdown on SIGINT/SIGTERM
- Auto-retry with backoff on errors

## Event Types

### payment_created
Payment initiated but not yet confirmed.

### payment_succeeded
Payment completed successfully.

### payment_failed
Payment failed (e.g., insufficient funds).

### payment_refunded
Payment was refunded to customer.

## Testing

```bash
# Server tests
cd server
npm test -- --coverage

# Web tests
cd web
npm test
```

## Deployment

### Docker

```bash
# Build API server
docker build -t molam/connect-server:latest -f server/Dockerfile ./server

# Build worker
docker build -t molam/connect-worker:latest -f server/Dockerfile.worker ./server

# Build web
docker build -t molam/connect-web:latest -f web/Dockerfile ./web

# Push to registry
docker push molam/connect-server:latest
docker push molam/connect-worker:latest
docker push molam/connect-web:latest
```

### Kubernetes

Deploy using Kubernetes manifests (similar to Brique 149a structure):
- Deployment for API server (with HPA)
- Deployment for worker (2-3 replicas)
- Service for API
- Ingress for external access
- Secrets for DB credentials and JWT key

## Monitoring

### Health Checks
- `/healthz` - Database connectivity
- `/readyz` - Service readiness
- `/metrics` - Prometheus metrics (TODO)

### Logs
- Structured logging with event context
- Request/response logging
- Worker processing logs
- Error tracking with stack traces

## Security

### Authentication
- RS256 JWT for web dashboard
- SHA-256 hashed API keys for server-to-server
- Rate limiting on ingestion endpoints

### Data Protection
- Non-root containers
- Read-only root filesystem
- Secrets via environment variables
- Database connection pooling with SSL

### API Keys
- Prefix-based lookup (fast)
- SHA-256 hashing (secure)
- Expiry support
- Last-used tracking
- Revocation support

## Performance

### Optimizations
- Database indexes on frequently queried columns
- Batch event processing
- Connection pooling (max 20 connections)
- Atomic aggregate updates (no locks)
- Hourly aggregates for real-time queries

### Scaling
- Horizontal scaling of API servers
- Multiple worker replicas (partitioned by merchant_id)
- Read replicas for dashboard queries
- Time-series partitioning for large datasets

## Troubleshooting

### Events Not Processing

```bash
# Check worker logs
docker-compose logs worker

# Check for unprocessed events
psql $DATABASE_URL -c "SELECT COUNT(*) FROM transaction_events WHERE processed = false"

# Manually process stuck event
psql $DATABASE_URL -c "UPDATE transaction_events SET processed = false WHERE id = 'event-id'"
```

### Dashboard Not Loading

```bash
# Check API health
curl http://localhost:8081/healthz

# Check database connection
psql $DATABASE_URL -c "SELECT NOW()"

# Check API logs
docker-compose logs server
```

## Contributing

1. Create feature branch
2. Write tests
3. Ensure all tests pass
4. Submit PR

## License

Proprietary - Molam Platform

## Support

For issues or questions, contact the Molam engineering team.

---

**Status:** ✅ Production Ready

**Last Updated:** 2025-01-19

**Version:** 1.0.0
