// ============================================================================
// FX Aggregator REST API Routes
// ============================================================================

import { Router } from "express";
import { getQuote, convert } from "../services/fx-service";

export const fxAggregatorRouter = Router();

// GET /api/fx-agg/quote?base=USD&quote=XOF
fxAggregatorRouter.get("/quote", async (req: any, res) => {
  const { base, quote } = req.query;
  if (!base || !quote) {
    return res.status(400).json({ error: "base and quote required" });
  }
  try {
    const result = await getQuote(base.toUpperCase(), quote.toUpperCase());
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/fx-agg/convert { base, quote, amount }
fxAggregatorRouter.post("/convert", async (req: any, res) => {
  const { base, quote, amount } = req.body;
  if (!base || !quote || !amount) {
    return res.status(400).json({ error: "base, quote, and amount required" });
  }
  try {
    const result = await convert(base.toUpperCase(), quote.toUpperCase(), Number(amount));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
