/**
 * Brique 41 - Molam Connect
 * Idempotency utilities
 */

import { Pool, PoolClient } from "pg";

/**
 * Idempotent operation helper
 * Checks if a record already exists by a unique key (idempotency key),
 * if yes returns it, otherwise executes the insert function.
 *
 * @param db - Database connection pool or client
 * @param key - Idempotency key value
 * @param table - Table name
 * @param selector - Column name for the key (e.g., 'external_key')
 * @param insert - Function that performs the insert and returns the result
 */
export async function idempo<T>(
  db: Pool | PoolClient,
  key: string,
  table: string,
  selector: string,
  insert: () => Promise<T>
): Promise<T> {
  // Check if record already exists
  const { rows } = await db.query(
    `SELECT * FROM ${table} WHERE ${selector} = $1`,
    [key]
  );

  if (rows.length > 0) {
    console.log(`[Idempotency] Found existing record in ${table} with ${selector}=${key}`);
    return rows[0];
  }

  // Execute insert
  return insert();
}

/**
 * Generate idempotency key from request
 * Combines user ID and external key
 */
export function generateIdempotencyKey(userId: string, externalKey: string): string {
  return `${userId}:${externalKey}`;
}

/**
 * Validate idempotency key format
 */
export function isValidIdempotencyKey(key: string): boolean {
  if (!key || typeof key !== "string") {
    return false;
  }

  // Should be between 1 and 255 characters
  if (key.length < 1 || key.length > 255) {
    return false;
  }

  // Should not contain null bytes or control characters
  return !/[\x00-\x1F\x7F]/.test(key);
}
