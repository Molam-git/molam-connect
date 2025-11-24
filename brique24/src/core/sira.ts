export type SiraHint = { route: string; label: string; score: number };
export function pickBest(hints: SiraHint[]): SiraHint | undefined {
    return hints.sort((a, b) => b.score - a.score)[0];
}