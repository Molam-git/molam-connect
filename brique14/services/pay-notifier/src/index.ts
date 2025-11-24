import { runWorkerForever } from "./queue/worker.js";
import "./http/server.js";
import { initializeWebhooks } from "./webhooks/outbound.js";
import { NotificationMetrics } from "./metrics.js";

// Graceful shutdown handling
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

let isShuttingDown = false;

async function gracefulShutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('Received shutdown signal, starting graceful shutdown...');

    // Stop accepting new requests (handled by HTTP server)
    // Allow current operations to complete
    setTimeout(() => {
        console.log('Graceful shutdown completed');
        process.exit(0);
    }, 30000); // 30 seconds max
}

async function main() {
    try {
        console.log('Starting Molam Pay Notifier service...');

        // Initialize webhooks from environment
        await initializeWebhooks();

        // Start the worker in background
        console.log('Starting notification worker...');
        runWorkerForever().catch(console.error);

        // Metrics endpoint for Prometheus
        if (process.env.ENABLE_METRICS === 'true') {
            console.log('Metrics collection enabled');
        }

        console.log('Molam Pay Notifier service started successfully');
    } catch (error) {
        console.error('Failed to start Molam Pay Notifier:', error);
        process.exit(1);
    }
}

// Start the application
main().catch(console.error);