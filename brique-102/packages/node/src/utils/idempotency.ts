/**
 * Idempotency utilities
 */
import { v4 as uuidv4 } from "uuid";

export function ensureIdempotencyKey(headers?: Record<string,string>|null) {
  const existing = headers?.["Idempotency-Key"] || headers?.["idempotency-key"];
  return existing || uuidv4();
}
