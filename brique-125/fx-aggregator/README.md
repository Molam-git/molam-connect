# FX Aggregator — Real-Time Multi-Provider FX Rates

## Overview
Real-time FX rate aggregation from multiple providers with SIRA-weighted quotes, Redis caching (P50 < 5ms), and WebSocket streaming.

## Features
- Multi-provider aggregation (HTTP polling + WebSocket)
- SIRA-weighted rate calculation
- Redis cache with 5s TTL
- REST API + WebSocket streaming
- Audit trail in PostgreSQL
- Automatic provider failover

## API Endpoints

### GET /api/fx-agg/quote
```bash
curl "http://localhost:3000/api/fx-agg/quote?base=USD&quote=XOF"
```

Response:
```json
{
  "pair": "USD/XOF",
  "rate": 615.234,
  "spread": 0.0012,
  "providers": [
    { "name": "Provider A", "rate": 615.12, "confidence": 1.0 },
    { "name": "Provider B", "rate": 615.35, "confidence": 0.98 }
  ],
  "computed_at": "2025-01-18T10:30:00Z"
}
```

### POST /api/fx-agg/convert
```bash
curl -X POST http://localhost:3000/api/fx-agg/convert \
  -H "Content-Type: application/json" \
  -d '{"base":"USD","quote":"XOF","amount":1000}'
```

Response:
```json
{
  "from_currency": "USD",
  "to_currency": "XOF",
  "from_amount": 1000,
  "to_amount": 615234.0,
  "rate": 615.234,
  "spread": 0.0012,
  "spread_cost": 1.2
}
```

## WebSocket

Connect to `ws://localhost:8081`:
```javascript
const ws = new WebSocket('ws://localhost:8081');
ws.send(JSON.stringify({ action: 'subscribe', pairs: ['USD/XOF', 'EUR/XOF'] }));
ws.onmessage = (event) => {
  const { type, pair, data } = JSON.parse(event.data);
  console.log(type, pair, data);
};
```

## Workers

Start aggregator worker:
```bash
node src/workers/aggregator.ts
```

Start WebSocket server:
```bash
node src/ws/server.ts
```

## Database

Tables:
- `fx_rate_providers` - Provider registry
- `fx_live_rates` - Live rates with TTL
- `fx_quotes_cache` - Computed quotes cache
- `fx_provider_audit` - Audit trail

## Configuration

Add providers:
```sql
INSERT INTO fx_rate_providers(name, provider_type, endpoint, api_key_ref, priority)
VALUES('Provider A', 'http', 'https://api.provider-a.com/rates', 'PROVIDER_A_KEY', 10);
```

## Integration with Brique 125

The FX Aggregator feeds real-time rates to Brique 125's FX execution engine via the `fx_quotes` table.

**Version**: 1.0.0 | **Status**: ✅ Ready
