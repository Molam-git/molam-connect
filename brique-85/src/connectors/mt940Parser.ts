/**
 * Brique 85 — Bank Connectors
 * MT940 Parser for Bank Statement Ingestion
 *
 * MT940 is a SWIFT standard format for bank statements
 * Supports multiple bank variants (Deutsche Bank, BNP, Standard, etc.)
 */

import { StatementLine } from './interface';

// =====================================================================
// TYPES
// =====================================================================

export interface MT940Statement {
  // Header
  statement_ref?: string;           // :20: Transaction reference
  account_number?: string;          // :25: Account identification
  statement_number?: string;        // :28C: Statement number/sequence

  // Balances
  opening_balance?: MT940Balance;   // :60F: Opening balance
  closing_balance?: MT940Balance;   // :62F: Closing balance

  // Transactions
  transactions: MT940Transaction[];

  // Metadata
  currency?: string;
  raw_text?: string;
}

export interface MT940Balance {
  debit_credit: 'D' | 'C';
  date: string;                     // YYMMDD format
  currency: string;
  amount: number;
}

export interface MT940Transaction {
  // :61: Statement line
  value_date: string;               // YYMMDD
  entry_date?: string;              // MMDD (optional)
  debit_credit: 'D' | 'C';
  amount: number;
  transaction_type?: string;        // N (SWIFT), F (customer)
  reference?: string;               // Customer reference

  // :86: Information to account owner
  description?: string;
  structured_ref?: string;
  counterparty_name?: string;
  counterparty_account?: string;

  // Computed
  balance_after?: number;
}

export interface MT940ParserConfig {
  variant?: 'standard' | 'deutsche_bank' | 'bnp' | 'ing' | 'rabo';
  strict_mode?: boolean;            // Throw on parse errors vs. continue
  include_raw_text?: boolean;       // Include raw MT940 text in output
}

// =====================================================================
// MT940 PARSER
// =====================================================================

export class MT940Parser {
  private config: MT940ParserConfig;

  constructor(config: MT940ParserConfig = {}) {
    this.config = {
      variant: 'standard',
      strict_mode: false,
      include_raw_text: false,
      ...config
    };
  }

  /**
   * Parse MT940 file buffer into statements
   */
  parse(buffer: Buffer | string): MT940Statement[] {
    const text = typeof buffer === 'string' ? buffer : buffer.toString('utf-8');

    // Split into individual statements (separated by :20: tags or -}{)
    const statementBlocks = this.splitStatements(text);

    const statements: MT940Statement[] = [];

    for (const block of statementBlocks) {
      try {
        const statement = this.parseStatement(block);
        statements.push(statement);
      } catch (error: any) {
        if (this.config.strict_mode) {
          throw error;
        }
        console.error('Failed to parse statement block:', error.message);
        // Continue with next block
      }
    }

    return statements;
  }

  /**
   * Split MT940 text into individual statement blocks
   */
  private splitStatements(text: string): string[] {
    // Remove any BOM or leading whitespace
    const cleaned = text.replace(/^\uFEFF/, '').trim();

    // Split by statement separator (multiple approaches for different formats)
    // Method 1: Split by -}{ or similar separators
    let blocks = cleaned.split(/-}{1,}/);

    // Method 2: If no separators, split by :20: (transaction reference)
    if (blocks.length === 1) {
      blocks = cleaned.split(/(?=:20:)/);
    }

