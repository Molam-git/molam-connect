// ============================================================================
// Mesh API Routes
// ============================================================================

import { Router, Request, Response } from "express";
import { pool } from "../utils/db";
import { logger } from "../utils/logger";
import {
  generateHealthPrediction,
  generateRoutingProposal,
} from "../sira/predictionEngine";
import {
  applyRoutingAtomically,
  simulateImpact,
  rollbackRouting,
} from "../mesh/controller";

export const meshRouter = Router();

// ============================================================================
// GET /api/mesh/regions - List mesh regions
// ============================================================================
meshRouter.get("/regions", async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM mesh_regions ORDER BY name`
    );

    res.json({ ok: true, regions: rows });
  } catch (error: any) {
    logger.error("Failed to get regions", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// GET /api/mesh/regions/:id/members - Get members of a region
// ============================================================================
meshRouter.get("/regions/:id/members", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT
        mm.*,
        bp.name as bank_name,
        bp.country as bank_country
       FROM mesh_members mm
       JOIN bank_profiles bp ON mm.bank_profile_id = bp.id
       WHERE mm.mesh_region_id = $1
       ORDER BY mm.prefer_order ASC, mm.current_health_score DESC NULLS LAST`,
      [id]
    );

    res.json({ ok: true, members: rows });
  } catch (error: any) {
    logger.error("Failed to get members", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// POST /api/mesh/members - Add member to mesh
// ============================================================================
meshRouter.post("/members", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      mesh_region_id,
      bank_profile_id,
      role,
      prefer_order,
      capabilities,
    } = req.body;

    if (!mesh_region_id || !bank_profile_id) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO mesh_members(
        mesh_region_id, bank_profile_id, role, prefer_order,
        capabilities, status
      )
      VALUES($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        mesh_region_id,
        bank_profile_id,
        role || "member",
        prefer_order || 100,
        capabilities || {},
        "pending_approval",
      ]
    );

    res.json({ ok: true, member: rows[0] });
  } catch (error: any) {
    logger.error("Failed to add member", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// GET /api/mesh/predictions - Get recent predictions
// ============================================================================
meshRouter.get("/predictions", async (req: Request, res: Response): Promise<void> => {
  try {
    const { mesh_region_id, bank_profile_id } = req.query;

    let query = `SELECT * FROM bank_health_predictions WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (mesh_region_id) {
      query += ` AND mesh_region_id = $${paramIndex++}`;
      params.push(mesh_region_id);
    }

    if (bank_profile_id) {
      query += ` AND bank_profile_id = $${paramIndex++}`;
      params.push(bank_profile_id);
    }

    query += ` ORDER BY created_at DESC LIMIT 100`;

    const { rows } = await pool.query(query, params);

    res.json({ ok: true, predictions: rows });
  } catch (error: any) {
    logger.error("Failed to get predictions", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// POST /api/mesh/predictions/generate - Generate prediction for a bank
// ============================================================================
meshRouter.post("/predictions/generate", async (req: Request, res: Response): Promise<void> => {
  try {
    const { bank_profile_id, mesh_region_id } = req.body;

    if (!bank_profile_id) {
      res.status(400).json({ error: "missing_bank_profile_id" });
      return;
    }

    const prediction = await generateHealthPrediction(bank_profile_id, mesh_region_id);

    if (!prediction) {
      res.status(404).json({ error: "no_health_data_available" });
      return;
    }

    res.json({ ok: true, prediction });
  } catch (error: any) {
    logger.error("Failed to generate prediction", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// GET /api/mesh/proposals - Get routing proposals
// ============================================================================
meshRouter.get("/proposals", async (req: Request, res: Response): Promise<void> => {
  try {
    const { mesh_region_id, status } = req.query;

    let query = `SELECT * FROM mesh_routing_proposals WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (mesh_region_id) {
      query += ` AND mesh_region_id = $${paramIndex++}`;
      params.push(mesh_region_id);
    }

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT 100`;

    const { rows } = await pool.query(query, params);

    res.json({ ok: true, proposals: rows });
  } catch (error: any) {
    logger.error("Failed to get proposals", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// POST /api/mesh/proposals/generate - Generate routing proposal
// ============================================================================
meshRouter.post("/proposals/generate", async (req: Request, res: Response): Promise<void> => {
  try {
    const { mesh_region_id, currency, min_amount, max_amount, reason } = req.body;

    if (!mesh_region_id || !currency) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    const proposal = await generateRoutingProposal(
      mesh_region_id,
      currency,
      min_amount || 0,
      max_amount,
      reason
    );

    res.json({ ok: true, proposal });
  } catch (error: any) {
    logger.error("Failed to generate proposal", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// POST /api/mesh/proposals/:id/simulate - Simulate proposal impact
// ============================================================================
meshRouter.post("/proposals/:id/simulate", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const simulation = await simulateImpact(id);

    res.json({ ok: true, simulation });
  } catch (error: any) {
    logger.error("Failed to simulate proposal", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// POST /api/mesh/proposals/:id/approve - Approve and apply proposal
// ============================================================================
meshRouter.post("/proposals/:id/approve", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Get proposal
    const { rows } = await pool.query(
      `SELECT * FROM mesh_routing_proposals WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "proposal_not_found" });
      return;
    }

    const proposal = rows[0];

    // Mark as approved
    await pool.query(
      `UPDATE mesh_routing_proposals
       SET status = 'approved', reviewed_by = $1, reviewed_at = now()
       WHERE id = $2`,
      [req.user?.id || "system", id]
    );

    // Apply routing
    await applyRoutingAtomically(proposal);

    res.json({ ok: true, message: "Proposal approved and applied" });
  } catch (error: any) {
    logger.error("Failed to approve proposal", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// POST /api/mesh/proposals/:id/reject - Reject proposal
// ============================================================================
meshRouter.post("/proposals/:id/reject", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await pool.query(
      `UPDATE mesh_routing_proposals
       SET status = 'rejected', reviewed_by = $1, reviewed_at = now()
       WHERE id = $2`,
      [req.user?.id || "system", id]
    );

    res.json({ ok: true, message: "Proposal rejected" });
  } catch (error: any) {
    logger.error("Failed to reject proposal", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// POST /api/mesh/proposals/:id/rollback - Rollback applied proposal
// ============================================================================
meshRouter.post("/proposals/:id/rollback", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      res.status(400).json({ error: "missing_reason" });
      return;
    }

    await rollbackRouting(id, reason);

    res.json({ ok: true, message: "Proposal rolled back" });
  } catch (error: any) {
    logger.error("Failed to rollback proposal", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// GET /api/mesh/actions - Get action logs
// ============================================================================
meshRouter.get("/actions", async (req: Request, res: Response): Promise<void> => {
  try {
    const { mesh_region_id, action_type, limit = "100" } = req.query;

    let query = `SELECT * FROM mesh_action_logs WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (mesh_region_id) {
      query += ` AND mesh_region_id = $${paramIndex++}`;
      params.push(mesh_region_id);
    }

    if (action_type) {
      query += ` AND action_type = $${paramIndex++}`;
      params.push(action_type);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++}`;
    params.push(parseInt(limit as string, 10));

    const { rows } = await pool.query(query, params);

    res.json({ ok: true, actions: rows });
  } catch (error: any) {
    logger.error("Failed to get actions", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// GET /api/mesh/reconciliations - Get reconciliations
// ============================================================================
meshRouter.get("/reconciliations", async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, limit = "100" } = req.query;

    let query = `SELECT * FROM mesh_reconciliations WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND reconciliation_status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++}`;
    params.push(parseInt(limit as string, 10));

    const { rows } = await pool.query(query, params);

    res.json({ ok: true, reconciliations: rows });
  } catch (error: any) {
    logger.error("Failed to get reconciliations", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// GET /api/mesh/policies - Get policies
// ============================================================================
meshRouter.get("/policies", async (req: Request, res: Response): Promise<void> => {
  try {
    const { mesh_region_id } = req.query;

    let query = `SELECT * FROM mesh_policies WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (mesh_region_id) {
      query += ` AND mesh_region_id = $${paramIndex++}`;
      params.push(mesh_region_id);
    }

    query += ` ORDER BY priority ASC`;

    const { rows } = await pool.query(query, params);

    res.json({ ok: true, policies: rows });
  } catch (error: any) {
    logger.error("Failed to get policies", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// PUT /api/mesh/policies/:id - Update policy
// ============================================================================
meshRouter.put("/policies/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { rules } = req.body;

    if (!rules) {
      res.status(400).json({ error: "missing_rules" });
      return;
    }

    await pool.query(
      `UPDATE mesh_policies SET rules = $1, updated_at = now() WHERE id = $2`,
      [rules, id]
    );

    res.json({ ok: true, message: "Policy updated" });
  } catch (error: any) {
    logger.error("Failed to update policy", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});
