// ============================================================================
// Brique 121 — MT940 Parser
// ============================================================================
// Purpose: Parse MT940 SWIFT bank statement format
// Standard: SWIFT MT940 Customer Statement Message
// ============================================================================

import { BankStatementLine } from '../types';

/**
 * MT940 statement structure
 */
export interface MT940Statement {
  transaction_reference: string;
  account_number: string;
  statement_number: string;
  opening_balance?: MT940Balance;
  closing_balance?: MT940Balance;
  transactions: MT940Transaction[];
  information_to_account_owner?: string;
}

/**
 * MT940 balance
 */
export interface MT940Balance {
  debit_credit: 'D' | 'C';
  date: string;
  currency: string;
  amount: number;
}

/**
 * MT940 transaction
 */
export interface MT940Transaction {
  value_date: string;
  entry_date?: string;
  debit_credit: 'D' | 'C';
  amount: number;
  transaction_type: string;
  reference: string;
  account_owner_reference?: string;
  bank_reference?: string;
  supplementary_details?: string;
}

/**
 * Parse MT940 file content
 */
export function parseMT940(content: string): BankStatementLine[] {
  const statements = splitStatements(content);
  const lines: BankStatementLine[] = [];

  for (const statementText of statements) {
    const statement = parseStatement(statementText);
    lines.push(...convertToStatementLines(statement));
  }

  return lines;
}

/**
 * Split content into individual statements
 */
function splitStatements(content: string): string[] {
  // MT940 statements typically start with :20: (Transaction Reference)
  const statements: string[] = [];
  const lines = content.split('\n');
  let currentStatement: string[] = [];

  for (const line of lines) {
    if (line.startsWith(':20:') && currentStatement.length > 0) {
      statements.push(currentStatement.join('\n'));
      currentStatement = [];
    }
    currentStatement.push(line);
  }

  if (currentStatement.length > 0) {
    statements.push(currentStatement.join('\n'));
  }

  return statements;
}

/**
 * Parse single MT940 statement
 */
function parseStatement(text: string): MT940Statement {
  const statement: MT940Statement = {
    transaction_reference: '',
    account_number: '',
    statement_number: '',
    transactions: []
  };

  const fields = extractFields(text);

  for (const [tag, value] of Object.entries(fields)) {
    switch (tag) {
      case '20': // Transaction Reference
        statement.transaction_reference = value;
        break;

      case '25': // Account Identification
        statement.account_number = value;
        break;

      case '28C': // Statement Number/Sequence Number
        statement.statement_number = value;
        break;

      case '60F': // Opening Balance
      case '60M':
        statement.opening_balance = parseBalance(value);
        break;

      case '62F': // Closing Balance
      case '62M':
        statement.closing_balance = parseBalance(value);
        break;

      case '61': // Statement Line
        if (Array.isArray(fields[tag])) {
          for (const txValue of fields[tag] as string[]) {
            const transaction = parseTransaction(txValue, fields['86'] as any);
            if (transaction) {
              statement.transactions.push(transaction);
            }
          }
        } else {
          const transaction = parseTransaction(value, fields['86']);
          if (transaction) {
            statement.transactions.push(transaction);
          }
        }
        break;

      case '86': // Information to Account Owner
        // Handled with :61: tag
        break;
    }
  }

  return statement;
}

/**
 * Extract field tags and values from MT940 text
 */
function extractFields(text: string): Record<string, any> {
  const fields: Record<string, any> = {};
  const lines = text.split('\n');
  let currentTag: string | null = null;
  let currentValue: string[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Check if line starts with a tag (e.g., :20:, :25:, :61:)
    const tagMatch = line.match(/^:(\d{2}[A-Z]?):(.*)/);

    if (tagMatch) {
      // Save previous field
      if (currentTag) {
        saveField(fields, currentTag, currentValue.join('\n'));
      }

      // Start new field
      currentTag = tagMatch[1];
      currentValue = [tagMatch[2]];
    } else if (currentTag) {
      // Continuation of previous field
      currentValue.push(line);
    }
  }

  // Save last field
  if (currentTag) {
    saveField(fields, currentTag, currentValue.join('\n'));
  }

  return fields;
}

/**
 * Save field to fields object (handle multiple occurrences)
 */
function saveField(fields: Record<string, any>, tag: string, value: string): void {
  if (tag === '61' || tag === '86') {
    // These tags can appear multiple times
    if (!fields[tag]) {
      fields[tag] = [];
    }
    fields[tag].push(value);
  } else {
    fields[tag] = value;
  }
}

/**
 * Parse balance field (:60F:, :62F:, etc.)
 * Format: D/C YYMMDD CUR Amount
 * Example: C230515EUR123456,78
 */
function parseBalance(value: string): MT940Balance | undefined {
  const match = value.match(/^([DC])(\d{6})([A-Z]{3})([\d,]+)$/);
  if (!match) return undefined;

  const [, debitCredit, date, currency, amountStr] = match;

  return {
    debit_credit: debitCredit as 'D' | 'C',
    date: parseDate(date),
    currency,
    amount: parseAmount(amountStr)
  };
}

