/**
 * Email Service
 * Sends notification emails for scheduled reports
 */

import nodemailer, { Transporter } from 'nodemailer';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: Buffer;
  }>;
}

export class MailerService {
  private transporter: Transporter;

  constructor() {
    // Configure email transporter
    const config = this.getTransporterConfig();
    this.transporter = nodemailer.createTransporter(config);
  }

  /**
   * Get transporter configuration based on environment
   */
  private getTransporterConfig(): any {
    // Production: Use SMTP or SendGrid/AWS SES
    if (process.env.NODE_ENV === 'production') {
      if (process.env.SMTP_HOST) {
        return {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        };
      }

      // SendGrid
      if (process.env.SENDGRID_API_KEY) {
        return {
          host: 'smtp.sendgrid.net',
          port: 587,
          auth: {
            user: 'apikey',
            pass: process.env.SENDGRID_API_KEY,
          },
        };
      }
    }

    // Development: Use Ethereal (test email service)
    // Or MailHog/MailCatcher for local testing
    if (process.env.MAILER_PREVIEW === 'true') {
      return {
        host: 'localhost',
        port: 1025,
        secure: false,
        ignoreTLS: true,
      };
    }

    // Default: log to console
    return {
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    };
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    const from = process.env.EMAIL_FROM || 'noreply@molam.io';

    try {
      const info = await this.transporter.sendMail({
        from: `Molam Analytics <${from}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      });

      console.log('✅ Email sent:', info.messageId);

      // Log preview URL for Ethereal
      if (info.messageId && info.messageId.includes('ethereal')) {
        console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
      }
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      throw error;
    }
  }

  /**
   * Send report notification email
   */
  async sendReportNotification(
    to: string,
    reportName: string,
    downloadUrl: string,
    expiresAt: Date
  ): Promise<void> {
    const subject = `Your Analytics Report is Ready: ${reportName}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #374151; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; padding: 30px; border-radius: 12px; text-align: center; }
            .content { padding: 30px 0; }
            .button { display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500; }
            .footer { color: #9ca3af; font-size: 14px; text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 4px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">📊 Analytics Report Ready</h1>
            </div>

            <div class="content">
              <p>Hello,</p>
              <p>Your scheduled analytics report <strong>${reportName}</strong> has been generated and is ready for download.</p>

              <p style="text-align: center; margin: 30px 0;">
                <a href="${downloadUrl}" class="button">Download Report</a>
              </p>

              <div class="warning">
                <strong>⏰ Note:</strong> This download link will expire on <strong>${expiresAt.toLocaleString()}</strong>
              </div>

              <p>If you have any questions or need assistance, please contact our support team.</p>
            </div>

            <div class="footer">
              <p>
                This is an automated message from Molam Analytics.<br>
                <a href="https://molam.io">molam.io</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Your Analytics Report is Ready: ${reportName}

Download your report here:
${downloadUrl}

This link will expire on ${expiresAt.toLocaleString()}

---
Molam Analytics
https://molam.io
    `.trim();

    await this.sendEmail({
      to,
      subject,
      html,
      text,
    });
  }

  /**
   * Send report error notification
   */
  async sendReportErrorNotification(
    to: string,
    reportName: string,
    error: string
  ): Promise<void> {
    const subject = `Analytics Report Failed: ${reportName}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #374151; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #ef4444; color: white; padding: 30px; border-radius: 12px; text-align: center; }
            .content { padding: 30px 0; }
            .error { background: #fee2e2; border-left: 4px solid #dc2626; padding: 12px; border-radius: 4px; margin: 20px 0; font-family: monospace; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">⚠️ Report Generation Failed</h1>
            </div>

            <div class="content">
              <p>Unfortunately, your scheduled report <strong>${reportName}</strong> could not be generated due to an error.</p>

              <div class="error">
                ${error}
              </div>

              <p>Please contact support if this issue persists.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to,
      subject,
      html,
    });
  }
}

// Singleton instance
let mailerServiceInstance: MailerService | null = null;

export function getMailerService(): MailerService {
  if (!mailerServiceInstance) {
    mailerServiceInstance = new MailerService();
  }
  return mailerServiceInstance;
}
