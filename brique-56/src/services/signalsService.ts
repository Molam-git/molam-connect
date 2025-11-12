/**
 * Signals Service - Manage payment signals for fraud detection
 */
import { pool } from "../utils/db.js";
import { PaymentSignal } from "../radar/evaluator.js";
import fetch from "node-fetch";

const SIRA_URL = process.env.SIRA_URL || "http://localhost:8044";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";

export interface CreateSignalInput {
  payment_id: string;
  merchant_id: string;
  customer_id?: string;
  country: string;
  currency: string;
  amount: number;
  device_fingerprint?: any;
  ip_address?: string;
  geo?: any;
  shipping_info?: any;
  billing_info?: any;
  labels?: any;
}

/**
 * Create payment signal
 */
export async function createPaymentSignal(input: CreateSignalInput): Promise<PaymentSignal> {
  // Calculate velocity signals
  const velocity = await calculateVelocity(
    input.merchant_id,
    input.customer_id,
    input.device_fingerprint?.id
  );

  // Get SIRA score
  const siraScore = await getSiraScore(input);

  // Insert signal
  const { rows: [signal] } = await pool.query<PaymentSignal>(
    `INSERT INTO payment_signals (
      payment_id, merchant_id, customer_id, country, currency, amount,
      device_fingerprint, ip_address, geo, velocity, shipping_info, billing_info,
      labels, sira_score
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      input.payment_id,
      input.merchant_id,
      input.customer_id || null,
      input.country,
      input.currency,
      input.amount,
      input.device_fingerprint || {},
      input.ip_address || null,
      input.geo || {},
      velocity,
      input.shipping_info || {},
      input.billing_info || {},
      input.labels || {},
      siraScore,
    ]
  );

  return signal;
}

/**
 * Get payment signal by payment ID
 */
export async function getPaymentSignal(paymentId: string): Promise<PaymentSignal | null> {
  const { rows } = await pool.query<PaymentSignal>(
    "SELECT * FROM payment_signals WHERE payment_id = $1",
    [paymentId]
  );
  return rows.length ? rows[0] : null;
}

/**
 * Calculate velocity signals for fraud detection
 */
async function calculateVelocity(
  merchantId: string,
  customerId?: string,
  _deviceId?: string
): Promise<any> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Count and sum for merchant in last hour
  const { rows: hourStats } = await pool.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as sum
     FROM payment_signals
     WHERE merchant_id = $1 AND created_at >= $2`,
    [merchantId, oneHourAgo]
  );

  // Count and sum for merchant in last 24 hours
  const { rows: dayStats } = await pool.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as sum
     FROM payment_signals
     WHERE merchant_id = $1 AND created_at >= $2`,
    [merchantId, oneDayAgo]
  );

  // Count unique devices in last 24 hours (if customer_id provided)
  let uniqueDevices = 0;
  if (customerId) {
    const { rows: deviceStats } = await pool.query(
      `SELECT COUNT(DISTINCT device_fingerprint->>'id') as count
       FROM payment_signals
       WHERE customer_id = $1 AND created_at >= $2
       AND device_fingerprint->>'id' IS NOT NULL`,
      [customerId, oneDayAgo]
    );
    uniqueDevices = parseInt(deviceStats[0]?.count || "0");
  }

  return {
    count_1h: parseInt(hourStats[0]?.count || "0"),
    sum_1h: parseFloat(hourStats[0]?.sum || "0"),
    count_24h: parseInt(dayStats[0]?.count || "0"),
    sum_24h: parseFloat(dayStats[0]?.sum || "0"),
    unique_devices_24h: uniqueDevices,
  };
}

/**
 * Get SIRA fraud score
 */
async function getSiraScore(input: CreateSignalInput): Promise<number> {
  try {
    const response = await fetch(`${SIRA_URL}/api/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        payment_id: input.payment_id,
        merchant_id: input.merchant_id,
        customer_id: input.customer_id,
        amount: input.amount,
        currency: input.currency,
        country: input.country,
        device_fingerprint: input.device_fingerprint,
        ip_address: input.ip_address,
        context: { type: "payment_authorization" },
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      console.warn("SIRA scoring failed, using default score");
      return 0.5;
    }

    const data = (await response.json()) as any;
    return data.score || 0.5;
  } catch (error) {
    console.error("SIRA service error:", error);
    return 0.5; // Default to medium risk
  }
}