/**
 * Parse transaction field (:61:)
 * Format: YYMMDD[MMDD] D/C Amount Transaction Type Reference [//Account Owner Reference]
 * Example: 2305151505DR123,45NTRFNONREF//1234567890
 */
function parseTransaction(value: string, info86: string | string[]): MT940Transaction | null {
  // Simplified parser - real implementation needs to handle all variants
  const match = value.match(/^(\d{6})(\d{4})?([DC])([\d,]+)([A-Z]{4})(.+)/);
  if (!match) return null;

  const [, valueDate, entryDate, debitCredit, amountStr, txType, rest] = match;

  // Extract reference and optional account owner reference
  const refMatch = rest.match(/^([^\s/]+)(?:\/\/(.+))?$/);
  const reference = refMatch ? refMatch[1] : rest;
  const accountOwnerRef = refMatch ? refMatch[2] : undefined;

  // Get supplementary details from :86: field
  let supplementary = '';
  if (Array.isArray(info86)) {
    supplementary = info86[0] || '';
  } else if (typeof info86 === 'string') {
    supplementary = info86;
  }

  return {
    value_date: parseDate(valueDate),
    entry_date: entryDate ? parseDate(entryDate) : undefined,
    debit_credit: debitCredit as 'D' | 'C',
    amount: parseAmount(amountStr),
    transaction_type: txType,
    reference,
    account_owner_reference: accountOwnerRef,
    supplementary_details: supplementary
  };
}

/**
 * Parse date from YYMMDD format
 */
function parseDate(dateStr: string): string {
  if (dateStr.length === 6) {
    const yy = parseInt(dateStr.substring(0, 2));
    const mm = dateStr.substring(2, 4);
    const dd = dateStr.substring(4, 6);

    // Assume 20xx for years 00-49, 19xx for 50-99
    const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;

    return `${yyyy}-${mm}-${dd}`;
  }
  return dateStr;
}

/**
 * Parse amount (handle comma as decimal separator)
 */
function parseAmount(amountStr: string): number {
  return parseFloat(amountStr.replace(',', '.'));
}

/**
 * Convert MT940 statement to normalized bank statement lines
 */
function convertToStatementLines(statement: MT940Statement): BankStatementLine[] {
  const lines: BankStatementLine[] = [];

  // Get currency from opening balance
  const currency = statement.opening_balance?.currency || statement.closing_balance?.currency || 'XXX';

  for (const tx of statement.transactions) {
    lines.push({
      statement_date: tx.value_date,
      value_date: tx.value_date,
      amount: tx.debit_credit === 'D' ? -tx.amount : tx.amount,
      currency,
      debit_credit: tx.debit_credit === 'D' ? 'debit' : 'credit',
      description: tx.supplementary_details || '',
      reference: tx.reference,
      bank_reference: tx.account_owner_reference,
      transaction_code: tx.transaction_type,
      raw: tx
    });
  }

  return lines;
}

/**
 * Parse CSV bank statement (simple format)
 * CSV format: Date,Description,Amount,Currency,Reference
 */
export function parseCSVStatement(csvContent: string, currency: string = 'XOF'): BankStatementLine[] {
  const lines: BankStatementLine[] = [];
  const rows = csvContent.split('\n');

  // Skip header row
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].trim();
    if (!row) continue;

    const parts = parseCSVLine(row);
    if (parts.length < 3) continue;

    const [date, description, amountStr, currencyCol, reference] = parts;
    const amount = parseFloat(amountStr.replace(',', '.').replace(/[^\d.-]/g, ''));

    if (isNaN(amount)) continue;

    lines.push({
      statement_date: date,
      value_date: date,
      amount,
      currency: currencyCol || currency,
      debit_credit: amount < 0 ? 'debit' : 'credit',
      description: description || '',
      reference: reference || '',
      raw: { csv_line: row }
    });
  }

  return lines;
}

/**
 * Parse CSV line (handle quoted fields)
 */
function parseCSVLine(line: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Validate MT940 statement
 */
export function validateMT940(statement: MT940Statement): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!statement.transaction_reference) {
    errors.push('Missing transaction reference (:20:)');
  }

  if (!statement.account_number) {
    errors.push('Missing account number (:25:)');
  }

  if (!statement.opening_balance && !statement.closing_balance) {
    errors.push('Missing both opening and closing balances');
  }

  // Validate balance calculation
  if (statement.opening_balance && statement.closing_balance) {
    const calculatedBalance = calculateBalance(statement);
    const actualBalance = statement.closing_balance.amount;

    if (Math.abs(calculatedBalance - actualBalance) > 0.01) {
      errors.push(`Balance mismatch: calculated ${calculatedBalance}, actual ${actualBalance}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate closing balance from opening balance and transactions
 */
function calculateBalance(statement: MT940Statement): number {
  if (!statement.opening_balance) return 0;

  let balance = statement.opening_balance.amount;
  if (statement.opening_balance.debit_credit === 'D') {
    balance = -balance;
  }

  for (const tx of statement.transactions) {
    if (tx.debit_credit === 'C') {
      balance += tx.amount;
    } else {
      balance -= tx.amount;
    }
  }

  return Math.abs(balance);
}

// ============================================================================
// End of MT940 parser
// ============================================================================
