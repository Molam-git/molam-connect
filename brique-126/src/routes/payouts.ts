// ============================================================================
// Brique 126 — Payouts API Routes
// ============================================================================

import { Router } from "express";
import { requestPayout, getPayout, listPayouts } from "../services/payout-service";

export const payoutsRouter = Router();

/**
 * POST /api/payouts - Request a new payout
 */
payoutsRouter.post("/", async (req: any, res) => {
  const { amount, currency, method, destinationId, metadata } = req.body;

  if (!amount || !currency || !method || !destinationId) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  try {
    const payout = await requestPayout({
      merchantId: req.user?.merchantId || req.user?.id,
      amount: Number(amount),
      currency,
      method,
      destinationId,
      metadata
    });

    res.json(payout);
  } catch (e: any) {
    if (e.message === "insufficient_funds") {
      return res.status(400).json({ error: "insufficient_funds" });
    }
    if (e.message === "destination_not_found") {
      return res.status(404).json({ error: "destination_not_found" });
    }
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/payouts - List merchant payouts
 */
payoutsRouter.get("/", async (req: any, res) => {
  const merchantId = req.user?.merchantId || req.user?.id;
  const limit = Number(req.query.limit) || 100;

  try {
    const payouts = await listPayouts(merchantId, limit);
    res.json(payouts);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/payouts/:id - Get payout details
 */
payoutsRouter.get("/:id", async (req: any, res) => {
  try {
    const payout = await getPayout(req.params.id);
    if (!payout) {
      return res.status(404).json({ error: "payout_not_found" });
    }

    // Check ownership
    const merchantId = req.user?.merchantId || req.user?.id;
    if (payout.merchant_id !== merchantId && !req.user?.roles?.includes("finance_ops")) {
      return res.status(403).json({ error: "forbidden" });
    }

    res.json(payout);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
