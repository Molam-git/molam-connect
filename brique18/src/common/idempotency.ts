// src/common/idempotency.ts
import { Pool } from "pg";
import { Request } from "express";

export async function ensureIdempotency(pool: Pool, idempotencyKey: string, req: Request): Promise<void> {
  const { rows } = await pool.query(
    'SELECT 1 FROM molam_cash_operations WHERE idempotency_key = $1',
    [idempotencyKey]
  );
  
  if (rows.length > 0) {
    throw new Error("Idempotency key already used");
  }
}