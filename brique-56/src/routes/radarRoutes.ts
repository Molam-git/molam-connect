/**
 * Radar Routes - REST API endpoints for fraud prevention
 */
import express from "express";
import { AuthRequest, requireRole } from "../utils/authz.js";
import { pool } from "../utils/db.js";
import { publishEvent } from "../utils/webhooks.js";
import { evaluateRulesForPayment } from "../radar/evaluator.js";
import { createPaymentSignal, getPaymentSignal } from "../services/signalsService.js";
import {
  createRule,
  getRule,
  listRules,
  updateRule,
  deleteRule,
  testRule,
} from "../services/rulesService.js";
import {
  createTemplate,
  listTemplates,
  generateEvidencePackage,
} from "../services/evidenceService.js";

const router = express.Router();

/**
 * POST /api/radar/evaluate
 * Real-time evaluation for checkout (fast path <50ms)
 */
router.post("/evaluate", async (req, res): Promise<void> => {
  try {
    const { payment_id } = req.body;

    if (!payment_id) {
      res.status(400).json({ error: "payment_id_required" });
      return;
    }

    // Load payment signal
    const signal = await getPaymentSignal(payment_id);
    if (!signal) {
      res.status(404).json({ error: "payment_signal_not_found" });
      return;
    }

    // Evaluate rules
    const results = await evaluateRulesForPayment(signal);

    // Persist evaluations
    for (const evaluation of results.evaluations) {
      await pool.query(
        `INSERT INTO radar_evaluations (payment_id, rule_id, triggered, score, explanation)
         VALUES ($1, $2, $3, $4, $5)`,
        [payment_id, evaluation.ruleId, evaluation.triggered, evaluation.score, evaluation.explanation]
      );
    }

    // Create pending actions
    for (const action of results.actions) {
      const { rows: [actionRecord] } = await pool.query(
        `INSERT INTO radar_actions (payment_id, rule_id, action_type, params, status)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
        [payment_id, action.ruleId, action.type, action.params]
      );

      // Publish event for workers
      await publishEvent("internal", "radar", "radar.action.created", {
        action_id: actionRecord.id,
        payment_id,
        action_type: action.type,
      });
    }

    res.json({
      payment_id,
      evaluations: results.evaluations,
      actions: results.actions,
      risk_level: results.riskLevel,
      total_score: results.totalScore,
    });
  } catch (error: any) {
    console.error("Evaluation error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/radar/signals
 * Create payment signal
 */
router.post("/signals", async (req, res): Promise<void> => {
  try {
    const signal = await createPaymentSignal(req.body);
    res.status(201).json(signal);
  } catch (error: any) {
    console.error("Create signal error:", error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/radar/signals/:paymentId
 * Get payment signal
 */
router.get("/signals/:paymentId", async (req, res): Promise<void> => {
  try {
    const signal = await getPaymentSignal(req.params.paymentId);
    if (!signal) {
      res.status(404).json({ error: "signal_not_found" });
      return;
    }
    res.json(signal);
  } catch (error: any) {
    console.error("Get signal error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/radar/rules
 * List all rules (ops)
 */
router.get("/rules", requireRole("pay_admin", "ops_radar"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const enabled = req.query.enabled === "true" ? true : req.query.enabled === "false" ? false : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

    const result = await listRules({ enabled, limit, offset });
    res.json(result);
  } catch (error: any) {
    console.error("List rules error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/radar/rules/:id
 * Get rule by ID
 */
router.get("/rules/:id", requireRole("pay_admin", "ops_radar"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const rule = await getRule(req.params.id);
    if (!rule) {
      res.status(404).json({ error: "rule_not_found" });
      return;
    }
    res.json(rule);
  } catch (error: any) {
    console.error("Get rule error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/radar/rules
 * Create rule (ops)
 */
router.post("/rules", requireRole("pay_admin", "ops_radar"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const { name, description, scope, condition, action, priority } = req.body;

    if (!name || !condition || !action) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    const rule = await createRule({
      name,
      description,
      scope,
      condition,
      action,
      priority,
      createdBy: req.user!.id,
    });

    res.status(201).json(rule);
  } catch (error: any) {
    console.error("Create rule error:", error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/radar/rules/:id
 * Update rule (ops)
 */
router.put("/rules/:id", requireRole("pay_admin", "ops_radar"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const rule = await updateRule(req.params.id, req.body);
    res.json(rule);
  } catch (error: any) {
    console.error("Update rule error:", error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/radar/rules/:id
 * Delete rule (ops)
 */
router.delete("/rules/:id", requireRole("pay_admin", "ops_radar"), async (req: AuthRequest, res): Promise<void> => {
  try {
    await deleteRule(req.params.id);
    res.json({ ok: true });
  } catch (error: any) {
    console.error("Delete rule error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/radar/rules/test
 * Test rule against sample data
 */
router.post("/rules/test", requireRole("pay_admin", "ops_radar"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const { condition, sample_data } = req.body;

    if (!condition || !sample_data) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    const result = await testRule(condition, sample_data);
    res.json(result);
  } catch (error: any) {
    console.error("Test rule error:", error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/radar/actions/:id/execute
 * Execute pending action (ops or system)
 */
router.post("/actions/:id/execute", requireRole("pay_admin", "ops_radar"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;

    // Update action status to executing
    await pool.query(
      `UPDATE radar_actions SET status = 'executing', executed_by = $1, updated_at = now()
       WHERE id = $2 AND status = 'pending'`,
      [req.user!.id, id]
    );

    // Publish event for worker to pick up
    await publishEvent("internal", "radar", "radar.action.execute", { action_id: id });

    res.json({ ok: true, message: "action_queued_for_execution" });
  } catch (error: any) {
    console.error("Execute action error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/radar/actions/:paymentId
 * Get actions for payment
 */
router.get("/actions/:paymentId", requireRole("pay_admin", "ops_radar"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const { rows: actions } = await pool.query(
      `SELECT * FROM radar_actions WHERE payment_id = $1 ORDER BY created_at DESC`,
      [req.params.paymentId]
    );
    res.json({ data: actions });
  } catch (error: any) {
    console.error("Get actions error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/radar/templates
 * List evidence templates
 */
router.get("/templates", requireRole("pay_admin", "ops_radar"), async (_req: AuthRequest, res): Promise<void> => {
  try {
    const templates = await listTemplates();
    res.json({ data: templates });
  } catch (error: any) {
    console.error("List templates error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/radar/templates
 * Create evidence template
 */
router.post("/templates", requireRole("pay_admin", "ops_radar"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const template = await createTemplate({ ...req.body, created_by: req.user!.id });
    res.status(201).json(template);
  } catch (error: any) {
    console.error("Create template error:", error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/radar/evidence/:templateId/generate
 * Generate evidence package for payment
 */
router.get("/evidence/:templateId/generate", requireRole("pay_admin", "ops_radar"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const { templateId } = req.params;
    const { payment_id } = req.query;

    if (!payment_id) {
      res.status(400).json({ error: "payment_id_required" });
      return;
    }

    const evidence = await generateEvidencePackage(payment_id as string, templateId);
    res.json(evidence);
  } catch (error: any) {
    console.error("Generate evidence error:", error);
    res.status(400).json({ error: error.message });
  }
});

export default router;
