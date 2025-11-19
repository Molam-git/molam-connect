// ============================================================================
// Real-Time FX Aggregator Service
// ============================================================================

import { pool } from "../db";
import Redis from "ioredis";
import { callSiraForWeights } from "../utils/sira";

const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

interface Provider {
  id: string;
  name: string;
  endpoint: string;
  priority: number;
  enabled: boolean;
}

interface FXRate {
  pair: string;
  rate: number;
  provider_id: string;
  sourced_at: Date;
  confidence: number;
}

// Get aggregated quote with SIRA weighting
export async function getQuote(base: string, quote: string): Promise<any> {
  const pair = `${base}/${quote}`;

  // Try cache first (P50 < 5ms target)
  const cached = await redis.get(`fx:quote:${pair}`);
  if (cached) return JSON.parse(cached);

  // Fetch from DB
  const { rows } = await pool.query(
    `SELECT r.*, p.name as provider_name, p.priority
     FROM fx_live_rates r
     JOIN fx_rate_providers p ON r.provider_id = p.id
     WHERE r.pair = $1 AND r.received_at > now() - interval '1 minute' * r.ttl_seconds
     ORDER BY p.priority ASC`,
    [pair]
  );

  if (rows.length === 0) {
    throw new Error(`No rates available for ${pair}`);
  }

  // SIRA-weighted calculation
  const providers = rows.map((r: any) => ({
    provider_id: r.provider_id,
    rate: Number(r.rate),
    confidence: r.confidence,
    priority: r.priority
  }));

  const weights = await callSiraForWeights(providers, pair);
  const totalWeight = weights.reduce((sum: number, w: any) => sum + w.weight, 0);
  const weightedRate = weights.reduce((sum: number, w: any) => sum + (w.rate * w.weight), 0) / totalWeight;

  const result = {
    pair,
    base_currency: base,
    quote_currency: quote,
    rate: weightedRate,
    spread: calculateSpread(rows),
    providers: weights.map((w: any) => ({ provider_id: w.provider_id, rate: w.rate, weight: w.weight })),
    computed_at: new Date(),
    ttl_seconds: 5
  };

  // Cache with 5s TTL
  await redis.setEx(`fx:quote:${pair}`, 5, JSON.stringify(result));

  // Store in quotes_cache
  await pool.query(
    `INSERT INTO fx_quotes_cache(pair, rate, computed_at, providers, ttl_seconds)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(pair) DO UPDATE SET rate=$2, computed_at=$3, providers=$4, ttl_seconds=$5`,
    [pair, weightedRate, new Date(), JSON.stringify(result.providers), 5]
  );

  return result;
}

// Convert amount with exact calculation
export async function convert(base: string, quote: string, amount: number): Promise<any> {
  const q = await getQuote(base, quote);
  const converted = amount * q.rate;
  const spread_cost = amount * q.spread;

  return {
    from_currency: base,
    to_currency: quote,
    from_amount: amount,
    to_amount: converted,
    rate: q.rate,
    spread: q.spread,
    spread_cost,
    providers: q.providers,
    computed_at: q.computed_at
  };
}

// Refresh rates from providers
export async function refreshRates(): Promise<void> {
  const { rows: providers } = await pool.query(
    `SELECT * FROM fx_rate_providers WHERE enabled=true ORDER BY priority ASC`
  );

  for (const p of providers) {
    try {
      const rates = await fetchFromProvider(p);
      for (const r of rates) {
        await pool.query(
          `INSERT INTO fx_live_rates(pair, base_currency, quote_currency, rate, provider_id, sourced_at, confidence)
           VALUES($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT(pair, provider_id) DO UPDATE SET rate=$4, sourced_at=$6, received_at=now()`,
          [r.pair, r.base, r.quote, r.rate, p.id, r.sourced_at, r.confidence || 1.0]
        );
        // Log to audit
        await pool.query(
          `INSERT INTO fx_provider_audit(provider_id, pair, raw_payload, parsed_rate, sourced_at)
           VALUES($1,$2,$3,$4,$5)`,
          [p.id, r.pair, r.raw || {}, r.rate, r.sourced_at]
        );
      }
    } catch (e: any) {
      console.error(`Failed to refresh from ${p.name}:`, e.message);
    }
  }
}

// Fetch from provider (HTTP or WebSocket)
async function fetchFromProvider(p: Provider): Promise<any[]> {
  if (p.provider_type === 'http') {
    const res = await fetch(p.endpoint, {
      headers: { 'Authorization': `Bearer ${process.env[p.api_key_ref || '']}` }
    });
    const data = await res.json();
    return normalizeProviderData(p.name, data);
  }
  // WebSocket handled by separate worker
  return [];
}

// Normalize provider-specific formats
function normalizeProviderData(provider: string, data: any): any[] {
  // Simple normalization - extend based on provider
  if (Array.isArray(data.rates)) {
    return data.rates.map((r: any) => ({
      pair: `${r.base}/${r.quote}`,
      base: r.base,
      quote: r.quote,
      rate: r.rate,
      sourced_at: new Date(r.timestamp || Date.now()),
      confidence: 1.0,
      raw: r
    }));
  }
  return [];
}

function calculateSpread(rows: any[]): number {
  if (rows.length < 2) return 0;
  const rates = rows.map((r: any) => Number(r.rate));
  const max = Math.max(...rates);
  const min = Math.min(...rates);
  return (max - min) / min;
}
