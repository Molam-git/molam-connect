// ============================================================================
// Merchant Dashboard Routes
// ============================================================================

import { Router, Request, Response } from "express";
import {
  getMerchantSummary,
  getTransactions,
  refundTransaction,
  getPayouts,
  getDisputes,
  uploadDisputeEvidence,
  updatePayoutSchedule,
  getAlerts,
} from "../../services/merchantService";
import {
  merchantAuth,
  requireMerchantRole,
  requireMerchantContext,
  require2FA,
} from "../../utils/authz";
import { i18nMiddleware } from "../../utils/i18n";
import { logger } from "../../utils/logger";

export const dashboardRouter = Router();

// Apply auth middleware to all routes
dashboardRouter.use(merchantAuth, requireMerchantContext, i18nMiddleware);

// ============================================================================
// GET /api/merchant/dashboard/summary - KPIs summary
// ============================================================================
dashboardRouter.get(
  "/summary",
  requireMerchantRole(["merchant_admin", "merchant_accountant"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const merchantId = req.user!.merchantId!;
      const period = (req.query.period as string) || "mtd";
      const currency = (req.query.currency as string) || req.user!.currency;

      const summary = await getMerchantSummary(merchantId, period, currency);

      res.json({
        ok: true,
        period,
        currency,
        summary,
      });
    } catch (error: any) {
      logger.error("Failed to get summary", {
        merchant_id: req.user!.merchantId,
        error: error.message,
      });
      res.status(500).json({ error: "server_error", detail: error.message });
    }
  }
);

// ============================================================================
// GET /api/merchant/dashboard/transactions - List transactions
// ============================================================================
dashboardRouter.get(
  "/transactions",
  requireMerchantRole(["merchant_admin", "merchant_accountant", "merchant_support"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const merchantId = req.user!.merchantId!;
      const result = await getTransactions(merchantId, req.query);

      res.json({
        ok: true,
        ...result,
      });
    } catch (error: any) {
      logger.error("Failed to get transactions", {
        merchant_id: req.user!.merchantId,
        error: error.message,
      });
      res.status(500).json({ error: "server_error" });
    }
  }
);

// ============================================================================
// POST /api/merchant/dashboard/refund - Initiate refund
// ============================================================================
dashboardRouter.post(
  "/refund",
  requireMerchantRole(["merchant_admin"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const merchantId = req.user!.merchantId!;
      const { transaction_id, amount, reason, evidence } = req.body;

      if (!transaction_id || !amount || !reason) {
        res.status(400).json({ error: "missing_required_fields" });
        return;
      }

      if (amount <= 0) {
        res.status(400).json({ error: "invalid_amount" });
        return;
      }

      const refund = await refundTransaction(
        merchantId,
        transaction_id,
        amount,
        reason,
        req.user!.id,
        evidence
      );

      res.json({
        ok: true,
        refund,
      });
    } catch (error: any) {
      logger.error("Failed to initiate refund", {
        merchant_id: req.user!.merchantId,
        error: error.message,
      });

      const errorMap: Record<string, number> = {
        transaction_not_found: 404,
        cannot_refund_non_succeeded_txn: 400,
        refund_amount_exceeds_transaction_amount: 400,
        approval_request_failed: 500,
      };

      const statusCode = errorMap[error.message] || 500;
      res.status(statusCode).json({ error: error.message });
    }
  }
);

// ============================================================================
// GET /api/merchant/dashboard/payouts - Get payouts
// ============================================================================
dashboardRouter.get(
  "/payouts",
  requireMerchantRole(["merchant_admin", "merchant_accountant"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const merchantId = req.user!.merchantId!;
      const result = await getPayouts(merchantId, req.query);

      res.json({
        ok: true,
        ...result,
      });
    } catch (error: any) {
      logger.error("Failed to get payouts", {
        merchant_id: req.user!.merchantId,
        error: error.message,
      });
      res.status(500).json({ error: "server_error" });
    }
  }
);

