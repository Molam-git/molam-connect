export function computeRiskScore({ volume, volatility, disputes }: { volume: number, volatility: number, disputes: number }): number {
    const v = Math.min(1, Math.log10(1 + volume) / 6);
    const vol = Math.min(1, volatility / Math.max(1, Math.sqrt(volume)));
    const d = Math.min(1, disputes / 50);

    const raw = 0.5 * v + 0.3 * vol + 0.2 * d;
    return Math.round(raw * 100 * 100) / 100;
}