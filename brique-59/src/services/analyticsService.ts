import { pool } from '../utils/db';

/**
 * Profile Builder & Benchmark Engine
 * Aggregates dispute analytics and sector benchmarks
 */

export async function buildMerchantProfile(merchantId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Aggregate dispute stats
    const { rows: stats } = await client.query(
      `SELECT
         COUNT(*) as total_disputes,
         COUNT(*) FILTER (WHERE outcome = 'won') as disputes_won,
         COUNT(*) FILTER (WHERE outcome = 'lost') as disputes_lost,
         COUNT(*) FILTER (WHERE outcome = 'settled') as disputes_settled,
         AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/86400) as avg_resolution_days,
         AVG(amount) as avg_dispute_amount,
         SUM(amount) FILTER (WHERE outcome = 'lost') as total_chargebacks
       FROM disputes
       WHERE merchant_id = $1 AND resolved_at IS NOT NULL`,
      [merchantId]
    );

    const stat = stats[0];
    const total = parseInt(stat.total_disputes || '0', 10);
    const won = parseInt(stat.disputes_won || '0', 10);
    const lost = parseInt(stat.disputes_lost || '0', 10);
    const win_rate = total > 0 ? (won / total) * 100 : 0;
    const loss_rate = total > 0 ? (lost / total) * 100 : 0;

    // Get evidence metrics
    const { rows: evidenceStats } = await client.query(
      `SELECT AVG(evidence_count) as avg_count
       FROM (
         SELECT dispute_id, COUNT(*) as evidence_count
         FROM dispute_evidence de
         JOIN disputes d ON d.id = de.dispute_id
         WHERE d.merchant_id = $1
         GROUP BY dispute_id
       ) sub`,
      [merchantId]
    );

    // Get sector/country from merchant
    const { rows: merchants } = await client.query(
      'SELECT sector, country FROM merchants WHERE id = $1',
      [merchantId]
    );
    const merchant = merchants[0] || { sector: 'unknown', country: 'unknown' };

    // Get sector benchmark
    const benchmark = await getSectorBenchmark(merchant.sector, merchant.country);

    // Calculate SIRA accuracy
    const { rows: accuracyStats } = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE prediction_correct = true) as correct,
         COUNT(*) as total
       FROM sira_predictions sp
       JOIN disputes d ON d.id = sp.dispute_id
       WHERE d.merchant_id = $1 AND sp.actual_outcome IS NOT NULL`,
      [merchantId]
    );

    const sira_accuracy =
      accuracyStats[0].total > 0 ? (accuracyStats[0].correct / accuracyStats[0].total) * 100 : 0;

    // Upsert profile
    await client.query(
      `INSERT INTO merchant_dispute_profiles (
        merchant_id, total_disputes, disputes_won, disputes_lost, disputes_settled,
        win_rate, loss_rate, avg_resolution_days, avg_dispute_amount, total_chargebacks,
        sector, country, benchmark_win_rate, avg_evidence_count, sira_accuracy, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      ON CONFLICT (merchant_id) DO UPDATE SET
        total_disputes = EXCLUDED.total_disputes,
        disputes_won = EXCLUDED.disputes_won,
        disputes_lost = EXCLUDED.disputes_lost,
        disputes_settled = EXCLUDED.disputes_settled,
        win_rate = EXCLUDED.win_rate,
        loss_rate = EXCLUDED.loss_rate,
        avg_resolution_days = EXCLUDED.avg_resolution_days,
        avg_dispute_amount = EXCLUDED.avg_dispute_amount,
        total_chargebacks = EXCLUDED.total_chargebacks,
        benchmark_win_rate = EXCLUDED.benchmark_win_rate,
        avg_evidence_count = EXCLUDED.avg_evidence_count,
        sira_accuracy = EXCLUDED.sira_accuracy,
        last_updated = NOW()`,
      [
        merchantId,
        total,
        won,
        lost,
        parseInt(stat.disputes_settled || '0', 10),
        win_rate,
        loss_rate,
        parseFloat(stat.avg_resolution_days || '0'),
        parseFloat(stat.avg_dispute_amount || '0'),
        parseFloat(stat.total_chargebacks || '0'),
        merchant.sector,
        merchant.country,
        benchmark.avg_win_rate,
        parseFloat(evidenceStats[0]?.avg_count || '0'),
        sira_accuracy,
      ]
    );

    await client.query('COMMIT');
    console.log(`[ProfileBuilder] Updated profile for merchant ${merchantId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function buildSectorBenchmarks(sector: string, country: string, currency?: string): Promise<void> {
  // Calculate 90-day rolling window
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - 90);

  let query = `SELECT
       COUNT(DISTINCT m.merchant_id) as merchant_count,
       AVG(m.win_rate) as avg_win_rate,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY m.win_rate) as median_win_rate,
       PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY m.win_rate) as p25_win_rate,
       PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY m.win_rate) as p75_win_rate,
       AVG(m.avg_resolution_days) as avg_resolution_days,
       SUM(m.total_disputes) as total_disputes,
       AVG(m.auto_resolution_rate) as auto_resolution_rate
     FROM merchant_dispute_profiles m
     WHERE m.sector = $1 AND m.country = $2`;

  const params: any[] = [sector, country];

  if (currency) {
    query += ` AND m.currency = $3`;
    params.push(currency);
  }

  const { rows: stats } = await pool.query(query, params);

  await pool.query(
    `INSERT INTO sector_benchmarks (
      sector, country, period_start, period_end, merchant_count, avg_win_rate,
      median_win_rate, p25_win_rate, p75_win_rate, avg_resolution_days, total_disputes, auto_resolution_rate
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (sector, country, period_start, period_end) DO UPDATE SET
      merchant_count = EXCLUDED.merchant_count,
      avg_win_rate = EXCLUDED.avg_win_rate,
      median_win_rate = EXCLUDED.median_win_rate,
      p25_win_rate = EXCLUDED.p25_win_rate,
      p75_win_rate = EXCLUDED.p75_win_rate,
      avg_resolution_days = EXCLUDED.avg_resolution_days,
      total_disputes = EXCLUDED.total_disputes,
      auto_resolution_rate = EXCLUDED.auto_resolution_rate`,
    [
      sector,
      country,
      periodStart,
      periodEnd,
      stats[0].merchant_count || 0,
      parseFloat(stats[0].avg_win_rate || '0'),
      parseFloat(stats[0].median_win_rate || '0'),
      parseFloat(stats[0].p25_win_rate || '0'),
      parseFloat(stats[0].p75_win_rate || '0'),
      parseFloat(stats[0].avg_resolution_days || '0'),
      parseInt(stats[0].total_disputes || '0', 10),
      parseFloat(stats[0].auto_resolution_rate || '0'),
    ]
  );

  console.log(`[BenchmarkEngine] Updated benchmark for ${sector}/${country}${currency ? `/${currency}` : ''}`);
}

async function getSectorBenchmark(sector: string, country: string): Promise<{ avg_win_rate: number }> {
  const { rows } = await pool.query(
    `SELECT avg_win_rate FROM sector_benchmarks
     WHERE sector = $1 AND country = $2
     ORDER BY period_end DESC LIMIT 1`,
    [sector, country]
  );

  return rows[0] || { avg_win_rate: 50 };
}

export async function generateRecommendations(merchantId: string): Promise<void> {
  const { rows: profiles } = await pool.query(
    'SELECT * FROM merchant_dispute_profiles WHERE merchant_id = $1',
    [merchantId]
  );

  if (profiles.length === 0) return;

  const profile = profiles[0];

  // Check if merchant is underperforming
  if (profile.win_rate < profile.benchmark_win_rate - 10) {
    await pool.query(
      `INSERT INTO sira_recommendations (
        merchant_id, recommendation_type, priority, title, description,
        potential_impact_win_rate, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '30 days')
      ON CONFLICT DO NOTHING`,
      [
        merchantId,
        'evidence_improvement',
        'high',
        'Improve Evidence Quality',
        `Your win rate (${profile.win_rate.toFixed(1)}%) is below sector average (${profile.benchmark_win_rate.toFixed(1)}%). Consider submitting more comprehensive evidence like delivery confirmations and customer communications.`,
        profile.benchmark_win_rate - profile.win_rate,
      ]
    );
  }

  // Check evidence count
  if (profile.avg_evidence_count < 2) {
    await pool.query(
      `INSERT INTO sira_recommendations (
        merchant_id, recommendation_type, priority, title, description, expires_at
      ) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '30 days')
      ON CONFLICT DO NOTHING`,
      [
        merchantId,
        'process_optimization',
        'medium',
        'Submit More Evidence',
        `Average ${profile.avg_evidence_count.toFixed(1)} documents per dispute. Aim for 3-5 pieces of evidence to strengthen your cases.`,
      ]
    );
  }
}
