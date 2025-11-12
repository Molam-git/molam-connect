import { Router, Request, Response } from 'express';
import pool from '../db';
import {
  awardPoints,
  redeemPoints,
  calculatePoints,
  calculateCashback,
  generateCampaignRecommendations,
  updateChurnRiskScores
} from '../services/loyaltyEngine';

const router = Router();

// Create loyalty program
router.post('/programs', async (req: Request, res: Response) => {
  try {
    const { merchantId, name, description, currency, earnRate, enableTiers, enableCashback, aiEnabled } = req.body;

    if (!merchantId || !name) {
      return res.status(400).json({ error: 'Missing required fields: merchantId, name' });
    }

    const result = await pool.query(
      `INSERT INTO loyalty_programs
       (merchant_id, name, description, currency, earn_rate, enable_tiers, enable_cashback, ai_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [merchantId, name, description, currency || 'points', earnRate || 0.02, enableTiers !== false, enableCashback || false, aiEnabled !== false]
    );

    res.status(201).json({ success: true, program: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get programs for merchant
router.get('/programs', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.query;
    const result = await pool.query(
      'SELECT * FROM loyalty_programs WHERE merchant_id = $1 ORDER BY created_at DESC',
      [merchantId]
    );
    res.json({ success: true, programs: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get user balance
router.get('/balances/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { programId } = req.query;

    let query = 'SELECT lb.*, lp.name as program_name, lp.currency FROM loyalty_balances lb JOIN loyalty_programs lp ON lb.program_id = lp.id WHERE lb.user_id = $1';
    const params: any[] = [userId];

    if (programId) {
      query += ' AND lb.program_id = $2';
      params.push(programId);
    }

    const result = await pool.query(query, params);
    res.json({ success: true, balances: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Award points (transaction webhook)
router.post('/award', async (req: Request, res: Response) => {
  try {
    const { programId, userId, transaction } = req.body;

    if (!programId || !userId || !transaction) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await awardPoints(programId, userId, transaction);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Redeem points
router.post('/redeem', async (req: Request, res: Response) => {
  try {
    const { balanceId, points, rewardId } = req.body;

    if (!balanceId || !points) {
      return res.status(400).json({ error: 'Missing required fields: balanceId, points' });
    }

    const result = await redeemPoints(balanceId, points, rewardId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get transactions
router.get('/transactions/:balanceId', async (req: Request, res: Response) => {
  try {
    const { balanceId } = req.params;
    const { limit = 50 } = req.query;

    const result = await pool.query(
      'SELECT * FROM loyalty_transactions WHERE balance_id = $1 ORDER BY created_at DESC LIMIT $2',
      [balanceId, limit]
    );

    res.json({ success: true, transactions: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create reward
router.post('/rewards', async (req: Request, res: Response) => {
  try {
    const { programId, name, description, rewardType, pointsCost, monetaryValue, minTier } = req.body;

    const result = await pool.query(
      `INSERT INTO loyalty_rewards
       (program_id, name, description, reward_type, points_cost, monetary_value, min_tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [programId, name, description, rewardType, pointsCost, monetaryValue, minTier]
    );

    res.status(201).json({ success: true, reward: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List rewards
router.get('/rewards', async (req: Request, res: Response) => {
  try {
    const { programId } = req.query;
    const result = await pool.query(
      'SELECT * FROM loyalty_rewards WHERE program_id = $1 AND status = $2 ORDER BY points_cost ASC',
      [programId, 'active']
    );
    res.json({ success: true, rewards: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// AI: Generate campaign recommendations
router.post('/campaigns/recommend', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.body;
    const recommendations = await generateCampaignRecommendations(merchantId);
    res.json({ success: true, recommendations });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update churn risk scores
router.post('/ai/update-churn-risk', async (req: Request, res: Response) => {
  try {
    const { programId } = req.body;
    await updateChurnRiskScores(programId);
    res.json({ success: true, message: 'Churn risk scores updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
