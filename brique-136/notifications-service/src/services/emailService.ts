// ============================================================================
// Email Service - Envoi d'emails avec Nodemailer
// ============================================================================

import nodemailer from "nodemailer";
import Handlebars from "handlebars";
import fs from "fs";
import path from "path";
import { pool } from "../db";
import { logger } from "../logger";
import { generateSignedToken } from "./tokenService";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.molam.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "no-reply@molam.com";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "Molam Pay Ops <no-reply@molam.com>";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://ops.molam.com/approvals";

// Create transporter
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// Precompile templates
const templatesDir = path.join(__dirname, "../templates");
const templates: { [key: string]: HandlebarsTemplateDelegate } = {};

function loadTemplates() {
  try {
    const approvalRequestTemplate = fs.readFileSync(
      path.join(templatesDir, "approval_request.html"),
      "utf8"
    );
    templates["approval_request"] = Handlebars.compile(approvalRequestTemplate);

    const expiryWarningTemplate = fs.readFileSync(
      path.join(templatesDir, "expiry_warning.html"),
      "utf8"
    );
    templates["expiry_warning"] = Handlebars.compile(expiryWarningTemplate);

    const approvalDecisionTemplate = fs.readFileSync(
      path.join(templatesDir, "approval_decision.html"),
      "utf8"
    );
    templates["approval_decision"] = Handlebars.compile(approvalDecisionTemplate);

    logger.info("Email templates loaded successfully");
  } catch (error: any) {
    logger.error("Failed to load email templates", { error: error.message });
  }
}

// Load templates on startup
loadTemplates();

export interface ApprovalRequestEmailData {
  approval_request_id: string;
  ops_log_id: string;
  action_type: string;
  description: string;
  amount?: number;
  currency?: string;
  quorum: number;
  recipient_id: string;
  recipient_email: string;
  recipient_name?: string;
  expires_at: string;
}

/**
 * Envoyer email de demande d'approbation avec liens signés
 */
export async function sendApprovalRequestEmail(
  data: ApprovalRequestEmailData
): Promise<void> {
  try {
    // Generate signed tokens
    const approveTokenData = await generateSignedToken(
      data.approval_request_id,
      "approve",
      data.recipient_id,
      data.recipient_email
    );

    const rejectTokenData = await generateSignedToken(
      data.approval_request_id,
      "reject",
      data.recipient_id,
      data.recipient_email
    );

    const approveUrl = `${FRONTEND_URL}?token=${approveTokenData.token}`;
    const rejectUrl = `${FRONTEND_URL}?token=${rejectTokenData.token}`;

    // Render template
    const html = templates["approval_request"]({
      recipient_name: data.recipient_name || "Ops Team",
      action_type: data.action_type,
      description: data.description,
      amount: data.amount ? formatCurrency(data.amount, data.currency) : null,
      quorum: data.quorum,
      approve_url: approveUrl,
      reject_url: rejectUrl,
      expires_at: formatDateTime(data.expires_at),
      approval_request_id: data.approval_request_id,
    });

    // Send email
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: data.recipient_email,
      subject: `[Molam Ops] Approbation requise — ${data.action_type}`,
      html,
    });

    // Log notification
    await pool.query(
      `INSERT INTO notification_audit(approval_request_id, recipient_email, recipient_id, recipient_role, notification_type, template_used, metadata, smtp_message_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        data.approval_request_id,
        data.recipient_email,
        data.recipient_id,
        "unknown", // Role will be filled by caller
        "approval_request",
        "approval_request",
        JSON.stringify({ ops_log_id: data.ops_log_id }),
        info.messageId,
        "sent",
      ]
    );

    logger.info("Approval request email sent", {
      approval_request_id: data.approval_request_id,
      recipient: data.recipient_email,
      message_id: info.messageId,
    });
  } catch (error: any) {
    logger.error("Failed to send approval request email", {
      approval_request_id: data.approval_request_id,
      recipient: data.recipient_email,
      error: error.message,
    });

    // Log failure
    await pool.query(
      `INSERT INTO notification_audit(approval_request_id, recipient_email, recipient_id, recipient_role, notification_type, template_used, status, error_details)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        data.approval_request_id,
        data.recipient_email,
        data.recipient_id,
        "unknown",
        "approval_request",
        "approval_request",
        "failed",
        error.message,
      ]
    );

    throw error;
  }
}

/**
 * Envoyer avertissement d'expiration
 */
export async function sendExpiryWarningEmail(
  approvalRequestId: string,
  recipientEmail: string,
  recipientId: string,
  expiresAt: string
): Promise<void> {
  try {
    const html = templates["expiry_warning"]({
      approval_request_id: approvalRequestId,
      expires_at: formatDateTime(expiresAt),
      approval_url: `${FRONTEND_URL}/${approvalRequestId}`,
    });

    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: recipientEmail,
      subject: "[Molam Ops] ⚠️ Approbation expire bientôt",
      html,
    });

    await pool.query(
      `INSERT INTO notification_audit(approval_request_id, recipient_email, recipient_id, recipient_role, notification_type, template_used, smtp_message_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
      [approvalRequestId, recipientEmail, recipientId, "unknown", "expiry_warning", "expiry_warning", info.messageId, "sent"]
    );

    logger.info("Expiry warning email sent", {
      approval_request_id: approvalRequestId,
      recipient: recipientEmail,
    });
  } catch (error: any) {
    logger.error("Failed to send expiry warning email", {
      error: error.message,
    });
  }
}

function formatCurrency(amount: number, currency?: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency || "XOF",
  }).format(amount);
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  });
}
