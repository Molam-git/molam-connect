// ============================================================================
// Main Routes Index
// ============================================================================

import { Router } from 'express';
import splitRulesRoutes from './splitRulesRoutes';
import paymentSplitsRoutes from './paymentSplitsRoutes';
import settlementsRoutes from './settlementsRoutes';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'brique-64-splits',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Mount sub-routes
router.use('/splits', splitRulesRoutes);
router.use('/splits', paymentSplitsRoutes);
router.use('/settlements', settlementsRoutes);

export default router;
