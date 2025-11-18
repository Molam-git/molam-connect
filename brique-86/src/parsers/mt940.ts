// MT940 (SWIFT) bank statement parser
// Handles multiple bank variants (Deutsche Bank, BNP, Wise, etc.)

export interface MT940Line {
  statement_date: string; // ISO date
  value_date: string; // ISO date
  booking_date?: string; // ISO date
  amount: number;
  currency: string;
  description: string;
  reference: string | null;
  provider_ref: string | null;
  beneficiary_name?: string;
  beneficiary_account?: string;
  transaction_type: 'credit' | 'debit' | 'fee' | 'reversal';
  metadata: Record<string, any>;
}

interface MT940Statement {
  account_number: string;
  statement_number: string;
  opening_balance: number;
  closing_balance: number;
  currency: string;
  lines: MT940Line[];
}

/**
 * Parse MT940 format bank statement
 * Supports SWIFT MT940 standard with common bank-specific variations
 */
export function parseMT940(content: string): MT940Line[] {
  const lines: MT940Line[] = [];

  try {
    // Split into blocks (statements can contain multiple blocks)
    const blocks = content.split(':20:').filter(b => b.trim());

    for (const block of blocks) {
      const parsed = parseBlock(block);
      lines.push(...parsed);
    }

    return lines;
  } catch (error: any) {
    console.error('MT940 parsing error:', error);
    throw new Error(`MT940 parse failed: ${error.message}`);
  }
}

function parseBlock(block: string): MT940Line[] {
  const lines: MT940Line[] = [];
  const fields = parseFields(block);

  // Extract statement metadata
  const currency = extractCurrency(fields);
  const statementDate = extractStatementDate(fields);

  // Parse transaction lines (:61: fields)
  const transactions = fields.filter(f => f.tag === '61');

  for (const txn of transactions) {
    try {
      const parsed = parseTransaction(txn, currency, statementDate);
      if (parsed) {
        lines.push(parsed);
      }
    } catch (error: any) {
      console.warn('Failed to parse transaction:', error.message, txn);
      // Continue parsing other transactions
    }
  }

  return lines;
}

interface Field {
  tag: string;
  value: string;
}

function parseFields(block: string): Field[] {
  const fields: Field[] = [];
  const regex = /:(\d{2}[A-Z]?):([\s\S]*?)(?=:\d{2}[A-Z]?:|$)/g;

  let match;
  while ((match = regex.exec(block)) !== null) {
    fields.push({
      tag: match[1],
      value: match[2].trim(),
    });
  }

  return fields;
}

function parseTransaction(field: Field, currency: string, statementDate: string): MT940Line | null {
  const value = field.value;

  // MT940 :61: format: YYMMDD[MMDD]C/D[amount]N[xxx][//reference][//additional]
  // Example: 231115C1234,56NTRFNONREF//PO123456

  // Extract date (first 6 chars: YYMMDD)
  const dateMatch = value.match(/^(\d{6})(\d{4})?/);
  if (!dateMatch) {
    console.warn('Invalid date format in :61: field:', value);
    return null;
  }

  const valueDateStr = dateMatch[1]; // YYMMDD
  const bookingDateStr = dateMatch[2]; // MMDD (optional)

  const valueDate = parseDate(valueDateStr);
  const bookingDate = bookingDateStr ? parseDate(valueDateStr.substring(0, 2) + bookingDateStr) : undefined;

  // Extract credit/debit indicator and amount
  const amountMatch = value.match(/([CD])([\d,\.]+)/);
  if (!amountMatch) {
    console.warn('Invalid amount format in :61: field:', value);
    return null;
  }

  const indicator = amountMatch[1]; // C = credit, D = debit
  const amountStr = amountMatch[2].replace(/,/g, '.');
  const amount = parseFloat(amountStr);

  if (isNaN(amount)) {
    console.warn('Invalid amount value:', amountStr);
    return null;
  }

  const transaction_type = indicator === 'C' ? 'credit' : 'debit';

  // Extract transaction code (NTRFNONREF, NMSC, etc.)
  const codeMatch = value.match(/N([A-Z]{3})/);
  const transactionCode = codeMatch ? codeMatch[1] : null;

  // Extract reference (everything after //)
  const refMatch = value.match(/\/\/(.+)$/);
  const referenceString = refMatch ? refMatch[1].trim() : null;

  // Try to extract structured reference (e.g., PO_xxx, INV-xxx, etc.)
  const { reference, provider_ref } = extractReferences(referenceString);

  // Extract additional details from :86: field (if available)
  // Note: In a full implementation, we'd need to match :86: with its corresponding :61:
  const description = referenceString || transactionCode || 'Bank transaction';

  return {
    statement_date: statementDate,
    value_date: valueDate,
    booking_date: bookingDate,
    amount: transaction_type === 'debit' ? -amount : amount,
    currency,
    description,
    reference,
    provider_ref,
    transaction_type,
    metadata: {
      transaction_code: transactionCode,
      raw_reference: referenceString,
    },
  };
}

