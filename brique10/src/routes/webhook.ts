// src/routes/webhook.ts
import { Router } from 'express';
import { webhookHandler } from '../controllers/webhookController';
import { webhookAuth } from '../middleware/webhookAuth';

const router = Router();

router.post('/webhook', webhookAuth, webhookHandler);

export default router;