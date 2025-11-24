import client from 'prom-client';

export const prometheusMetrics = {
    cashinTransactionsTotal: new client.Counter({
        name: 'cashin_transactions_total',
        help: 'Total number of cash-in transactions',
        labelNames: ['country', 'status'] as const,
    }),

    cashinVolumeSum: new client.Counter({
        name: 'cashin_volume_sum',
        help: 'Total volume of cash-in transactions',
        labelNames: ['currency'] as const,
    }),

    cashinDuration: new client.Histogram({
        name: 'cashin_duration_seconds',
        help: 'Duration of cash-in transactions',
        labelNames: ['status'] as const,
        buckets: [0.1, 0.5, 1, 2, 5],
    }),
};

// Collecte des métiques par défaut
client.collectDefaultMetrics();