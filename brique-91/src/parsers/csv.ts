// CSV Statement Parser
// Supports various CSV formats with configurable column mapping

import { StatementParser, ParsedStatement, ParsedStatementLine, ParserResult } from './types';

interface CSVConfig {
  delimiter: string;
  hasHeader: boolean;
  dateFormat: string;
  columnMapping: {
    date?: number | string;
    amount?: number | string;
    currency?: number | string;
    description?: number | string;
    reference?: number | string;
    counterparty?: number | string;
    counterparty_account?: number | string;
    debit?: number | string;
    credit?: number | string;
  };
}

export class CSVParser extends StatementParser {
  private config: CSVConfig;

  constructor(config?: Partial<CSVConfig>) {
    super();

    // Default configuration
    this.config = {
      delimiter: config?.delimiter || ',',
      hasHeader: config?.hasHeader ?? true,
      dateFormat: config?.dateFormat || 'YYYY-MM-DD',
      columnMapping: config?.columnMapping || {
        date: 0,
        amount: 1,
        currency: 2,
        description: 3,
        reference: 4,
        counterparty: 5
      }
    };
  }

  getFormat(): 'MT940' | 'ISO20022' | 'CSV' {
    return 'CSV';
  }

  canParse(content: string | Buffer): boolean {
    const text = Buffer.isBuffer(content) ? content.toString('utf-8') : content;

    // Check if it looks like CSV (has commas or semicolons and multiple lines)
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return false;

    // Check if first line has delimiters
    const firstLine = lines[0];
    return firstLine.includes(',') || firstLine.includes(';') || firstLine.includes('\t');
  }

  async parse(content: string | Buffer): Promise<ParserResult> {
    try {
      const text = Buffer.isBuffer(content) ? content.toString('utf-8') : content;

      // Auto-detect delimiter if not specified
      const delimiter = this.detectDelimiter(text);
      this.config.delimiter = delimiter;

      const lines = text.split(/\r?\n/).filter(l => l.trim());

      if (lines.length === 0) {
        return {
          success: false,
          errors: ['Empty CSV file']
        };
      }

      let dataLines = lines;
      let headers: string[] = [];

      // Handle header row
      if (this.config.hasHeader) {
        headers = this.parseLine(lines[0], delimiter);
        dataLines = lines.slice(1);

        // Update column mapping if using header names
        this.updateMappingFromHeaders(headers);
      }

      // Parse transactions
      const parsedLines: ParsedStatementLine[] = [];
      const errors: string[] = [];

      for (let i = 0; i < dataLines.length; i++) {
        const lineNum = i + (this.config.hasHeader ? 2 : 1);

        try {
          const line = this.parseTransactionLine(dataLines[i], delimiter, headers);
          if (line) {
            parsedLines.push(line);
          }
        } catch (error: any) {
          errors.push(`Line ${lineNum}: ${error.message}`);
        }
      }

      if (parsedLines.length === 0) {
        return {
          success: false,
          errors: ['No valid transactions found', ...errors]
        };
      }

      // Build statement
      const statement: ParsedStatement = {
        statement_id: `CSV-${Date.now()}`,
        account_number: 'UNKNOWN', // CSV typically doesn't include account info
        currency: this.detectCurrency(parsedLines),
        from_date: this.getEarliestDate(parsedLines),
        to_date: this.getLatestDate(parsedLines),
        opening_balance: 0, // CSV typically doesn't include opening balance
        closing_balance: this.calculateBalance(parsedLines),
        lines: parsedLines,
        format: 'CSV',
        raw_metadata: {
          line_count: parsedLines.length,
          has_header: this.config.hasHeader,
          delimiter,
          headers: headers.length > 0 ? headers : undefined
        }
      };

      return {
        success: true,
        statement,
        errors: errors.length > 0 ? errors : undefined,
        warnings: errors.length > 0 ? [`${errors.length} lines failed to parse`] : undefined
      };
    } catch (error: any) {
      return {
        success: false,
        errors: [error.message || 'Failed to parse CSV statement']
      };
    }
  }

  /**
   * Detect delimiter (comma, semicolon, or tab)
   */
  private detectDelimiter(text: string): string {
    const firstLine = text.split(/\r?\n/)[0];

    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;

    if (tabCount > 0) return '\t';
    if (semicolonCount > commaCount) return ';';
    return ',';
  }

  /**
   * Parse a single CSV line, handling quoted values
   */
  private parseLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add last field
    result.push(current.trim());

