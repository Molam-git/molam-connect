// =====================================================================
// Communication Utilities
// =====================================================================
// Send emails, SMS, and push notifications
// Date: 2025-11-12
// =====================================================================

import { pool } from '../db';

// =====================================================================
// Types
// =====================================================================

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
  }>;
}

export interface SMSOptions {
  to: string;
  message: string;
  from?: string;
}

export interface PushOptions {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

// =====================================================================
// Email Service
// =====================================================================

/**
 * Send email using configured provider (SendGrid, AWS SES, etc.)
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  text?: string
): Promise<boolean> {
  const options: EmailOptions = {
    to,
    subject,
    html,
    text: text || stripHtml(html),
    from: process.env.EMAIL_FROM || 'noreply@molam.com',
  };

  try {
    console.log(`Sending email to ${Array.isArray(to) ? to.join(', ') : to}: ${subject}`);

    // Integration with email provider
    if (process.env.EMAIL_PROVIDER === 'sendgrid') {
      await sendViaSendGrid(options);
    } else if (process.env.EMAIL_PROVIDER === 'ses') {
      await sendViaSES(options);
    } else if (process.env.EMAIL_PROVIDER === 'smtp') {
      await sendViaSMTP(options);
    } else {
      // Development mode: log email
      console.log('Email (dev mode):', options);
      await logEmailToDatabase(options);
    }

    // Log to database
    await logEmailToDatabase(options, 'sent');

    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    await logEmailToDatabase(options, 'failed', error);
    return false;
  }
}

/**
 * Send email via SendGrid
 */
async function sendViaSendGrid(options: EmailOptions): Promise<void> {
  // Integration with SendGrid API
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY not configured');
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: Array.isArray(options.to)
            ? options.to.map((email) => ({ email }))
            : [{ email: options.to }],
          subject: options.subject,
        },
      ],
      from: { email: options.from || 'noreply@molam.com' },
      content: [
        { type: 'text/html', value: options.html },
        ...(options.text ? [{ type: 'text/plain', value: options.text }] : []),
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`SendGrid API error: ${response.status} ${response.statusText}`);
  }
}

/**
 * Send email via AWS SES
 */
async function sendViaSES(options: EmailOptions): Promise<void> {
  // Integration with AWS SES
  // Implementation would use AWS SDK
  throw new Error('AWS SES integration not implemented');
}

/**
 * Send email via SMTP
 */
async function sendViaSMTP(options: EmailOptions): Promise<void> {
  // Integration with SMTP server using nodemailer
  throw new Error('SMTP integration not implemented');
}

/**
 * Log email to database for auditing
 */
async function logEmailToDatabase(
  options: EmailOptions,
  status: string = 'pending',
  error?: any
): Promise<void> {
  try {
    await pool.query(
      `
      INSERT INTO email_log (
        recipient,
        subject,
        body_html,
        body_text,
        from_address,
        status,
        error_message,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `,
      [
        Array.isArray(options.to) ? options.to.join(',') : options.to,
        options.subject,
        options.html,
        options.text,
        options.from,
        status,
        error ? error.message : null,
      ]
    );
  } catch (err) {
    console.error('Failed to log email to database:', err);
  }
}

// =====================================================================
// SMS Service
// =====================================================================

/**
 * Send SMS using configured provider (Twilio, AWS SNS, etc.)
 */
export async function sendSMS(to: string, message: string, from?: string): Promise<boolean> {
  const options: SMSOptions = {
    to,
    message,
    from: from || process.env.SMS_FROM || '+1234567890',
  };

  try {
    console.log(`Sending SMS to ${to}: ${message.substring(0, 50)}...`);

    // Integration with SMS provider
    if (process.env.SMS_PROVIDER === 'twilio') {
      await sendViaTwilio(options);
    } else if (process.env.SMS_PROVIDER === 'sns') {
      await sendViaSNS(options);
    } else {
      // Development mode: log SMS
      console.log('SMS (dev mode):', options);
      await logSMSToDatabase(options);
    }

    // Log to database
    await logSMSToDatabase(options, 'sent');

    return true;
  } catch (error) {
    console.error('Failed to send SMS:', error);
    await logSMSToDatabase(options, 'failed', error);
    return false;
  }
}

