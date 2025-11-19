/**
 * Wallet API Routes
 * Handles wallet operations: home data, QR generation/scanning, actions
 */
import { Router } from 'express';
import { z } from 'zod';
import { molamIdAuth, AuthenticatedRequest } from '../utils/molamIdAuth';
import { pool, withTransaction } from '../utils/db';
import { generateQrToken, verifyQrToken, markQrTokenUsed } from '../services/qrService';
import { publishLedgerEvent } from '../utils/ledgerPublisher';

const router = Router();

/**
 * GET /api/wallet/home
 * Returns wallet data: balance, actions, transaction history
 */
router.get('/home', molamIdAuth, async (req, res) => {
  const user = (req as AuthenticatedRequest).user;

  try {
    // Define available actions based on user's country/currency
    const actions = [
      { k: 'transfer', l: 'Transfer', e: '🔁', icon: 'Send' },
      { k: 'bank_transfer', l: 'Bank Transfer', e: '🏦', icon: 'Building' },
      { k: 'merchant_payment', l: 'Pay Merchant', e: '💳', icon: 'ShoppingBag' },
      {
        k: 'bill_payment',
        l: 'Bills & Services',
        e: '📡',
        icon: 'Receipt',
        sub: [
          { k: 'electricity', l: 'Electricity', e: '⚡', icon: 'Zap' },
          { k: 'water', l: 'Water', e: '💧', icon: 'Droplet' },
          { k: 'tv', l: 'TV', e: '📺', icon: 'Tv' },
          { k: 'internet', l: 'Internet', e: '🌐', icon: 'Wifi' },
          { k: 'mobile_credit', l: 'Mobile Credit', e: '📱', icon: 'Smartphone' }
        ]
      },
      { k: 'cashin', l: 'Deposit', e: '➕💵', icon: 'Plus' },
      { k: 'cashout', l: 'Withdraw', e: '➖💵', icon: 'Minus' }
    ];

    // Get or create wallet
    const { rows: walletRows } = await pool.query(
      `INSERT INTO molam_wallets (user_id, currency, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
       RETURNING balance, currency, status`,
      [user.id, user.currency]
    );

    const wallet = walletRows[0];

    // Get transaction history (last 50)
    const { rows: historyRows } = await pool.query(
      `SELECT id, label, amount, currency, type, category, created_at
       FROM wallet_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [user.id]
    );

    // Format response
    res.json({
      user: {
        id: user.id,
        locale: user.locale,
        currency: user.currency,
        country: user.country
      },
      balance: {
        balance: parseFloat(wallet.balance),
        currency: wallet.currency,
        status: wallet.status
      },
      actions,
      history: historyRows.map(row => ({
        id: row.id,
        label: row.label,
        amount: parseFloat(row.amount),
        currency: row.currency,
        type: row.type,
        category: row.category,
        timestamp: row.created_at
      }))
    });
  } catch (error: any) {
    console.error('Wallet home error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to fetch wallet data'
    });
  }
});

/**
 * POST /api/wallet/qr/generate
 * Generates a new QR token for receiving payments
 */
const generateQrSchema = z.object({
  purpose: z.enum(['receive', 'pay', 'transfer']).default('receive'),
  amount: z.number().positive().optional(),
  expiryMinutes: z.number().min(1).max(60).default(15)
});

router.post('/qr/generate', molamIdAuth, async (req, res) => {
  const user = (req as AuthenticatedRequest).user;

  try {
    const parsed = generateQrSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_input',
        details: parsed.error.errors
      });
    }

    const { purpose, amount, expiryMinutes } = parsed.data;

    // Generate QR token
    const { token, expiresAt } = await generateQrToken(
      user.id,
      purpose,
      user.currency,
      amount,
      expiryMinutes
    );

    // Log action
    await pool.query(
      `INSERT INTO wallet_action_logs (user_id, action_type, payload, status)
       VALUES ($1, 'qr_generate', $2, 'completed')`,
      [user.id, { purpose, amount, token }]
    );

    // Publish event
    await publishLedgerEvent({
      type: 'wallet.qr.generated',
      userId: user.id,
      data: { purpose, amount, currency: user.currency, expiresAt }
    });

    res.json({
      token,
      expires_at: expiresAt,
      qr_url: `molam://pay/${token}`,
      deep_link: `https://pay.molam.io/qr/${token}`
    });
  } catch (error: any) {
    console.error('QR generation error:', error);
    res.status(500).json({
      error: 'qr_generation_failed',
      message: error.message
    });
  }
});

/**
 * POST /api/wallet/qr/scan
 * Scans and processes a QR code payment
 */
