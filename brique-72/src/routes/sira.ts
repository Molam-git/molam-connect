/**
 * SIRA Routes
 * Brique 72 - Account Capabilities & Limits
 */

import { Router, Request, Response } from 'express';
import {
  callSiraLimitRecommendation,
  applySiraRecommendations,
} from '../services/siraLimits';

const router = Router();

// ========================================
// SIRA Limit Recommendations
// ========================================

/**
 * POST /api/sira/recommend-limits
 * Get SIRA limit recommendations for user
 */
router.post('/recommend-limits', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // In production, gather real user data from various services
    // For now, use placeholder data
    const userData = {
      userId,
      currentKycLevel: 'P1',
      accountAge: 60,
      transactionHistory: {
        totalVolume: 25000,
        avgMonthlyVolume: 5000,
        maxTransactionAmount: 2000,
        transactionCount: 150,
        successRate: 0.98,
      },
      riskProfile: {
        fraudScore: 0.05,
        chargebackRate: 0.01,
        disputeRate: 0.005,
        suspiciousActivityCount: 0,
      },
      usagePatterns: {
        dailyActiveRate: 0.6,
        velocityScore: 0.15,
        peakHourActivity: true,
      },
    };

    const recommendation = await callSiraLimitRecommendation(userData);

    res.json({
      success: true,
      recommendation,
    });
  } catch (error: any) {
    console.error('SIRA recommendation error', { error });
    res.status(500).json({ error: error.message || 'Failed to get recommendations' });
  }
});

/**
 * POST /api/sira/apply-recommendations
 * Apply SIRA recommendations (auto or manual)
 */
router.post('/apply-recommendations', async (req: Request, res: Response) => {
  try {
    const { userId, recommendation } = req.body;

    if (!userId || !recommendation) {
      return res.status(400).json({ error: 'userId and recommendation required' });
    }

    const result = await applySiraRecommendations(userId, recommendation);

    res.json({
      success: true,
      applied: result.applied,
      skipped: result.skipped,
      message: `Applied ${result.applied} recommendations, skipped ${result.skipped}`,
    });
  } catch (error: any) {
    console.error('Apply recommendations error', { error });
    res.status(500).json({ error: error.message || 'Failed to apply recommendations' });
  }
});

export default router;
