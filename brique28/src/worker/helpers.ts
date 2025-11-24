// src/worker/helpers.ts
export function computeCost(providerBaseCost: number, zone: any): number {
    const markup = Number(zone.pricing_markup_pct || 0) / 100.0;
    let cost = Number(providerBaseCost) * (1 + markup);
    const minFee = Number(zone.min_fee || 0.01);
    const maxFee = Number(zone.max_fee || 5.0);
    cost = Math.max(cost, minFee);
    cost = Math.min(cost, maxFee);
    return Number(cost.toFixed(6));
}

export function computeBackoff(retries: number, maxBackoffSec: number): number {
    const base = Math.min(Math.pow(2, retries) * 5, maxBackoffSec);
    const jitter = Math.floor(Math.random() * 5);
    return base + jitter;
}