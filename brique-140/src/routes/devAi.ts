/**
 * SOUS-BRIQUE 140bis — AI Dev Assistant Routes
 */

import { Router } from 'express';
import { siraAssist, submitFeedback, siraDebug } from '../ai/siraDevAssistant';
import { requireRole, authzMiddleware } from '../utils/authz';

export const devAiRouter = Router();

// Auth middleware
devAiRouter.use(authzMiddleware);

/**
 * POST /api/dev/ai/assist
 * Generate code snippet with Sira
 */
devAiRouter.post(
  '/assist',
  requireRole(['merchant_dev', 'dev_admin']),
  async (req: any, res) => {
    const { query, lang = 'node' } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query_required' });
    }

    try {
      const snippet = await siraAssist({
        developerId: req.user.id,
        query,
        lang,
      });

      res.json({ snippet });
    } catch (error) {
      console.error('[DevAI] Error:', error);
      res.status(500).json({ error: 'failed_to_generate' });
    }
  }
);

/**
 * POST /api/dev/ai/debug
 * Debug API error with Sira
 */
devAiRouter.post(
  '/debug',
  requireRole(['merchant_dev', 'dev_admin']),
  async (req: any, res) => {
    const { endpoint, status_code, error_message } = req.body;

    try {
      const solution = await siraDebug(
        req.user.id,
        endpoint,
        status_code,
        error_message
      );

      res.json({ solution });
    } catch (error) {
      console.error('[DevAI] Debug error:', error);
      res.status(500).json({ error: 'failed_to_debug' });
    }
  }
);

/**
 * POST /api/dev/ai/feedback
 * Submit feedback on Sira suggestion
 */
devAiRouter.post(
  '/feedback',
  requireRole(['merchant_dev', 'dev_admin']),
  async (req: any, res) => {
    const { feedback_id, rating, feedback_text } = req.body;

    if (!feedback_id || !rating) {
      return res.status(400).json({ error: 'invalid_feedback' });
    }

    try {
      await submitFeedback(feedback_id, rating, feedback_text);
      res.json({ ok: true });
    } catch (error) {
      console.error('[DevAI] Feedback error:', error);
      res.status(500).json({ error: 'failed_to_submit_feedback' });
    }
  }
);

export default devAiRouter;
