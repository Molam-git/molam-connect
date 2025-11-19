/**
 * Brique 112: Canary Deployment API
 * Manage canary rollouts and traffic splitting
 */

const express = require('express');

function createCanaryRouter(pool, canaryService) {
  const router = express.Router();

  /**
   * Get canary configuration for a product
   * GET /api/sira/canary/:product
   */
  router.get('/:product', async (req, res) => {
    try {
      const { product } = req.params;

      const config = await canaryService.getCanaryConfig(product);

      if (!config) {
        return res.status(404).json({
          error: 'no_canary_config',
          message: 'No active canary configuration for this product'
        });
      }

      res.json(config);
    } catch (error) {
      console.error('Get canary config error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Set canary configuration
   * POST /api/sira/canary/:product
   */
  router.post('/:product', async (req, res) => {
    try {
      const { product } = req.params;
      const config = req.body;
      const userId = req.user?.id || 'system';

      // Validate user role
      const userRoles = req.user?.roles || [];
      if (!userRoles.includes('ml_ops') && !userRoles.includes('pay_admin')) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Only ml_ops or pay_admin can configure canary'
        });
      }

      const result = await canaryService.setCanaryConfig(product, config, userId);

      res.json(result);
    } catch (error) {
      console.error('Set canary config error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Stop canary deployment (rollback)
   * POST /api/sira/canary/:product/stop
   */
  router.post('/:product/stop', async (req, res) => {
    try {
      const { product } = req.params;
      const userId = req.user?.id || 'system';

      // Validate user role
      const userRoles = req.user?.roles || [];
      if (!userRoles.includes('ml_ops') && !userRoles.includes('pay_admin')) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Only ml_ops or pay_admin can stop canary'
        });
      }

      const result = await canaryService.stopCanary(product, userId);

      res.json({ ok: true, config: result });
    } catch (error) {
      console.error('Stop canary error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Check canary health
   * GET /api/sira/canary/:product/health
   */
  router.get('/:product/health', async (req, res) => {
    try {
      const { product } = req.params;

      const health = await canaryService.checkCanaryHealth(product);

      res.json(health);
    } catch (error) {
      console.error('Check canary health error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Route inference request (for testing)
   * POST /api/sira/canary/:product/route
   */
  router.post('/:product/route', async (req, res) => {
    try {
      const { product } = req.params;
      const { event_id } = req.body;

      if (!event_id) {
        return res.status(400).json({
          error: 'missing_event_id',
          message: 'event_id is required'
        });
      }

      const routing = await canaryService.routeInference(event_id, product);

      res.json(routing);
    } catch (error) {
      console.error('Route inference error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  return router;
}

module.exports = createCanaryRouter;
