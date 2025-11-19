// ============================================================================
// SIRA Integration for FX Provider Weighting
// ============================================================================

/**
 * callSiraForWeights - Get SIRA-weighted provider recommendations
 * In production: call SIRA microservice via gRPC/HTTP
 */
export async function callSiraForWeights(providers: any[], pair: string) {
  // Simple weighting: confidence × (inverse of priority index)
  const weights = providers.map((p: any, i: number) => ({
    provider_id: p.provider_id,
    rate: p.rate,
    weight: (p.confidence || 1.0) * (1 / (1 + i * 0.1))
  }));
  return weights;
}

/**
 * getSiraFXRecommendation - Get final recommended rate
 */
export async function getSiraFXRecommendation(candidates: any[], pair: string) {
  const weights = candidates.map((c: any) => ({
    provider_id: c.provider_id,
    rate: c.rate,
    weight: c.confidence || 1.0
  }));

  let total = 0, weighted = 0;
  for (const w of weights) {
    total += w.weight;
    weighted += w.rate * w.weight;
  }

  return { rate: total ? (weighted / total) : candidates[0].rate };
}
