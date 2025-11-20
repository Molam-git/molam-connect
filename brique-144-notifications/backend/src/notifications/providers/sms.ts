/**
 * BRIQUE 144 — SMS Provider Adapter
 * Supports Twilio and extensible for other providers
 */
import Twilio from "twilio";
import { pool } from "../db";

export async function sendSms(
  provider: any,
  opts: {
    to: string;
    text: string;
    notificationId?: string;
  }
) {
  const cfg = provider.metadata || {};

  if (provider.type === 'twilio') {
    const accountSid = cfg.accountSid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = cfg.authToken || process.env.TWILIO_AUTH_TOKEN;
    const from = cfg.from || process.env.TWILIO_FROM;

    if (!accountSid || !authToken || !from) {
      throw new Error('Twilio credentials not configured');
    }

    const client = Twilio(accountSid, authToken);

    const message = await client.messages.create({
      body: opts.text,
      from,
      to: opts.to
    });

    // Log delivery
    if (opts.notificationId) {
      await pool.query(
        `INSERT INTO notification_logs(notification_id, channel, provider, provider_ref, status, payload)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [opts.notificationId, 'sms', provider.provider_key, message.sid, 'sent', JSON.stringify({})]
      );
    }

    return { providerRef: message.sid };
  }

  throw new Error(`unsupported_sms_provider: ${provider.type}`);
}
