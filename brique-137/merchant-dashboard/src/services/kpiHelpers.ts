// ============================================================================
// KPI Computation Helpers
// ============================================================================

import { pool } from "../utils/db";
import { logger } from "../utils/logger";

export interface KPIValue {
  value: number;
  currency: string;
  usd_equivalent?: number;
  txn_count?: number;
}

export interface KPISummary {
  sales: KPIValue;
  refunds: KPIValue;
  fees: KPIValue;
  net_revenue: KPIValue;
  chargeback_rate?: KPIValue;
  conversion_rate?: KPIValue;
  avg_ticket?: KPIValue;
}

/**
 * Compute KPIs from materialized view for a given period
 */
export async function computeKPIsFromMV(
  merchantId: string,
  period: string,
  currency: string
): Promise<KPISummary> {
  const dateRange = parsePeriod(period);

  const { rows } = await pool.query(
    `SELECT
      COALESCE(SUM(total_sales), 0) as total_sales,
      COALESCE(SUM(total_refunds), 0) as total_refunds,
      COALESCE(SUM(total_fees), 0) as total_fees,
      COALESCE(SUM(payment_count), 0) as payment_count,
      COALESCE(SUM(refund_count), 0) as refund_count
    FROM mv_merchant_tx_agg
    WHERE merchant_id = $1
      AND day >= $2
      AND day <= $3
      AND currency = $4`,
    [merchantId, dateRange.from, dateRange.to, currency]
  );

  const data = rows[0];
  const sales = parseFloat(data.total_sales || "0");
  const refunds = parseFloat(data.total_refunds || "0");
  const fees = parseFloat(data.total_fees || "0");
  const netRevenue = sales - refunds - fees;
  const paymentCount = parseInt(data.payment_count || "0", 10);
  const refundCount = parseInt(data.refund_count || "0", 10);

  // Get USD conversion rate
  const usdRate = await getFXRate(currency, "USD");

  const kpi: KPISummary = {
    sales: {
      value: sales,
      currency,
      usd_equivalent: sales * usdRate,
      txn_count: paymentCount,
    },
    refunds: {
      value: refunds,
      currency,
      usd_equivalent: refunds * usdRate,
      txn_count: refundCount,
    },
    fees: {
      value: fees,
      currency,
      usd_equivalent: fees * usdRate,
    },
    net_revenue: {
      value: netRevenue,
      currency,
      usd_equivalent: netRevenue * usdRate,
    },
  };

  // Compute additional metrics
  if (paymentCount > 0) {
    kpi.avg_ticket = {
      value: sales / paymentCount,
      currency,
      usd_equivalent: (sales / paymentCount) * usdRate,
    };
  }

  // Chargeback rate (from disputes table)
  const { rows: chargebackRows } = await pool.query(
    `SELECT COUNT(*) as chargeback_count
     FROM disputes
     WHERE merchant_id = $1
       AND type = 'chargeback'
       AND created_at >= $2
       AND created_at <= $3`,
    [merchantId, dateRange.from, dateRange.to]
  );

  const chargebackCount = parseInt(chargebackRows[0]?.chargeback_count || "0", 10);
  if (paymentCount > 0) {
    kpi.chargeback_rate = {
      value: (chargebackCount / paymentCount) * 100, // percentage
      currency: "%",
    };
  }

  logger.info("KPIs computed", {
    merchant_id: merchantId,
    period,
    sales,
    refunds,
    fees,
    net_revenue: netRevenue,
  });

  return kpi;
}

/**
 * Parse period string into date range
 */
function parsePeriod(period: string): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today":
      return {
        from: today.toISOString().split("T")[0],
        to: today.toISOString().split("T")[0],
      };

    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        from: yesterday.toISOString().split("T")[0],
        to: yesterday.toISOString().split("T")[0],
      };
    }

    case "last_7d": {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return {
        from: weekAgo.toISOString().split("T")[0],
        to: today.toISOString().split("T")[0],
      };
    }

    case "mtd": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        from: monthStart.toISOString().split("T")[0],
        to: today.toISOString().split("T")[0],
      };
    }

    case "ytd": {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return {
        from: yearStart.toISOString().split("T")[0],
        to: today.toISOString().split("T")[0],
      };
    }

    default: {
      // custom:YYYY-MM-DD:YYYY-MM-DD
      if (period.startsWith("custom:")) {
        const [, from, to] = period.split(":");
        return { from, to };
      }

      // Fallback to MTD
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        from: monthStart.toISOString().split("T")[0],
        to: today.toISOString().split("T")[0],
      };
    }
  }
}

/**
 * Get FX rate from cache or service
 */
async function getFXRate(from: string, to: string): Promise<number> {
  if (from === to) return 1.0;

  try {
    const { rows } = await pool.query(
      `SELECT rate FROM fx_rates WHERE from_currency = $1 AND to_currency = $2 AND date = CURRENT_DATE LIMIT 1`,
      [from, to]
    );

    if (rows.length > 0) {
      return parseFloat(rows[0].rate);
    }

    // Fallback rates
    const fallbackRates: Record<string, number> = {
      "XOF-USD": 0.0017,
      "GHS-USD": 0.085,
      "NGN-USD": 0.0013,
      "KES-USD": 0.0077,
      "USD-XOF": 590,
      "USD-GHS": 11.8,
      "USD-NGN": 770,
      "USD-KES": 130,
    };

    return fallbackRates[`${from}-${to}`] || 1.0;
  } catch (error: any) {
    logger.error("Failed to get FX rate", { from, to, error: error.message });
    return 1.0;
  }
}

/**
 * Cache KPIs for fast retrieval
 */
export async function cacheKPIs(
  merchantId: string,
  period: string,
  kpis: KPISummary
): Promise<void> {
  const now = new Date();

  for (const [key, value] of Object.entries(kpis)) {
    if (!value) continue;

    await pool.query(
      `INSERT INTO merchant_kpis_cache(merchant_id, period, kpi_key, value, currency, usd_equivalent, txn_count, computed_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (merchant_id, period, kpi_key, currency)
       DO UPDATE SET
         value = EXCLUDED.value,
         usd_equivalent = EXCLUDED.usd_equivalent,
         txn_count = EXCLUDED.txn_count,
         computed_at = EXCLUDED.computed_at`,
      [
        merchantId,
        period,
        key,
        value.value,
        value.currency,
        value.usd_equivalent || null,
        value.txn_count || null,
        now,
      ]
    );
  }

  logger.info("KPIs cached", { merchant_id: merchantId, period });
}
