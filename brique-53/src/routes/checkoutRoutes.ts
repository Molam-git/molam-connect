/**
 * Checkout API Routes
 */
import { Router, Response } from "express";
import { AuthRequest, requireRole } from "../utils/authz.js";
import {
  createCheckoutSession,
  getCheckoutSession,
  completeCheckoutSession,
  failCheckoutSession,
  logCheckoutEvent,
} from "../services/checkoutService.js";
import { pool } from "../utils/db.js";

export const checkoutRouter = Router();

const CHECKOUT_HOST = process.env.CHECKOUT_HOST || "http://localhost:8053";

// Create checkout session
checkoutRouter.post(
  "/checkout/session",
  requireRole("merchant_admin", "connect_dev"),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        idempotency_key,
        merchant_id,
        customer_id,
        plan_id,
        return_url,
        cancel_url,
        success_url,
        locale,
        metadata,
      } = req.body;

      if (!idempotency_key || !plan_id) {
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

      const session = await createCheckoutSession({
        idempotencyKey: idempotency_key,
        merchantId: effectiveMerchantId,
        customerId: customer_id,
        planId: plan_id,
        returnUrl: return_url,
        cancelUrl: cancel_url,
        successUrl: success_url,
        locale,
        metadata,
      });

      const checkoutUrl = `${CHECKOUT_HOST}/checkout/${session.id}`;

      res.status(201).json({
        session_id: session.id,
        url: checkoutUrl,
        expires_at: session.expires_at,
      });
    } catch (err: any) {
      console.error("Create checkout session error:", err);
      res.status(500).json({
        error: { message: err.message || "Failed to create session", type: "server_error" },
      });
    }
  }
);

// Get checkout session
checkoutRouter.get("/checkout/session/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const session = await getCheckoutSession(id);

    if (!session) {
      res.status(404).json({ error: { message: "Session not found", type: "not_found" } });
      return;
    }

    res.json(session);
  } catch (err: any) {
    console.error("Get checkout session error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to get session", type: "server_error" },
    });
  }
});

// Complete session (internal - called from payment processor)
checkoutRouter.post("/checkout/session/:id/complete", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { payment_method_id, subscription_id } = req.body;

    if (!payment_method_id || !subscription_id) {
      res.status(400).json({
        error: { message: "Missing payment_method_id or subscription_id", type: "validation_error" },
      });
      return;
    }

    const session = await completeCheckoutSession(id, payment_method_id, subscription_id);

    res.json(session);
  } catch (err: any) {
    console.error("Complete checkout session error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to complete session", type: "server_error" },
    });
  }
});

// Fail session (internal - called from payment processor)
checkoutRouter.post("/checkout/session/:id/fail", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const session = await failCheckoutSession(id, reason || "payment_declined");

    res.json(session);
  } catch (err: any) {
    console.error("Fail checkout session error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to fail session", type: "server_error" },
    });
  }
});

// Log event (for analytics)
checkoutRouter.post("/checkout/session/:id/event", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { event_type, event_data } = req.body;

    const userAgent = req.headers["user-agent"] as string;
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.socket.remoteAddress ||
      "";

    await logCheckoutEvent(id, event_type, event_data, userAgent, ipAddress);

    res.json({ logged: true });
  } catch (err: any) {
    console.error("Log checkout event error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to log event", type: "server_error" },
    });
  }
});

// Get merchant branding
checkoutRouter.get("/checkout/branding/:merchantId", async (req: AuthRequest, res: Response) => {
  try {
    const { merchantId } = req.params;

    const { rows } = await pool.query(
      "SELECT * FROM merchant_branding WHERE merchant_id = $1",
      [merchantId]
    );

    if (!rows.length) {
      // Return default branding
      res.json({
        logo_url: process.env.DEFAULT_LOGO_URL,
        brand_color: process.env.DEFAULT_BRAND_COLOR,
        business_name: "Molam Connect",
        enabled_payment_methods: ["card", "sepa_debit", "wallet"],
      });
      return;
    }

    res.json(rows[0]);
  } catch (err: any) {
    console.error("Get merchant branding error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to get branding", type: "server_error" },
    });
  }
});

// Update merchant branding
checkoutRouter.patch(
  "/checkout/branding/:merchantId",
  requireRole("merchant_admin", "pay_admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const {
        logo_url,
        brand_color,
        business_name,
        support_email,
        support_phone,
        terms_url,
        privacy_url,
        locale_texts,
        enabled_payment_methods,
      } = req.body;

      // Check authorization
      if (merchantId !== req.user?.merchantId && !req.user?.roles.includes("pay_admin")) {
        res.status(403).json({ error: { message: "Forbidden", type: "forbidden" } });
        return;
      }

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (logo_url !== undefined) {
        updates.push(`logo_url = $${paramIndex++}`);
        values.push(logo_url);
      }
      if (brand_color !== undefined) {
        updates.push(`brand_color = $${paramIndex++}`);
        values.push(brand_color);
      }
      if (business_name !== undefined) {
        updates.push(`business_name = $${paramIndex++}`);
        values.push(business_name);
      }
      if (support_email !== undefined) {
        updates.push(`support_email = $${paramIndex++}`);
        values.push(support_email);
      }
      if (support_phone !== undefined) {
        updates.push(`support_phone = $${paramIndex++}`);
        values.push(support_phone);
      }
      if (terms_url !== undefined) {
        updates.push(`terms_url = $${paramIndex++}`);
        values.push(terms_url);
      }
      if (privacy_url !== undefined) {
        updates.push(`privacy_url = $${paramIndex++}`);
        values.push(privacy_url);
      }
      if (locale_texts !== undefined) {
        updates.push(`locale_texts = $${paramIndex++}`);
        values.push(locale_texts);
      }
      if (enabled_payment_methods !== undefined) {
        updates.push(`enabled_payment_methods = $${paramIndex++}`);
        values.push(enabled_payment_methods);
      }

      if (updates.length === 0) {
        res.status(400).json({ error: { message: "No fields to update", type: "validation_error" } });
        return;
      }

      updates.push(`updated_at = now()`);
      values.push(merchantId);

      // Upsert
      const { rows } = await pool.query(
        `INSERT INTO merchant_branding (merchant_id) VALUES ($${paramIndex})
         ON CONFLICT (merchant_id) DO UPDATE SET ${updates.join(", ")}
         RETURNING *`,
        values
      );

      res.json(rows[0]);
    } catch (err: any) {
      console.error("Update merchant branding error:", err);
      res.status(500).json({
        error: { message: err.message || "Failed to update branding", type: "server_error" },
      });
    }
  }
);
