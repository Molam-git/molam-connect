/**
 * Event Ingestion API Routes
 * Receives transaction events from external systems
 */
import { Router } from 'express';
import { z } from 'zod';
import { apiKeyAuth, AuthenticatedRequest } from '../utils/merchantAuth';
import { ingestTransactionEvent, ingestTransactionEventsBatch } from '../services/eventIngestion';

const router = Router();

/**
 * POST /api/events/transaction
 * Ingests a single transaction event
 */
const TransactionEventSchema = z.object({
  transaction_id: z.string().min(1),
  customer_id: z.string().uuid().optional(),
  event_type: z.enum(['payment_created', 'payment_succeeded', 'payment_failed', 'payment_refunded']),
  amount: z.number().positive(),
  currency: z.string().length(3),
  fee: z.number().nonnegative().default(0),
  payment_method: z.enum(['mobile_money', 'card', 'bank_transfer', 'qr_payment']).optional(),
  product_id: z.string().optional(),
  product_name: z.string().optional(),
  metadata: z.any().optional()
});

router.post('/transaction', apiKeyAuth, async (req, res) => {
  const merchant = (req as AuthenticatedRequest).merchant;

  try {
    const parsed = TransactionEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_event',
        details: parsed.error.errors
      });
    }

    const event = {
      ...parsed.data,
      merchant_id: merchant.merchantId
    };

    const result = await ingestTransactionEvent(event);

    res.status(result.queued ? 201 : 200).json({
      ok: true,
      event_id: result.id,
      queued: result.queued,
      message: result.queued ? 'Event queued for processing' : 'Event already exists'
    });
  } catch (error: any) {
    console.error('Event ingestion error:', error);
    res.status(500).json({
      error: 'ingestion_failed',
      message: error.message
    });
  }
});

/**
 * POST /api/events/transaction/batch
 * Ingests multiple transaction events in batch
 */
router.post('/transaction/batch', apiKeyAuth, async (req, res) => {
  const merchant = (req as AuthenticatedRequest).merchant;

  try {
    if (!Array.isArray(req.body) || req.body.length === 0) {
      return res.status(400).json({
        error: 'invalid_batch',
        message: 'Expected array of events'
      });
    }

    if (req.body.length > 1000) {
      return res.status(400).json({
        error: 'batch_too_large',
        message: 'Maximum 1000 events per batch'
      });
    }

    // Validate all events
    const events = [];
    const errors = [];

    for (let i = 0; i < req.body.length; i++) {
      const parsed = TransactionEventSchema.safeParse(req.body[i]);
      if (parsed.success) {
        events.push({
          ...parsed.data,
          merchant_id: merchant.merchantId
        });
      } else {
        errors.push({
          index: i,
          errors: parsed.error.errors
        });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'validation_failed',
        message: `${errors.length} events failed validation`,
        details: errors.slice(0, 10) // Return first 10 errors only
      });
    }

    // Ingest all events
    const result = await ingestTransactionEventsBatch(events);

    res.status(201).json({
      ok: true,
      total: events.length,
      ingested: result.ingested,
      duplicates: result.duplicates
    });
  } catch (error: any) {
    console.error('Batch ingestion error:', error);
    res.status(500).json({
      error: 'ingestion_failed',
      message: error.message
    });
  }
});

/**
 * POST /api/events/webhook
 * Generic webhook endpoint for payment provider callbacks
 */
router.post('/webhook', async (req, res) => {
  // TODO: Implement webhook signature verification
  // TODO: Map provider-specific format to internal event format

  try {
    console.log('Webhook received:', req.body);

    // For now, just acknowledge receipt
    res.json({
      ok: true,
      message: 'Webhook received'
    });
  } catch (error: any) {
    console.error('Webhook error:', error);
    res.status(500).json({
      error: 'webhook_failed',
      message: error.message
    });
  }
});

export default router;
