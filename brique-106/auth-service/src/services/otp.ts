/**
 * OTP Service
 *
 * Generates, delivers, and verifies One-Time Passwords
 * Supports SMS and Voice delivery channels
 */

import argon2 from 'argon2';
import { query } from '../db';
import { logger } from '../utils/logger';
import { smsProvider } from '../providers/sms';
import { voiceProvider } from '../providers/voice';
import { RedisService } from './redis';

export interface OtpRequest {
  user_id?: string;
  payment_id?: string;
  phone: string;
  phone_country_code?: string;
  method: 'sms' | 'voice';
  ip_address?: string;
  device_fingerprint?: string;
}

export interface OtpResponse {
  id: string;
  phone: string;
  method: 'sms' | 'voice';
  expires_at: Date;
  max_attempts: number;
}

export interface OtpVerifyRequest {
  otp_id: string;
  code: string;
}

class OtpService {
  private redis: RedisService;
  private readonly OTP_LENGTH = parseInt(process.env.OTP_LENGTH || '6', 10);
  private readonly OTP_TTL_SECONDS = parseInt(process.env.OTP_TTL_SECONDS || '300', 10); // 5 minutes
  private readonly OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '3', 10);
  private readonly RATE_LIMIT_WINDOW = parseInt(process.env.OTP_RATE_LIMIT_WINDOW_SECONDS || '3600', 10);
  private readonly RATE_LIMIT_MAX = parseInt(process.env.OTP_RATE_LIMIT_MAX_REQUESTS || '5', 10);

  constructor() {
    this.redis = new RedisService();
  }

  /**
   * Generate and send OTP
   */
  async create(request: OtpRequest): Promise<OtpResponse> {
    try {
      // Step 1: Check rate limits
      await this.checkRateLimits(request.phone, request.ip_address);

      // Step 2: Generate OTP code
      const code = this.generateCode(this.OTP_LENGTH);

      // Step 3: Hash the code
      const codeHash = await argon2.hash(code, {
        timeCost: parseInt(process.env.ARGON2_TIME_COST || '3', 10),
        memoryCost: parseInt(process.env.ARGON2_MEMORY_COST || '65536', 10),
        parallelism: parseInt(process.env.ARGON2_PARALLELISM || '4', 10),
      });

      // Step 4: Calculate expiry
      const expiresAt = new Date(Date.now() + this.OTP_TTL_SECONDS * 1000);

      // Step 5: Store in database
      const result = await query<OtpResponse & { code_hash: string }>(
        `INSERT INTO otp_requests (
          user_id,
          payment_id,
          phone,
          phone_country_code,
          method,
          code_hash,
          length,
          expires_at,
          max_attempts,
          ip_address,
          device_fingerprint,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
        RETURNING id, phone, method, expires_at, max_attempts`,
        [
          request.user_id || null,
          request.payment_id || null,
          request.phone,
          request.phone_country_code || null,
          request.method,
          codeHash,
          this.OTP_LENGTH,
          expiresAt,
          this.OTP_MAX_ATTEMPTS,
          request.ip_address || null,
          request.device_fingerprint || null,
        ]
      );

      const otpRecord = result.rows[0]!;

      // Step 6: Send OTP asynchronously (don't wait)
      this.sendOtp(otpRecord.id, request.phone, code, request.method, request.phone_country_code);

      logger.info({
        otp_id: otpRecord.id,
        phone: this.maskPhone(request.phone),
        method: request.method,
      }, 'OTP created');

      return otpRecord;
    } catch (error: any) {
      logger.error({
        error: error.message,
        phone: this.maskPhone(request.phone),
      }, 'OTP creation failed');
      throw error;
    }
  }

  /**
   * Verify OTP code
   */
  async verify(request: OtpVerifyRequest): Promise<boolean> {
    try {
      // Step 1: Fetch OTP record
      const result = await query<{
        id: string;
        code_hash: string;
        expires_at: Date;
        attempts: number;
        max_attempts: number;
        status: string;
        payment_id: string | null;
      }>(
        `SELECT id, code_hash, expires_at, attempts, max_attempts, status, payment_id
         FROM otp_requests
         WHERE id = $1`,
        [request.otp_id]
      );

      if (result.rows.length === 0) {
        logger.warn({ otp_id: request.otp_id }, 'OTP not found');
        return false;
      }

      const otpRecord = result.rows[0]!;

      // Step 2: Check if already verified
      if (otpRecord.status === 'verified') {
        logger.warn({ otp_id: request.otp_id }, 'OTP already verified');
        return true;
      }

      // Step 3: Check if expired
      if (new Date() > new Date(otpRecord.expires_at)) {
        await this.updateStatus(request.otp_id, 'expired');
        logger.warn({ otp_id: request.otp_id }, 'OTP expired');
        return false;
      }

      // Step 4: Check max attempts
      if (otpRecord.attempts >= otpRecord.max_attempts) {
        await this.updateStatus(request.otp_id, 'failed');
        logger.warn({ otp_id: request.otp_id }, 'OTP max attempts exceeded');
        return false;
      }

      // Step 5: Verify code
      const isValid = await argon2.verify(otpRecord.code_hash, request.code);

      // Step 6: Increment attempts
      await this.incrementAttempts(request.otp_id);

      if (isValid) {
        // Mark as verified
        await this.updateStatus(request.otp_id, 'verified');
        await query(
          `UPDATE otp_requests SET verified_at = now() WHERE id = $1`,
          [request.otp_id]
        );

        logger.info({ otp_id: request.otp_id }, 'OTP verified successfully');
        return true;
      } else {
        logger.warn({
          otp_id: request.otp_id,
          attempts: otpRecord.attempts + 1,
        }, 'Invalid OTP code');
        return false;
      }
    } catch (error: any) {
      logger.error({
        error: error.message,
        otp_id: request.otp_id,
      }, 'OTP verification error');
      throw error;
    }
  }

  /**
   * Resend OTP
   */
  async resend(otpId: string): Promise<void> {
    const result = await query<{
      phone: string;
      phone_country_code: string | null;
      method: 'sms' | 'voice';
      status: string;
    }>(
      `SELECT phone, phone_country_code, method, status FROM otp_requests WHERE id = $1`,
      [otpId]
    );

    if (result.rows.length === 0) {
      throw new Error('OTP not found');
    }

    const otpRecord = result.rows[0]!;

    if (otpRecord.status === 'verified') {
      throw new Error('OTP already verified');
    }

    // Generate new code
    const newCode = this.generateCode(this.OTP_LENGTH);
    const newCodeHash = await argon2.hash(newCode);

    // Update database
    await query(
      `UPDATE otp_requests
       SET code_hash = $1,
           attempts = 0,
           status = 'pending',
           updated_at = now()
       WHERE id = $2`,
      [newCodeHash, otpId]
    );

    // Send new OTP
    await this.sendOtp(otpId, otpRecord.phone, newCode, otpRecord.method, otpRecord.phone_country_code);

    logger.info({ otp_id: otpId }, 'OTP resent');
  }

  /**
   * Send OTP via SMS or Voice
   */
  private async sendOtp(
    otpId: string,
    phone: string,
    code: string,
    method: 'sms' | 'voice',
    countryCode?: string | null
  ): Promise<void> {
    try {
      let messageId: string;

      if (method === 'sms') {
        messageId = await smsProvider.send(phone, code, countryCode);
      } else {
        messageId = await voiceProvider.send(phone, code, countryCode);
      }

      // Update database with provider info
      await query(
        `UPDATE otp_requests
         SET provider_message_id = $1,
             status = 'sent',
             sent_at = now(),
             updated_at = now()
         WHERE id = $2`,
        [messageId, otpId]
      );

      logger.info({
        otp_id: otpId,
        provider_message_id: messageId,
        method,
      }, 'OTP sent');
    } catch (error: any) {
      logger.error({
        error: error.message,
        otp_id: otpId,
        method,
      }, 'OTP delivery failed');

      await query(
        `UPDATE otp_requests
         SET status = 'failed',
             delivery_error = $1,
             updated_at = now()
         WHERE id = $2`,
        [error.message, otpId]
      );
    }
  }

  /**
   * Check rate limits
   */
  private async checkRateLimits(phone: string, ipAddress?: string): Promise<void> {
    // Check phone rate limit
    const phoneLimit = await this.redis.checkRateLimit(
      `otp:phone:${phone}`,
      this.RATE_LIMIT_MAX,
      this.RATE_LIMIT_WINDOW
    );

    if (!phoneLimit.allowed) {
      throw new Error(`Rate limit exceeded for phone number. Try again at ${phoneLimit.resetAt.toISOString()}`);
    }

    // Check IP rate limit
    if (ipAddress) {
      const ipLimit = await this.redis.checkRateLimit(
        `otp:ip:${ipAddress}`,
        this.RATE_LIMIT_MAX * 2, // Allow more for IP
        this.RATE_LIMIT_WINDOW
      );

      if (!ipLimit.allowed) {
        throw new Error(`Rate limit exceeded for IP address. Try again at ${ipLimit.resetAt.toISOString()}`);
      }
    }
  }

  /**
   * Generate random numeric code
   */
  private generateCode(length: number): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
  }

  /**
   * Mask phone number for logging
   */
  private maskPhone(phone: string): string {
    if (phone.length <= 4) return '****';
    return phone.substring(0, 4) + '****' + phone.substring(phone.length - 2);
  }

  /**
   * Update OTP status
   */
  private async updateStatus(otpId: string, status: string): Promise<void> {
    await query(
      `UPDATE otp_requests SET status = $1, updated_at = now() WHERE id = $2`,
      [status, otpId]
    );
  }

  /**
   * Increment verification attempts
   */
  private async incrementAttempts(otpId: string): Promise<void> {
    await query(
      `UPDATE otp_requests SET attempts = attempts + 1, updated_at = now() WHERE id = $1`,
      [otpId]
    );
  }
}

export const otpService = new OtpService();
