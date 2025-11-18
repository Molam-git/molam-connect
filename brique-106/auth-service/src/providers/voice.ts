/**
 * Voice OTP Provider
 *
 * Delivers OTP via voice call
 */

import twilio from 'twilio';
import { logger } from '../utils/logger';

interface VoiceProvider {
  send(phone: string, code: string, countryCode?: string | null): Promise<string>;
}

/**
 * Twilio Voice Provider
 */
class TwilioVoiceProvider implements VoiceProvider {
  private client: twilio.Twilio;
  private fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.VOICE_FROM_NUMBER || process.env.TWILIO_FROM_NUMBER || '';

    if (!accountSid || !authToken) {
      logger.warn('Twilio credentials not configured');
    }

    this.client = twilio(accountSid, authToken);
  }

  async send(phone: string, code: string, countryCode?: string | null): Promise<string> {
    try {
      const twiml = this.generateTwiML(code, countryCode);

      const call = await this.client.calls.create({
        twiml,
        from: this.fromNumber,
        to: phone,
      });

      logger.info({
        call_sid: call.sid,
        phone: this.maskPhone(phone),
        status: call.status,
      }, 'Twilio voice call initiated');

      return call.sid;
    } catch (error: any) {
      logger.error({
        error: error.message,
        phone: this.maskPhone(phone),
      }, 'Twilio voice call failed');
      throw new Error(`Voice OTP delivery failed: ${error.message}`);
    }
  }

  /**
   * Generate TwiML for voice call
   */
  private generateTwiML(code: string, countryCode?: string | null): string {
    // Split code into individual digits for better clarity
    const digits = code.split('').join(' ');

    // Localized voice message
    let message = `Hello. Your Molam verification code is: ${digits}. I repeat, your code is: ${digits}. Thank you.`;

    if (countryCode && ['FR', 'SN', 'CI', 'BJ', 'TG', 'ML', 'BF'].includes(countryCode)) {
      message = `Bonjour. Votre code de vérification Molam est: ${digits}. Je répète, votre code est: ${digits}. Merci.`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="en-US" voice="alice">${message}</Say>
  <Pause length="1"/>
  <Say language="en-US" voice="alice">${message}</Say>
</Response>`;
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return '****';
    return phone.substring(0, 4) + '****' + phone.substring(phone.length - 2);
  }
}

/**
 * Voice Provider Factory
 */
class VoiceProviderFactory {
  private twilioProvider: TwilioVoiceProvider;

  constructor() {
    this.twilioProvider = new TwilioVoiceProvider();
  }

  async send(phone: string, code: string, countryCode?: string | null): Promise<string> {
    // Currently only Twilio is supported
    // Can add more providers here (e.g., local voice gateways)
    return this.twilioProvider.send(phone, code, countryCode);
  }
}

export const voiceProvider = new VoiceProviderFactory();
