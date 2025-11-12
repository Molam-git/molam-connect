/**
 * Plan API Routes
 */
import { Router, Response } from "express";
import { AuthRequest, requireRole } from "../utils/authz.js";
import { pool } from "../utils/db.js";

export const planRouter = Router();

// Create plan
planRouter.post(
  "/plans",
  requireRole("merchant_admin", "pay_admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        merchant_id,
        code,
        name,
        description,
        billing_currency,
        amount,
        interval,
        interval_count = 1,
        trial_period_days = 0,
        proration_behavior = "credit",
        metadata = {},
      } = req.body;

      if (!code || !name || !billing_currency || !amount || !interval) {
        res.status(400).json({
          error: { message: "Missing required fields", type: "validation_error" },
        });
        return;
      }

      const effectiveMerchantId = merchant_id || req.user?.merchantId;
      if (!effectiveMerchantId) {
        res.status(400).json({
          error: { message: "merchant_id required", type: "validation_error" },
        });
        return;
      }

      const { rows } = await pool.query(
        `INSERT INTO plans (
          merchant_id, code, name, description, billing_currency, amount,
          interval, interval_count, trial_period_days, proration_behavior, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          effectiveMerchantId,
          code,
          name,
          description,
          billing_currency,
          amount,
          interval,
          interval_count,
          trial_period_days,
          proration_behavior,
          metadata,
        ]
      );

      res.status(201).json(rows[0]);
    } catch (err: any) {
      console.error("Create plan error:", err);
      res.status(500).json({
        error: { message: err.message || "Failed to create plan", type: "server_error" },
      });
    }
  }
);

// Get plan
planRouter.get("/plans/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query("SELECT * FROM plans WHERE id = $1", [id]);

    if (!rows.length) {
      res.status(404).json({ error: { message: "Plan not found", type: "not_found" } });
      return;
    }

    res.json(rows[0]);
  } catch (err: any) {
    console.error("Get plan error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to get plan", type: "server_error" },
    });
  }
});

// List merchant plans
planRouter.get("/merchant/:merchantId/plans", async (req: AuthRequest, res: Response) => {
  try {
    const { merchantId } = req.params;
    const { active = "true" } = req.query;

    let query = "SELECT * FROM plans WHERE merchant_id = $1";
    const params: any[] = [merchantId];

    if (active === "true") {
      query += " AND active = true";
    }

    query += " ORDER BY created_at DESC";

    const { rows } = await pool.query(query, params);

    res.json({ data: rows });
  } catch (err: any) {
    console.error("List plans error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to list plans", type: "server_error" },
    });
  }
});

// Update plan
planRouter.patch(
  "/plans/:id",
  requireRole("merchant_admin", "pay_admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, active, metadata } = req.body;

      // Check authorization
      const { rows: planRows } = await pool.query("SELECT * FROM plans WHERE id = $1", [id]);
      if (!planRows.length) {
        res.status(404).json({ error: { message: "Plan not found", type: "not_found" } });
        return;
      }

      if (
        planRows[0].merchant_id !== req.user?.merchantId &&
        !req.user?.roles.includes("pay_admin")
      ) {
        res.status(403).json({ error: { message: "Forbidden", type: "forbidden" } });
        return;
      }

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(name);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(description);
      }
      if (active !== undefined) {
        updates.push(`active = $${paramIndex++}`);
        values.push(active);
      }
      if (metadata !== undefined) {
        updates.push(`metadata = $${paramIndex++}`);
        values.push(metadata);
      }

      if (updates.length === 0) {
        res.status(400).json({ error: { message: "No fields to update", type: "validation_error" } });
        return;
      }

      updates.push(`updated_at = now()`);
      values.push(id);

      const query = `UPDATE plans SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`;

      const { rows } = await pool.query(query, values);

      res.json(rows[0]);
    } catch (err: any) {
      console.error("Update plan error:", err);
      res.status(500).json({
        error: { message: err.message || "Failed to update plan", type: "server_error" },
      });
    }
  }
);
