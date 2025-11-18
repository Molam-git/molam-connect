/**
 * Retry utilities for HTTP requests
 */

export function backoff(attempt: number) {
  // deterministic backoff sequence (ms) - safe for webhooks & SDK retries
  const seq = [200, 500, 1000, 2000, 5000];
  return seq[Math.min(attempt, seq.length - 1)];
}

export function isRetryableStatus(status?: number) {
  if (!status) return true;
  if (status >= 500) return true;
  if ([408, 429, 425].includes(status)) return true;
  return false;
}
