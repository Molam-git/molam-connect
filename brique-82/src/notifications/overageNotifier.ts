// =====================================================================
// Overage Preview Notifier
// =====================================================================
// Sends notifications to merchants about pending overage charges
// Date: 2025-11-12
// =====================================================================

import { pool } from '../db';
import { sendEmail, sendSMS, sendPush, formatCurrency, formatDate } from '../utils/comm';
import { getMerchant, getMerchantNotificationPreferences, getMerchantLocale, getMerchantAdmins } from '../merchants/service';
import { sendWebhook } from '../webhooks/publisher';

// =====================================================================
// Types
// =====================================================================

export interface NotificationOptions {
  previewId: string;
  notificationType?: 'preview_created' | 'reminder' | 'accepted' | 'contested' | 'approved' | 'billed';
  force?: boolean; // Force notification even if already sent
}

export interface PreviewData {
  id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  currency: string;
  status: string;
  line_count: number;
  metrics: string[];
}

// =====================================================================
// Notifier Service
// =====================================================================

export class OverageNotifierService {
  /**
   * Send notification for a preview
   */
  async notifyPreview(options: NotificationOptions): Promise<void> {
    const { previewId, notificationType = 'preview_created', force = false } = options;

    console.log(`Sending ${notificationType} notification for preview ${previewId}`);

    // Get preview details
    const preview = await this.getPreviewData(previewId);

    if (!preview) {
      throw new Error(`Preview ${previewId} not found`);
    }

    // Check if already notified (unless force)
    if (!force && preview.status === 'notified') {
      console.log(`Preview ${previewId} already notified, skipping`);
      return;
    }

    // Get merchant details
    const merchant = await getMerchant(preview.tenant_id);
    const preferences = await getMerchantNotificationPreferences(preview.tenant_id);
    const locale = await getMerchantLocale(preview.tenant_id);

    // Get preview lines
    const lines = await this.getPreviewLines(previewId);

    // Compose notification content
    const content = this.composeNotification(preview, merchant, lines, locale, notificationType);

    // Send via enabled channels
    const results: Array<{ channel: string; success: boolean }> = [];

    if (preferences.email) {
      const emailSuccess = await this.sendEmailNotification(merchant.email, content);
      results.push({ channel: 'email', success: emailSuccess });
      await this.logNotification(previewId, 'merchant', merchant.id, 'email', notificationType, emailSuccess);
    }

    if (preferences.sms && merchant.phone) {
      const smsSuccess = await this.sendSMSNotification(merchant.phone, content);
      results.push({ channel: 'sms', success: smsSuccess });
      await this.logNotification(previewId, 'merchant', merchant.id, 'sms', notificationType, smsSuccess);
    }

    if (preferences.push) {
      // Send to all merchant admin users
      const admins = await getMerchantAdmins(preview.tenant_id);
      for (const admin of admins) {
        const pushSuccess = await sendPush(admin.id, content.push.title, content.push.body, {
          preview_id: previewId,
          type: notificationType,
        });
        results.push({ channel: 'push', success: pushSuccess });
        await this.logNotification(previewId, 'merchant', admin.id, 'push', notificationType, pushSuccess);
      }
    }

    if (preferences.webhook && merchant.webhook_url) {
      const webhookSuccess = await sendWebhook(merchant.webhook_url, {
        event: `overage.${notificationType}`,
        preview: preview,
        lines: lines,
        timestamp: new Date().toISOString(),
      });
      results.push({ channel: 'webhook', success: webhookSuccess });
      await this.logNotification(previewId, 'merchant', merchant.id, 'webhook', notificationType, webhookSuccess);
    }

    // Update preview status
    await this.markAsNotified(previewId, results);

    console.log(`Notification sent for preview ${previewId}:`, results);
  }

  /**
   * Send reminder notifications for previews pending action
   * (Run as scheduled job)
   */
  async sendReminders(): Promise<void> {
    console.log('Sending reminder notifications for pending previews...');

    // Get previews that were notified but not yet accepted/contested
    // and period_end is approaching (e.g., 1 day before)
    const { rows: previews } = await pool.query<{ id: string }>(
      `
      SELECT id::text
      FROM overage_previews
      WHERE status = 'notified'
        AND merchant_action IS NULL
        AND period_end = CURRENT_DATE + INTERVAL '1 day'
      `
    );

    console.log(`Found ${previews.length} previews requiring reminders`);

    for (const preview of previews) {
      try {
        await this.notifyPreview({
          previewId: preview.id,
          notificationType: 'reminder',
          force: true,
        });
      } catch (error) {
        console.error(`Failed to send reminder for preview ${preview.id}:`, error);
      }
    }

    console.log('Reminder notifications completed');
  }

