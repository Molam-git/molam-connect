// ============================================================================
// Notification Routes
// ============================================================================

import { Router, Request, Response } from "express";
import { verifyToken } from "../services/tokenService";
import { sendApprovalRequestEmail } from "../services/emailService";
import { logger } from "../logger";
import axios from "axios";

export const notificationsRouter = Router();

const APPROVALS_SERVICE_URL = process.env.APPROVALS_SERVICE_URL || "http://approvals-service";

// ============================================================================
// POST /api/notifications/verify-token - Vérifier et utiliser un token email
// ============================================================================
notificationsRouter.post("/verify-token", async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: "token_required" });
      return;
    }

    const ipAddress = (req.headers["x-forwarded-for"] as string) || req.ip;
    const userAgent = req.headers["user-agent"];

    const result = await verifyToken(token, ipAddress, userAgent);

    if (!result.valid) {
      res.status(400).json({
        valid: false,
        error: result.error,
      });
      return;
    }

    // Token valide - soumettre le vote au service d'approbations
    try {
      await axios.post(
        `${APPROVALS_SERVICE_URL}/api/approvals/requests/${result.payload!.approval_request_id}/vote`,
        {
          vote: result.payload!.action === "approve" ? "approve" : "reject",
          comment: `Via email link - ${result.payload!.action}`,
        },
        {
          headers: {
            // Utiliser un token de service interne
            Authorization: `Bearer ${process.env.SERVICE_TOKEN}`,
            "X-On-Behalf-Of": result.payload!.recipient_id,
          },
          timeout: 5000,
        }
      );

      logger.info("Vote submitted via email token", {
        approval_request_id: result.payload!.approval_request_id,
        action: result.payload!.action,
        recipient_id: result.payload!.recipient_id,
      });

      res.json({
        valid: true,
        action: result.payload!.action,
        approval_request_id: result.payload!.approval_request_id,
        message: `Votre ${result.payload!.action === "approve" ? "approbation" : "rejet"} a été enregistré avec succès.`,
      });
    } catch (apiError: any) {
      logger.error("Failed to submit vote to approvals service", {
        error: apiError.message,
      });
      res.status(500).json({
        error: "vote_submission_failed",
        message: "Le token est valide mais la soumission du vote a échoué.",
      });
    }
  } catch (error: any) {
    logger.error("Token verification failed", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// POST /api/notifications/send-approval-request - Envoyer email d'approbation
// ============================================================================
notificationsRouter.post("/send-approval-request", async (req: Request, res: Response): Promise<void> => {
  try {
    const emailData = req.body;

    // Validation basique
    if (!emailData.approval_request_id || !emailData.recipient_email || !emailData.recipient_id) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    await sendApprovalRequestEmail(emailData);

    res.json({
      ok: true,
      message: "Email sent successfully",
    });
  } catch (error: any) {
    logger.error("Failed to send approval request email", { error: error.message });
    res.status(500).json({ error: "email_send_failed" });
  }
});

// ============================================================================
// GET /api/notifications/audit - Récupérer historique des notifications
// ============================================================================
notificationsRouter.get("/audit", async (req: Request, res: Response): Promise<void> => {
  try {
    const { approval_request_id, recipient_id, limit = 50, offset = 0 } = req.query;

    let query = `SELECT * FROM notification_audit WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (approval_request_id) {
      query += ` AND approval_request_id = $${paramIndex++}`;
      params.push(approval_request_id);
    }

    if (recipient_id) {
      query += ` AND recipient_id = $${paramIndex++}`;
      params.push(recipient_id);
    }

    query += ` ORDER BY sent_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const { rows } = await (await import("../db")).pool.query(query, params);

    res.json({ ok: true, notifications: rows });
  } catch (error: any) {
    logger.error("Failed to fetch notification audit", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});
