import { Router, Response } from 'express';
import { authzMiddleware, requireRole, AuthRequest } from '../utils/authz';
import * as listsService from '../services/listsService';
import * as notificationsService from '../services/notificationsService';
import * as evidenceService from '../services/evidenceService';
import * as kpiService from '../services/kpiService';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ==================== Lists Management ====================

/**
 * POST /api/merchant-protection/lists
 * Add entry to whitelist or blacklist
 */
router.post('/lists', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { list_type, entity_type, value, scope, reason } = req.body;
    const merchantId = req.user!.merchantId!;
    const actorId = req.user!.id;

    if (!['whitelist', 'blacklist'].includes(list_type)) {
      res.status(400).json({ error: 'Invalid list_type' });
      return;
    }

    if (!['customer', 'card', 'ip', 'device'].includes(entity_type)) {
      res.status(400).json({ error: 'Invalid entity_type' });
      return;
    }

    const entry = await listsService.addListEntry({
      merchantId,
      listType: list_type,
      entityType: entity_type,
      value,
      scope,
      reason,
      actorId,
    });

    res.status(201).json(entry);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error adding list entry:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/merchant-protection/lists
 * Get all list entries for merchant
 */
router.get('/lists', authzMiddleware, requireRole('merchant_admin', 'connect_ops'), async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const { list_type, entity_type } = req.query;

    const entries = await listsService.getListEntries(
      merchantId,
      list_type as any,
      entity_type as string
    );

    res.json(entries);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error getting list entries:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/merchant-protection/lists
 * Remove entry from list
 */
router.delete('/lists', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { list_type, entity_type, value } = req.body;
    const merchantId = req.user!.merchantId!;
    const actorId = req.user!.id;

    await listsService.removeListEntry(merchantId, list_type, entity_type, value, actorId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error removing list entry:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/merchant-protection/lists/bulk-import
 * Bulk import list entries from CSV
 */
router.post('/lists/bulk-import', authzMiddleware, requireRole('merchant_admin'), upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const actorId = req.user!.id;
    const { list_type, entity_type } = req.body;

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Parse CSV
    const csvContent = req.file.buffer.toString('utf-8');
    const lines = csvContent.split('\n').filter((l) => l.trim());
    const entries = lines.slice(1).map((line) => {
      const [value, reason] = line.split(',').map((v) => v.trim());
      return { value, reason };
    });

    const result = await listsService.bulkImportEntries(
      merchantId,
      list_type,
      entity_type,
      entries,
      actorId
    );

    res.json(result);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error bulk importing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/merchant-protection/lists/check
 * Check if entity is whitelisted or blacklisted
 */
router.get('/lists/check', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const { entity_type, value } = req.query;

    if (!entity_type || !value) {
      res.status(400).json({ error: 'Missing entity_type or value' });
      return;
    }

    const isWhitelisted = await listsService.isWhitelisted(merchantId, entity_type as any, value as string);
    const isBlacklisted = await listsService.isBlacklisted(merchantId, entity_type as any, value as string);

    res.json({ is_whitelisted: isWhitelisted, is_blacklisted: isBlacklisted });
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error checking list:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Notifications Management ====================

/**
 * POST /api/merchant-protection/notifications
 * Set notification preference
 */
router.post('/notifications', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { event_type, channels, threshold, enabled } = req.body;
    const merchantId = req.user!.merchantId!;
    const actorId = req.user!.id;

    const pref = await notificationsService.setPreference({
      merchantId,
      eventType: event_type,
      channels,
      threshold,
      enabled,
      actorId,
    });

    res.json(pref);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error setting notification preference:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/merchant-protection/notifications
 * Get all notification preferences
 */
router.get('/notifications', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const prefs = await notificationsService.getPreferences(merchantId);
    res.json(prefs);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error getting notification preferences:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/merchant-protection/notifications/test
 * Test notification channel
 */
router.post('/notifications/test', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { channel } = req.body;
    const merchantId = req.user!.merchantId!;

    const result = await notificationsService.testChannel(merchantId, channel);
    res.json(result);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error testing notification channel:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Evidence Packages ====================

/**
 * POST /api/merchant-protection/evidence
 * Create evidence package
 */
router.post('/evidence', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { dispute_id, package_type, template_id } = req.body;
    const merchantId = req.user!.merchantId!;
    const actorId = req.user!.id;

    const pkg = await evidenceService.createPackage({
      merchantId,
      disputeId: dispute_id,
      packageType: package_type,
      templateId: template_id,
      actorId,
    });

    res.status(201).json(pkg);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error creating evidence package:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/merchant-protection/evidence
 * List evidence packages
 */
router.get('/evidence', authzMiddleware, requireRole('merchant_admin', 'connect_ops'), async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const { dispute_id } = req.query;

    const packages = await evidenceService.listPackages(merchantId, dispute_id as string);
    res.json(packages);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error listing evidence packages:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/merchant-protection/evidence/:package_id
 * Get evidence package details
 */
router.get('/evidence/:package_id', authzMiddleware, requireRole('merchant_admin', 'connect_ops'), async (req: AuthRequest, res: Response) => {
  try {
    const { package_id } = req.params;
    const merchantId = req.user!.merchantId!;

    const pkg = await evidenceService.getPackage(package_id, merchantId);
    if (!pkg) {
      res.status(404).json({ error: 'Evidence package not found' });
      return;
    }

    res.json(pkg);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error getting evidence package:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/merchant-protection/evidence/:package_id/documents
 * Add document to evidence package
 */
router.post('/evidence/:package_id/documents', authzMiddleware, requireRole('merchant_admin'), upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { package_id } = req.params;
    const { document_type, metadata } = req.body;
    const merchantId = req.user!.merchantId!;
    const actorId = req.user!.id;

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const pkg = await evidenceService.addDocument({
      packageId: package_id,
      merchantId,
      documentType: document_type,
      fileName: req.file.originalname,
      fileBuffer: req.file.buffer,
      metadata: metadata ? JSON.parse(metadata) : {},
      actorId,
    });

    res.json(pkg);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error adding document:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/merchant-protection/evidence/:package_id/documents/:document_id
 * Delete document from evidence package
 */
router.delete('/evidence/:package_id/documents/:document_id', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { package_id, document_id } = req.params;
    const merchantId = req.user!.merchantId!;
    const actorId = req.user!.id;

    const pkg = await evidenceService.deleteDocument(package_id, document_id, merchantId, actorId);
    res.json(pkg);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error deleting document:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/merchant-protection/evidence/:package_id/submit
 * Submit evidence package (finalize and lock)
 */
router.post('/evidence/:package_id/submit', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { package_id } = req.params;
    const merchantId = req.user!.merchantId!;
    const actorId = req.user!.id;

    const pkg = await evidenceService.submitPackage(package_id, merchantId, actorId);
    res.json(pkg);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error submitting evidence package:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/merchant-protection/evidence/:package_id/documents/:document_id/download
 * Get presigned download URL for document
 */
router.get('/evidence/:package_id/documents/:document_id/download', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { package_id, document_id } = req.params;
    const merchantId = req.user!.merchantId!;

    const url = await evidenceService.getDocumentDownloadUrl(package_id, document_id, merchantId);
    res.json({ url });
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error getting download URL:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== KPIs & Analytics ====================

/**
 * GET /api/merchant-protection/kpis
 * Get fraud KPIs for date range
 */
router.get('/kpis', authzMiddleware, requireRole('merchant_admin', 'connect_ops'), async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const { start_date, end_date } = req.query;

    const startDate = start_date ? new Date(start_date as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = end_date ? new Date(end_date as string) : new Date();

    const kpis = await kpiService.calculateKPIs(merchantId, startDate, endDate);
    res.json(kpis);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error calculating KPIs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/merchant-protection/trend
 * Get fraud trend (daily snapshots)
 */
router.get('/trend', authzMiddleware, requireRole('merchant_admin', 'connect_ops'), async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const { start_date, end_date } = req.query;

    const startDate = start_date ? new Date(start_date as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = end_date ? new Date(end_date as string) : new Date();

    const trend = await kpiService.getFraudTrend(merchantId, startDate, endDate);
    res.json(trend);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error getting fraud trend:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/merchant-protection/alerts
 * Get recent fraud alerts (last 24h)
 */
router.get('/alerts', authzMiddleware, requireRole('merchant_admin', 'connect_ops'), async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const { limit } = req.query;

    const alerts = await kpiService.getRecentAlerts(merchantId, limit ? parseInt(limit as string, 10) : 50);
    res.json(alerts);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error getting recent alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/merchant-protection/alerts/count
 * Get alert count (last 24h)
 */
router.get('/alerts/count', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const count = await kpiService.getAlertCount(merchantId);
    res.json({ count });
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error getting alert count:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Protection Level ====================

/**
 * GET /api/merchant-protection/status
 * Get protection level status
 */
router.get('/status', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const status = await kpiService.getProtectionStatus(merchantId);
    res.json(status);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error getting protection status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/merchant-protection/subscribe
 * Subscribe to protection level
 */
router.post('/subscribe', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { level } = req.body;
    const merchantId = req.user!.merchantId!;
    const actorId = req.user!.id;

    if (!['basic', 'premium', 'guaranteed'].includes(level)) {
      res.status(400).json({ error: 'Invalid protection level' });
      return;
    }

    const protection = await kpiService.subscribeToProtection(merchantId, level, actorId);
    res.json(protection);
  } catch (error: any) {
    console.error('[MerchantProtectionRoutes] Error subscribing to protection:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
