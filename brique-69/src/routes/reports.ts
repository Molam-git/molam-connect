/**
 * Reports API Routes
 * Manages export and scheduled reports
 */

import { Router } from 'express';
import { AuthenticatedRequest, requirePermission, getMerchantFilter } from '../middleware/auth';
import { query } from '../services/db';
import { getReportGenerator } from '../services/reportGenerator';
import { getStorageService } from '../services/storage';
import { apiRequestDuration, apiRequestsTotal } from '../utils/metrics';

const router = Router();

/**
 * POST /api/analytics/reports/export
 * Generate and download report immediately
 */
router.post('/export', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'POST', route: '/reports/export' });
  const startTime = Date.now();

  try {
    const {
      format = 'csv',
      reportName = 'Analytics Export',
      queryParams,
    } = req.body;

    // Validate format
    if (!['csv', 'xlsx', 'pdf'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Must be csv, xlsx, or pdf' });
    }

    // Apply merchant filter
    const effectiveMerchantId = getMerchantFilter(req, queryParams?.merchantId);
    const finalQueryParams = {
      ...queryParams,
      merchantId: effectiveMerchantId,
    };

    // Generate report
    const reportGenerator = getReportGenerator(await import('../services/db').then(m => m.getPool()));
    const report = await reportGenerator.generateReport(
      finalQueryParams,
      format as any,
      reportName
    );

    // Upload to storage
    const storageService = getStorageService();
    const uploadResult = await storageService.uploadFile(
      report.filePath,
      report.fileName,
      {
        merchantId: effectiveMerchantId || 'system',
        userId: req.user!.id,
        reportName,
      }
    );

    // Record audit log
    await query(
      `INSERT INTO analytics_report_audit
       (merchant_id, report_name, format, query_params, file_url, file_size_bytes, file_expires_at, row_count, execution_time_ms, status, created_by, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        effectiveMerchantId || null,
        reportName,
        format,
        finalQueryParams,
        uploadResult.url,
        report.fileSizeBytes,
        uploadResult.expiresAt,
        report.rowCount,
        Date.now() - startTime,
        'completed',
        req.user!.id,
        req.headers['user-agent'] || null,
        req.ip || null,
      ]
    );

    apiRequestsTotal.inc({ method: 'POST', route: '/reports/export', status: '200' });
    endTimer({ status: '200' });

    res.json({
      downloadUrl: uploadResult.url,
      fileName: report.fileName,
      format: report.format,
      rowCount: report.rowCount,
      fileSizeBytes: report.fileSizeBytes,
      expiresAt: uploadResult.expiresAt,
    });
  } catch (error) {
    console.error('Error in /reports/export:', error);
    apiRequestsTotal.inc({ method: 'POST', route: '/reports/export', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * POST /api/analytics/reports/schedule
 * Create a new scheduled report
 */
router.post('/schedule', requirePermission('analytics:ops'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'POST', route: '/reports/schedule' });

  try {
    const {
      name,
      description,
      format,
      queryParams,
      cronExpr,
      recipients,
      deliveryMethod = 'email',
      webhookUrl,
    } = req.body;

    // Validation
    if (!name || !format || !queryParams || !cronExpr || !recipients || recipients.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['csv', 'xlsx', 'pdf'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format' });
    }

    if (!['email', 'webhook', 'both'].includes(deliveryMethod)) {
      return res.status(400).json({ error: 'Invalid delivery method' });
    }

    // Apply merchant filter
    const effectiveMerchantId = getMerchantFilter(req, queryParams?.merchantId);

    const result = await query(
      `INSERT INTO analytics_report_schedules
       (merchant_id, org_id, created_by, name, description, format, query_params, cron_expr, recipients, delivery_method, webhook_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        effectiveMerchantId || null,
        req.user!.organization_id || null,
        req.user!.id,
        name,
        description || null,
        format,
        queryParams,
        cronExpr,
        JSON.stringify(recipients),
        deliveryMethod,
        webhookUrl || null,
      ]
    );

    apiRequestsTotal.inc({ method: 'POST', route: '/reports/schedule', status: '201' });
    endTimer({ status: '201' });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error in /reports/schedule:', error);
    apiRequestsTotal.inc({ method: 'POST', route: '/reports/schedule', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

/**
 * GET /api/analytics/reports/schedules
 * List scheduled reports
 */
router.get('/schedules', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'GET', route: '/reports/schedules' });

  try {
    const { status = 'active' } = req.query as any;
    const effectiveMerchantId = getMerchantFilter(req);

    const result = await query(
      `SELECT * FROM analytics_report_schedules
       WHERE ($1::uuid IS NULL OR merchant_id = $1)
         AND ($2::text IS NULL OR status = $2)
       ORDER BY created_at DESC`,
      [effectiveMerchantId, status]
    );

    apiRequestsTotal.inc({ method: 'GET', route: '/reports/schedules', status: '200' });
    endTimer({ status: '200' });

    res.json(result.rows);
  } catch (error) {
    console.error('Error in /reports/schedules:', error);
    apiRequestsTotal.inc({ method: 'GET', route: '/reports/schedules', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

/**
 * PATCH /api/analytics/reports/schedules/:id
 * Update scheduled report
 */
router.patch('/schedules/:id', requirePermission('analytics:ops'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'PATCH', route: '/reports/schedules/:id' });

  try {
    const { id } = req.params;
    const { status, isEnabled, cronExpr, recipients } = req.body;

    let updates: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (isEnabled !== undefined) {
      updates.push(`is_enabled = $${paramIndex++}`);
      params.push(isEnabled);
    }

    if (cronExpr !== undefined) {
      updates.push(`cron_expr = $${paramIndex++}`);
      params.push(cronExpr);
    }

    if (recipients !== undefined) {
      updates.push(`recipients = $${paramIndex++}`);
      params.push(JSON.stringify(recipients));
    }

    updates.push(`updated_at = now()`);
    params.push(id);

    const result = await query(
      `UPDATE analytics_report_schedules
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    apiRequestsTotal.inc({ method: 'PATCH', route: '/reports/schedules/:id', status: '200' });
    endTimer({ status: '200' });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error in /reports/schedules/:id:', error);
    apiRequestsTotal.inc({ method: 'PATCH', route: '/reports/schedules/:id', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

/**
 * DELETE /api/analytics/reports/schedules/:id
 * Delete (archive) scheduled report
 */
router.delete('/schedules/:id', requirePermission('analytics:ops'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'DELETE', route: '/reports/schedules/:id' });

  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE analytics_report_schedules
       SET status = 'archived', is_enabled = false, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    apiRequestsTotal.inc({ method: 'DELETE', route: '/reports/schedules/:id', status: '200' });
    endTimer({ status: '200' });

    res.json({ message: 'Schedule archived', schedule: result.rows[0] });
  } catch (error) {
    console.error('Error in /reports/schedules/:id:', error);
    apiRequestsTotal.inc({ method: 'DELETE', route: '/reports/schedules/:id', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

/**
 * GET /api/analytics/reports/history
 * Get report generation history
 */
router.get('/history', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'GET', route: '/reports/history' });

  try {
    const { scheduleId, limit = 50, offset = 0 } = req.query as any;
    const effectiveMerchantId = getMerchantFilter(req);

    const result = await query(
      `SELECT * FROM analytics_report_audit
       WHERE ($1::uuid IS NULL OR merchant_id = $1)
         AND ($2::uuid IS NULL OR schedule_id = $2)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [effectiveMerchantId, scheduleId || null, limit, offset]
    );

    apiRequestsTotal.inc({ method: 'GET', route: '/reports/history', status: '200' });
    endTimer({ status: '200' });

    res.json({
      reports: result.rows,
      total: result.rowCount,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error in /reports/history:', error);
    apiRequestsTotal.inc({ method: 'GET', route: '/reports/history', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * GET /api/analytics/reports/templates
 * Get available export templates
 */
router.get('/templates', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'GET', route: '/reports/templates' });

  try {
    const result = await query(
      `SELECT * FROM analytics_export_templates
       WHERE is_active = true
       ORDER BY category, name`
    );

    apiRequestsTotal.inc({ method: 'GET', route: '/reports/templates', status: '200' });
    endTimer({ status: '200' });

    res.json(result.rows);
  } catch (error) {
    console.error('Error in /reports/templates:', error);
    apiRequestsTotal.inc({ method: 'GET', route: '/reports/templates', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

export default router;
