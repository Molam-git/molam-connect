import { Router, Response } from 'express';
import { authzMiddleware, requireRole, AuthRequest } from '../utils/authz';
import { pool } from '../utils/db';
import * as disputeScorer from '../services/disputeScorer';
import * as analyticsService from '../services/analyticsService';
import * as selfUpdater from '../services/selfUpdater';

const router = Router();

/**
 * GET /api/sira/widgets - Get dynamic widget recommendations for merchant
 */
router.get('/widgets', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;

    // Get merchant profile
    const { rows: profiles } = await pool.query(
      'SELECT * FROM merchant_dispute_profiles WHERE merchant_id = $1',
      [merchantId]
    );

    const profile = profiles[0];
    if (!profile) {
      res.json({ widgets: [] });
      return;
    }

    const widgets: any[] = [];

    // Recommendation: Improve win rate
    if (profile.win_rate < profile.benchmark_win_rate - 5) {
      widgets.push({
        type: 'recommendation',
        priority: 'high',
        title: 'Win Rate Below Sector Average',
        text: `Your win rate (${profile.win_rate.toFixed(1)}%) is below the ${profile.sector} sector average (${profile.benchmark_win_rate.toFixed(1)}%). Consider improving evidence quality and submission timing.`,
        action: { label: 'View Evidence Tips', link: '/evidence-builder' },
      });
    }

    // Recommendation: Reduce resolution time
    if (profile.avg_resolution_days > profile.benchmark_resolution_days + 10) {
      widgets.push({
        type: 'recommendation',
        priority: 'medium',
        title: 'Resolution Time Above Average',
        text: `Your disputes take ${profile.avg_resolution_days.toFixed(0)} days on average, compared to sector average of ${profile.benchmark_resolution_days.toFixed(0)} days. Faster evidence submission can improve outcomes.`,
        action: { label: 'View Timeline', link: '/disputes' },
      });
    }

    // Alert: High SIRA accuracy
    if (profile.sira_accuracy > 0.75) {
      widgets.push({
        type: 'insight',
        priority: 'low',
        title: 'Strong SIRA Performance',
        text: `SIRA predictions are ${(profile.sira_accuracy * 100).toFixed(0)}% accurate for your disputes. Consider enabling auto-submit for high-confidence cases.`,
        action: { label: 'Configure Auto-Submit', link: '/settings/sira' },
      });
    }

    // Get active recommendations from ML
    const { rows: recommendations } = await pool.query(
      `SELECT * FROM sira_recommendations
       WHERE merchant_id = $1 AND dismissed = false
       ORDER BY priority DESC, created_at DESC
       LIMIT 5`,
      [merchantId]
    );

    recommendations.forEach((rec) => {
      widgets.push({
        type: 'ml_recommendation',
        priority: rec.priority,
        title: rec.recommendation_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        text: rec.reason,
        action: { label: 'View Details', link: `/recommendations/${rec.id}` },
      });
    });

    res.json({ widgets });
  } catch (error: any) {
    console.error('[SiraRoutes] Error getting widgets:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sira/score-dispute - Score a dispute with ML
 */
router.post('/score-dispute', authzMiddleware, requireRole('pay_admin', 'finance_ops', 'merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const dispute = req.body;

    const score = await disputeScorer.scoreDispute(dispute);
    res.json(score);
  } catch (error: any) {
    console.error('[SiraRoutes] Error scoring dispute:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sira/profiles/:merchantId - Get merchant dispute profile
 */
router.get('/profiles/:merchantId', authzMiddleware, requireRole('pay_admin', 'merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { merchantId } = req.params;

    // Check authorization: merchant can only see own profile
    if (req.user!.roles.includes('merchant_admin') && req.user!.merchantId !== merchantId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    const { rows } = await pool.query(
      'SELECT * FROM merchant_dispute_profiles WHERE merchant_id = $1',
      [merchantId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json(rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sira/profiles/:merchantId/rebuild - Force rebuild merchant profile
 */
router.post('/profiles/:merchantId/rebuild', authzMiddleware, requireRole('pay_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { merchantId } = req.params;

    await analyticsService.buildMerchantProfile(merchantId);
    res.json({ ok: true, message: 'Profile rebuild queued' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sira/benchmarks/:sector/:country - Get sector benchmarks
 */
router.get('/benchmarks/:sector/:country', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { sector, country } = req.params;
    const { currency, reason_code } = req.query;

    let query = 'SELECT * FROM sector_benchmarks WHERE sector = $1 AND country = $2';
    const params: any[] = [sector, country];

    if (currency) {
      query += ' AND currency = $3';
      params.push(currency);
    }
    if (reason_code) {
      query += ` AND reason_code = $${params.length + 1}`;
      params.push(reason_code);
    }

    query += ' ORDER BY created_at DESC LIMIT 1';

    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      res.status(404).json({ error: 'Benchmark not found' });
      return;
    }

    res.json(rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sira/benchmarks/rebuild - Force rebuild all sector benchmarks
 */
router.post('/benchmarks/rebuild', authzMiddleware, requireRole('pay_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { sector, country, currency } = req.body;

    await analyticsService.buildSectorBenchmarks(sector, country, currency);
    res.json({ ok: true, message: 'Benchmark rebuild queued' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sira/models - List ML models
 */
router.get('/models', authzMiddleware, requireRole('pay_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM sira_models ORDER BY created_at DESC LIMIT 20`
    );

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sira/models/:id/activate - Activate a specific model
 */
router.post('/models/:id/activate', authzMiddleware, requireRole('pay_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Deactivate all models of same type
    const { rows: modelRows } = await pool.query('SELECT * FROM sira_models WHERE id = $1', [id]);
    if (modelRows.length === 0) {
      res.status(404).json({ error: 'Model not found' });
      return;
    }

    const model = modelRows[0];

    await pool.query(
      `UPDATE sira_models SET status = 'archived' WHERE model_type = $1 AND status = 'active'`,
      [model.model_type]
    );

    // Activate target model
    await pool.query(`UPDATE sira_models SET status = 'active' WHERE id = $1`, [id]);

    res.json({ ok: true, message: `Model ${model.version} activated` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sira/predictions - List predictions with outcomes
 */
router.get('/predictions', authzMiddleware, requireRole('pay_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { limit = '100', offset = '0', has_outcome } = req.query;

    let query = 'SELECT * FROM sira_predictions';
    const params: any[] = [];

    if (has_outcome === 'true') {
      query += ' WHERE actual_outcome IS NOT NULL';
    } else if (has_outcome === 'false') {
      query += ' WHERE actual_outcome IS NULL';
    }

    query += ' ORDER BY created_at DESC LIMIT $1 OFFSET $2';
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sira/patches - Propose a self-improvement patch
 */
router.post('/patches', authzMiddleware, requireRole('pay_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { patch_name, model_version, patch_type, code_diff, description } = req.body;

    if (!['code', 'hyperparameters', 'training_data', 'feature_engineering'].includes(patch_type)) {
      res.status(400).json({ error: 'Invalid patch_type' });
      return;
    }

    const patchId = await selfUpdater.proposePatch(patch_name, model_version, patch_type, code_diff, description);
    res.json({ ok: true, patch_id: patchId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sira/patches/:id/test - Test patch in sandbox
 */
router.post('/patches/:id/test', authzMiddleware, requireRole('pay_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await selfUpdater.testPatch(id);
    res.json(result);
  } catch (error: any) {
    console.error('[SiraRoutes] Patch test failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sira/patches/:id/deploy - Deploy approved patch
 */
router.post('/patches/:id/deploy', authzMiddleware, requireRole('pay_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const approvedBy = req.user!.id;

    await selfUpdater.deployPatch(id, approvedBy);
    res.json({ ok: true, message: 'Patch deployed' });
  } catch (error: any) {
    console.error('[SiraRoutes] Patch deployment failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sira/patches - List patches
 */
router.get('/patches', authzMiddleware, requireRole('pay_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query;

    let query = 'SELECT * FROM sira_patches';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT 50';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sira/recommendations/:merchantId - Get recommendations for merchant
 */
router.get('/recommendations/:merchantId', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { merchantId } = req.params;

    // Check authorization
    if (req.user!.roles.includes('merchant_admin') && req.user!.merchantId !== merchantId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT * FROM sira_recommendations
       WHERE merchant_id = $1 AND dismissed = false
       ORDER BY priority DESC, created_at DESC`,
      [merchantId]
    );

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sira/recommendations/:id/dismiss - Dismiss a recommendation
 */
router.post('/recommendations/:id/dismiss', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await pool.query(
      `UPDATE sira_recommendations SET dismissed = true WHERE id = $1`,
      [id]
    );

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sira/outcome - Record dispute outcome for feedback loop
 */
router.post('/outcome', authzMiddleware, requireRole('pay_admin', 'finance_ops'), async (req: AuthRequest, res: Response) => {
  try {
    const { dispute_id, outcome } = req.body;

    if (!['won', 'lost', 'settled'].includes(outcome)) {
      res.status(400).json({ error: 'Invalid outcome' });
      return;
    }

    await disputeScorer.recordOutcome(dispute_id, outcome);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
