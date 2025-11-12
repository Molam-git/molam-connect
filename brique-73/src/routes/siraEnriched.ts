/**
 * SIRA Enriched API Routes
 * AI-guided replay, fraud detection, and immutable audit
 * Brique 73 v2.1
 */

import express, { Response } from 'express';
import { requireRole } from '../utils/authz';
import {
  analyzeAndSuggestReplay,
  queueIntelligentReplay,
  detectAdvancedAbusePatterns,
  writeImmutableAudit,
  verifyAuditLogIntegrity,
  updateWebhookProfile,
} from '../services/siraEnriched';
import { pool } from '../db';

const router = express.Router();

// ========================================
// AI-Guided Webhook Replay
// ========================================

/**
 * POST /sira/webhooks/:deliveryId/analyze-replay
 * Analyze failed delivery and get AI suggestions for replay
 */
router.post('/webhooks/:deliveryId/analyze-replay', requireRole(['dev_admin', 'merchant_admin']), async (req: any, res: Response) => {
  try {
    const { deliveryId } = req.params;

    // Verify access to delivery
    const delivery = await pool.query(
      `SELECT wd.*, w.app_id
       FROM webhook_deliveries wd
       JOIN webhooks w ON wd.webhook_id = w.id
       WHERE wd.id = $1`,
      [deliveryId]
    );

    if (delivery.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    // Verify user has access
    const appCheck = await pool.query(
      `SELECT id FROM dev_apps WHERE id = $1 AND tenant_id = $2`,
      [delivery.rows[0].app_id, req.user.tenantId]
    );

    if (appCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get AI analysis
    const strategy = await analyzeAndSuggestReplay(deliveryId);

    // Log audit
    await writeImmutableAudit({
      keyId: req.user.apiKeyId,
      eventType: 'replay_analysis',
      eventCategory: 'access',
      actorId: req.user.id,
      actorType: 'user',
      endpoint: req.path,
      ipAddress: req.ip,
      payload: { deliveryId, strategy },
      complianceFlags: ['AUDIT'],
    });

    res.json({
      success: true,
      deliveryId,
      analysis: {
        strategy: strategy.strategy,
        expectedImprovement: strategy.expectedImprovement,
        aiConfidence: strategy.aiConfidence,
        modifications: {
          payloadModified: strategy.modifiedPayload !== undefined,
          customTimeout: strategy.customTimeout,
          customRetryDelay: strategy.customRetryDelay,
        },
      },
      recommendation: `SIRA AI recommends: ${strategy.expectedImprovement}`,
    });
  } catch (error: any) {
    console.error('Failed to analyze replay', error);
    res.status(500).json({ error: error.message || 'Failed to analyze replay' });
  }
});

/**
 * POST /sira/webhooks/:deliveryId/replay
 * Queue intelligent replay with AI-guided modifications
 */
router.post('/webhooks/:deliveryId/replay', requireRole(['dev_admin', 'merchant_admin']), async (req: any, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const { forceStrategy } = req.body; // Optional: override AI suggestion

    // Verify access
    const delivery = await pool.query(
      `SELECT wd.*, w.app_id
       FROM webhook_deliveries wd
       JOIN webhooks w ON wd.webhook_id = w.id
       WHERE wd.id = $1`,
      [deliveryId]
    );

    if (delivery.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const appCheck = await pool.query(
      `SELECT id FROM dev_apps WHERE id = $1 AND tenant_id = $2`,
      [delivery.rows[0].app_id, req.user.tenantId]
    );

    if (appCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Queue intelligent replay
    const result = await queueIntelligentReplay(deliveryId, req.user.id);

    // Log audit
    await writeImmutableAudit({
      keyId: req.user.apiKeyId,
      webhookId: delivery.rows[0].webhook_id,
      eventType: 'replay_queued',
      eventCategory: 'delivery',
      actorId: req.user.id,
      actorType: 'user',
      endpoint: req.path,
      ipAddress: req.ip,
      payload: { deliveryId, replayId: result.replayId, strategy: result.strategy },
      complianceFlags: ['AUDIT'],
    });

    res.json({
      success: true,
      replayId: result.replayId,
      strategy: result.strategy,
      message: 'Intelligent replay queued with AI-guided optimizations',
    });
  } catch (error: any) {
    console.error('Failed to queue replay', error);
    res.status(500).json({ error: error.message || 'Failed to queue replay' });
  }
});

/**
 * GET /sira/webhooks/:webhookId/profile
 * Get adaptive webhook profile with AI recommendations
 */
router.get('/webhooks/:webhookId/profile', requireRole(['dev_admin', 'merchant_admin']), async (req: any, res: Response) => {
  try {
    const { webhookId } = req.params;

    // Verify access
    const webhook = await pool.query(
      `SELECT w.*, da.tenant_id
       FROM webhooks w
       JOIN dev_apps da ON w.app_id = da.id
       WHERE w.id = $1`,
      [webhookId]
    );

    if (webhook.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    if (webhook.rows[0].tenant_id !== req.user.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get profile
    const profile = await pool.query(
      `SELECT * FROM webhook_profiles WHERE webhook_id = $1`,
      [webhookId]
    );

    if (profile.rows.length === 0) {
      // Create profile if doesn't exist
      await updateWebhookProfile(webhookId);

      const newProfile = await pool.query(
        `SELECT * FROM webhook_profiles WHERE webhook_id = $1`,
        [webhookId]
      );

      return res.json({
        success: true,
        profile: newProfile.rows[0] || null,
      });
    }

    res.json({
      success: true,
      profile: profile.rows[0],
    });
  } catch (error: any) {
    console.error('Failed to get webhook profile', error);
    res.status(500).json({ error: error.message || 'Failed to get profile' });
  }
});

// ========================================
// Advanced Fraud Detection
// ========================================

/**
 * POST /sira/keys/:keyId/analyze-abuse
 * Run advanced fraud detection on API key
 */
router.post('/keys/:keyId/analyze-abuse', requireRole(['dev_admin', 'security_admin']), async (req: any, res: Response) => {
  try {
    const { keyId } = req.params;

    // Verify access
    const key = await pool.query(
      `SELECT ak.*, da.tenant_id
       FROM api_keys ak
       JOIN dev_apps da ON ak.app_id = da.id
       WHERE ak.id = $1`,
      [keyId]
    );

    if (key.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

    if (key.rows[0].tenant_id !== req.user.tenantId && req.user.role !== 'security_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Run fraud detection
    const patterns = await detectAdvancedAbusePatterns(keyId);

    // Log audit
    await writeImmutableAudit({
      keyId,
      eventType: 'abuse_analysis',
      eventCategory: 'security',
      actorId: req.user.id,
      actorType: 'user',
      endpoint: req.path,
      ipAddress: req.ip,
      payload: { keyId, patternsFound: patterns.length },
      complianceFlags: ['SECURITY', 'AUDIT'],
    });

    res.json({
      success: true,
      keyId,
      analysis: {
        patternsDetected: patterns.length,
        severity: patterns.length > 0 ? Math.max(...patterns.map(p => getSeverityLevel(p.severity))) : 0,
        autoActionTaken: patterns.some(p => p.actionTaken !== 'none'),
      },
      patterns: patterns.map(p => ({
        id: p.id,
        type: p.patternType,
        severity: p.severity,
        confidence: p.confidenceScore,
        details: p.details,
        actionTaken: p.actionTaken,
        detectedAt: p.detectedAt,
      })),
    });
  } catch (error: any) {
    console.error('Failed to analyze abuse', error);
    res.status(500).json({ error: error.message || 'Failed to analyze abuse' });
  }
});

/**
 * GET /sira/abuse-patterns
 * List active abuse patterns across all keys
 */
router.get('/abuse-patterns', requireRole(['security_admin', 'platform_admin']), async (req: any, res: Response) => {
  try {
    const { severity, status = 'active', limit = 50 } = req.query;

    let query = `
      SELECT aap.*, ak.kid, da.name as app_name
      FROM api_abuse_patterns aap
      JOIN api_keys ak ON aap.key_id = ak.id
      JOIN dev_apps da ON ak.app_id = da.id
      WHERE aap.status = $1
    `;
    const params: any[] = [status];

    if (severity) {
      params.push(severity);
      query += ` AND aap.severity = $${params.length}`;
    }

    query += ` ORDER BY aap.detected_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      patterns: result.rows,
      count: result.rows.length,
    });
  } catch (error: any) {
    console.error('Failed to list abuse patterns', error);
    res.status(500).json({ error: error.message || 'Failed to list patterns' });
  }
});

/**
 * PATCH /sira/abuse-patterns/:patternId
 * Update abuse pattern status (mark as resolved, false positive, etc.)
 */
router.patch('/abuse-patterns/:patternId', requireRole(['security_admin']), async (req: any, res: Response) => {
  try {
    const { patternId } = req.params;
    const { status, dismissReason } = req.body;

    if (!['resolved', 'false_positive', 'under_review'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await pool.query(
      `UPDATE api_abuse_patterns
       SET status = $1,
           reviewed_by = $2,
           reviewed_at = NOW()
       WHERE id = $3`,
      [status, req.user.id, patternId]
    );

    // Log audit
    await writeImmutableAudit({
      eventType: 'abuse_pattern_updated',
      eventCategory: 'security',
      actorId: req.user.id,
      actorType: 'user',
      endpoint: req.path,
      ipAddress: req.ip,
      payload: { patternId, status, dismissReason },
      complianceFlags: ['SECURITY', 'AUDIT'],
    });

    res.json({
      success: true,
      message: 'Abuse pattern updated',
    });
  } catch (error: any) {
    console.error('Failed to update abuse pattern', error);
    res.status(500).json({ error: error.message || 'Failed to update pattern' });
  }
});

// ========================================
// Immutable Audit & Compliance
// ========================================

/**
 * GET /sira/audit-log
 * Query immutable audit log (compliance export)
 */
router.get('/audit-log', requireRole(['security_admin', 'compliance_admin']), async (req: any, res: Response) => {
  try {
    const {
      keyId,
      webhookId,
      eventType,
      eventCategory,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
    } = req.query;

    let query = `SELECT * FROM api_audit_log WHERE 1=1`;
    const params: any[] = [];

    if (keyId) {
      params.push(keyId);
      query += ` AND key_id = $${params.length}`;
    }

    if (webhookId) {
      params.push(webhookId);
      query += ` AND webhook_id = $${params.length}`;
    }

    if (eventType) {
      params.push(eventType);
      query += ` AND event_type = $${params.length}`;
    }

    if (eventCategory) {
      params.push(eventCategory);
      query += ` AND event_category = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      query += ` AND created_at >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND created_at <= $${params.length}`;
    }

    query += ` ORDER BY chain_index DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Log this audit query
    await writeImmutableAudit({
      eventType: 'audit_log_accessed',
      eventCategory: 'compliance',
      actorId: req.user.id,
      actorType: 'user',
      endpoint: req.path,
      ipAddress: req.ip,
      payload: { query: req.query },
      complianceFlags: ['AUDIT', 'COMPLIANCE'],
    });

    res.json({
      success: true,
      entries: result.rows,
      count: result.rows.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error: any) {
    console.error('Failed to query audit log', error);
    res.status(500).json({ error: error.message || 'Failed to query audit log' });
  }
});

/**
 * POST /sira/audit-log/verify
 * Verify audit log integrity (hash chain validation)
 */
router.post('/audit-log/verify', requireRole(['security_admin', 'compliance_admin']), async (req: any, res: Response) => {
  try {
    const { startIndex, endIndex } = req.body;

    if (!startIndex || !endIndex) {
      return res.status(400).json({ error: 'startIndex and endIndex required' });
    }

    const verification = await verifyAuditLogIntegrity(startIndex, endIndex);

    // Log verification attempt
    await writeImmutableAudit({
      eventType: 'audit_integrity_check',
      eventCategory: 'compliance',
      actorId: req.user.id,
      actorType: 'user',
      endpoint: req.path,
      ipAddress: req.ip,
      payload: { startIndex, endIndex, result: verification },
      complianceFlags: ['AUDIT', 'COMPLIANCE'],
    });

    res.json({
      success: true,
      verification,
      message: verification.valid
        ? 'Audit log integrity verified successfully'
        : `Integrity check failed: ${verification.error}`,
    });
  } catch (error: any) {
    console.error('Failed to verify audit log', error);
    res.status(500).json({ error: error.message || 'Failed to verify integrity' });
  }
});

/**
 * GET /sira/audit-log/export
 * Export audit log for compliance (PDF/CSV)
 */
router.get('/audit-log/export', requireRole(['compliance_admin']), async (req: any, res: Response) => {
  try {
    const { format = 'csv', startDate, endDate } = req.query;

    let query = `SELECT * FROM api_audit_log WHERE 1=1`;
    const params: any[] = [];

    if (startDate) {
      params.push(startDate);
      query += ` AND created_at >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND created_at <= $${params.length}`;
    }

    query += ` ORDER BY chain_index ASC`;

    const result = await pool.query(query, params);

    if (format === 'csv') {
      // Generate CSV
      const csv = generateCSV(result.rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=audit-log-${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        entries: result.rows,
        count: result.rows.length,
      });
    }

    // Log export
    await writeImmutableAudit({
      eventType: 'audit_log_exported',
      eventCategory: 'compliance',
      actorId: req.user.id,
      actorType: 'user',
      endpoint: req.path,
      ipAddress: req.ip,
      payload: { format, entryCount: result.rows.length },
      complianceFlags: ['AUDIT', 'COMPLIANCE', 'EXPORT'],
    });
  } catch (error: any) {
    console.error('Failed to export audit log', error);
    res.status(500).json({ error: error.message || 'Failed to export' });
  }
});

// ========================================
// API Version Management
// ========================================

/**
 * GET /sira/version-contracts
 * List API version usage and migration status
 */
router.get('/version-contracts', requireRole(['dev_admin', 'platform_admin']), async (req: any, res: Response) => {
  try {
    const { deprecated = 'true' } = req.query;

    const result = await pool.query(
      `SELECT avc.*, da.name as app_name
       FROM api_version_contracts avc
       JOIN dev_apps da ON avc.app_id = da.id
       WHERE avc.is_deprecated = $1
       ORDER BY avc.migration_deadline ASC NULLS LAST`,
      [deprecated === 'true']
    );

    res.json({
      success: true,
      contracts: result.rows,
      count: result.rows.length,
    });
  } catch (error: any) {
    console.error('Failed to list version contracts', error);
    res.status(500).json({ error: error.message || 'Failed to list contracts' });
  }
});

// ========================================
// Helper Functions
// ========================================

function getSeverityLevel(severity: string): number {
  const levels: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  return levels[severity] || 0;
}

function generateCSV(rows: any[]): string {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]).join(',');
  const data = rows.map(row =>
    Object.values(row).map(val =>
      typeof val === 'string' && val.includes(',') ? `"${val}"` : val
    ).join(',')
  ).join('\n');

  return `${headers}\n${data}`;
}

export default router;
