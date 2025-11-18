/**
 * SMS Provider
 *
 * Abstracts SMS delivery across multiple providers (Twilio, Orange SMS, etc.)
 */

import twilio from 'twilio';
import axios from 'axios';
import { logger } from '../utils/logger';

interface SmsProvider {
  send(phone: string, code: string, countryCode?: string | null): Promise<string>;
}

/**
 * Twilio SMS Provider
 */
class TwilioSmsProvider implements SmsProvider {
  private client: twilio.Twilio;
  private fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_FROM_NUMBER || '';

    if (!accountSid || !authToken) {
      logger.warn('Twilio credentials not configured');
    }

    this.client = twilio(accountSid, authToken);
  }

  async send(phone: string, code: string, countryCode?: string | null): Promise<string> {
    try {
      const message = this.formatMessage(code);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: phone,
      });

      logger.info({
        message_sid: result.sid,
        phone: this.maskPhone(phone),
        status: result.status,
      }, 'Twilio SMS sent');

      return result.sid;
    } catch (error: any) {
      logger.error({
        error: error.message,
        phone: this.maskPhone(phone),
      }, 'Twilio SMS failed');
      throw new Error(`SMS delivery failed: ${error.message}`);
    }
  }

  private formatMessage(code: string): string {
    return `Your Molam verification code is: ${code}. Valid for 5 minutes. Do not share this code.`;
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return '****';
    return phone.substring(0, 4) + '****' + phone.substring(phone.length - 2);
  }
}

/**
 * Orange SMS Provider (for West Africa)
 */
class OrangeSmsProvider implements SmsProvider {
  private apiUrl: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.apiUrl = process.env.ORANGE_SMS_API_URL || 'https://api.orange.com/sms/v1';
    this.clientId = process.env.ORANGE_SMS_CLIENT_ID || '';
    this.clientSecret = process.env.ORANGE_SMS_CLIENT_SECRET || '';
  }

  async send(phone: string, code: string, countryCode?: string | null): Promise<string> {
    try {
      // Ensure we have valid access token
      await this.ensureAccessToken();

      const message = this.formatMessage(code, countryCode);

      const response = await axios.post(
        `${this.apiUrl}/outbound/tel%3A%2B${phone.replace(/\+/g, '')}/requests`,
        {
          outboundSMSMessageRequest: {
            address: `tel:${phone}`,
            senderAddress: 'tel:+Molam',
            outboundSMSTextMessage: {
              message,
            },
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const messageId = response.data.outboundSMSMessageRequest?.resourceURL?.split('/').pop() || 'unknown';

      logger.info({
        message_id: messageId,
        phone: this.maskPhone(phone),
      }, 'Orange SMS sent');

      return messageId;
    } catch (error: any) {
      logger.error({
        error: error.message,
        phone: this.maskPhone(phone),
      }, 'Orange SMS failed');
      throw new Error(`SMS delivery failed: ${error.message}`);
    }
  }

  /**
   * Get OAuth2 access token
   */
  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return; // Token still valid
    }

    try {
      const response = await axios.post(
        'https://api.orange.com/oauth/v2/token',
        new URLSearchParams({
          grant_type: 'client_credentials',
        }),
        {
          auth: {
            username: this.clientId,
            password: this.clientSecret,
          },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000; // Refresh 1 min early

      logger.debug('Orange SMS access token refreshed');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Orange SMS token refresh failed');
      throw error;
    }
  }

  private formatMessage(code: string, countryCode?: string | null): string {
    // Localized message for West Africa
    if (countryCode && ['SN', 'CI', 'BJ', 'TG', 'ML', 'BF'].includes(countryCode)) {
      return `Code Molam: ${code}. Valable 5 min. Ne partagez pas ce code.`;
    }

    return `Your Molam code: ${code}. Valid 5 min. Do not share.`;
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return '****';
    return phone.substring(0, 4) + '****' + phone.substring(phone.length - 2);
  }
}

/**
 * Provider Factory
 * Selects appropriate provider based on country/configuration
 */
class SmsProviderFactory {
  private twilioProvider: TwilioSmsProvider;
  private orangeProvider: OrangeSmsProvider;

  constructor() {
    this.twilioProvider = new TwilioSmsProvider();
    this.orangeProvider = new OrangeSmsProvider();
  }

  async send(phone: string, code: string, countryCode?: string | null): Promise<string> {
    // Use Orange SMS for West Africa
    const westAfricaCountries = ['SN', 'CI', 'BJ', 'TG', 'ML', 'BF', 'NE', 'GN'];

    if (countryCode && westAfricaCountries.includes(countryCode)) {
      logger.debug({ country: countryCode }, 'Using Orange SMS provider');
      return this.orangeProvider.send(phone, code, countryCode);
    }

    // Default to Twilio
    logger.debug('Using Twilio SMS provider');
    return this.twilioProvider.send(phone, code, countryCode);
  }
}

export const smsProvider = new SmsProviderFactory();