// ============================================================================
// GET /api/merchant/dashboard/disputes - Get disputes
// ============================================================================
dashboardRouter.get(
  "/disputes",
  requireMerchantRole(["merchant_admin", "merchant_support"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const merchantId = req.user!.merchantId!;
      const disputes = await getDisputes(merchantId, req.query);

      res.json({
        ok: true,
        disputes,
      });
    } catch (error: any) {
      logger.error("Failed to get disputes", {
        merchant_id: req.user!.merchantId,
        error: error.message,
      });
      res.status(500).json({ error: "server_error" });
    }
  }
);

// ============================================================================
// POST /api/merchant/dashboard/disputes/:id/evidence - Upload dispute evidence
// ============================================================================
dashboardRouter.post(
  "/disputes/:id/evidence",
  requireMerchantRole(["merchant_admin"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const merchantId = req.user!.merchantId!;
      const { id: disputeId } = req.params;
      const { evidence_urls } = req.body;

      if (!evidence_urls || !Array.isArray(evidence_urls)) {
        res.status(400).json({ error: "invalid_evidence_urls" });
        return;
      }

      await uploadDisputeEvidence(merchantId, disputeId, evidence_urls, req.user!.id);

      res.json({ ok: true });
    } catch (error: any) {
      logger.error("Failed to upload evidence", {
        merchant_id: req.user!.merchantId,
        error: error.message,
      });
      res.status(500).json({ error: "server_error" });
    }
  }
);

// ============================================================================
// PUT /api/merchant/dashboard/settings/payout-schedule - Update payout schedule
// ============================================================================
dashboardRouter.put(
  "/settings/payout-schedule",
  requireMerchantRole(["merchant_admin"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const merchantId = req.user!.merchantId!;
      const { schedule } = req.body;

      if (!schedule) {
        res.status(400).json({ error: "missing_schedule" });
        return;
      }

      await updatePayoutSchedule(merchantId, schedule, req.user!.id);

      res.json({ ok: true });
    } catch (error: any) {
      logger.error("Failed to update payout schedule", {
        merchant_id: req.user!.merchantId,
        error: error.message,
      });

      if (error.message === "invalid_payout_schedule") {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "server_error" });
      }
    }
  }
);

// ============================================================================
// GET /api/merchant/dashboard/alerts - Get active alerts
// ============================================================================
dashboardRouter.get(
  "/alerts",
  requireMerchantRole(["merchant_admin", "merchant_accountant"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const merchantId = req.user!.merchantId!;
      const alerts = await getAlerts(merchantId);

      res.json({
        ok: true,
        alerts,
      });
    } catch (error: any) {
      logger.error("Failed to get alerts", {
        merchant_id: req.user!.merchantId,
        error: error.message,
      });
      res.status(500).json({ error: "server_error" });
    }
  }
);

// ============================================================================
// POST /api/merchant/dashboard/export - Export data as CSV/PDF
// ============================================================================
dashboardRouter.post(
  "/export",
  requireMerchantRole(["merchant_admin", "merchant_accountant"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const merchantId = req.user!.merchantId!;
      const { format, period, type } = req.body;

      if (!format || !["csv", "pdf"].includes(format)) {
        res.status(400).json({ error: "invalid_format" });
        return;
      }

      // TODO: Generate export and upload to S3
      // Return signed URL

      const exportUrl = `https://exports.molam.com/merchants/${merchantId}/export-${Date.now()}.${format}`;

      logger.info("Export generated", {
        merchant_id: merchantId,
        format,
        period,
        type,
      });

      res.json({
        ok: true,
        export_url: exportUrl,
        expires_in: 3600,
      });
    } catch (error: any) {
      logger.error("Failed to generate export", {
        merchant_id: req.user!.merchantId,
        error: error.message,
      });
      res.status(500).json({ error: "server_error" });
    }
  }
);
