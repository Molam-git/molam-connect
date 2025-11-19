export async function computeSiraScore(input: { metrics: any; current: number; t: any }) {
  const vol = input.metrics?.volatility || 1.0;
  const matchRate = input.metrics?.match_rate || 0.98;
  const bankRisk = 0.1;
  const costDelta = input.metrics?.avg_fee || 0.0025;

  const raw = matchRate * 0.5 + (1 / vol) * 0.3 + (1 - bankRisk) * 0.15 + (1 - costDelta) * 0.05;
  return Math.round(raw * 10000) / 10000;
}

