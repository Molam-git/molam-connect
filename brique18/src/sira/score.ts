// src/sira/score.ts
export async function siraScore(params: {
    opType: string;
    agentId: number;
    emitterUserId: number;
    receiverUserId: number;
    amountMinor: number;
    currency: string;
    country_code: string;
}): Promise<{ score: number; flags: string[] }> {
    // Implémentation simplifiée du scoring
    const baseScore = 85;
    const flags: string[] = [];

    // Logique de scoring à implémenter
    if (params.amountMinor > 1000000) { // 10,000 XOF
        flags.push("HIGH_AMOUNT");
    }

    return {
        score: baseScore,
        flags
    };
}