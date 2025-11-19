// ============================================================================
// Brique 121 — Connector Logger
// ============================================================================

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export interface ConnectorLogEntry {
  connector_id: string;
  operation: string;
  payout_slice_id?: string;
  statement_id?: string;
  trace_id: string;
  request_payload?: any;
  response_payload?: any;
  status: 'success' | 'failed' | 'timeout' | 'circuit_open';
  duration_ms: number;
  error_message?: string;
}

export async function logConnectorExecution(entry: ConnectorLogEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO bank_connector_logs
       (connector_id, operation, payout_slice_id, statement_id, trace_id, request_payload, response_payload, status, duration_ms, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.connector_id,
        entry.operation,
        entry.payout_slice_id || null,
        entry.statement_id || null,
        entry.trace_id,
        entry.request_payload ? JSON.stringify(entry.request_payload) : null,
        entry.response_payload ? JSON.stringify(entry.response_payload) : null,
        entry.status,
        entry.duration_ms,
        entry.error_message || null
      ]
    );
  } catch (error: any) {
    console.error('Failed to log connector execution:', error.message);
  }
}
