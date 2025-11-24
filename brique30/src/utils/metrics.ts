import client from 'prom-client';

// Compteur pour les requêtes vocales
export const vocalRequestsTotal = new client.Counter({
    name: 'vocal_requests_total',
    help: 'Total number of voice requests',
    labelNames: ['country', 'lang', 'template_key', 'result'] as const,
});

// Histogram pour la latence
export const vocalLatencySeconds = new client.Histogram({
    name: 'vocal_latency_seconds',
    help: 'Voice request latency in seconds',
    labelNames: ['country', 'provider'] as const,
    buckets: [0.1, 0.5, 1, 2, 5, 10],
});

// Compteur pour le coût
export const vocalCostUsdTotal = new client.Counter({
    name: 'vocal_cost_usd_total',
    help: 'Total cost of voice requests in USD',
    labelNames: ['country', 'provider'] as const,
});

// Fonction pour enregistrer les métriques
export function recordMetrics(metricName: string, labels: Record<string, any>, value?: number) {
    switch (metricName) {
        case 'vocal_requests_total':
            vocalRequestsTotal.inc(labels, value || 1);
            break;
        case 'vocal_latency_seconds':
            if (value) vocalLatencySeconds.observe(labels, value);
            break;
        case 'vocal_cost_usd_total':
            if (value) vocalCostUsdTotal.inc(labels, value);
            break;
        default:
            console.warn(`Unknown metric: ${metricName}`);
    }
}