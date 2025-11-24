export function exponentialBackoffMs(attempt: number, baseDelay: number, maxDelay: number): number {
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    return Math.floor(delay * (0.5 + Math.random()));
}