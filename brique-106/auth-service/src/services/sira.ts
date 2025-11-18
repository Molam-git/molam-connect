/**
 * SIRA Risk Scoring Integration
 *
 * Connects to SIRA risk scoring engine to get real-time risk assessments
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

export interface SiraRequest {
  user_id?: string;
  device: {
    fingerprint?: string;
    ip?: string;
    ua?: string;
    imei?: string | null;
  };
  transaction: {
    amount: number;
    currency: string;
    merchant_id?: string;
  };
  context?: {
    country?: string;
    payment_method?: string;
  };
}

export interface SiraResponse {
  score: number; // 0-100
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
  recommended_auth?: '3ds2' | 'otp_sms' | 'otp_voice' | 'biometric' | 'none';
  explain?: Record<string, any>;
}

class SiraService {
  private client: AxiosInstance;
  private timeout: number;

  constructor() {
    this.timeout = parseInt(process.env.SIRA_TIMEOUT_MS || '500', 10);

    this.client = axios.create({
      baseURL: process.env.SIRA_API_URL || 'https://sira-api.molam.internal',
      timeout: this.timeout,
      headers: {
        'Authorization': `Bearer ${process.env.SIRA_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get risk score from SIRA
   */
  async getScore(request: SiraRequest): Promise<SiraResponse> {
    const startTime = Date.now();

    try {
      const response = await this.client.post<SiraResponse>('/v1/risk/score', request);

      const duration = Date.now() - startTime;
      logger.info({
        user_id: request.user_id,
        score: response.data.score,
        level: response.data.level,
        duration,
      }, 'SIRA risk score obtained');

      return response.data;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({
        error: error.message,
        duration,
        user_id: request.user_id,
      }, 'SIRA risk scoring failed');

      // Fallback to medium risk if SIRA is unavailable
      return this.getFallbackScore(request);
    }
  }

  /**
   * Fallback score when SIRA is unavailable
   */
  private getFallbackScore(request: SiraRequest): SiraResponse {
    const amount = request.transaction.amount;

    // Simple heuristic fallback
    let score = 50; // Medium risk default
    const factors: string[] = ['sira_unavailable'];

    // Adjust based on transaction amount
    if (amount > 100000) {
      score += 20;
      factors.push('high_amount');
    } else if (amount > 50000) {
      score += 10;
      factors.push('medium_amount');
    }

    // New device adds risk
    if (!request.user_id) {
      score += 15;
      factors.push('new_user');
    }

    score = Math.min(100, Math.max(0, score));

    logger.warn({
      score,
      factors,
    }, 'Using fallback risk score (SIRA unavailable)');

    return {
      score,
      level: score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low',
      factors,
      recommended_auth: score >= 70 ? '3ds2' : score >= 50 ? 'otp_sms' : 'none',
    };
  }

  /**
   * Batch score multiple transactions
   */
  async batchScore(requests: SiraRequest[]): Promise<SiraResponse[]> {
    try {
      const response = await this.client.post<SiraResponse[]>('/v1/risk/batch', {
        requests,
      });

      return response.data;
    } catch (error: any) {
      logger.error({ error: error.message }, 'SIRA batch scoring failed');
      return requests.map((req) => this.getFallbackScore(req));
    }
  }
}

export const siraService = new SiraService();
