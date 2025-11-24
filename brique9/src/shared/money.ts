export function toMinor(amount: number, currency: string): number {
    const scale = ['JPY', 'XAF', 'XOF'].includes(currency) ? 0 : 2;
    return Math.round(amount * Math.pow(10, scale));
}

export function toMajor(minor: number, currency: string): number {
    const scale = ['JPY', 'XAF', 'XOF'].includes(currency) ? 0 : 2;
    return minor / Math.pow(10, scale);
}