const scanQrSchema = z.object({
  token: z.string().min(1),
  amount: z.number().positive().optional()
});

router.post('/qr/scan', molamIdAuth, async (req, res) => {
  const user = (req as AuthenticatedRequest).user;

  try {
    const parsed = scanQrSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_input',
        details: parsed.error.errors
      });
    }

    const { token, amount } = parsed.data;

    // Use transaction to ensure atomicity
    await withTransaction(async (client) => {
      // Verify token
      const qrToken = await verifyQrToken(token);

      // Check if payer is not the receiver
      if (qrToken.userId === user.id) {
        throw new Error('cannot_pay_yourself');
      }

      // Determine payment amount
      const paymentAmount = amount || qrToken.amount;
      if (!paymentAmount) {
        throw new Error('amount_required');
      }

      // Mark token as used (atomic)
      const marked = await markQrTokenUsed(token, user.id);
      if (!marked) {
        throw new Error('token_already_used_or_expired');
      }

      // Create wallet history entry
      await client.query(
        `INSERT INTO wallet_history (user_id, label, amount, currency, type, category, metadata)
         VALUES ($1, $2, $3, $4, 'debit', 'qr_payment', $5)`,
        [
          user.id,
          `QR Payment to ${qrToken.userId}`,
          -paymentAmount,
          qrToken.currency,
          { qr_token: token, receiver_id: qrToken.userId }
        ]
      );

      // Log action
      await client.query(
        `INSERT INTO wallet_action_logs (user_id, action_type, payload, status)
         VALUES ($1, 'qr_scan', $2, 'completed')`,
        [user.id, { token, amount: paymentAmount, receiver: qrToken.userId }]
      );

      // Publish ledger event
      await publishLedgerEvent({
        type: 'payment_intent_from_qr',
        userId: user.id,
        data: {
          qr_token: token,
          payer_id: user.id,
          receiver_id: qrToken.userId,
          amount: paymentAmount,
          currency: qrToken.currency,
          origin: 'qr_scan'
        }
      });
    });

    res.json({
      ok: true,
      message: 'Payment initiated successfully'
    });
  } catch (error: any) {
    console.error('QR scan error:', error);

    const statusCode = error.message.includes('token_') ? 409 : 500;

    res.status(statusCode).json({
      error: 'qr_scan_failed',
      message: error.message
    });
  }
});

/**
 * POST /api/wallet/action
 * Logs a wallet action (idempotent via idempotency-key header)
 */
const actionSchema = z.object({
  action: z.string().min(1),
  payload: z.any().optional()
});

router.post('/action', molamIdAuth, async (req, res) => {
  const user = (req as AuthenticatedRequest).user;

  try {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_input',
        details: parsed.error.errors
      });
    }

    const { action, payload } = parsed.data;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // Check for existing action with same idempotency key
    if (idempotencyKey) {
      const { rows: existing } = await pool.query(
        `SELECT * FROM wallet_action_logs WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey]
      );

      if (existing.length > 0) {
        return res.json({
          ok: true,
          log: existing[0],
          idempotent: true
        });
      }
    }

    // Insert new action log
    const { rows } = await pool.query(
      `INSERT INTO wallet_action_logs (user_id, action_type, payload, status, idempotency_key)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING *`,
      [user.id, action, payload || {}, idempotencyKey]
    );

    const log = rows[0];

    // Publish event
    await publishLedgerEvent({
      type: 'wallet_action_requested',
      userId: user.id,
      data: {
        log_id: log.id,
        action,
        payload
      }
    });

    res.json({
      ok: true,
      log: {
        id: log.id,
        action: log.action_type,
        status: log.status,
        created_at: log.created_at
      }
    });
  } catch (error: any) {
    console.error('Action log error:', error);
    res.status(500).json({
      error: 'action_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/wallet/balance
 * Quick endpoint to get current balance
 */
router.get('/balance', molamIdAuth, async (req, res) => {
  const user = (req as AuthenticatedRequest).user;

  try {
    const { rows } = await pool.query(
      `SELECT balance, currency, status FROM molam_wallets WHERE user_id = $1`,
      [user.id]
    );

    if (rows.length === 0) {
      return res.json({
        balance: 0,
        currency: user.currency,
        status: 'not_created'
      });
    }

    res.json({
      balance: parseFloat(rows[0].balance),
      currency: rows[0].currency,
      status: rows[0].status
    });
  } catch (error: any) {
    console.error('Balance fetch error:', error);
    res.status(500).json({
      error: 'fetch_failed',
      message: error.message
    });
  }
});

export default router;
