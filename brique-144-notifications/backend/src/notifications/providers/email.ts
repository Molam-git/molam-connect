/**
 * BRIQUE 144 — Email Provider Adapter
 * Supports SMTP and SES
 */
import nodemailer from "nodemailer";
import { pool } from "../db";

export async function sendEmail(
  provider: any,
  opts: {
    to: string;
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
    notificationId?: string;
  }
) {
  const cfg = provider.metadata || {};

  if (provider.type === 'smtp') {
    const transporter = nodemailer.createTransporter({
      host: cfg.host || process.env.SMTP_HOST,
      port: cfg.port || Number(process.env.SMTP_PORT) || 587,
      secure: cfg.secure || false,
      auth: {
        user: cfg.user || process.env.SMTP_USER,
        pass: cfg.pass || process.env.SMTP_PASS
      }
    });

    const info = await transporter.sendMail({
      from: cfg.from || process.env.SMTP_FROM,
      to: opts.to,
      subject: opts.subject,
      text: opts.bodyText,
      html: opts.bodyHtml
    });

    // Log delivery
    if (opts.notificationId) {
      await pool.query(
        `INSERT INTO notification_logs(notification_id, channel, provider, provider_ref, status, payload)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [opts.notificationId, 'email', provider.provider_key, info.messageId, 'sent', JSON.stringify({})]
      );
    }

    return { providerRef: info.messageId };
  }

  if (provider.type === 'ses') {
    // AWS SES implementation would go here
    // import AWS from 'aws-sdk';
    // const ses = new AWS.SES({ region: cfg.region });
    // const result = await ses.sendEmail({...}).promise();
    throw new Error('SES not implemented in this sample');
  }

  throw new Error(`unsupported_email_provider: ${provider.type}`);
}