  /**
   * Get preview data with line statistics
   */
  private async getPreviewData(previewId: string): Promise<PreviewData | null> {
    const { rows } = await pool.query(
      `
      SELECT
        p.id::text,
        p.tenant_id::text,
        p.period_start::text,
        p.period_end::text,
        p.total_amount,
        p.currency,
        p.status,
        COUNT(pl.id) as line_count,
        array_agg(DISTINCT pl.metric) as metrics
      FROM overage_previews p
      LEFT JOIN overage_preview_lines pl ON p.id = pl.preview_id
      WHERE p.id = $1
      GROUP BY p.id
      `,
      [previewId]
    );

    return rows[0] || null;
  }

  /**
   * Get preview lines
   */
  private async getPreviewLines(previewId: string): Promise<any[]> {
    const { rows } = await pool.query(
      `
      SELECT
        metric,
        unit_count,
        unit_price,
        amount,
        billing_model,
        line_status
      FROM overage_preview_lines
      WHERE preview_id = $1
      ORDER BY amount DESC
      `,
      [previewId]
    );

    return rows;
  }

  /**
   * Compose notification content for different channels
   */
  private composeNotification(
    preview: PreviewData,
    merchant: any,
    lines: any[],
    locale: { locale: string; currency: string; timezone: string },
    notificationType: string
  ): {
    email: { subject: string; html: string; text: string };
    sms: { message: string };
    push: { title: string; body: string };
  } {
    const appBase = process.env.APP_BASE || 'https://app.molam.com';
    const previewUrl = `${appBase}/merchant/overages/preview/${preview.id}`;
    const formattedAmount = formatCurrency(preview.total_amount, preview.currency);
    const formattedPeriod = `${formatDate(new Date(preview.period_start), locale.locale)} - ${formatDate(new Date(preview.period_end), locale.locale)}`;

    // Email content
    const emailSubject = this.getEmailSubject(notificationType, formattedAmount, preview.currency);
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; }
    .summary { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .amount { font-size: 32px; font-weight: bold; color: #667eea; margin: 10px 0; }
    .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    .table th { background: #f1f1f1; font-weight: 600; }
    .btn { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 10px 5px; }
    .btn-secondary { background: #6c757d; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Molam — Overage Charges ${notificationType === 'reminder' ? 'Reminder' : 'Preview'}</h1>
    </div>
    <div class="content">
      <div class="summary">
        <p>Dear ${merchant.legal_name},</p>
        ${this.getEmailBody(notificationType, formattedPeriod)}
        <div class="amount">${formattedAmount}</div>
        <p><strong>Billing Period:</strong> ${formattedPeriod}</p>
        <p><strong>Number of Charges:</strong> ${lines.length}</p>
      </div>

      <h3>Charge Breakdown</h3>
      <table class="table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Units</th>
            <th>Unit Price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lines.slice(0, 5).map(line => `
            <tr>
              <td>${this.formatMetric(line.metric)}</td>
              <td>${this.formatNumber(line.unit_count)}</td>
              <td>${formatCurrency(line.unit_price, preview.currency)}</td>
              <td>${formatCurrency(line.amount, preview.currency)}</td>
            </tr>
          `).join('')}
          ${lines.length > 5 ? `<tr><td colspan="4"><em>...and ${lines.length - 5} more charges</em></td></tr>` : ''}
        </tbody>
      </table>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${previewUrl}" class="btn">Review Charges</a>
        <a href="${previewUrl}/accept" class="btn">Accept Charges</a>
        <a href="${previewUrl}/contest" class="btn btn-secondary">Contest Charges</a>
      </div>

      <p style="margin-top: 30px;">
        <strong>What happens next?</strong><br>
        • If you accept, charges will be added to your next invoice<br>
        • If you contest, our billing team will review and contact you<br>
        • If no action is taken, charges will be automatically billed after ${formatDate(new Date(preview.period_end), locale.locale)}
      </p>
    </div>
    <div class="footer">
      <p>Molam Connect — Overage Billing System</p>
      <p>If you have questions, contact <a href="mailto:billing@molam.com">billing@molam.com</a></p>
    </div>
  </div>
</body>
</html>
    `;

    const emailText = `
Molam — Overage Charges ${notificationType === 'reminder' ? 'Reminder' : 'Preview'}

Dear ${merchant.legal_name},

${this.getEmailBodyText(notificationType, formattedPeriod)}

Total Amount: ${formattedAmount}
Billing Period: ${formattedPeriod}
Number of Charges: ${lines.length}

Charge Breakdown:
${lines.slice(0, 5).map(line => `- ${this.formatMetric(line.metric)}: ${this.formatNumber(line.unit_count)} units @ ${formatCurrency(line.unit_price, preview.currency)} = ${formatCurrency(line.amount, preview.currency)}`).join('\n')}
${lines.length > 5 ? `...and ${lines.length - 5} more charges` : ''}

Review charges: ${previewUrl}

What happens next?
- If you accept, charges will be added to your next invoice
- If you contest, our billing team will review and contact you
- If no action is taken, charges will be automatically billed after ${formatDate(new Date(preview.period_end), locale.locale)}

Questions? Contact billing@molam.com
    `;

    // SMS content (short and concise)
    const smsMessage = `Molam: You have ${formattedAmount} in pending overage charges for ${formattedPeriod}. Review: ${previewUrl}`;

    // Push notification content
    const pushTitle = `Overage Charges: ${formattedAmount}`;
    const pushBody = `You have pending charges for ${formattedPeriod}. Tap to review.`;

    return {
      email: {
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
      },
      sms: {
        message: smsMessage,
      },
      push: {
        title: pushTitle,
        body: pushBody,
      },
    };
  }

  /**
   * Get email subject based on notification type
   */
  private getEmailSubject(type: string, amount: string, currency: string): string {
    switch (type) {
      case 'reminder':
        return `Reminder: ${amount} in Pending Overage Charges`;
      case 'accepted':
        return `Overage Charges Accepted: ${amount}`;
      case 'contested':
        return `Overage Charges Contested: ${amount}`;
      case 'approved':
        return `Overage Charges Approved: ${amount}`;
      case 'billed':
        return `Overage Charges Billed: ${amount}`;
      default:
        return `Pending Overage Charges: ${amount}`;
    }
  }

  /**
   * Get email body text based on notification type
   */
  private getEmailBody(type: string, period: string): string {
    switch (type) {
      case 'reminder':
        return `<p>This is a reminder that you have pending overage charges for period <strong>${period}</strong>.</p><p>Please review and take action before the billing cut-off date.</p>`;
      case 'accepted':
        return `<p>Thank you for accepting the overage charges for period <strong>${period}</strong>.</p><p>These charges will be included in your next invoice.</p>`;
      case 'contested':
        return `<p>We have received your contest for the overage charges for period <strong>${period}</strong>.</p><p>Our billing team will review and contact you shortly.</p>`;
      case 'approved':
        return `<p>The contested overage charges for period <strong>${period}</strong> have been approved by our billing team.</p>`;
      case 'billed':
        return `<p>The overage charges for period <strong>${period}</strong> have been added to your invoice.</p>`;
      default:
        return `<p>You have pending overage charges for period <strong>${period}</strong>.</p><p>Please review and take action.</p>`;
    }
  }

  /**
   * Get email body text (plain text version)
   */
  private getEmailBodyText(type: string, period: string): string {
    return this.getEmailBody(type, period).replace(/<[^>]*>/g, '');
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(email: string, content: any): Promise<boolean> {
    try {
      return await sendEmail(email, content.email.subject, content.email.html, content.email.text);
    } catch (error) {
      console.error('Failed to send email notification:', error);
      return false;
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(phone: string, content: any): Promise<boolean> {
    try {
      return await sendSMS(phone, content.sms.message);
    } catch (error) {
      console.error('Failed to send SMS notification:', error);
      return false;
    }
  }

  /**
   * Log notification to database
   */
  private async logNotification(
    previewId: string,
    recipientType: string,
    recipientId: string,
    method: string,
    type: string,
    success: boolean
  ): Promise<void> {
    try {
      await pool.query(
        `
        INSERT INTO preview_notifications (
          preview_id,
          recipient_type,
          recipient_id,
          notification_type,
          notification_method,
          status,
          sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [previewId, recipientType, recipientId, type, method, success ? 'sent' : 'failed', success ? new Date() : null]
      );
    } catch (error) {
      console.error('Failed to log notification:', error);
    }
  }

  /**
   * Mark preview as notified
   */
  private async markAsNotified(
    previewId: string,
    results: Array<{ channel: string; success: boolean }>
  ): Promise<void> {
    const successfulChannels = results.filter(r => r.success).map(r => r.channel);

    await pool.query(
      `
      UPDATE overage_previews
      SET
        status = CASE WHEN status = 'pending' THEN 'notified' ELSE status END,
        notification_sent_at = NOW(),
        notification_method = $2,
        notification_retries = notification_retries + 1,
        updated_at = NOW()
      WHERE id = $1
      `,
      [previewId, successfulChannels.join(',') || 'none']
    );
  }

  /**
   * Format metric name for display
   */
  private formatMetric(metric: string): string {
    return metric
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Format number with thousands separator
   */
  private formatNumber(num: number): string {
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
}

// =====================================================================
// Exported Instance
// =====================================================================

export const overageNotifier = new OverageNotifierService();

// =====================================================================
// CLI Entry Point (for testing and cron jobs)
// =====================================================================

if (require.main === module) {
  const command = process.argv[2];

  if (command === 'send-reminders') {
    overageNotifier
      .sendReminders()
      .then(() => {
        console.log('Reminders sent successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Failed to send reminders:', error);
        process.exit(1);
      });
  } else if (command === 'notify-one') {
    const previewId = process.argv[3];
    if (!previewId) {
      console.error('Usage: node overageNotifier.js notify-one <preview_id>');
      process.exit(1);
    }

    overageNotifier
      .notifyPreview({ previewId })
      .then(() => {
        console.log(`Notification sent for preview ${previewId}`);
        process.exit(0);
      })
      .catch((error) => {
        console.error('Failed to send notification:', error);
        process.exit(1);
      });
  } else {
    console.error('Usage: node overageNotifier.js [send-reminders|notify-one <preview_id>]');
    process.exit(1);
  }
}
