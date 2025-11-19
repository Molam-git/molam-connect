// ============================================================================
// Multi-Channel Orchestrator - Stratégie de distribution et fallback
// ============================================================================

import { pool } from "../db";
import { logger } from "../logger";
import { sendApprovalRequestEmail } from "./emailService";
import { sendSlackApprovalNotification } from "./slackService";
import { sendPushApprovalNotification, getUserDeviceTokens } from "./pushService";

export interface MultiChannelApprovalData {
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
  recipient_slack_user_id?: string;
  expires_at: string;
}

/**
 * Envoyer notification sur tous les canaux selon préférences utilisateur
 */
export async function sendMultiChannelApproval(
  data: MultiChannelApprovalData
): Promise<{
  success: boolean;
  channels_sent: string[];
  channels_failed: string[];
}> {
  const channelsSent: string[] = [];
  const channelsFailed: string[] = [];

  try {
    // Récupérer préférences utilisateur
    const { rows: prefs } = await pool.query(
      `SELECT * FROM notification_preferences WHERE user_id = $1 LIMIT 1`,
      [data.recipient_id]
    );

    const preferences = prefs[0] || {
      email_enabled: true,
      sms_enabled: false,
      push_enabled: true,
      channel_priority: ["push", "email", "slack"],
      fallback_enabled: true,
    };

    // Récupérer identifiants des canaux
    const { rows: channelIds } = await pool.query(
      `SELECT channel, identifier, verified FROM user_channel_identifiers
       WHERE user_id = $1 AND enabled = true`,
      [data.recipient_id]
    );

    const channelMap = new Map(
      channelIds.map((c) => [c.channel, { identifier: c.identifier, verified: c.verified }])
    );

    // Envoyer selon priorité
    const priority: string[] = preferences.channel_priority || ["push", "email", "slack"];

    for (const channel of priority) {
      try {
        switch (channel) {
          case "email":
            if (preferences.email_enabled && data.recipient_email) {
              await sendApprovalRequestEmail({
                approval_request_id: data.approval_request_id,
                ops_log_id: data.ops_log_id,
                action_type: data.action_type,
                description: data.description,
                amount: data.amount,
                currency: data.currency,
                quorum: data.quorum,
                recipient_id: data.recipient_id,
                recipient_email: data.recipient_email,
                recipient_name: data.recipient_name,
                expires_at: data.expires_at,
              });
              channelsSent.push("email");
            }
            break;

          case "slack":
            const slackUserId = data.recipient_slack_user_id || channelMap.get("slack")?.identifier;
            if (slackUserId) {
              await sendSlackApprovalNotification({
                approval_request_id: data.approval_request_id,
                ops_log_id: data.ops_log_id,
                action_type: data.action_type,
                description: data.description,
                amount: data.amount,
                currency: data.currency,
                recipient_id: data.recipient_id,
                recipient_slack_user_id: slackUserId,
                expires_at: data.expires_at,
              });
              channelsSent.push("slack");
            }
            break;

          case "push":
            if (preferences.push_enabled) {
              const deviceTokens = await getUserDeviceTokens(data.recipient_id);
              if (deviceTokens.length > 0) {
                await sendPushApprovalNotification({
                  approval_request_id: data.approval_request_id,
                  ops_log_id: data.ops_log_id,
                  action_type: data.action_type,
                  description: data.description,
                  amount: data.amount,
                  currency: data.currency,
                  recipient_id: data.recipient_id,
                  recipient_device_tokens: deviceTokens,
                  expires_at: data.expires_at,
                });
                channelsSent.push("push");
              }
            }
            break;
        }
      } catch (error: any) {
        logger.error(`Failed to send via ${channel}`, {
          approval_request_id: data.approval_request_id,
          channel,
          error: error.message,
        });
        channelsFailed.push(channel);

        // Fallback au canal suivant si activé
        if (!preferences.fallback_enabled) {
          break; // Stop trying other channels
        }
      }
    }

    // Si aucun canal n'a fonctionné, lever une erreur
    if (channelsSent.length === 0) {
      throw new Error("All notification channels failed");
    }

    logger.info("Multi-channel approval sent", {
      approval_request_id: data.approval_request_id,
      recipient_id: data.recipient_id,
      channels_sent: channelsSent,
      channels_failed: channelsFailed,
    });

    return {
      success: true,
      channels_sent: channelsSent,
      channels_failed: channelsFailed,
    };
  } catch (error: any) {
    logger.error("Multi-channel approval failed completely", {
      approval_request_id: data.approval_request_id,
      recipient_id: data.recipient_id,
      error: error.message,
    });

    return {
      success: false,
      channels_sent: channelsSent,
      channels_failed: channelsFailed,
    };
  }
}

/**
 * Envoyer notification sur le canal primaire uniquement (rapide)
 */
export async function sendPrimaryChannelApproval(
  data: MultiChannelApprovalData
): Promise<{ success: boolean; channel: string }> {
  try {
    // Récupérer canal primaire
    const { rows } = await pool.query(
      `SELECT channel, identifier FROM user_channel_identifiers
       WHERE user_id = $1 AND primary_channel = true AND enabled = true
       LIMIT 1`,
      [data.recipient_id]
    );

    if (rows.length === 0) {
      // Fallback to email
      await sendApprovalRequestEmail({
        approval_request_id: data.approval_request_id,
        ops_log_id: data.ops_log_id,
        action_type: data.action_type,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        quorum: data.quorum,
        recipient_id: data.recipient_id,
        recipient_email: data.recipient_email,
        recipient_name: data.recipient_name,
        expires_at: data.expires_at,
      });
      return { success: true, channel: "email" };
    }

    const primaryChannel = rows[0].channel;

    switch (primaryChannel) {
      case "email":
        await sendApprovalRequestEmail({
          approval_request_id: data.approval_request_id,
          ops_log_id: data.ops_log_id,
          action_type: data.action_type,
          description: data.description,
          amount: data.amount,
          currency: data.currency,
          quorum: data.quorum,
          recipient_id: data.recipient_id,
          recipient_email: data.recipient_email,
          recipient_name: data.recipient_name,
          expires_at: data.expires_at,
        });
        break;

      case "slack":
        await sendSlackApprovalNotification({
          approval_request_id: data.approval_request_id,
          ops_log_id: data.ops_log_id,
          action_type: data.action_type,
          description: data.description,
          amount: data.amount,
          currency: data.currency,
          recipient_id: data.recipient_id,
          recipient_slack_user_id: rows[0].identifier,
          expires_at: data.expires_at,
        });
        break;

      case "push":
        const deviceTokens = await getUserDeviceTokens(data.recipient_id);
        await sendPushApprovalNotification({
          approval_request_id: data.approval_request_id,
          ops_log_id: data.ops_log_id,
          action_type: data.action_type,
          description: data.description,
          amount: data.amount,
          currency: data.currency,
          recipient_id: data.recipient_id,
          recipient_device_tokens: deviceTokens,
          expires_at: data.expires_at,
        });
        break;
    }

    return { success: true, channel: primaryChannel };
  } catch (error: any) {
    logger.error("Primary channel send failed", {
      approval_request_id: data.approval_request_id,
      error: error.message,
    });
    return { success: false, channel: "none" };
  }
}