    return blocks.filter(b => b.trim().length > 0);
  }

  /**
   * Parse a single statement block
   */
  private parseStatement(block: string): MT940Statement {
    const statement: MT940Statement = {
      transactions: []
    };

    if (this.config.include_raw_text) {
      statement.raw_text = block;
    }

    // Extract fields using regex patterns

    // :20: Transaction reference
    const ref20 = block.match(/:20:(.+)/);
    if (ref20) {
      statement.statement_ref = ref20[1].trim();
    }

    // :25: Account identification
    const ref25 = block.match(/:25:(.+)/);
    if (ref25) {
      statement.account_number = ref25[1].trim();
    }

    // :28C: Statement number/sequence
    const ref28C = block.match(/:28C?:(.+)/);
    if (ref28C) {
      statement.statement_number = ref28C[1].trim();
    }

    // :60F: Opening balance
    const ref60F = block.match(/:60F:([CD])(\d{6})([A-Z]{3})([\d,\.]+)/);
    if (ref60F) {
      statement.opening_balance = {
        debit_credit: ref60F[1] as 'D' | 'C',
        date: ref60F[2],
        currency: ref60F[3],
        amount: this.parseAmount(ref60F[4]) * (ref60F[1] === 'D' ? -1 : 1)
      };
      statement.currency = ref60F[3];
    }

    // :62F: Closing balance
    const ref62F = block.match(/:62F:([CD])(\d{6})([A-Z]{3})([\d,\.]+)/);
    if (ref62F) {
      statement.closing_balance = {
        debit_credit: ref62F[1] as 'D' | 'C',
        date: ref62F[2],
        currency: ref62F[3],
        amount: this.parseAmount(ref62F[4]) * (ref62F[1] === 'D' ? -1 : 1)
      };
    }

    // :61: Statement lines (transactions)
    statement.transactions = this.parseTransactions(block);

    // Calculate running balance if opening balance available
    if (statement.opening_balance) {
      let runningBalance = statement.opening_balance.amount;
      for (const txn of statement.transactions) {
        runningBalance += txn.amount * (txn.debit_credit === 'D' ? -1 : 1);
        txn.balance_after = runningBalance;
      }
    }

    return statement;
  }

  /**
   * Parse transactions from :61: and :86: tags
   */
  private parseTransactions(block: string): MT940Transaction[] {
    const transactions: MT940Transaction[] = [];

    // Regex for :61: tag (statement line)
    // Format: :61:YYMMDD[MMDD][C|D][amount][transaction type][reference]
    const txnRegex = /:61:(\d{6})(\d{4})?([CD])([\d,\.]+)([A-Z])([^\r\n]*)/g;

    let match;
    const txnMatches: Array<{ index: number; match: RegExpExecArray }> = [];

    while ((match = txnRegex.exec(block)) !== null) {
      txnMatches.push({ index: match.index, match });
    }

    for (let i = 0; i < txnMatches.length; i++) {
      const { match } = txnMatches[i];

      const txn: MT940Transaction = {
        value_date: match[1],
        entry_date: match[2],
        debit_credit: match[3] as 'D' | 'C',
        amount: this.parseAmount(match[4]),
        transaction_type: match[5],
        reference: match[6] ? match[6].trim() : undefined
      };

      // Find corresponding :86: tag (information to account owner)
      const nextTxnIndex = i + 1 < txnMatches.length ? txnMatches[i + 1].index : block.length;
      const txnBlock = block.substring(match.index, nextTxnIndex);

      const ref86Match = txnBlock.match(/:86:([\s\S]*?)(?=:61:|:62|$)/);
      if (ref86Match) {
        const info86 = ref86Match[1].trim();
        txn.description = this.parse86Field(info86, txn);
      }

      transactions.push(txn);
    }

    return transactions;
  }

  /**
   * Parse :86: field (bank-specific formats)
   */
  private parse86Field(text: string, txn: MT940Transaction): string {
    // Clean up line breaks and multiple spaces
    const cleaned = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();

    // Apply bank-specific parsing
    if (this.config.variant === 'deutsche_bank') {
      return this.parse86DeutscheBank(cleaned, txn);
    } else if (this.config.variant === 'bnp') {
      return this.parse86BNP(cleaned, txn);
    } else {
      return this.parse86Standard(cleaned, txn);
    }
  }

  /**
   * Parse Deutsche Bank :86: format
   */
  private parse86DeutscheBank(text: string, txn: MT940Transaction): string {
    // Deutsche Bank format: structured with codes
    // Example: 177?00SEPA-UEBERWEISUNG?10999?20EREF+...?30DEUTSCHE BANK?31DE...?32NAME

    const parts = text.split('?');
    let description = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part.startsWith('20') || part.startsWith('21')) {
        // Remittance info
        description += part.substring(2) + ' ';
      } else if (part.startsWith('30')) {
        // Bank name
        txn.counterparty_name = part.substring(2);
      } else if (part.startsWith('31')) {
        // IBAN
        txn.counterparty_account = part.substring(2);
      } else if (part.startsWith('32') || part.startsWith('33')) {
        // Counterparty name
        if (!txn.counterparty_name) {
          txn.counterparty_name = part.substring(2);
        }
      }
    }

    return description.trim() || text;
  }

  /**
   * Parse BNP Paribas :86: format
   */
  private parse86BNP(text: string, txn: MT940Transaction): string {
    // BNP format: similar to Deutsche Bank but different codes
    // Implement BNP-specific parsing logic here
    return this.parse86Standard(text, txn);
  }

  /**
   * Parse standard :86: format
   */
  private parse86Standard(text: string, txn: MT940Transaction): string {
    // Standard format: plain text description
    // Try to extract structured information if present

    // Extract IBAN if present
    const ibanMatch = text.match(/([A-Z]{2}\d{2}[A-Z0-9]+)/);
    if (ibanMatch) {
      txn.counterparty_account = ibanMatch[1];
    }

    // Extract reference if present (EREF+... or similar)
    const erefMatch = text.match(/EREF\+([A-Z0-9]+)/);
    if (erefMatch) {
      txn.structured_ref = erefMatch[1];
    }

    return text;
  }

  /**
   * Parse amount (handles comma and dot as decimal separators)
   */
  private parseAmount(amountStr: string): number {
    // Replace comma with dot (European format)
    const normalized = amountStr.replace(',', '.');
    return parseFloat(normalized);
  }

  /**
   * Convert MT940 date (YYMMDD) to ISO format (YYYY-MM-DD)
   */
  private convertDate(yymmdd: string): string {
    if (yymmdd.length !== 6) {
      throw new Error(`Invalid date format: ${yymmdd}`);
    }

    const yy = parseInt(yymmdd.substring(0, 2));
    const mm = yymmdd.substring(2, 4);
    const dd = yymmdd.substring(4, 6);

    // Assume 20xx for years < 50, otherwise 19xx
    const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;

    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Convert MT940 statement to normalized statement lines
   */
  toStatementLines(statement: MT940Statement): StatementLine[] {
    return statement.transactions.map(txn => ({
      transaction_date: this.convertDate(txn.value_date),
      value_date: txn.entry_date ? this.convertDate(txn.value_date) : undefined,
      amount: txn.amount * (txn.debit_credit === 'D' ? -1 : 1),
      currency: statement.currency || 'EUR',
      debit_credit: txn.debit_credit,
      bank_reference: txn.reference,
      end_to_end_id: txn.structured_ref,
      description: txn.description,
      counterparty_name: txn.counterparty_name,
      counterparty_account: txn.counterparty_account,
      balance_after: txn.balance_after,
      metadata: {
        transaction_type: txn.transaction_type,
        statement_ref: statement.statement_ref,
        statement_number: statement.statement_number
      }
    }));
  }
}

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Parse MT940 buffer and return normalized statement lines
 */
export function parseMT940ToLines(
  buffer: Buffer | string,
  config?: MT940ParserConfig
): StatementLine[] {
  const parser = new MT940Parser(config);
  const statements = parser.parse(buffer);

  const allLines: StatementLine[] = [];
  for (const statement of statements) {
    const lines = parser.toStatementLines(statement);
    allLines.push(...lines);
  }

  return allLines;
}

/**
 * Validate MT940 format
 */
export function validateMT940(text: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for required tags
  if (!text.includes(':20:')) {
    errors.push('Missing :20: (transaction reference)');
  }

  if (!text.includes(':25:')) {
    errors.push('Missing :25: (account identification)');
  }

  if (!text.includes(':60F:')) {
    errors.push('Missing :60F: (opening balance)');
  }

  if (!text.includes(':62F:')) {
    errors.push('Missing :62F: (closing balance)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
