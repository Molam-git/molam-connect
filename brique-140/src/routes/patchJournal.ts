/**
 * SOUS-BRIQUE 140quater — Patch Journal & Crowdsourcing Routes
 * Endpoints pour journalisation et propositions communautaires
 */

import { Router } from 'express';
import { pool } from '../db';
import { authzMiddleware, requireRole } from '../utils/authz';

export const patchJournalRouter = Router();

/**
 * POST /api/dev/patch-journal
 * Enregistrer l'application d'un patch (public endpoint pour SDKs)
 */
patchJournalRouter.post('/', async (req: any, res) => {
  const {
    sdk_language,
    error_signature,
    patch_applied,
    rollback_available,
    rollback_triggered,
    success,
    execution_time_ms,
    context,
    applied_by,
  } = req.body;

  if (!sdk_language || !error_signature || !patch_applied) {
    return res.status(400).json({ error: 'missing_required_fields' });
  }

  try {
    await pool.query(
      `INSERT INTO sdk_patch_journal
       (sdk_language, error_signature, patch_applied, rollback_available,
        rollback_triggered, success, execution_time_ms, context, applied_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        sdk_language,
        error_signature,
        patch_applied,
        rollback_available || false,
        rollback_triggered || false,
        success,
        execution_time_ms || null,
        context || {},
        applied_by || 'auto',
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('[PatchJournal] Error logging:', error);
    res.status(500).json({ error: 'failed_to_log' });
  }
});

/**
 * GET /api/dev/patch-journal/analytics
 * Analytics sur les patches appliqués (crowdsourcing intelligence)
 */
patchJournalRouter.get(
  '/analytics',
  authzMiddleware,
  requireRole(['dev_admin']),
  async (req: any, res) => {
    try {
      const analytics = await pool.query(
        `SELECT
           sdk_language,
           error_signature,
           COUNT(*) as total_applications,
           SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
           SUM(CASE WHEN rollback_triggered THEN 1 ELSE 0 END) as rollbacks,
           AVG(execution_time_ms) as avg_execution_time,
           MAX(applied_at) as last_applied
         FROM sdk_patch_journal
         WHERE applied_at > NOW() - INTERVAL '30 days'
         GROUP BY sdk_language, error_signature
         ORDER BY total_applications DESC
         LIMIT 50`
      );

      res.json({ analytics: analytics.rows });
    } catch (error) {
      console.error('[PatchJournal] Analytics error:', error);
      res.status(500).json({ error: 'failed_to_fetch_analytics' });
    }
  }
);

/**
 * POST /api/dev/crowd-patches
 * Proposer un nouveau patch (crowdsourcing)
 */
patchJournalRouter.post(
  '/crowd-patches',
  authzMiddleware,
  requireRole(['merchant_dev', 'dev_admin']),
  async (req: any, res) => {
    const {
      sdk_language,
      error_signature,
      proposed_patch_code,
      proposed_rollback_code,
      description,
    } = req.body;

    if (!sdk_language || !error_signature || !proposed_patch_code) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO sdk_crowd_patches
         (sdk_language, error_signature, proposed_patch_code,
          proposed_rollback_code, description, proposer_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING id`,
        [
          sdk_language,
          error_signature,
          proposed_patch_code,
          proposed_rollback_code || null,
          description,
          req.user.id,
        ]
      );

      res.json({ ok: true, crowd_patch_id: result.rows[0].id });
    } catch (error) {
      console.error('[CrowdPatch] Error creating:', error);
      res.status(500).json({ error: 'failed_to_create_crowd_patch' });
    }
  }
);

/**
 * GET /api/dev/crowd-patches
 * Liste des patches proposés par la communauté
 */
patchJournalRouter.get(
  '/crowd-patches',
  authzMiddleware,
  requireRole(['merchant_dev', 'dev_admin']),
  async (req: any, res) => {
    const { status = 'pending' } = req.query;

    try {
      const result = await pool.query(
        `SELECT
           id, sdk_language, error_signature, description,
           votes_up, votes_down, status, created_at,
           (votes_up - votes_down) as score
         FROM sdk_crowd_patches
         WHERE status = $1
         ORDER BY score DESC, created_at DESC
         LIMIT 50`,
        [status]
      );

      res.json({ crowd_patches: result.rows });
    } catch (error) {
      console.error('[CrowdPatch] Error fetching:', error);
      res.status(500).json({ error: 'failed_to_fetch_crowd_patches' });
    }
  }
);

/**
 * POST /api/dev/crowd-patches/:patchId/vote
 * Voter pour un patch communautaire
 */
