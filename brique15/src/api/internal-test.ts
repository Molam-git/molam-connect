import express from 'express';
import { publishNotification } from '../services/producer';
import { authServiceMTLS } from './security-mw';

export const router = express.Router();

router.post('/internal/notify/test', authServiceMTLS, async (req, res) => {
    await publishNotification({
        eventKey: 'p2p.completed',
        userId: req.body.userId,
        locale: req.body.locale ?? 'en',
        currency: req.body.currency ?? 'USD',
        renderVars: {
            receiverName: req.body.receiverName ?? 'you',
            senderName: req.body.senderName ?? 'John',
            amount: req.body.amount ?? 10,
            txRef: req.body.txRef ?? 'TST-123'
        },
        siraPriority: 'normal'
    });
    res.json({ ok: true });
});

router.get('/healthz', (_req, res) => res.json({ ok: true }));