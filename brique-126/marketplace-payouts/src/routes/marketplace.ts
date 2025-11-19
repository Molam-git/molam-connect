// ============================================================================
// Marketplace Payouts API Routes
// ============================================================================

import { Router } from "express";
import { createMarketplacePayoutBatch } from "../services/batch-create";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const marketplaceRouter = Router();

/**
 * POST /api/marketplace/:id/batches - Create payout batch
 */
marketplaceRouter.post("/:id/batches", async (req: any, res) => {
  const marketplaceId = req.params.id;
  const { scheduleType, externalRequestId, currency } = req.body;

  try {
    const batch = await createMarketplacePayoutBatch({
      marketplaceId,
      initiatedBy: req.user?.id || "system",
      currency: currency || "USD",
      scheduleType: scheduleType || "immediate",
      externalRequestId
    });

    res.json(batch);
  } catch (e: any) {
    if (e.message === "no_due_payouts") {
      return res.status(400).json({ error: "no_due_payouts" });
    }
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/marketplace/:id/batches - List batches
 */
marketplaceRouter.get("/:id/batches", async (req: any, res) => {
  const marketplaceId = req.params.id;
  const limit = Number(req.query.limit) || 50;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM marketplace_payout_batches
       WHERE marketplace_id=$1
       ORDER BY created_at DESC
       LIMIT $2`,
      [marketplaceId, limit]
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/marketplace/:id/batches/:batchId - Get batch details
 */
marketplaceRouter.get("/:id/batches/:batchId", async (req: any, res) => {
  const { batchId } = req.params;

  try {
    const { rows: [batch] } = await pool.query(
      `SELECT * FROM marketplace_payout_batches WHERE id=$1`,
      [batchId]
    );

    if (!batch) {
      return res.status(404).json({ error: "batch_not_found" });
    }

    const { rows: lines } = await pool.query(
      `SELECT * FROM marketplace_payout_lines WHERE batch_id=$1`,
      [batchId]
    );

    res.json({ ...batch, lines });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/marketplace/:id/sellers/:sellerId/balance - Get seller balance
 */
marketplaceRouter.get("/:id/sellers/:sellerId/balance", async (req: any, res) => {
  const { id: marketplaceId, sellerId } = req.params;

  try {
    const { rows: [balance] } = await pool.query(
      `SELECT * FROM marketplace_seller_balances
       WHERE marketplace_id=$1 AND seller_id=$2`,
      [marketplaceId, sellerId]
    );

    if (!balance) {
      return res.json({ available_to_payout: 0, held_amount: 0 });
    }

    res.json(balance);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
