import express from 'express';
import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const metricsApp = express();
metricsApp.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});