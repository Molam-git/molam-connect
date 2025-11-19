/**
 * SOUS-BRIQUE 140ter — Auto-Debug Routes
 * API interne pour analyse d'erreurs
 */

import { Router } from 'express';
import {
  analyzeError,
  markErrorResolved,
  getUnresolvedErrors,
  getErrorStats,
} from '../sira/autoDebugWorker';
import { requireRole, authzMiddleware } from '../utils/authz';

export const debugRouter = Router();

// Auth middleware
debugRouter.use(authzMiddleware);

/**
 * POST /api/debug/report
 * Analyser une erreur et proposer un fix
 */
debugRouter.post(
  '/report',
  requireRole(['merchant_dev', 'dev_admin']),
  async (req: any, res) => {
    const { lang, error_message, context } = req.body;

    if (!lang || !error_message) {
      return res.status(400).json({ error: 'lang and error_message required' });
    }

    if (!['node', 'php', 'python'].includes(lang)) {
      return res.status(400).json({ error: 'invalid language' });
    }

    try {
      const fix = await analyzeError(req.user.id, lang, error_message, context || {});
      res.json({ fix });
    } catch (error) {
      console.error('[Debug] Error analyzing:', error);
      res.status(500).json({ error: 'failed_to_analyze' });
    }
  }
);

/**
 * POST /api/debug/:logId/resolve
 * Marquer une erreur comme résolue
 */
debugRouter.post(
  '/:logId/resolve',
  requireRole(['merchant_dev', 'dev_admin']),
  async (req: any, res) => {
    const { logId } = req.params;

    try {
      await markErrorResolved(logId);
      res.json({ ok: true });
    } catch (error) {
      console.error('[Debug] Error resolving:', error);
      res.status(500).json({ error: 'failed_to_resolve' });
    }
  }
);

/**
 * GET /api/debug/unresolved
 * Récupérer les erreurs non résolues
 */
debugRouter.get(
  '/unresolved',
  requireRole(['merchant_dev', 'dev_admin']),
  async (req: any, res) => {
    try {
      const errors = await getUnresolvedErrors(req.user.id);
      res.json({ errors });
    } catch (error) {
      console.error('[Debug] Error fetching unresolved:', error);
      res.status(500).json({ error: 'failed_to_fetch' });
    }
  }
);

/**
 * GET /api/debug/stats
 * Stats d'erreurs par catégorie
 */
debugRouter.get(
  '/stats',
  requireRole(['merchant_dev', 'dev_admin']),
  async (req: any, res) => {
    try {
      const stats = await getErrorStats(req.user.id);
      res.json({ stats });
    } catch (error) {
      console.error('[Debug] Error fetching stats:', error);
      res.status(500).json({ error: 'failed_to_fetch_stats' });
    }
  }
);

export default debugRouter;
