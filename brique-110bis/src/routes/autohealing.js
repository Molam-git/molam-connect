// src/routes/autohealing.js
// Auto-Healing API Endpoints

const express = require('express');

/**
 * Create auto-healing router
 * @param {Object} pool - Database pool
 * @param {Object} autoHealingService - Auto-healing service
 * @param {Object} interopService - Interop service
 * @returns {express.Router} Router
 */
function createAutoHealingRouter(pool, autoHealingService, interopService) {
  const router = express.Router();

  // ============================================================================
  // Auto-Healing Endpoints
  // ============================================================================

  /**
   * POST /autoheal - Sira détecte un bug et propose un patch
   */
  router.post('/autoheal', async (req, res) => {
    try {
      const { plugin_id, detected_issue, issue_severity, patch_type, proposed_patch, sira_confidence } = req.body;

      // Validation
      if (!plugin_id || !detected_issue || !proposed_patch) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // TODO: Auth - require Sira token or Ops role
      // if (!req.user || req.user.role !== 'sira') {
      //   return res.status(403).json({ error: 'Forbidden' });
      // }

      // Create healing log
      const log = await autoHealingService.detectAndLogIssue({
        plugin_id,
        detected_issue,
        issue_severity: issue_severity || 'medium',
        patch_type: patch_type || 'bug_fix',
        sira_decision: {
          proposed_patch,
          confidence: sira_confidence,
          timestamp: new Date().toISOString()
        },
        sira_confidence: sira_confidence || 0
      });

      // Check if should auto-apply
      const shouldAutoApply = sira_confidence >= 85.0;

      if (shouldAutoApply) {
        // Apply patch automatically
        await autoHealingService.applyPatch(log.id, proposed_patch);
        console.log(`[API] Auto-applied patch for log ${log.id}`);
      } else {
        // Send notification to Ops for manual review
        console.log(`[API] Patch pending manual review: ${log.id}`);
      }

      res.status(201).json({
        status: shouldAutoApply ? 'applied' : 'pending_review',
        log
      });
    } catch (error) {
      console.error('[API] Auto-heal failed:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  /**
   * POST /autoheal/:id/apply - Apply pending patch
   */
  router.post('/autoheal/:id/apply', async (req, res) => {
    try {
      const { id } = req.params;
      const { patch } = req.body;

      // TODO: Auth - require Ops role

      const result = await autoHealingService.applyPatch(id, patch);

      res.json({
        status: 'ok',
        message: 'Patch applied successfully',
        log: result
      });
    } catch (error) {
      console.error('[API] Apply patch failed:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  /**
   * POST /autoheal/:id/rollback - Rollback patch
   */
  router.post('/autoheal/:id/rollback', async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      // TODO: Auth - require Ops role

      const result = await autoHealingService.rollbackPatch(id, reason || 'Manual rollback');

      res.json({
        status: 'ok',
        message: 'Patch rolled back successfully',
        result
      });
    } catch (error) {
      console.error('[API] Rollback failed:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  /**
   * GET /autoheal/logs - Get healing logs
   */
  router.get('/autoheal/logs', async (req, res) => {
    try {
      const { plugin_id, status, issue_severity, limit } = req.query;

      // TODO: Auth - require Ops role

      const logs = await autoHealingService.getHealingLogs({
        plugin_id,
        status,
        issue_severity,
        limit: parseInt(limit || '100', 10)
      });

      res.json(logs);
    } catch (error) {
      console.error('[API] Get logs failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /autoheal/stats - Get auto-healing statistics
   */
  router.get('/autoheal/stats', async (req, res) => {
    try {
      const { days } = req.query;

      // TODO: Auth - require Ops role

      const stats = await autoHealingService.getStats(parseInt(days || '30', 10));

      res.json(stats);
    } catch (error) {
      console.error('[API] Get stats failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /autoheal/commands/:plugin_id - Get pending commands for plugin
   */
  router.get('/autoheal/commands/:plugin_id', async (req, res) => {
    try {
      const { plugin_id } = req.params;

      // TODO: Auth - require plugin API key matching plugin_id

      const commands = await autoHealingService.getPendingCommands(plugin_id);

      res.json(commands);
    } catch (error) {
      console.error('[API] Get commands failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /autoheal/commands/:command_id/ack - Acknowledge command execution
   */
  router.post('/autoheal/commands/:command_id/ack', async (req, res) => {
    try {
      const { command_id } = req.params;
      const { success, error, result } = req.body;

      // TODO: Auth - require plugin API key

      const command = await autoHealingService.acknowledgeCommand(command_id, {
        success: success !== false,
        error: error || null,
        result: result || {}
      });

      res.json({
        status: 'ok',
        command
      });
    } catch (error) {
      console.error('[API] Acknowledge command failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ============================================================================
  // Interop Layer Endpoints
  // ============================================================================

  /**
   * POST /interop/event - Receive normalized event from plugin
   */
  router.post('/interop/event', async (req, res) => {
    try {
      const { plugin_id, event_type, payload } = req.body;

      // Validation
      if (!plugin_id || !event_type || !payload) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // TODO: Auth - require merchant API key
      // const merchant_id = req.user.merchant_id;

      // Get plugin info to determine platform
      const { rows: [plugin] } = await pool.query(
        'SELECT * FROM plugin_installations WHERE id = $1',
        [plugin_id]
      );

      if (!plugin) {
        return res.status(404).json({ error: 'Plugin not found' });
      }

      // Receive event
      const event = await interopService.receiveEvent({
        plugin_id,
        merchant_id: plugin.merchant_id,
        event_type,
        event_category: req.body.event_category || null,
        payload,
        source_platform: plugin.cms
      });

      res.status(201).json({
        status: 'ack',
        event_id: event.id,
        normalized: event.normalized_payload
      });
    } catch (error) {
      console.error('[API] Receive event failed:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  /**
   * GET /interop/events - Get interop events
   */
  router.get('/interop/events', async (req, res) => {
    try {
      const { plugin_id, merchant_id, event_type, event_category, source_platform, processing_status, limit } = req.query;

      // TODO: Auth - require Ops role or merchant owns plugin

      const events = await interopService.getEvents({
        plugin_id,
        merchant_id,
        event_type,
        event_category,
        source_platform,
        processing_status,
        limit: parseInt(limit || '100', 10)
      });

      res.json(events);
    } catch (error) {
      console.error('[API] Get events failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /interop/stats - Get interop statistics
   */
  router.get('/interop/stats', async (req, res) => {
    try {
      const { days } = req.query;

      // TODO: Auth - require Ops role

      const stats = await interopService.getStats(parseInt(days || '30', 10));

      res.json(stats);
    } catch (error) {
      console.error('[API] Get interop stats failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /interop/retry - Retry failed events
   */
  router.post('/interop/retry', async (req, res) => {
    try {
      const { max_retries } = req.body;

      // TODO: Auth - require Ops role

      const retried = await interopService.retryFailedEvents(max_retries || 3);

      res.json({
        status: 'ok',
        retried
      });
    } catch (error) {
      console.error('[API] Retry failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /interop/mappings - Get event mappings
   */
  router.get('/interop/mappings', async (req, res) => {
    try {
      const { source_platform, is_active } = req.query;

      // TODO: Auth - require Ops role

      const mappings = await interopService.getMappings({
        source_platform,
        is_active: is_active !== undefined ? is_active === 'true' : undefined
      });

      res.json(mappings);
    } catch (error) {
      console.error('[API] Get mappings failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /interop/mappings - Create or update mapping
   */
  router.post('/interop/mappings', async (req, res) => {
    try {
      const { source_platform, source_event_type, normalized_event_type, field_mappings, transformation_rules, is_active } = req.body;

      // Validation
      if (!source_platform || !source_event_type || !normalized_event_type || !field_mappings) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // TODO: Auth - require Ops role

      const mapping = await interopService.upsertMapping({
        source_platform,
        source_event_type,
        normalized_event_type,
        field_mappings,
        transformation_rules,
        is_active
      });

      res.status(201).json(mapping);
    } catch (error) {
      console.error('[API] Create mapping failed:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  return router;
}

module.exports = createAutoHealingRouter;
