import client from 'prom-client';

// Enable collection of default metrics
client.collectDefaultMetrics();

// Custom metrics
export const payoutCreatedCounter = new client.Counter({
    name: 'payouts_created_total',
    help: 'Total number of payouts created',
    labelNames: ['origin_module', 'currency'] as const,
});

export const payoutStatusCounter = new client.Counter({
    name: 'payouts_status_total',
    help: 'Total number of payouts by status',
    labelNames: ['status', 'origin_module'] as const,
});

export const payoutProcessingDuration = new client.Histogram({
    name: 'payout_processing_duration_seconds',
    help: 'Payout processing duration in seconds',
    labelNames: ['status'] as const,
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
});

export const reconciliationMatchRate = new client.Gauge({
    name: 'reconciliation_match_rate',
    help: 'Rate of successful reconciliation matches',
});

export async function initMetrics() {
    return await client.register.metrics();
}