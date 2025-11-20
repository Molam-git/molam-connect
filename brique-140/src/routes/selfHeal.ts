/**
 * SOUS-BRIQUE 140quater — Self-Heal API Routes
 * Endpoint pour récupération de patches auto-correctifs
 */

import { Router } from 'express';
import { pool } from '../db';
import { authzMiddleware, requireRole } from '../utils/authz';

export const selfHealRouter = Router();

// Auth middleware (optionnel pour self-heal public)
selfHealRouter.use(authzMiddleware);

/**
 * POST /api/dev/self-heal
 * Récupérer un patch auto-correctif pour une erreur donnée
 */
selfHealRouter.post('/', async (req: any, res) => {
  const { sdk, error, status, endpoint, context } = req.body;

  if (!sdk || !error) {
    return res.status(400).json({ error: 'sdk and error required' });
  }

  try {
    // Recherche du patch le plus pertinent
    const patchResult = await pool.query(
      `SELECT id, patch_code, description, rollback_code, version, severity
       FROM sdk_self_healing_registry
       WHERE sdk_language = $1
         AND active = true
         AND (
           $2 ILIKE '%' || error_signature || '%'
           OR error_signature = $3::TEXT
         )
       ORDER BY
         CASE severity
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
         END,
         updated_at DESC
       LIMIT 1`,
      [sdk, error, status]
    );

    if (patchResult.rows.length > 0) {
      const patch = patchResult.rows[0];

      // Enregistrer l'application du patch
      await pool.query(
        `INSERT INTO sdk_patch_applications
         (patch_id, developer_id, sdk_language, error_encountered, context)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          patch.id,
          req.user?.id || 'anonymous',
          sdk,
          error,
          { status, endpoint, ...context },
        ]
      );

      res.json({
        patch: {
          patch_id: patch.id,
          code: patch.patch_code,
          description: patch.description,
          rollback_code: patch.rollback_code,
          version: patch.version,
          severity: patch.severity,
        },
      });
    } else {
      // Aucun patch trouvé
      res.json({ patch: null });
    }
  } catch (error) {
    console.error('[SelfHeal] Error fetching patch:', error);
    res.status(500).json({ error: 'failed_to_fetch_patch' });
  }
});

/**
 * POST /api/dev/self-heal/:applicationId/report
 * Reporter le succès/échec d'un patch appliqué
 */
selfHealRouter.post('/:applicationId/report', async (req: any, res) => {
  const { applicationId } = req.params;
  const { success, rollback_triggered } = req.body;

  try {
    await pool.query(
      `UPDATE sdk_patch_applications
       SET success = $1, rollback_triggered = $2
       WHERE id = $3`,
      [success, rollback_triggered || false, applicationId]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('[SelfHeal] Error reporting patch result:', error);
    res.status(500).json({ error: 'failed_to_report' });
  }
});

/**
 * GET /api/dev/patches
 * Liste des patches actifs
 */
selfHealRouter.get(
  '/patches',
  requireRole(['merchant_dev', 'dev_admin']),
  async (req: any, res) => {
    try {
      const result = await pool.query(
        `SELECT id, sdk_language, error_signature, description, severity, version, active
         FROM sdk_self_healing_registry
         ORDER BY
           CASE severity
             WHEN 'critical' THEN 1
             WHEN 'high' THEN 2
             WHEN 'medium' THEN 3
             WHEN 'low' THEN 4
           END,
           updated_at DESC`
      );

      res.json({ patches: result.rows });
    } catch (error) {
      console.error('[SelfHeal] Error fetching patches:', error);
      res.status(500).json({ error: 'failed_to_fetch_patches' });
    }
  }
);

/**
 * GET /api/dev/patches/stats
 * Statistiques d'application des patches
 */
selfHealRouter.get(
  '/patches/stats',
  requireRole(['merchant_dev', 'dev_admin']),
  async (req: any, res) => {
    try {
      const stats = await pool.query(
        `SELECT
           p.sdk_language,
           p.error_signature,
           p.description,
           COUNT(a.id) as applications_count,
           SUM(CASE WHEN a.success THEN 1 ELSE 0 END) as success_count,
           SUM(CASE WHEN a.rollback_triggered THEN 1 ELSE 0 END) as rollback_count
         FROM sdk_self_healing_registry p
         LEFT JOIN sdk_patch_applications a ON p.id = a.patch_id
         WHERE p.active = true
         GROUP BY p.id, p.sdk_language, p.error_signature, p.description
         ORDER BY applications_count DESC`
      );

      res.json({ stats: stats.rows });
    } catch (error) {
      console.error('[SelfHeal] Error fetching stats:', error);
      res.status(500).json({ error: 'failed_to_fetch_stats' });
    }
  }
);

/**
 * POST /api/dev/patches (Admin only)
 * Créer un nouveau patch
 */
selfHealRouter.post(
  '/patches',
  requireRole(['dev_admin']),
  async (req: any, res) => {
    const { sdk_language, error_signature, patch_code, description, severity, rollback_code } =
      req.body;

    if (!sdk_language || !error_signature || !patch_code) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO sdk_self_healing_registry
         (sdk_language, error_signature, patch_code, description, severity, rollback_code)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [sdk_language, error_signature, patch_code, description, severity || 'medium', rollback_code]
      );

      res.json({ ok: true, patch_id: result.rows[0].id });
    } catch (error) {
      console.error('[SelfHeal] Error creating patch:', error);
      res.status(500).json({ error: 'failed_to_create_patch' });
    }
  }
);

/**
 * DELETE /api/dev/patches/:patchId (Admin only)
 * Désactiver un patch
 */
selfHealRouter.delete(
  '/patches/:patchId',
  requireRole(['dev_admin']),
  async (req: any, res) => {
    const { patchId } = req.params;

    try {
      await pool.query(
        `UPDATE sdk_self_healing_registry
         SET active = false, updated_at = now()
         WHERE id = $1`,
        [patchId]
      );

      res.json({ ok: true });
    } catch (error) {
      console.error('[SelfHeal] Error deactivating patch:', error);
      res.status(500).json({ error: 'failed_to_deactivate_patch' });
    }
  }
);

export default selfHealRouter;
