/**
 * BRIQUE 143bis — Adaptive UI API Routes
 * Endpoints for SIRA adaptive UI management
 */

import { Router } from 'express';
import { requireAuth } from '../utils/authz';
import {
  getAdaptiveProfile,
  updateAdaptiveProfile,
  applySiraRecommendation,
  detectAndAdaptContext,
  getAdaptationHistory,
} from '../services/sira/adaptiveProfile';
import {
  recordInteractionEvent,
  calculateInteractionMetrics,
  generateRecommendations,
  getPendingRecommendations,
  dismissRecommendation,
  updateProfileMetrics,
} from '../services/sira/adaptiveAnalytics';

const router = Router();

/**
 * Get adaptive profile for current user
 * GET /api/sira/adaptive
 */
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const profile = await getAdaptiveProfile(userId);
    res.json(profile);
  } catch (error: any) {
    console.error('[Adaptive API] Get profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get adaptive profile by user ID (for cross-module use)
 * GET /api/sira/adaptive/:userId
 */
router.get('/:userId', async (req: any, res) => {
  try {
    const { userId } = req.params;
    const profile = await getAdaptiveProfile(userId);
    res.json(profile);
  } catch (error: any) {
    console.error('[Adaptive API] Get profile by ID error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update adaptive profile manually
 * PATCH /api/sira/adaptive
 */
router.patch('/', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;

    // Validate font_scale range
    if (updates.font_scale !== undefined) {
      if (updates.font_scale < 0.75 || updates.font_scale > 2.0) {
        return res.status(400).json({ error: 'font_scale must be between 0.75 and 2.0' });
      }
    }

    const updated = await updateAdaptiveProfile(userId, updates);
    res.json(updated);
  } catch (error: any) {
    console.error('[Adaptive API] Update profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Record UI interaction event
 * POST /api/sira/adaptive/events
 */
router.post('/events', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const event = { ...req.body, user_id: userId };

    await recordInteractionEvent(event);
    res.status(201).json({ ok: true });
  } catch (error: any) {
    console.error('[Adaptive API] Record event error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get interaction metrics
 * GET /api/sira/adaptive/metrics
 */
router.get('/metrics/user', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const timeframe = (req.query.timeframe as 'day' | 'week' | 'month') || 'week';

    const metrics = await calculateInteractionMetrics(userId, timeframe);
    res.json(metrics);
  } catch (error: any) {
    console.error('[Adaptive API] Get metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get pending SIRA recommendations
 * GET /api/sira/adaptive/recommendations
 */
router.get('/recommendations', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const recommendations = await getPendingRecommendations(userId);
    res.json(recommendations);
  } catch (error: any) {
    console.error('[Adaptive API] Get recommendations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Apply SIRA recommendation
 * POST /api/sira/adaptive/recommendations/:id/apply
 */
router.post('/recommendations/:id/apply', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const updated = await applySiraRecommendation(userId, id);
    res.json(updated);
  } catch (error: any) {
    console.error('[Adaptive API] Apply recommendation error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Dismiss SIRA recommendation
 * POST /api/sira/adaptive/recommendations/:id/dismiss
 */
router.post('/recommendations/:id/dismiss', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await dismissRecommendation(id, userId);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[Adaptive API] Dismiss recommendation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Trigger SIRA analysis and generate recommendations
 * POST /api/sira/adaptive/analyze
 */
router.post('/analyze', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;

    // Update profile metrics
    await updateProfileMetrics(userId);

    // Generate new recommendations
    await generateRecommendations(userId);

    // Get updated recommendations
    const recommendations = await getPendingRecommendations(userId);

    res.json({
      ok: true,
      recommendations_count: recommendations.length,
      recommendations,
    });
  } catch (error: any) {
    console.error('[Adaptive API] Analyze error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Detect context and auto-adapt
 * POST /api/sira/adaptive/context
 */
router.post('/context', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const contextData = req.body;

    const updated = await detectAndAdaptContext(userId, contextData);

    if (updated) {
      res.json({ ok: true, profile: updated });
    } else {
      res.json({ ok: true, message: 'No context adaptation needed' });
    }
  } catch (error: any) {
    console.error('[Adaptive API] Context detection error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get adaptation history
 * GET /api/sira/adaptive/history
 */
router.get('/history', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const history = await getAdaptationHistory(userId, limit);
    res.json(history);
  } catch (error: any) {
    console.error('[Adaptive API] Get history error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
