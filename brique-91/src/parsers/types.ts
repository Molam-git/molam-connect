// Common types for statement parsers

export interface ParsedStatementLine {
  // Transaction identification
  reference?: string;
  bank_reference?: string;

  // Dates
  value_date: Date;
  posting_date?: Date;

  // Amount and currency
  amount: number;
  currency: string;

  // Transaction details
  direction: 'debit' | 'credit';
  transaction_type?: string;
  description?: string;

  // Counterparty information
  counterparty_name?: string;
  counterparty_iban?: string;
  counterparty_bic?: string;
  counterparty_account?: string;

  // Additional metadata
  additional_info?: Record<string, any>;
}

export interface ParsedStatement {
  // Statement header
  statement_id: string;
  account_number: string;
  account_iban?: string;
  currency: string;

  // Date range
  from_date: Date;
  to_date: Date;

  // Opening/closing balances
  opening_balance: number;
  closing_balance: number;

  // Transactions
  lines: ParsedStatementLine[];

  // Metadata
  format: 'MT940' | 'ISO20022' | 'CSV';
  raw_metadata?: Record<string, any>;
}

export interface ParserResult {
  success: boolean;
  statement?: ParsedStatement;
  errors?: string[];
  warnings?: string[];
}

export abstract class StatementParser {
  abstract parse(content: string | Buffer): Promise<ParserResult>;

  /**
   * Detect if this parser can handle the given content
   */
  abstract canParse(content: string | Buffer): boolean;

  /**
   * Get parser format name
   */
  abstract getFormat(): 'MT940' | 'ISO20022' | 'CSV';
}