function extractCurrency(fields: Field[]): string {
  // Look for :60F: or :62F: (opening/closing balance) to extract currency
  const balanceField = fields.find(f => f.tag === '60F' || f.tag === '62F');
  if (balanceField) {
    // Format: C/D YYMMDD CUR amount
    const match = balanceField.value.match(/([A-Z]{3})/);
    if (match) {
      return match[1];
    }
  }
  return 'EUR'; // Default fallback
}

function extractStatementDate(fields: Field[]): string {
  // Try to extract from :60F: (opening balance)
  const field = fields.find(f => f.tag === '60F');
  if (field) {
    const match = field.value.match(/[CD](\d{6})/);
    if (match) {
      return parseDate(match[1]);
    }
  }
  return new Date().toISOString().split('T')[0]; // Fallback to today
}

function parseDate(yymmdd: string): string {
  // Convert YYMMDD to ISO date (YYYY-MM-DD)
  const yy = parseInt(yymmdd.substring(0, 2));
  const mm = yymmdd.substring(2, 4);
  const dd = yymmdd.substring(4, 6);

  // Assume 20xx for years 00-49, 19xx for 50-99
  const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;

  return `${yyyy}-${mm}-${dd}`;
}

function extractReferences(referenceString: string | null): { reference: string | null; provider_ref: string | null } {
  if (!referenceString) {
    return { reference: null, provider_ref: null };
  }

  // Try to match common patterns
  // Payout references: PO_xxx, PAYOUT_xxx, po_xxx
  const payoutMatch = referenceString.match(/\b(PO_[A-Za-z0-9]+|PAYOUT_[A-Za-z0-9]+|po_[a-z0-9]+)\b/i);
  if (payoutMatch) {
    return { reference: payoutMatch[1], provider_ref: payoutMatch[1] };
  }

  // Stripe transfer IDs: tr_xxx
  const stripeMatch = referenceString.match(/\b(tr_[A-Za-z0-9]+)\b/);
  if (stripeMatch) {
    return { reference: null, provider_ref: stripeMatch[1] };
  }

  // Invoice references: INV-xxx
  const invoiceMatch = referenceString.match(/\b(INV-[A-Z0-9\-]+)\b/i);
  if (invoiceMatch) {
    return { reference: invoiceMatch[1], provider_ref: null };
  }

  // Generic alphanumeric reference (8+ chars)
  const genericMatch = referenceString.match(/\b([A-Z0-9]{8,})\b/);
  if (genericMatch) {
    return { reference: genericMatch[1], provider_ref: null };
  }

  return { reference: null, provider_ref: null };
}

/**
 * Parse :86: structured information field (additional transaction details)
 * This field contains unstructured data that varies by bank
 */
export function parse86Field(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Try SEPA-style structured format (used by many European banks)
  // Format: ?20Description?21More?30BIC?31IBAN?32Name
  const sepaMatches = content.matchAll(/\?(\d{2})([^\?]*)/g);
  for (const match of sepaMatches) {
    const code = match[1];
    const value = match[2].trim();

    switch (code) {
      case '20':
      case '21':
      case '22':
      case '23':
        result.description = (result.description || '') + ' ' + value;
        break;
      case '30':
        result.bic = value;
        break;
      case '31':
        result.iban = value;
        break;
      case '32':
      case '33':
        result.beneficiary_name = (result.beneficiary_name || '') + ' ' + value;
        break;
    }
  }

  // Fallback: use entire content as description
  if (Object.keys(result).length === 0) {
    result.description = content;
  }

  return result;
}
