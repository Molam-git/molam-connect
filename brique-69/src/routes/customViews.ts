/**
 * Custom Views API Routes
 * Allows users to save and share custom dashboard configurations
 */

import { Router } from 'express';
import { AuthenticatedRequest, requirePermission, getMerchantFilter } from '../middleware/auth';
import { query } from '../services/db';
import { apiRequestDuration, apiRequestsTotal } from '../utils/metrics';

const router = Router();

/**
 * POST /api/analytics/views
 * Create a new custom view
 */
router.post('/', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'POST', route: '/views' });

  try {
    const {
      name,
      description,
      viewConfig,
      isPublic = false,
      sharedWith = [],
    } = req.body;

    if (!name || !viewConfig) {
      return res.status(400).json({ error: 'Missing required fields: name, viewConfig' });
    }

    const effectiveMerchantId = getMerchantFilter(req);

    const result = await query(
      `INSERT INTO analytics_custom_views
       (merchant_id, org_id, created_by, name, description, view_config, is_public, shared_with)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        effectiveMerchantId || null,
        req.user!.organization_id || null,
        req.user!.id,
        name,
        description || null,
        viewConfig,
        isPublic,
        JSON.stringify(sharedWith),
      ]
    );

    apiRequestsTotal.inc({ method: 'POST', route: '/views', status: '201' });
    endTimer({ status: '201' });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating custom view:', error);
    apiRequestsTotal.inc({ method: 'POST', route: '/views', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Failed to create custom view' });
  }
});

/**
 * GET /api/analytics/views
 * List custom views (own + shared + public)
 */
router.get('/', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'GET', route: '/views' });

  try {
    const userId = req.user!.id;
    const effectiveMerchantId = getMerchantFilter(req);

    // Fetch views that the user can access:
    // 1. Created by user
    // 2. Public views
    // 3. Shared with user
    const result = await query(
      `SELECT * FROM analytics_custom_views
       WHERE is_active = true
         AND (
           created_by = $1
           OR is_public = true
           OR shared_with @> $2::jsonb
         )
         AND ($3::uuid IS NULL OR merchant_id = $3 OR merchant_id IS NULL)
       ORDER BY created_at DESC`,
      [userId, JSON.stringify([userId]), effectiveMerchantId]
    );

    apiRequestsTotal.inc({ method: 'GET', route: '/views', status: '200' });
    endTimer({ status: '200' });

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching custom views:', error);
    apiRequestsTotal.inc({ method: 'GET', route: '/views', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Failed to fetch custom views' });
  }
});

/**
 * GET /api/analytics/views/:id
 * Get a specific custom view
 */
router.get('/:id', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'GET', route: '/views/:id' });

  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const result = await query(
      `SELECT * FROM analytics_custom_views
       WHERE id = $1
         AND (
           created_by = $2
           OR is_public = true
           OR shared_with @> $3::jsonb
         )`,
      [id, userId, JSON.stringify([userId])]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Custom view not found or access denied' });
    }

    // Update view count and last viewed
    await query(
      `UPDATE analytics_custom_views
       SET view_count = view_count + 1, last_viewed_at = now()
       WHERE id = $1`,
      [id]
    );

    apiRequestsTotal.inc({ method: 'GET', route: '/views/:id', status: '200' });
    endTimer({ status: '200' });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching custom view:', error);
    apiRequestsTotal.inc({ method: 'GET', route: '/views/:id', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Failed to fetch custom view' });
  }
});

/**
 * PATCH /api/analytics/views/:id
 * Update a custom view
 */
router.patch('/:id', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'PATCH', route: '/views/:id' });

  try {
    const { id } = req.params;
    const { name, description, viewConfig, isPublic, sharedWith } = req.body;
    const userId = req.user!.id;

    // Check ownership
    const checkResult = await query(
      `SELECT created_by FROM analytics_custom_views WHERE id = $1`,
      [id]
    );

    if (checkResult.rowCount === 0) {
      return res.status(404).json({ error: 'Custom view not found' });
    }

    if (checkResult.rows[0].created_by !== userId) {
      return res.status(403).json({ error: 'You can only update your own views' });
    }

    let updates: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description);
    }

    if (viewConfig !== undefined) {
      updates.push(`view_config = $${paramIndex++}`);
      params.push(viewConfig);
    }

    if (isPublic !== undefined) {
      updates.push(`is_public = $${paramIndex++}`);
      params.push(isPublic);
    }

    if (sharedWith !== undefined) {
      updates.push(`shared_with = $${paramIndex++}`);
      params.push(JSON.stringify(sharedWith));
    }

    updates.push(`updated_at = now()`);
    params.push(id);

    const result = await query(
      `UPDATE analytics_custom_views
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    apiRequestsTotal.inc({ method: 'PATCH', route: '/views/:id', status: '200' });
    endTimer({ status: '200' });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating custom view:', error);
    apiRequestsTotal.inc({ method: 'PATCH', route: '/views/:id', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Failed to update custom view' });
  }
});

/**
 * DELETE /api/analytics/views/:id
 * Delete a custom view
 */
router.delete('/:id', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'DELETE', route: '/views/:id' });

  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const result = await query(
      `UPDATE analytics_custom_views
       SET is_active = false, updated_at = now()
       WHERE id = $1 AND created_by = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Custom view not found or access denied' });
    }

    apiRequestsTotal.inc({ method: 'DELETE', route: '/views/:id', status: '200' });
    endTimer({ status: '200' });

    res.json({ message: 'Custom view deleted', view: result.rows[0] });
  } catch (error) {
    console.error('Error deleting custom view:', error);
    apiRequestsTotal.inc({ method: 'DELETE', route: '/views/:id', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Failed to delete custom view' });
  }
});

export default router;
