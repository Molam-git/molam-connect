// Ledger Integration Client
// Interfaces with Brique 88 ledger system for holds and entries

import { pool } from '../utils/db';
import { v4 as uuidv4 } from 'uuid';

export interface LedgerHoldRequest {
  account_id: string; // entity ID (merchant, agent, etc.)
  amount: number;
  currency: string;
  reference: string; // payout-hold:{payout_id}
  reason?: string;
  expires_at?: Date;
}

export interface LedgerHoldResponse {
  hold_id: string;
  success: boolean;
  error?: string;
}

export interface LedgerEntryRequest {
  source_type: string; // 'payout'
  source_id: string; // payout_id
  external_ref: string; // idempotency key
  amount: number;
  currency: string;
  debit_account: string;
  credit_account: string;
  description: string;
  metadata?: any;
}

export interface LedgerEntryResponse {
  entry_id: string;
  success: boolean;
  error?: string;
}

/**
 * Create ledger hold to reserve funds for payout
 */
export async function createLedgerHold(
  request: LedgerHoldRequest
): Promise<LedgerHoldResponse> {
  try {
    // In production, this would call Brique 88 ledger API
    // For now, store in a holds table or use ledger_adjustments

    const hold_id = uuidv4();

    // Create hold entry in ledger
    // This is a simplified implementation - in production use proper ledger API
    await pool.query(
      `INSERT INTO ledger_holds (id, account_id, amount, currency, reference, reason, status, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, now())
       ON CONFLICT (reference) DO NOTHING`,
      [
        hold_id,
        request.account_id,
        request.amount,
        request.currency,
        request.reference,
        request.reason || 'payout_hold',
        request.expires_at || null,
      ]
    );

    console.log(`✅ Created ledger hold ${hold_id} for ${request.amount} ${request.currency}`);

    return {
      hold_id,
      success: true,
    };
  } catch (error: any) {
    console.error('Failed to create ledger hold:', error);
    return {
      hold_id: '',
      success: false,
      error: error.message,
    };
  }
}

/**
 * Release ledger hold
 */
export async function releaseLedgerHold(
  hold_id: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await pool.query(
      `UPDATE ledger_holds
       SET status = 'released', released_at = now(), release_reason = $2
       WHERE id = $1 AND status = 'active'`,
      [hold_id, reason || 'payout_completed']
    );

    console.log(`✅ Released ledger hold ${hold_id}`);

    return { success: true };
  } catch (error: any) {
    console.error('Failed to release ledger hold:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Release hold by reference (e.g., payout-hold:{payout_id})
 */
export async function releaseLedgerHoldByReference(
  reference: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { rowCount } = await pool.query(
      `UPDATE ledger_holds
       SET status = 'released', released_at = now(), release_reason = $2
       WHERE reference = $1 AND status = 'active'`,
      [reference, reason || 'payout_completed']
    );

    if (rowCount === 0) {
      console.warn(`⚠️  No active hold found for reference ${reference}`);
    } else {
      console.log(`✅ Released ledger hold for reference ${reference}`);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Failed to release ledger hold by reference:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create final ledger entry after payout settlement
 */
export async function createLedgerEntry(
  request: LedgerEntryRequest
): Promise<LedgerEntryResponse> {
  try {
    // In production, this creates journal entries via Brique 88 API
    // For now, simplified implementation

    const entry_id = uuidv4();

    // Create journal entry (double-entry bookkeeping)
    await pool.query('BEGIN');

    try {
      // Insert journal entry header
      await pool.query(
        `INSERT INTO journal_entries (id, entry_ref, source_type, source_id, entry_date, status, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_DATE, 'posted', now())
         ON CONFLICT (entry_ref) DO NOTHING`,
        [entry_id, request.external_ref, request.source_type, request.source_id]
      );

      // Insert debit line
      await pool.query(
        `INSERT INTO journal_lines (id, journal_entry_id, line_number, gl_code, debit, credit, currency, description, created_at)
         VALUES ($1, $2, 1, $3, $4, 0, $5, $6, now())`,
        [
          uuidv4(),
          entry_id,
          request.debit_account,
          request.amount,
          request.currency,
          `${request.description} - Debit`,
        ]
      );

      // Insert credit line
      await pool.query(
        `INSERT INTO journal_lines (id, journal_entry_id, line_number, gl_code, debit, credit, currency, description, created_at)
         VALUES ($1, $2, 2, $3, 0, $4, $5, $6, now())`,
        [
          uuidv4(),
          entry_id,
          request.credit_account,
          request.amount,
          request.currency,
          `${request.description} - Credit`,
        ]
      );

      await pool.query('COMMIT');

      console.log(`✅ Created ledger entry ${entry_id} for payout ${request.source_id}`);

      return {
        entry_id,
        success: true,
      };
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error: any) {
    console.error('Failed to create ledger entry:', error);
    return {
      entry_id: '',
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create ledger tables if they don't exist (for standalone operation)
 */
export async function initializeLedgerTables(): Promise<void> {
  // Create ledger_holds table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_holds (
      id UUID PRIMARY KEY,
      account_id UUID NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      currency TEXT NOT NULL,
      reference TEXT UNIQUE NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      expires_at TIMESTAMPTZ NULL,
      released_at TIMESTAMPTZ NULL,
      release_reason TEXT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Create journal_entries table (if not exists from B88)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id UUID PRIMARY KEY,
      entry_ref TEXT UNIQUE NOT NULL,
      source_type TEXT NOT NULL,
      source_id UUID NOT NULL,
      entry_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      posted_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Create journal_lines table (if not exists from B88)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS journal_lines (
      id UUID PRIMARY KEY,
      journal_entry_id UUID NOT NULL REFERENCES journal_entries(id),
      line_number INT NOT NULL,
      gl_code TEXT NOT NULL,
      debit NUMERIC(18,2) DEFAULT 0,
      credit NUMERIC(18,2) DEFAULT 0,
      currency TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  console.log('✅ Ledger tables initialized');
}

/**
 * Get hold by reference
 */
export async function getLedgerHold(reference: string): Promise<any | null> {
  const { rows } = await pool.query(
    `SELECT * FROM ledger_holds WHERE reference = $1`,
    [reference]
  );

  return rows[0] || null;
}

/**
 * Check if sufficient funds available (considering holds)
 */
export async function checkSufficientFunds(
  account_id: string,
  currency: string,
  amount: number
): Promise<{ sufficient: boolean; available_balance: number }> {
  // Query account balance
  const { rows: balanceRows } = await pool.query(
    `SELECT available_balance FROM treasury_accounts
     WHERE id = $1 AND currency = $2`,
    [account_id, currency]
  );

  if (balanceRows.length === 0) {
    return {
      sufficient: false,
      available_balance: 0,
    };
  }

  const available_balance = parseFloat(balanceRows[0].available_balance || '0');

  // Calculate active holds
  const { rows: holdsRows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as total_holds
     FROM ledger_holds
     WHERE account_id = $1 AND currency = $2 AND status = 'active'`,
    [account_id, currency]
  );

  const total_holds = parseFloat(holdsRows[0].total_holds || '0');
  const effective_balance = available_balance - total_holds;

  return {
    sufficient: effective_balance >= amount,
    available_balance: effective_balance,
  };
}
