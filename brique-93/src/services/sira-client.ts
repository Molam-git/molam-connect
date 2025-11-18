// SIRA Client - AI-powered routing and simulation
// Integrates with SIRA service for cost optimization and risk assessment

import axios, { AxiosInstance } from 'axios';

const SIRA_BASE_URL = process.env.SIRA_API_URL || 'http://localhost:9000';
const SIRA_API_KEY = process.env.SIRA_API_KEY || '';
const SIRA_TIMEOUT_MS = parseInt(process.env.SIRA_TIMEOUT_MS || '10000');

interface PayoutItem {
  payout_id: string;
  amount: number;
  currency: string;
  origin_module: string;
  beneficiary?: any;
  priority?: number;
}

interface RoutingSimulation {
  bank_profile_id: string;
  treasury_account_id: string;
  currency: string;
  items: Array<{
    payout_id: string;
    suggested_connector: string;
    estimated_fee: number;
    estimated_time_seconds: number;
    confidence: number;
  }>;
  total: number;
  estimated_fees: {
    molam_fee: number;
    bank_fee: number;
    total: number;
  };
  sira_score: number; // 0.00 to 1.00
  risk_flags: string[];
  recommendations: string[];
}

/**
 * SIRA Client for routing simulation and optimization
 */
class SIRAClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: SIRA_BASE_URL,
      timeout: SIRA_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': SIRA_API_KEY,
        'X-Service-Name': 'brique-93-scheduler'
      }
    });

    this.client.interceptors.request.use((config) => {
      console.log(`[SIRA] ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('[SIRA] Request failed:', error.message);
        throw error;
      }
    );
  }

  /**
   * Simulate routing for a batch of payouts
   */
  async simulateRouting(
    items: PayoutItem[],
    treasury_account_id: string
  ): Promise<RoutingSimulation> {
    try {
      console.log(`[SIRA] Simulating routing for ${items.length} payouts`);

      // In production, this would call actual SIRA API
      // For now, return mock simulation
      return this.mockSimulation(items, treasury_account_id);

      // Production implementation:
      // const response = await this.client.post('/routing/simulate', {
      //   items,
      //   treasury_account_id,
      //   optimize_for: 'cost', // or 'speed', 'reliability'
      //   constraints: {}
      // });
      // return response.data;

    } catch (error: any) {
      console.error('[SIRA] Simulation failed:', error);

      // Fallback to basic simulation
      return this.mockSimulation(items, treasury_account_id);
    }
  }

  /**
   * Mock simulation (for development)
   */
  private mockSimulation(
    items: PayoutItem[],
    treasury_account_id: string
  ): RoutingSimulation {
    const currency = items[0]?.currency || 'USD';
    const total = items.reduce((sum, item) => sum + item.amount, 0);

    // Mock fee calculation
    const molam_fee = total * 0.015; // 1.5%
    const bank_fee = items.length * 0.25; // $0.25 per transaction
    const total_fees = molam_fee + bank_fee;

    // Mock confidence score (higher for larger batches)
    const sira_score = Math.min(0.95, 0.70 + (items.length / 1000) * 0.25);

    // Assign suggested routing to each item
    const processedItems = items.map((item, index) => ({
      payout_id: item.payout_id,
      suggested_connector: 'sandbox', // Would be 'wise', 'bank_of_africa', etc.
      estimated_fee: item.amount * 0.015,
      estimated_time_seconds: item.priority && item.priority <= 5 ? 300 : 3600,
      confidence: 0.85 + Math.random() * 0.10
    }));

    return {
      bank_profile_id: 'default-bank-profile',
      treasury_account_id,
      currency,
      items: processedItems,
      total,
      estimated_fees: {
        molam_fee,
        bank_fee,
        total: total_fees
      },
      sira_score,
      risk_flags: [],
      recommendations: [
        'Batch size optimal for cost efficiency',
        `Estimated settlement in ${items.length > 100 ? '1-2' : '30-60'} minutes`
      ]
    };
  }

  /**
   * Get risk assessment for a payout
   */
  async assessRisk(payout_id: string): Promise<{
    risk_score: number;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    flags: string[];
  }> {
    try {
      // In production, call SIRA risk API
      // For now, return mock assessment

      const risk_score = Math.random() * 0.3; // Mock: mostly low risk

      return {
        risk_score,
        risk_level: risk_score < 0.3 ? 'low' : risk_score < 0.6 ? 'medium' : 'high',
        flags: []
      };

    } catch (error) {
      // Default to low risk on error
      return {
        risk_score: 0.1,
        risk_level: 'low',
        flags: []
      };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

// Singleton instance
export const siraClient = new SIRAClient();

// Convenience functions
export async function simulateRouting(items: PayoutItem[], treasury_account_id: string) {
  return siraClient.simulateRouting(items, treasury_account_id);
}

export async function assessPayoutRisk(payout_id: string) {
  return siraClient.assessRisk(payout_id);
}

export default siraClient;
