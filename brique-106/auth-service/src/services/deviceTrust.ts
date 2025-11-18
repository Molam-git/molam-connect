/**
 * Device Trust Service
 *
 * Manages device trust levels for "remember device" functionality
 */

import { query } from '../db';
import { logger } from '../utils/logger';

export interface DeviceTrust {
  id: string;
  user_id: string;
  device_fingerprint: string;
  trust_level: 'new' | 'trusted' | 'suspicious' | 'blocked';
  trust_score: number;
  successful_auths: number;
  failed_auths: number;
  first_auth_at: Date;
  last_auth_at: Date;
}

class DeviceTrustService {
  /**
   * Get trust level for a device
   */
  async getTrustLevel(userId: string, deviceFingerprint: string): Promise<DeviceTrust | null> {
    try {
      const result = await query<DeviceTrust>(
        `SELECT * FROM device_trust
         WHERE user_id = $1 AND device_fingerprint = $2
         AND (expires_at IS NULL OR expires_at > now())
         AND revoked_at IS NULL`,
        [userId, deviceFingerprint]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0]!;
    } catch (error: any) {
      logger.error({
        error: error.message,
        user_id: userId,
      }, 'Failed to get device trust level');
      return null;
    }
  }

  /**
   * Create new device trust entry
   */
  async createDeviceTrust(
    userId: string,
    deviceFingerprint: string,
    deviceInfo: {
      device_name?: string;
      device_type?: string;
      os?: string;
      browser?: string;
      ip?: string;
    },
    userConsented: boolean = false
  ): Promise<DeviceTrust> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(process.env.DEVICE_TRUST_DURATION_DAYS || '90', 10));

    const result = await query<DeviceTrust>(
      `INSERT INTO device_trust (
        user_id,
        device_fingerprint,
        device_name,
        device_type,
        os,
        browser,
        ip_addresses,
        user_consented,
        consented_at,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (user_id, device_fingerprint)
      DO UPDATE SET
        last_auth_at = now(),
        updated_at = now()
      RETURNING *`,
      [
        userId,
        deviceFingerprint,
        deviceInfo.device_name || null,
        deviceInfo.device_type || null,
        deviceInfo.os || null,
        deviceInfo.browser || null,
        deviceInfo.ip ? JSON.stringify([deviceInfo.ip]) : '[]',
        userConsented,
        userConsented ? new Date() : null,
        expiresAt,
      ]
    );

    logger.info({
      user_id: userId,
      device_fingerprint: deviceFingerprint,
    }, 'Device trust entry created');

    return result.rows[0]!;
  }

  /**
   * Record successful authentication
   */
  async recordSuccessfulAuth(userId: string, deviceFingerprint: string, ip?: string): Promise<void> {
    await query(
      `UPDATE device_trust
       SET successful_auths = successful_auths + 1,
           last_auth_at = now(),
           trust_score = LEAST(100, trust_score + 5),
           ip_addresses = CASE
             WHEN $3::inet IS NOT NULL AND NOT ip_addresses @> to_jsonb($3::text)
             THEN ip_addresses || to_jsonb($3::text)
             ELSE ip_addresses
           END,
           updated_at = now()
       WHERE user_id = $1 AND device_fingerprint = $2`,
      [userId, deviceFingerprint, ip || null]
    );

    // Promote to trusted after 3 successful auths
    await this.evaluateTrustPromotion(userId, deviceFingerprint);
  }

  /**
   * Record failed authentication
   */
  async recordFailedAuth(userId: string, deviceFingerprint: string): Promise<void> {
    await query(
      `UPDATE device_trust
       SET failed_auths = failed_auths + 1,
           trust_score = GREATEST(0, trust_score - 10),
           updated_at = now()
       WHERE user_id = $1 AND device_fingerprint = $2`,
      [userId, deviceFingerprint]
    );

    // Demote to suspicious after 3 failed auths
    await this.evaluateTrustDemotion(userId, deviceFingerprint);
  }

  /**
   * Evaluate if device should be promoted to trusted
   */
  private async evaluateTrustPromotion(userId: string, deviceFingerprint: string): Promise<void> {
    await query(
      `UPDATE device_trust
       SET trust_level = 'trusted',
           updated_at = now()
       WHERE user_id = $1
         AND device_fingerprint = $2
         AND trust_level = 'new'
         AND successful_auths >= 3
         AND failed_auths = 0`,
      [userId, deviceFingerprint]
    );
  }

  /**
   * Evaluate if device should be demoted to suspicious
   */
  private async evaluateTrustDemotion(userId: string, deviceFingerprint: string): Promise<void> {
    await query(
      `UPDATE device_trust
       SET trust_level = 'suspicious',
           updated_at = now()
       WHERE user_id = $1
         AND device_fingerprint = $2
         AND failed_auths >= 3`,
      [userId, deviceFingerprint]
    );
  }

  /**
   * Revoke device trust
   */
  async revokeDeviceTrust(userId: string, deviceFingerprint: string): Promise<void> {
    await query(
      `UPDATE device_trust
       SET revoked_at = now(),
           trust_level = 'blocked',
           updated_at = now()
       WHERE user_id = $1 AND device_fingerprint = $2`,
      [userId, deviceFingerprint]
    );

    logger.info({
      user_id: userId,
      device_fingerprint: deviceFingerprint,
    }, 'Device trust revoked');
  }

  /**
   * Get all trusted devices for a user
   */
  async getUserDevices(userId: string): Promise<DeviceTrust[]> {
    const result = await query<DeviceTrust>(
      `SELECT * FROM device_trust
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())
       ORDER BY last_auth_at DESC`,
      [userId]
    );

    return result.rows;
  }
}

export const deviceTrustService = new DeviceTrustService();