patchJournalRouter.post(
  '/crowd-patches/:patchId/vote',
  authzMiddleware,
  requireRole(['merchant_dev', 'dev_admin']),
  async (req: any, res) => {
    const { patchId } = req.params;
    const { vote } = req.body; // 'up' or 'down'

    if (!['up', 'down'].includes(vote)) {
      return res.status(400).json({ error: 'invalid_vote' });
    }

    try {
      const column = vote === 'up' ? 'votes_up' : 'votes_down';

      await pool.query(
        `UPDATE sdk_crowd_patches
         SET ${column} = ${column} + 1
         WHERE id = $1`,
        [patchId]
      );

      res.json({ ok: true });
    } catch (error) {
      console.error('[CrowdPatch] Voting error:', error);
      res.status(500).json({ error: 'failed_to_vote' });
    }
  }
);

/**
 * POST /api/dev/crowd-patches/:patchId/approve (Admin only)
 * Approuver un patch crowdsourcé
 */
patchJournalRouter.post(
  '/crowd-patches/:patchId/approve',
  authzMiddleware,
  requireRole(['dev_admin']),
  async (req: any, res) => {
    const { patchId } = req.params;

    try {
      // Récupérer le patch crowd
      const crowdPatch = await pool.query(
        `SELECT * FROM sdk_crowd_patches WHERE id = $1`,
        [patchId]
      );

      if (crowdPatch.rows.length === 0) {
        return res.status(404).json({ error: 'patch_not_found' });
      }

      const patch = crowdPatch.rows[0];

      // Créer dans registry officiel
      await pool.query(
        `INSERT INTO sdk_self_healing_registry
         (sdk_language, error_signature, patch_code, rollback_code,
          description, source, crowd_votes, sandbox_tested)
         VALUES ($1, $2, $3, $4, $5, 'crowd', $6, false)`,
        [
          patch.sdk_language,
          patch.error_signature,
          patch.proposed_patch_code,
          patch.proposed_rollback_code,
          patch.description,
          patch.votes_up - patch.votes_down,
        ]
      );

      // Marquer comme approuvé
      await pool.query(
        `UPDATE sdk_crowd_patches
         SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1
         WHERE id = $2`,
        [req.user.id, patchId]
      );

      res.json({ ok: true });
    } catch (error) {
      console.error('[CrowdPatch] Approval error:', error);
      res.status(500).json({ error: 'failed_to_approve' });
    }
  }
);

/**
 * POST /api/dev/sandbox/test
 * Tester un patch en mode sandbox
 */
patchJournalRouter.post(
  '/sandbox/test',
  authzMiddleware,
  requireRole(['dev_admin']),
  async (req: any, res) => {
    const { patch_id, crowd_patch_id, test_scenario, expected_result } = req.body;

    if ((!patch_id && !crowd_patch_id) || !test_scenario) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    try {
      // Simuler l'exécution du patch (en réalité, cela devrait être dans un sandbox isolé)
      const startTime = Date.now();

      // TODO: Implémenter vrai sandbox avec VM isolée
      const actual_result = 'SANDBOX_SIMULATION';
      const success = actual_result === expected_result;
      const execution_time = Date.now() - startTime;

      // Enregistrer résultat
      await pool.query(
        `INSERT INTO sdk_sandbox_tests
         (patch_id, crowd_patch_id, test_scenario, expected_result,
          actual_result, success, execution_time_ms, tested_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          patch_id || null,
          crowd_patch_id || null,
          test_scenario,
          expected_result,
          actual_result,
          success,
          execution_time,
          req.user.id,
        ]
      );

      res.json({
        ok: true,
        test_result: {
          success,
          actual_result,
          execution_time_ms: execution_time,
        },
      });
    } catch (error) {
      console.error('[Sandbox] Test error:', error);
      res.status(500).json({ error: 'failed_to_test' });
    }
  }
);

/**
 * GET /api/dev/sandbox/results/:patchId
 * Résultats des tests sandbox pour un patch
 */
patchJournalRouter.get(
  '/sandbox/results/:patchId',
  authzMiddleware,
  requireRole(['dev_admin']),
  async (req: any, res) => {
    const { patchId } = req.params;

    try {
      const results = await pool.query(
        `SELECT
           test_scenario, expected_result, actual_result,
           success, execution_time_ms, tested_at
         FROM sdk_sandbox_tests
         WHERE patch_id = $1 OR crowd_patch_id = $1
         ORDER BY tested_at DESC`,
        [patchId]
      );

      res.json({ sandbox_results: results.rows });
    } catch (error) {
      console.error('[Sandbox] Results error:', error);
      res.status(500).json({ error: 'failed_to_fetch_results' });
    }
  }
);

export default patchJournalRouter;
