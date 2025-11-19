// ============================================================================
// Push Notification Service - Envoi de push vers app mobile Ops
// ============================================================================

import axios from "axios";
import { pool } from "../db";
import { logger } from "../logger";
import { generateSignedToken } from "./tokenService";

const PUSH_API_URL = process.env.PUSH_API_URL || "https://ops.molam.com/api/push";
const PUSH_API_KEY = process.env.PUSH_API_KEY || "";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://ops.molam.com/approvals";

export interface PushApprovalData {
  approval_request_id: string;
  ops_log_id: string;
  action_type: string;
  description: string;
  amount?: number;
  currency?: string;
  recipient_id: string;
  recipient_device_tokens: string[]; // Multiple devices per user
  expires_at: string;
}

/**
 * Envoyer notification push interactive
 */
export async function sendPushApprovalNotification(
  data: PushApprovalData
): Promise<void> {
  try {
    // Generate signed tokens
    const approveTokenData = await generateSignedToken(
      data.approval_request_id,
      "approve",
      data.recipient_id,
      data.recipient_id // Use user ID as email placeholder
    );

    const rejectTokenData = await generateSignedToken(
      data.approval_request_id,
      "reject",
      data.recipient_id,
      data.recipient_id
    );

    const approveUrl = `${FRONTEND_URL}?token=${approveTokenData.token}`;
    const rejectUrl = `${FRONTEND_URL}?token=${rejectTokenData.token}`;

    // Build push notification payload
    const payload = {
      user_id: data.recipient_id,
      device_tokens: data.recipient_device_tokens,
      notification: {
        title: "🔐 Approbation Requise",
        body: `${data.action_type}: ${data.description}`,
        badge: 1,
        sound: "default",
        priority: "high",
        category: "APPROVAL_REQUEST",
      },
      data: {
        type: "approval_request",
        approval_request_id: data.approval_request_id,
        ops_log_id: data.ops_log_id,
        action_type: data.action_type,
        amount: data.amount,
        currency: data.currency,
        expires_at: data.expires_at,
      },
      actions: [
        {
          id: "approve",
          title: "✅ Approuver",
          url: approveUrl,
          destructive: false,
        },
        {
          id: "reject",
          title: "❌ Rejeter",
          url: rejectUrl,
          destructive: true,
        },
      ],
    };

    // Send to push API
    const response = await axios.post(PUSH_API_URL, payload, {
      headers: {
        "X-API-Key": PUSH_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 5000,
    });

    const pushNotificationId = response.data.notification_id;

    // Log notification
    await pool.query(
      `INSERT INTO notification_audit(approval_request_id, recipient_email, recipient_id, recipient_role, notification_type, template_used, metadata, push_notification_id, status, channel)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        data.approval_request_id,
        data.recipient_id, // Store user ID
        data.recipient_id,
        "unknown",
        "approval_request",
        "push_interactive",
        JSON.stringify({
          ops_log_id: data.ops_log_id,
          device_count: data.recipient_device_tokens.length,
        }),
        pushNotificationId,
        "sent",
        "push",
      ]
    );

    // Log delivery for each device
    for (const deviceToken of data.recipient_device_tokens) {
      await pool.query(
        `INSERT INTO channel_delivery_log(approval_request_id, recipient_id, channel, status, provider_message_id)
         VALUES($1, $2, $3, $4, $5)`,
        [
          data.approval_request_id,
          data.recipient_id,
          "push",
          "sent",
          `${pushNotificationId}-${deviceToken.slice(0, 8)}`,
        ]
      );
    }

    logger.info("Push approval notification sent", {
      approval_request_id: data.approval_request_id,
      recipient_id: data.recipient_id,
      device_count: data.recipient_device_tokens.length,
      notification_id: pushNotificationId,
    });
  } catch (error: any) {
    logger.error("Failed to send push notification", {
      approval_request_id: data.approval_request_id,
      recipient_id: data.recipient_id,
      error: error.message,
    });

    // Log failure
    await pool.query(
      `INSERT INTO notification_audit(approval_request_id, recipient_email, recipient_id, recipient_role, notification_type, template_used, status, error_details, channel)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        data.approval_request_id,
        data.recipient_id,
        data.recipient_id,
        "unknown",
        "approval_request",
        "push_interactive",
        "failed",
        error.message,
        "push",
      ]
    );

    await pool.query(
      `INSERT INTO channel_delivery_log(approval_request_id, recipient_id, channel, status, error_details)
       VALUES($1, $2, $3, $4, $5)`,
      [data.approval_request_id, data.recipient_id, "push", "failed", error.message]
    );

    throw error;
  }
}

/**
 * Récupérer device tokens pour un utilisateur
 */
export async function getUserDeviceTokens(userId: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT identifier FROM user_channel_identifiers
     WHERE user_id = $1 AND channel = 'push' AND enabled = true`,
    [userId]
  );

  return rows.map((r) => r.identifier);
}
