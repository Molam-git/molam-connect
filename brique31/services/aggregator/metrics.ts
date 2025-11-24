import client from 'prom-client';

// Enable collection of default metrics
client.collectDefaultMetrics();

// Custom metrics
export const processedEventsCounter = new client.Counter({
    name: 'molam_aggregator_processed_events_total',
    help: 'Total number of processed events',
    labelNames: ['topic', 'status']
});

export const processingLatencyHistogram = new client.Histogram({
    name: 'molam_aggregator_processing_latency_seconds',
    help: 'Processing latency in seconds',
    labelNames: ['topic']
});

export const wsConnectionsGauge = new client.Gauge({
    name: 'molam_ws_connections',
    help: 'Number of active WebSocket connections'
});

export const alertsTriggeredCounter = new client.Counter({
    name: 'molam_alerts_triggered_total',
    help: 'Total number of alerts triggered',
    labelNames: ['severity']
});

export function initMetrics() {
    console.log('Metrics initialized');
}

export function getMetrics() {
    return client.register.metrics();
}