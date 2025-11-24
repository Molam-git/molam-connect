export async function scoreCycleRisk(input: {
    agentId: string; currency: string; gross: number; events: number;
}): Promise<number> {
    let score = 0;
    if (input.gross > 5000) score += 40;
    if (input.events > 100) score += 20;
    return score;
}