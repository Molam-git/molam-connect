// ============================================================================
// Slack Service - Envoi de notifications Slack interactives
// ============================================================================

import axios from "axios";
import { pool } from "../db";
import { logger } from "../logger";
import { generateSignedToken } from "./tokenService";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://ops.molam.com/approvals";

export interface SlackApprovalData {
  approval_request_id: string;
  ops_log_id: string;
  action_type: string;
  description: string;
  amount?: number;
  currency?: string;
  recipient_id: string;
  recipient_slack_user_id: string;
  expires_at: string;
  channel?: string;
}

/**
 * Envoyer notification Slack interactive avec boutons
 */
export async function sendSlackApprovalNotification(
  data: SlackApprovalData
): Promise<void> {
  try {
    // Generate signed tokens
    const approveTokenData = await generateSignedToken(
      data.approval_request_id,
      "approve",
      data.recipient_id,
      data.recipient_slack_user_id
    );

    const rejectTokenData = await generateSignedToken(
      data.approval_request_id,
      "reject",
      data.recipient_id,
      data.recipient_slack_user_id
    );

    const approveUrl = `${FRONTEND_URL}?token=${approveTokenData.token}`;
    const rejectUrl = `${FRONTEND_URL}?token=${rejectTokenData.token}`;

    // Build Slack message with Block Kit
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🔐 Approbation Requise",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Action :* ${data.action_type}\n*Description :* ${data.description}`,
        },
      },
    ];

    if (data.amount) {
      blocks.push({
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Montant :*\n${formatCurrency(data.amount, data.currency)}`,
          },
          {
            type: "mrkdwn",
            text: `*ID Demande :*\n\`${data.approval_request_id.slice(0, 8)}...\``,
          },
        ],
      } as any);
    }

    blocks.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `⚠️ *Expire le:* ${formatDateTime(data.expires_at)}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "✅ Approuver",
              emoji: true,
            },
            style: "primary",
            url: approveUrl,
            value: "approve",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "❌ Rejeter",
              emoji: true,
            },
            style: "danger",
            url: rejectUrl,
            value: "reject",
          },
        ],
      }
    );

    // Send via webhook or API
    let messageTs: string | undefined;

    if (SLACK_BOT_TOKEN) {
      // Use chat.postMessage API for better tracking
      const response = await axios.post(
        "https://slack.com/api/chat.postMessage",
        {
          channel: data.channel || data.recipient_slack_user_id, // DM or channel
          blocks,
          text: `Approbation requise: ${data.action_type}`, // Fallback text
        },
        {
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.data.ok) {
        throw new Error(`Slack API error: ${response.data.error}`);
      }

      messageTs = response.data.ts;
    } else if (SLACK_WEBHOOK_URL) {
      // Fallback to webhook
      await axios.post(SLACK_WEBHOOK_URL, {
        blocks,
        text: `Approbation requise: ${data.action_type}`,
      });
    } else {
      throw new Error("Slack not configured (missing WEBHOOK_URL or BOT_TOKEN)");
    }

    // Log notification
    await pool.query(
      `INSERT INTO notification_audit(approval_request_id, recipient_email, recipient_id, recipient_role, notification_type, template_used, metadata, slack_message_ts, status, channel)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        data.approval_request_id,
        data.recipient_slack_user_id, // Store Slack user ID in email field
        data.recipient_id,
        "unknown",
        "approval_request",
        "slack_interactive",
        JSON.stringify({ ops_log_id: data.ops_log_id, channel: data.channel }),
        messageTs,
        "sent",
        "slack",
      ]
    );

    // Log delivery
    await pool.query(
      `INSERT INTO channel_delivery_log(approval_request_id, recipient_id, channel, status, provider_message_id)
       VALUES($1, $2, $3, $4, $5)`,
      [data.approval_request_id, data.recipient_id, "slack", "sent", messageTs]
    );

    logger.info("Slack approval notification sent", {
      approval_request_id: data.approval_request_id,
      recipient_slack_user_id: data.recipient_slack_user_id,
      message_ts: messageTs,
    });
  } catch (error: any) {
    logger.error("Failed to send Slack notification", {
      approval_request_id: data.approval_request_id,
      error: error.message,
    });

    // Log failure
    await pool.query(
      `INSERT INTO notification_audit(approval_request_id, recipient_email, recipient_id, recipient_role, notification_type, template_used, status, error_details, channel)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        data.approval_request_id,
        data.recipient_slack_user_id,
        data.recipient_id,
        "unknown",
        "approval_request",
        "slack_interactive",
        "failed",
        error.message,
        "slack",
      ]
    );

    await pool.query(
      `INSERT INTO channel_delivery_log(approval_request_id, recipient_id, channel, status, error_details)
       VALUES($1, $2, $3, $4, $5)`,
      [data.approval_request_id, data.recipient_id, "slack", "failed", error.message]
    );

    throw error;
  }
}

/**
 * Update Slack message when approval is decided
 */
export async function updateSlackMessage(
  messageTs: string,
  channel: string,
  decision: "approved" | "rejected"
): Promise<void> {
  if (!SLACK_BOT_TOKEN) {
    logger.warn("Cannot update Slack message: BOT_TOKEN not configured");
    return;
  }

  try {
    const emoji = decision === "approved" ? "✅" : "❌";
    const text = decision === "approved" ? "Approuvé" : "Rejeté";

    await axios.post(
      "https://slack.com/api/chat.update",
      {
        channel,
        ts: messageTs,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} *${text}*`,
            },
          },
        ],
        text: `Décision: ${text}`,
      },
      {
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    logger.info("Slack message updated", { message_ts: messageTs, decision });
  } catch (error: any) {
    logger.error("Failed to update Slack message", {
      error: error.message,
      message_ts: messageTs,
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
    dateStyle: "short",
    timeStyle: "short",
  });
}
