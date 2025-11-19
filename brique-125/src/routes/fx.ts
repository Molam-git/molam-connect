// ============================================================================
// Brique 125 — FX Routes
// ============================================================================

import { Router } from "express";
import { getBestQuote, executeFX } from "../services/fx-engine";

export const fxRouter = Router();

// Get quote
fxRouter.post("/quote", async (req: any, res) => {
  const { from_currency, to_currency, amount } = req.body;
  try {
    const quote = await getBestQuote(from_currency, to_currency, amount);
    res.json(quote);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Execute FX
fxRouter.post("/execute", async (req: any, res) => {
  const { quote_id, amount } = req.body;
  try {
    const exec = await executeFX(quote_id, amount, req.user?.id || 'system');
    res.json(exec);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
