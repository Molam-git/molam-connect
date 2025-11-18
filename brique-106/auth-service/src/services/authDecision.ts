/**
 * Auth Decision Service
 *
 * Core decision engine that determines optimal authentication method
 * based on risk score, device capabilities, and business rules
 */

import { query } from '../db';
import { siraService, SiraRequest } from './sira';
import { binLookupService } from './binLookup';
import { deviceTrustService } from './deviceTrust';
import { logger } from '../utils/logger';

export interface AuthDecisionRequest {
  payment_id: string;
  user_id?: string;
  amount: number;
  currency: string;
  device: {
    ip?: string;
    ua?: string;
    imei?: string | null;
    fingerprint?: string;
  };
  bin: string;
  country: string;
  merchant_id?: string;
}

export type AuthMethod = '3ds2' | '3ds1' | 'otp_sms' | 'otp_voice' | 'biometric' | 'none';

export interface AuthDecisionResponse {
  decision_id: string;
  risk_score: number;
  recommended: AuthMethod;
  explain: {
    factors: string[];
    sira?: any;
    card_capabilities?: any;
    device_trust?: any;
  };
  ttl_seconds: number;
  fallback_methods?: AuthMethod[];
}

class AuthDecisionService {
  // Configurable thresholds
  private readonly RISK_THRESHOLD_3DS2_REQUIRED = parseInt(
    process.env.RISK_THRESHOLD_3DS2_REQUIRED || '80',
    10
  );
  private readonly RISK_THRESHOLD_OTP_REQUIRED = parseInt(
    process.env.RISK_THRESHOLD_OTP_REQUIRED || '50',
    10
  );
  private readonly RISK_THRESHOLD_LOW_FRICTION = parseInt(
    process.env.RISK_THRESHOLD_LOW_FRICTION || '30',
    10
  );

  /**
   * Main decision logic
   */
  async decide(request: AuthDecisionRequest): Promise<AuthDecisionResponse> {
    const startTime = Date.now();

    try {
      // Step 1: Get risk score from SIRA
      const siraRequest: SiraRequest = {
        user_id: request.user_id,
        device: {
          fingerprint: request.device.fingerprint,
          ip: request.device.ip,
          ua: request.device.ua,
          imei: request.device.imei,
        },
        transaction: {
          amount: request.amount,
          currency: request.currency,
          merchant_id: request.merchant_id,
        },
        context: {
          country: request.country,
          payment_method: 'card',
        },
      };

      const siraResult = await siraService.getScore(siraRequest);

      // Step 2: Get card capabilities (3DS support)
      const binInfo = await binLookupService.lookup(request.bin, request.country);

      // Step 3: Check device trust (if user authenticated)
      let deviceTrust: any = null;
      if (request.user_id && request.device.fingerprint) {
        deviceTrust = await deviceTrustService.getTrustLevel(
          request.user_id,
          request.device.fingerprint
        );
      }

      // Step 4: Apply decision rules
      const recommended = this.applyDecisionRules(
        siraResult.score,
        binInfo.supports_3ds2,
        binInfo.supports_3ds1,
        request.country,
        deviceTrust
      );

      // Step 5: Determine fallback methods
      const fallbackMethods = this.determineFallbackMethods(
        recommended,
        binInfo.supports_3ds2,
        binInfo.supports_3ds1
      );

      // Step 6: Log decision to database
      const decisionRow = await this.logDecision({
        payment_id: request.payment_id,
        user_id: request.user_id,
        merchant_id: request.merchant_id,
        country: request.country,
        device_fingerprint: request.device.fingerprint,
        device_ip: request.device.ip,
        device_ua: request.device.ua,
        risk_score: siraResult.score,
        risk_factors: siraResult.factors,
        recommended_method: recommended,
        amount: request.amount,
        currency: request.currency,
        bin: request.bin,
        card_supports_3ds2: binInfo.supports_3ds2,
        decision_payload: {
          sira: siraResult,
          card: binInfo,
          device_trust: deviceTrust,
        },
      });

      const duration = Date.now() - startTime;

      logger.info({
        decision_id: decisionRow.id,
        payment_id: request.payment_id,
        risk_score: siraResult.score,
        recommended,
        duration,
      }, 'Auth decision made');

      return {
        decision_id: decisionRow.id,
        risk_score: siraResult.score,
        recommended,
        explain: {
          factors: siraResult.factors,
          sira: siraResult.explain,
          card_capabilities: {
            supports_3ds2: binInfo.supports_3ds2,
            supports_3ds1: binInfo.supports_3ds1,
            scheme: binInfo.scheme,
          },
          device_trust: deviceTrust,
        },
        ttl_seconds: 120, // Decision valid for 2 minutes
        fallback_methods: fallbackMethods,
      };
    } catch (error: any) {
      logger.error({
        error: error.message,
        payment_id: request.payment_id,
      }, 'Auth decision error');

      throw new Error(`Failed to make auth decision: ${error.message}`);
    }
  }

