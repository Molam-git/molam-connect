/**
 * OTP Routes
 *
 * API endpoints for OTP generation and verification
 */

import { Router } from 'express';
import { z } from 'zod';
import { otpService } from '../services/otp';
import { logger } from '../utils/logger';

const router = Router();

// Request validation schemas
const createOtpSchema = z.object({
  user_id: z.string().uuid().optional(),
  payment_id: z.string().uuid().optional(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/), // E.164 format
  phone_country_code: z.string().length(2).optional(),
  method: z.enum(['sms', 'voice']),
  ip_address: z.string().optional(),
  device_fingerprint: z.string().optional(),
});

const verifyOtpSchema = z.object({
  otp_id: z.string().uuid(),
  code: z.string().regex(/^\d{4,8}$/),
});

const resendOtpSchema = z.object({
  otp_id: z.string().uuid(),
});

/**
 * POST /v1/otp/create
 *
 * Generate and send OTP
 */
router.post('/create', async (req, res) => {
  try {
    const validated = createOtpSchema.parse(req.body);

    // Add IP from request if not provided
    if (!validated.ip_address) {
      validated.ip_address = req.ip || req.headers['x-forwarded-for'] as string;
    }

    const otp = await otpService.create(validated);

    res.status(201).json({
      otp_id: otp.id,
      phone: maskPhone(otp.phone),
      method: otp.method,
      expires_at: otp.expires_at,
      max_attempts: otp.max_attempts,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error.message.includes('Rate limit exceeded')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: error.message,
      });
    }

    logger.error({ error: error.message }, 'OTP creation error');
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * POST /v1/otp/verify
 *
 * Verify OTP code
 */
router.post('/verify', async (req, res) => {
  try {
    const validated = verifyOtpSchema.parse(req.body);

    const isValid = await otpService.verify(validated);

    if (isValid) {
      res.status(200).json({
        success: true,
        message: 'OTP verified successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP code',
      });
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    logger.error({ error: error.message }, 'OTP verification error');
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * POST /v1/otp/resend
 *
 * Resend OTP
 */
router.post('/resend', async (req, res) => {
  try {
    const validated = resendOtpSchema.parse(req.body);

    await otpService.resend(validated.otp_id);

    res.status(200).json({
      success: true,
      message: 'OTP resent successfully',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    logger.error({ error: error.message }, 'OTP resend error');
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// Helper function
function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  return phone.substring(0, 4) + '****' + phone.substring(phone.length - 2);
}

export default router;
