/**
 * Payment Method API Routes
 */
import { Router, Response } from "express";
import { AuthRequest, requireRole } from "../utils/authz.js";
import {
  createPaymentMethod,
  getPaymentMethod,
  listPaymentMethods,
  deletePaymentMethod,
} from "../services/paymentMethodService.js";

export const paymentMethodRouter = Router();

// Create payment method
paymentMethodRouter.post(
  "/payment_methods",
  requireRole("merchant_admin", "connect_dev", "user"),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        customer_id,
        merchant_id,
        type,
        provider,
        token,
        last4,
        brand,
        exp_month,
        exp_year,
        sepa_mandate_ref,
        sepa_mandate_pdf_s3,
        is_default,
      } = req.body;

      if (!customer_id || !type || !provider || !token) {
        res.status(400).json({
          error: { message: "Missing required fields", type: "validation_error" },
        });
        return;
      }

      const paymentMethod = await createPaymentMethod({
        customerId: customer_id,
        merchantId: merchant_id,
        type,
        provider,
        token,
        last4,
        brand,
        expMonth: exp_month,
        expYear: exp_year,
        sepaMandateRef: sepa_mandate_ref,
        sepaMandatePdfS3: sepa_mandate_pdf_s3,
        isDefault: is_default,
      });

      res.status(201).json(paymentMethod);
    } catch (err: any) {
      console.error("Create payment method error:", err);
      res.status(500).json({
        error: { message: err.message || "Failed to create payment method", type: "server_error" },
      });
    }
  }
);

// Get payment method
paymentMethodRouter.get("/payment_methods/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const paymentMethod = await getPaymentMethod(id);

    if (!paymentMethod) {
      res.status(404).json({ error: { message: "Payment method not found", type: "not_found" } });
      return;
    }

    res.json(paymentMethod);
  } catch (err: any) {
    console.error("Get payment method error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to get payment method", type: "server_error" },
    });
  }
});

// List customer payment methods
paymentMethodRouter.get(
  "/customers/:customerId/payment_methods",
  async (req: AuthRequest, res: Response) => {
    try {
      const { customerId } = req.params;

      const paymentMethods = await listPaymentMethods(customerId);

      res.json({ data: paymentMethods });
    } catch (err: any) {
      console.error("List payment methods error:", err);
      res.status(500).json({
        error: { message: err.message || "Failed to list payment methods", type: "server_error" },
      });
    }
  }
);

// Delete payment method
paymentMethodRouter.delete(
  "/payment_methods/:id",
  requireRole("merchant_admin", "connect_dev", "user"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      await deletePaymentMethod(id);

      res.json({ deleted: true, id });
    } catch (err: any) {
      console.error("Delete payment method error:", err);
      res.status(500).json({
        error: { message: err.message || "Failed to delete payment method", type: "server_error" },
      });
    }
  }
);