  /**
   * Apply business rules to determine auth method
   */
  private applyDecisionRules(
    riskScore: number,
    supports3DS2: boolean,
    supports3DS1: boolean,
    country: string,
    deviceTrust: any
  ): AuthMethod {
    // Rule 1: Critical risk always requires 3DS2 (if supported)
    if (riskScore >= this.RISK_THRESHOLD_3DS2_REQUIRED) {
      if (supports3DS2) {
        return '3ds2';
      } else if (supports3DS1) {
        return '3ds1';
      } else {
        return 'otp_sms'; // Fallback to OTP
      }
    }

    // Rule 2: High risk prefers 3DS2, accepts OTP
    if (riskScore >= this.RISK_THRESHOLD_OTP_REQUIRED) {
      if (supports3DS2) {
        return '3ds2';
      } else {
        return 'otp_sms';
      }
    }

    // Rule 3: Medium risk - OTP for unknown devices, none for trusted
    if (riskScore >= this.RISK_THRESHOLD_LOW_FRICTION) {
      if (deviceTrust?.trust_level === 'trusted') {
        return 'none'; // Frictionless for trusted devices
      }
      return 'otp_sms';
    }

    // Rule 4: Low risk - frictionless
    return 'none';
  }

  /**
   * Determine fallback authentication methods
   */
  private determineFallbackMethods(
    primary: AuthMethod,
    supports3DS2: boolean,
    supports3DS1: boolean
  ): AuthMethod[] {
    const fallbacks: AuthMethod[] = [];

    switch (primary) {
      case '3ds2':
        if (supports3DS1) fallbacks.push('3ds1');
        fallbacks.push('otp_sms');
        fallbacks.push('otp_voice');
        break;

      case '3ds1':
        fallbacks.push('otp_sms');
        fallbacks.push('otp_voice');
        break;

      case 'otp_sms':
        fallbacks.push('otp_voice');
        if (supports3DS2) fallbacks.push('3ds2');
        break;

      case 'otp_voice':
        fallbacks.push('otp_sms');
        break;

      case 'biometric':
        fallbacks.push('otp_sms');
        break;

      case 'none':
        // No fallback for frictionless
        break;
    }

    return fallbacks;
  }

  /**
   * Log decision to database for audit
   */
  private async logDecision(data: {
    payment_id: string;
    user_id?: string;
    merchant_id?: string;
    country: string;
    device_fingerprint?: string;
    device_ip?: string;
    device_ua?: string;
    risk_score: number;
    risk_factors: string[];
    recommended_method: AuthMethod;
    amount: number;
    currency: string;
    bin: string;
    card_supports_3ds2: boolean;
    decision_payload: any;
  }): Promise<{ id: string }> {
    const result = await query<{ id: string }>(
      `INSERT INTO auth_decisions (
        payment_id,
        user_id,
        merchant_id,
        country,
        device_fingerprint,
        device_ip,
        device_ua,
        risk_score,
        risk_factors,
        recommended_method,
        final_method,
        amount,
        currency,
        bin,
        card_supports_3ds2,
        decision_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id`,
      [
        data.payment_id,
        data.user_id || null,
        data.merchant_id || null,
        data.country,
        data.device_fingerprint || null,
        data.device_ip || null,
        data.device_ua || null,
        data.risk_score,
        JSON.stringify(data.risk_factors),
        data.recommended_method,
        data.recommended_method, // initial final_method same as recommended
        data.amount,
        data.currency,
        data.bin,
        data.card_supports_3ds2,
        JSON.stringify(data.decision_payload),
      ]
    );

    return result.rows[0]!;
  }

  /**
   * Update decision with final method (if fallback was used)
   */
  async updateFinalMethod(
    decisionId: string,
    finalMethod: AuthMethod,
    fallbackReason?: string
  ): Promise<void> {
    await query(
      `UPDATE auth_decisions
       SET final_method = $1,
           fallback_reason = $2,
           updated_at = now()
       WHERE id = $3`,
      [finalMethod, fallbackReason || null, decisionId]
    );

    logger.info({
      decision_id: decisionId,
      final_method: finalMethod,
      fallback_reason: fallbackReason,
    }, 'Auth method updated to fallback');
  }

  /**
   * Record authentication outcome
   */
  async recordOutcome(
    decisionId: string,
    successful: boolean,
    durationMs: number,
    abandonment: boolean = false
  ): Promise<void> {
    await query(
      `UPDATE auth_decisions
       SET auth_successful = $1,
           auth_completed_at = now(),
           auth_duration_ms = $2,
           abandonment = $3,
           updated_at = now()
       WHERE id = $4`,
      [successful, durationMs, abandonment, decisionId]
    );

    logger.info({
      decision_id: decisionId,
      successful,
      duration_ms: durationMs,
      abandonment,
    }, 'Auth outcome recorded');
  }
}

export const authDecisionService = new AuthDecisionService();
