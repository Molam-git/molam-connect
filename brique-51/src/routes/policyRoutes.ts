/**
 * Brique 51bis - Merchant Refund Policies & Zones
 * Policy API Routes
 */

import { Router, Request, Response } from "express";
import { requireRole } from "../utils/authz.js";
import {
  listPolicies,
  createPolicy,
  updatePolicy,
  PolicyConfig,
} from "../services/policy/policyService.js";
import { pool } from "../utils/db.js";

export const policyRouter = Router();

/**
 * List policies
 * GET /api/policies?scope=global&scopeId=uuid&status=active
 */
policyRouter.get("/policies", requireRole("finance_ops", "pay_admin", "merchant_admin"), async (req: any, res: Response) => {
  try {
    const filters = {
      scope: req.query.scope as string,
      scopeId: req.query.scope_id as string,
      status: req.query.status as string,
    };

    // Merchants can only see their own policies
    if (req.user.roles.includes("merchant_admin") && !req.user.roles.includes("pay_admin")) {
      filters.scope = "merchant";
      filters.scopeId = req.user.merchantId;
    }

    const policies = await listPolicies(filters);
    res.json(policies);
  } catch (e: any) {
    console.error("List policies error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Get policy by ID
 * GET /api/policies/:id
 */
policyRouter.get("/policies/:id", requireRole("finance_ops", "pay_admin", "merchant_admin"), async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM refund_policies_v2 WHERE id = $1`, [req.params.id]);

    if (!rows[0]) {
      res.status(404).json({ error: "policy_not_found" });
      return;
    }

    const policy = rows[0];

    // Merchants can only see their own policies
    if (req.user.roles.includes("merchant_admin") && !req.user.roles.includes("pay_admin")) {
      if (policy.scope !== "merchant" || policy.scope_id !== req.user.merchantId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
    }

    res.json(policy);
  } catch (e: any) {
    console.error("Get policy error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Create policy
 * POST /api/policies
 */
policyRouter.post("/policies", requireRole("finance_ops", "pay_admin", "merchant_admin"), async (req: any, res: Response) => {
  try {
    const { scope, scope_id, name, description, config } = req.body;

    // Validation
    if (!scope || !name || !config) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    // Authorization checks
    if (req.user.roles.includes("merchant_admin") && !req.user.roles.includes("pay_admin")) {
      // Merchants can only create merchant or sub_account policies
      if (scope !== "merchant" && scope !== "sub_account") {
        res.status(403).json({ error: "forbidden", message: "Merchants can only create merchant or sub_account policies" });
        return;
      }

      // Merchants can only create policies for their own merchant
      if (scope === "merchant" && scope_id !== req.user.merchantId) {
        res.status(403).json({ error: "forbidden", message: "Can only create policies for your own merchant" });
        return;
      }
    }

    const policy = await createPolicy({
      scope,
      scopeId: scope_id,
      name,
      description,
      config: config as PolicyConfig,
      createdBy: req.user.id,
    });

    res.json(policy);
  } catch (e: any) {
    console.error("Create policy error:", e);
    res.status(400).json({ error: e.message });
  }
});

/**
 * Update policy
 * PUT /api/policies/:id
 */
policyRouter.put("/policies/:id", requireRole("finance_ops", "pay_admin", "merchant_admin"), async (req: any, res: Response) => {
  try {
    const { name, description, config, status } = req.body;

    // Check policy ownership for merchants
    if (req.user.roles.includes("merchant_admin") && !req.user.roles.includes("pay_admin")) {
      const { rows } = await pool.query(`SELECT * FROM refund_policies_v2 WHERE id = $1`, [req.params.id]);

      if (!rows[0]) {
        res.status(404).json({ error: "policy_not_found" });
        return;
      }

      const policy = rows[0];

      if (policy.scope !== "merchant" || policy.scope_id !== req.user.merchantId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
    }

    const updated = await updatePolicy(
      req.params.id,
      { name, description, config, status },
      req.user.id
    );

    res.json(updated);
  } catch (e: any) {
    console.error("Update policy error:", e);
    res.status(400).json({ error: e.message });
  }
});

/**
 * Get policy history
 * GET /api/policies/:id/history
 */
policyRouter.get("/policies/:id/history", requireRole("finance_ops", "pay_admin", "auditor"), async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM refund_policy_history
       WHERE policy_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.params.id]
    );

    res.json(rows);
  } catch (e: any) {
    console.error("Get policy history error:", e);
    res.status(500).json({ error: e.message });
  }
});
