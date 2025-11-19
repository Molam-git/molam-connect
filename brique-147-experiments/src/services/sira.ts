/**
 * SIRA Integration Service
 * Multi-armed bandit (Thompson Sampling) for experiment optimization
 */
import { pool } from '../db';

const SIRA_URL = process.env.SIRA_URL || 'http://localhost:4000';

interface BanditState {
  variant_id: string;
  alpha: number;
  beta: number;
  total_samples: number;
}

interface SiraDecisionRequest {
  experiment_id: string;
  molam_id: string;
  context?: any;
}

interface SiraDecisionResponse {
  variant_id: string;
  confidence: number;
  algorithm: string;
}

/**
 * Get optimal variant using Thompson Sampling
 */
export async function getOptimalVariant(
  experimentId: string,
  molamId: string
): Promise<string> {
  try {
    // Fetch bandit state for all variants
    const { rows } = await pool.query(
      `SELECT variant_id, alpha, beta, total_samples
       FROM experiment_bandit_state
       WHERE experiment_id = $1`,
      [experimentId]
    );

    if (rows.length === 0) {
      // Initialize bandit state for new experiment
      await initializeBanditState(experimentId);
      return await getOptimalVariant(experimentId, molamId);
    }

    // Thompson Sampling: sample from Beta distribution for each variant
    const samples = rows.map((state: BanditState) => ({
      variant_id: state.variant_id,
      sample: betaSample(state.alpha, state.beta)
    }));

    // Select variant with highest sample
    const winner = samples.reduce((max, curr) =>
      curr.sample > max.sample ? curr : max
    );

    return winner.variant_id;
  } catch (error) {
    console.error('SIRA decision error:', error);
    // Fallback to random selection
    return await getRandomVariant(experimentId);
  }
}

/**
 * Sample from Beta distribution (simple approximation)
 */
function betaSample(alpha: number, beta: number): number {
  // Using gamma distribution approximation
  const x = gammaSample(alpha, 1);
  const y = gammaSample(beta, 1);
  return x / (x + y);
}

/**
 * Sample from Gamma distribution (Marsaglia and Tsang method)
 */
function gammaSample(shape: number, scale: number): number {
  if (shape < 1) {
    return gammaSample(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x, v;
    do {
      x = normalSample();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v * scale;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v * scale;
    }
  }
}

/**
 * Sample from standard normal distribution (Box-Muller transform)
 */
function normalSample(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Initialize bandit state for all variants of an experiment
 */
async function initializeBanditState(experimentId: string): Promise<void> {
  const { rows: variants } = await pool.query(
    `SELECT id FROM experiment_variants WHERE experiment_id = $1`,
    [experimentId]
  );

  for (const variant of variants) {
    await pool.query(
      `INSERT INTO experiment_bandit_state (experiment_id, variant_id, alpha, beta, total_samples)
       VALUES ($1, $2, 1, 1, 0)
       ON CONFLICT (experiment_id, variant_id) DO NOTHING`,
      [experimentId, variant.id]
    );
  }
}

/**
 * Fallback: random variant selection
 */
async function getRandomVariant(experimentId: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT id FROM experiment_variants
     WHERE experiment_id = $1
     ORDER BY RANDOM()
     LIMIT 1`,
    [experimentId]
  );

  return rows[0]?.id;
}

/**
 * Update bandit state when metric arrives
 */
export async function updateBanditState(
  experimentId: string,
  variantId: string,
  isSuccess: boolean
): Promise<void> {
  const increment = isSuccess ? 'alpha = alpha + 1' : 'beta = beta + 1';

  await pool.query(
    `UPDATE experiment_bandit_state
     SET ${increment},
         total_samples = total_samples + 1,
         last_updated = now()
     WHERE experiment_id = $1 AND variant_id = $2`,
    [experimentId, variantId]
  );
}

/**
 * Check if experiment should be stopped (fail-fast)
 * Stop if P(variant is worse than best) > threshold for min_samples
 */
export async function shouldStopExperiment(
  experimentId: string,
  threshold: number = 0.95,
  minSamples: number = 100
): Promise<{ shouldStop: boolean; reason?: string; variantId?: string }> {
  const { rows } = await pool.query(
    `SELECT variant_id, alpha, beta, total_samples
     FROM experiment_bandit_state
     WHERE experiment_id = $1
     ORDER BY alpha DESC`,
    [experimentId]
  );

  if (rows.length < 2) {
    return { shouldStop: false };
  }

  const best = rows[0];

  for (let i = 1; i < rows.length; i++) {
    const current = rows[i];

    if (current.total_samples < minSamples) {
      continue;
    }

    // Calculate probability that current is worse than best
    const pWorse = calculateProbabilityWorse(
      current.alpha,
      current.beta,
      best.alpha,
      best.beta
    );

    if (pWorse > threshold) {
      return {
        shouldStop: true,
        reason: `Variant ${current.variant_id} is ${(pWorse * 100).toFixed(1)}% likely to be worse than best`,
        variantId: current.variant_id
      };
    }
  }

  return { shouldStop: false };
}

/**
 * Calculate P(A < B) for two Beta distributions using Monte Carlo
 */
function calculateProbabilityWorse(
  alpha1: number,
  beta1: number,
  alpha2: number,
  beta2: number,
  samples: number = 10000
): number {
  let worseThanBest = 0;

  for (let i = 0; i < samples; i++) {
    const sample1 = betaSample(alpha1, beta1);
    const sample2 = betaSample(alpha2, beta2);

    if (sample1 < sample2) {
      worseThanBest++;
    }
  }

  return worseThanBest / samples;
}

/**
 * Get SIRA insights for experiment
 */
export async function getExperimentInsights(
  experimentId: string
): Promise<any> {
  const { rows: states } = await pool.query(
    `SELECT
       ev.name as variant_name,
       ebs.alpha,
       ebs.beta,
       ebs.total_samples,
       ebs.alpha / (ebs.alpha + ebs.beta) as conversion_rate
     FROM experiment_bandit_state ebs
     JOIN experiment_variants ev ON ev.id = ebs.variant_id
     WHERE ebs.experiment_id = $1
     ORDER BY conversion_rate DESC`,
    [experimentId]
  );

  if (states.length === 0) {
    return { insights: [], recommendation: 'No data yet' };
  }

  const best = states[0];
  const insights = [];

  // Calculate confidence intervals (95%)
  for (const state of states) {
    const mean = state.conversion_rate;
    const variance = (state.alpha * state.beta) /
                    ((state.alpha + state.beta) ** 2 * (state.alpha + state.beta + 1));
    const stdDev = Math.sqrt(variance);

    insights.push({
      variant: state.variant_name,
      conversion_rate: parseFloat(mean.toFixed(4)),
      samples: state.total_samples,
      confidence_interval: {
        lower: Math.max(0, mean - 1.96 * stdDev),
        upper: Math.min(1, mean + 1.96 * stdDev)
      }
    });
  }

  return {
    insights,
    recommendation: states[0].total_samples > 100
      ? `Variant "${best.variant_name}" is currently leading with ${(best.conversion_rate * 100).toFixed(2)}% conversion`
      : 'Collect more data before making decisions'
  };
}
