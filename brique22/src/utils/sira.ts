export function siraScore({ fee, eta, success }: { fee: number; eta: number; success: number }): number {
    // Weighted score (lower fee/eta better, higher success better)
    const nf = 1 / (1 + fee);
    const ne = 1 / (1 + eta / 3600); // hours
    const ns = success / 100;
    return (0.55 * nf) + (0.25 * ne) + (0.20 * ns);
}