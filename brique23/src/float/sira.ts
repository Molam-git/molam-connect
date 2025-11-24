// SIRA placeholder: combine coût (frais transfer), SLA, risque concentration
export function scoreMove(params: { cost: number; etaSec: number; dstConcentration: number }): number {
    const nf = 1 / (1 + params.cost);
    const ne = 1 / (1 + params.etaSec / 3600);
    const nr = 1 / (1 + params.dstConcentration); // plus concentré => score baisse
    return Number((0.5 * nf + 0.3 * ne + 0.2 * nr).toFixed(4));
}

// Fonction de prédiction de demande (stub)
export function predictDemand(accountId: number, windowStart: Date, windowEnd: Date): { outflow: number; inflow: number } {
    // Implémentation réelle à connecter avec le modèle ML SIRA
    return {
        outflow: Math.random() * 10000,
        inflow: Math.random() * 15000
    };
}