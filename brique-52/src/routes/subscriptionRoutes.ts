/**
 * Subscription API Routes
 */
import { Router, Response } from "express";
import { AuthRequest, requireRole } from "../utils/authz.js";
import {
  createSubscription,
  changePlan,
  cancelSubscription,
  reactivateSubscription,
} from "../services/subscriptionService.js";
import { pool } from "../utils/db.js";

export const subscriptionRouter = Router();

// Create subscription
subscriptionRouter.post(
  "/subscriptions",
  requireRole("merchant_admin", "connect_dev"),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        idempotency_key,
        merchant_id,
        customer_id,
        plan_id,
        quantity,
        payment_method_id,
        billing_currency,
        trial_days,
      } = req.body;

      if (!idempotency_key || !customer_id || !plan_id) {
        res.status(400).json({
          error: { message: "Missing required fields", type: "validation_error" },
        });
        return;
      }

      // Use merchant_id from JWT if not provided
      const effectiveMerchantId = merchant_id || req.user?.merchantId;
      if (!effectiveMerchantId) {
        res.status(400).json({
          error: { message: "merchant_id required", type: "validation_error" },
        });
        return;
      }

      const subscription = await createSubscription({
        idempotencyKey: idempotency_key,
        merchantId: effectiveMerchantId,
        customerId: customer_id,
        planId: plan_id,
        quantity,
        paymentMethodId: payment_method_id,
        billingCurrency: billing_currency,
        trialDays: trial_days,
      });

      res.status(201).json(subscription);
    } catch (err: any) {
      console.error("Create subscription error:", err);
      res.status(500).json({
        error: { message: err.message || "Failed to create subscription", type: "server_error" },
      });
    }
  }
);

// Get subscription by ID
subscriptionRouter.get("/subscriptions/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [id]);

    if (!rows.length) {
      res.status(404).json({ error: { message: "Subscription not found", type: "not_found" } });
      return;
    }

    const subscription = rows[0];

    // Check authorization
    if (
      subscription.merchant_id !== req.user?.merchantId &&
      !req.user?.roles.includes("pay_admin")
    ) {
      res.status(403).json({ error: { message: "Forbidden", type: "forbidden" } });
      return;
    }

    // Get subscription items
    const { rows: items } = await pool.query(
      `SELECT si.*, p.name as plan_name, p.code as plan_code
       FROM subscription_items si
       JOIN plans p ON p.id = si.plan_id
       WHERE si.subscription_id = $1`,
      [id]
    );

    res.json({ ...subscription, items });
  } catch (err: any) {
    console.error("Get subscription error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to get subscription", type: "server_error" },
    });
  }
});

// Change plan
subscriptionRouter.post(
  "/subscriptions/:id/change_plan",
  requireRole("merchant_admin", "connect_dev"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { idempotency_key, new_plan_id, quantity, effective } = req.body;

      if (!idempotency_key || !new_plan_id) {
        res.status(400).json({
          error: { message: "Missing required fields", type: "validation_error" },
        });
        return;
      }

      // Check authorization
      const { rows } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [id]);
      if (!rows.length) {
        res.status(404).json({ error: { message: "Subscription not found", type: "not_found" } });
        return;
      }

      if (
        rows[0].merchant_id !== req.user?.merchantId &&
        !req.user?.roles.includes("pay_admin")
      ) {
        res.status(403).json({ error: { message: "Forbidden", type: "forbidden" } });
        return;
      }

      const subscription = await changePlan({
        subscriptionId: id,
        newPlanId: new_plan_id,
        quantity,
        effective: effective || "now",
        idempotencyKey: idempotency_key,
      });

      res.json(subscription);
    } catch (err: any) {
      console.error("Change plan error:", err);
      res.status(500).json({
        error: { message: err.message || "Failed to change plan", type: "server_error" },
      });
    }
  }
);

// Cancel subscription
subscriptionRouter.post(
  "/subscriptions/:id/cancel",
  requireRole("merchant_admin", "connect_dev"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { cancel_at_period_end = true } = req.body;

      // Check authorization
      const { rows } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [id]);
      if (!rows.length) {
        res.status(404).json({ error: { message: "Subscription not found", type: "not_found" } });
        return;
      }

      if (
        rows[0].merchant_id !== req.user?.merchantId &&
        !req.user?.roles.includes("pay_admin")
      ) {
        res.status(403).json({ error: { message: "Forbidden", type: "forbidden" } });
        return;
      }

      const subscription = await cancelSubscription(
        id,
        cancel_at_period_end,
        req.user?.id
      );

      res.json(subscription);
    } catch (err: any) {
      console.error("Cancel subscription error:", err);
      res.status(500).json({
        error: { message: err.message || "Failed to cancel subscription", type: "server_error" },
      });
    }
  }
);

// Reactivate subscription
subscriptionRouter.post(
  "/subscriptions/:id/reactivate",
  requireRole("merchant_admin", "connect_dev"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Check authorization
      const { rows } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [id]);
      if (!rows.length) {
        res.status(404).json({ error: { message: "Subscription not found", type: "not_found" } });
        return;
      }

      if (
        rows[0].merchant_id !== req.user?.merchantId &&
        !req.user?.roles.includes("pay_admin")
      ) {
        res.status(403).json({ error: { message: "Forbidden", type: "forbidden" } });
        return;
      }

      const subscription = await reactivateSubscription(id);

      res.json(subscription);
    } catch (err: any) {
      console.error("Reactivate subscription error:", err);
      res.status(500).json({
        error: { message: err.message || "Failed to reactivate subscription", type: "server_error" },
      });
    }
  }
);

// List merchant subscriptions
subscriptionRouter.get("/merchant/:merchantId/subscriptions", async (req: AuthRequest, res: Response) => {
  try {
    const { merchantId } = req.params;
    const { status, limit = "100", offset = "0" } = req.query;

    // Check authorization
    if (merchantId !== req.user?.merchantId && !req.user?.roles.includes("pay_admin")) {
      res.status(403).json({ error: { message: "Forbidden", type: "forbidden" } });
      return;
    }

    let query = "SELECT * FROM subscriptions WHERE merchant_id = $1";
    const params: any[] = [merchantId];

    if (status) {
      query += " AND status = $2";
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const { rows } = await pool.query(query, params);

    res.json({ data: rows, has_more: rows.length === parseInt(limit as string) });
  } catch (err: any) {
    console.error("List subscriptions error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to list subscriptions", type: "server_error" },
    });
  }
});
