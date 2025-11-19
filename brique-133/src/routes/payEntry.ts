// ============================================================================
// Pay Entry API Routes
// ============================================================================

import { Router } from "express";
import {
  getUserPayEntry,
  updatePayEntry,
  trackModuleUsage,
  enableModule,
  requestModuleActivation,
  getUserModuleStats,
  applySiraRecommendation,
} from "../services/payEntryService";

export const payEntryRouter = Router();

/**
 * GET /api/pay/entry - Get user pay entry configuration
 */
payEntryRouter.get("/entry", async (req: any, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const entry = await getUserPayEntry(userId);
    res.json(entry);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PUT /api/pay/entry - Update user preferences
 */
payEntryRouter.put("/entry", async (req: any, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const updated = await updatePayEntry(userId, req.body);
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/pay/track - Track module usage
 */
payEntryRouter.post("/track", async (req: any, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    await trackModuleUsage({
      user_id: userId,
      ...req.body,
    });
    res.json({ tracked: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/pay/modules/:module/enable - Enable a module
 */
payEntryRouter.post("/modules/:module/enable", async (req: any, res) => {
  const userId = req.user?.id;
  const { module } = req.params;

  if (!userId) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const result = await enableModule(userId, module);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/pay/modules/:module/request - Request module activation (gated)
 */
payEntryRouter.post("/modules/:module/request", async (req: any, res) => {
  const userId = req.user?.id;
  const { module } = req.params;
  const { reason } = req.body;

  if (!userId) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const request = await requestModuleActivation(userId, module, reason);
    res.json(request);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/pay/stats - Get module usage statistics
 */
payEntryRouter.get("/stats", async (req: any, res) => {
  const userId = req.user?.id;
  const { days = 30 } = req.query;

  if (!userId) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const stats = await getUserModuleStats(userId, Number(days));
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/pay/sira/recommend - Apply SIRA recommendation
 */
payEntryRouter.post("/sira/recommend", async (req: any, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const recommendation = await applySiraRecommendation(userId);
    res.json(recommendation);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