    return result;
  }

  /**
   * Update column mapping based on header names
   */
  private updateMappingFromHeaders(headers: string[]) {
    const normalized = headers.map(h => h.toLowerCase().trim());

    const mapping: Record<string, number> = {};

    for (let i = 0; i < normalized.length; i++) {
      const header = normalized[i];

      if (header.includes('date') || header.includes('datum')) {
        mapping.date = i;
      } else if (header.includes('amount') || header.includes('montant') || header.includes('bedrag')) {
        mapping.amount = i;
      } else if (header.includes('currency') || header.includes('devise') || header.includes('valuta')) {
        mapping.currency = i;
      } else if (header.includes('description') || header.includes('libelle') || header.includes('omschrijving')) {
        mapping.description = i;
      } else if (header.includes('reference') || header.includes('ref')) {
        mapping.reference = i;
      } else if (header.includes('counterparty') || header.includes('beneficiary') || header.includes('tegenpartij')) {
        mapping.counterparty = i;
      } else if (header.includes('debit') || header.includes('débit')) {
        mapping.debit = i;
      } else if (header.includes('credit') || header.includes('crédit')) {
        mapping.credit = i;
      }
    }

    // Only update if we found mappings
    if (Object.keys(mapping).length > 0) {
      this.config.columnMapping = { ...this.config.columnMapping, ...mapping };
    }
  }

  /**
   * Parse a transaction line
   */
  private parseTransactionLine(line: string, delimiter: string, headers: string[]): ParsedStatementLine | null {
    const fields = this.parseLine(line, delimiter);

    if (fields.length === 0) return null;

    const mapping = this.config.columnMapping;

    // Extract date
    const dateStr = this.getField(fields, mapping.date);
    if (!dateStr) throw new Error('Missing date field');
    const value_date = this.parseDate(dateStr);

    // Extract amount (handle separate debit/credit columns)
    let amount: number;
    let direction: 'debit' | 'credit';

    if (mapping.debit !== undefined && mapping.credit !== undefined) {
      const debitStr = this.getField(fields, mapping.debit);
      const creditStr = this.getField(fields, mapping.credit);

      if (debitStr && parseFloat(debitStr) !== 0) {
        amount = Math.abs(parseFloat(debitStr));
        direction = 'debit';
      } else if (creditStr && parseFloat(creditStr) !== 0) {
        amount = Math.abs(parseFloat(creditStr));
        direction = 'credit';
      } else {
        throw new Error('Missing amount');
      }
    } else {
      const amountStr = this.getField(fields, mapping.amount);
      if (!amountStr) throw new Error('Missing amount field');

      amount = Math.abs(parseFloat(amountStr.replace(',', '.')));
      direction = parseFloat(amountStr.replace(',', '.')) < 0 ? 'debit' : 'credit';
    }

    // Extract other fields
    const currency = this.getField(fields, mapping.currency) || 'EUR';
    const description = this.getField(fields, mapping.description);
    const reference = this.getField(fields, mapping.reference);
    const counterparty_name = this.getField(fields, mapping.counterparty);
    const counterparty_account = this.getField(fields, mapping.counterparty_account);

    return {
      value_date,
      amount,
      currency,
      direction,
      description,
      reference,
      counterparty_name,
      counterparty_account,
      additional_info: {
        raw_line: line,
        field_count: fields.length
      }
    };
  }

  /**
   * Get field value by index or name
   */
  private getField(fields: string[], indexOrName: number | string | undefined): string | undefined {
    if (indexOrName === undefined) return undefined;
    if (typeof indexOrName === 'number') {
      return fields[indexOrName];
    }
    return undefined; // Name-based lookup not implemented in this simple version
  }

  /**
   * Parse date string to Date object
   */
  private parseDate(dateStr: string): Date {
    // Try ISO format first
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      return new Date(dateStr);
    }

    // Try DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (ddmmyyyy) {
      return new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
    }

    // Try MM/DD/YYYY
    const mmddyyyy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (mmddyyyy) {
      return new Date(parseInt(mmddyyyy[3]), parseInt(mmddyyyy[1]) - 1, parseInt(mmddyyyy[2]));
    }

    // Fallback: try Date constructor
    return new Date(dateStr);
  }

  /**
   * Detect most common currency in transactions
   */
  private detectCurrency(lines: ParsedStatementLine[]): string {
    const currencies = lines.map(l => l.currency);
    const counts: Record<string, number> = {};

    for (const currency of currencies) {
      counts[currency] = (counts[currency] || 0) + 1;
    }

    let maxCount = 0;
    let maxCurrency = 'EUR';

    for (const [currency, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxCurrency = currency;
      }
    }

    return maxCurrency;
  }

  /**
   * Get earliest transaction date
   */
  private getEarliestDate(lines: ParsedStatementLine[]): Date {
    return lines.reduce((earliest, line) => {
      return line.value_date < earliest ? line.value_date : earliest;
    }, lines[0].value_date);
  }

  /**
   * Get latest transaction date
   */
  private getLatestDate(lines: ParsedStatementLine[]): Date {
    return lines.reduce((latest, line) => {
      return line.value_date > latest ? line.value_date : latest;
    }, lines[0].value_date);
  }

  /**
   * Calculate net balance from transactions
   */
  private calculateBalance(lines: ParsedStatementLine[]): number {
    return lines.reduce((balance, line) => {
      return balance + (line.direction === 'credit' ? line.amount : -line.amount);
    }, 0);
  }
}