/**
 * Send SMS via Twilio
 */
async function sendViaTwilio(options: SMSOptions): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured');
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: options.to,
        From: options.from || process.env.TWILIO_PHONE_NUMBER || '',
        Body: options.message,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twilio API error: ${response.status} ${error}`);
  }
}

/**
 * Send SMS via AWS SNS
 */
async function sendViaSNS(options: SMSOptions): Promise<void> {
  // Integration with AWS SNS
  throw new Error('AWS SNS integration not implemented');
}

/**
 * Log SMS to database for auditing
 */
async function logSMSToDatabase(
  options: SMSOptions,
  status: string = 'pending',
  error?: any
): Promise<void> {
  try {
    await pool.query(
      `
      INSERT INTO sms_log (
        recipient,
        message,
        from_number,
        status,
        error_message,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      `,
      [options.to, options.message, options.from, status, error ? error.message : null]
    );
  } catch (err) {
    console.error('Failed to log SMS to database:', err);
  }
}

// =====================================================================
// Push Notification Service
// =====================================================================

/**
 * Send push notification using configured provider (FCM, APNs, etc.)
 */
export async function sendPush(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<boolean> {
  const options: PushOptions = {
    userId,
    title,
    body,
    data,
  };

  try {
    console.log(`Sending push to user ${userId}: ${title}`);

    // Get user's device tokens from database
    const { rows: tokens } = await pool.query(
      `SELECT token, platform FROM user_device_tokens WHERE user_id = $1 AND active = true`,
      [userId]
    );

    if (tokens.length === 0) {
      console.log(`No device tokens found for user ${userId}`);
      return false;
    }

    // Send to each device
    for (const token of tokens) {
      if (token.platform === 'ios') {
        await sendViaAPNs(token.token, options);
      } else if (token.platform === 'android') {
        await sendViaFCM(token.token, options);
      }
    }

    await logPushToDatabase(options, 'sent');

    return true;
  } catch (error) {
    console.error('Failed to send push notification:', error);
    await logPushToDatabase(options, 'failed', error);
    return false;
  }
}

/**
 * Send push via Firebase Cloud Messaging (FCM)
 */
async function sendViaFCM(deviceToken: string, options: PushOptions): Promise<void> {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) {
    throw new Error('FCM_SERVER_KEY not configured');
  }

  const response = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Authorization': `key=${serverKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: deviceToken,
      notification: {
        title: options.title,
        body: options.body,
      },
      data: options.data || {},
    }),
  });

  if (!response.ok) {
    throw new Error(`FCM API error: ${response.status}`);
  }
}

/**
 * Send push via Apple Push Notification service (APNs)
 */
async function sendViaAPNs(deviceToken: string, options: PushOptions): Promise<void> {
  // Integration with APNs
  throw new Error('APNs integration not implemented');
}

/**
 * Log push notification to database
 */
async function logPushToDatabase(
  options: PushOptions,
  status: string = 'pending',
  error?: any
): Promise<void> {
  try {
    await pool.query(
      `
      INSERT INTO push_log (
        user_id,
        title,
        body,
        data,
        status,
        error_message,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `,
      [
        options.userId,
        options.title,
        options.body,
        JSON.stringify(options.data || {}),
        status,
        error ? error.message : null,
      ]
    );
  } catch (err) {
    console.error('Failed to log push to database:', err);
  }
}

// =====================================================================
// Utility Functions
// =====================================================================

/**
 * Strip HTML tags from string
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

/**
 * Format date
 */
export function formatDate(date: Date, locale: string = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
