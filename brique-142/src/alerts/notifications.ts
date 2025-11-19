/**
 * BRIQUE 142 — Alert Notifications
 * Multi-channel notification system
 */

import { pool } from '../db';

/**
 * Trigger notifications for alert
 */
export async function triggerNotifications(alertId: string): Promise<void> {
  try {
    // Fetch alert
    const { rows: alertRows } = await pool.query(
      `SELECT * FROM alerts WHERE id = $1`,
      [alertId]
    );

    if (alertRows.length === 0) {
      console.error(`[Notifications] Alert ${alertId} not found`);
      return;
    }

    const alert = alertRows[0];

    // Fetch matching notification channels
    const { rows: channels } = await pool.query(
      `SELECT * FROM alert_notification_channels
       WHERE active = true
         AND (severity_filter IS NULL OR $1 = ANY(severity_filter))`,
      [alert.severity]
    );

    // Create notification records and trigger async delivery
    for (const channel of channels) {
      const { rows } = await pool.query(
        `INSERT INTO alert_notifications(alert_id, channel_id, status)
         VALUES ($1, $2, 'pending')
         RETURNING id`,
        [alertId, channel.id]
      );

      const notificationId = rows[0].id;

      // Trigger async delivery (stub - real impl would use worker queue)
      await deliverNotification(notificationId, alert, channel);
    }

    console.log(`[Notifications] Triggered ${channels.length} notifications for alert ${alertId}`);
  } catch (error) {
    console.error(`[Notifications] Error triggering for alert ${alertId}:`, error);
  }
}

/**
 * Deliver notification via channel
 */
async function deliverNotification(
  notificationId: string,
  alert: any,
  channel: any
): Promise<void> {
  try {
    const { channel_type, config } = channel;

    // Mark as sent
    await pool.query(
      `UPDATE alert_notifications SET status = 'sent', sent_at = NOW() WHERE id = $1`,
      [notificationId]
    );

    // Actual delivery (stub - real impl would call external APIs)
    switch (channel_type) {
      case 'email':
        console.log(`[Email] Sending to ${config.to}: ${alert.message}`);
        // await sendEmail(config.to, alert);
        break;

      case 'slack':
        console.log(`[Slack] Posting to ${config.channel}: ${alert.message}`);
        // await postToSlack(config.webhook_url, alert);
        break;

      case 'sms':
        console.log(`[SMS] Sending to ${config.phone}: ${alert.message}`);
        // await sendSMS(config.phone, alert.message);
        break;

      case 'webhook':
        console.log(`[Webhook] Posting to ${config.url}`);
        // await fetch(config.url, { method: 'POST', body: JSON.stringify(alert) });
        break;

      case 'pagerduty':
        console.log(`[PagerDuty] Triggering incident: ${alert.message}`);
        // await triggerPagerDuty(config.service_key, alert);
        break;

      default:
        console.warn(`[Notifications] Unknown channel type: ${channel_type}`);
    }

    // Mark as delivered
    await pool.query(
      `UPDATE alert_notifications SET status = 'delivered', delivered_at = NOW() WHERE id = $1`,
      [notificationId]
    );
  } catch (error: any) {
    console.error(`[Notifications] Delivery error for ${notificationId}:`, error);

    // Mark as failed
    await pool.query(
      `UPDATE alert_notifications SET status = 'failed', error_message = $2 WHERE id = $1`,
      [notificationId, error.message]
    );
  }
}
