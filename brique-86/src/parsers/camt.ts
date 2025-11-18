// CAMT.053 (ISO20022) bank statement parser
// XML-based format, more structured than MT940

import { parseString } from 'xml2js';
import { promisify } from 'util';

const parseXML = promisify(parseString);

export interface CAMTLine {
  statement_date: string;
  value_date: string;
  booking_date?: string;
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

/**
 * Parse CAMT.053 (ISO20022) XML bank statement
 * Supports camt.053.001.02, camt.053.001.04, and later versions
 */
export async function parseCAMT(content: string): Promise<CAMTLine[]> {
  try {
    const xml = await parseXML(content, { trim: true, explicitArray: false });

    // Navigate XML structure (namespaces may vary)
    const document = xml?.Document || xml?.BkToCstmrStmt || xml;
    const statements = ensureArray(document?.BkToCstmrStmt?.Stmt || document?.Stmt);

    const lines: CAMTLine[] = [];

    for (const stmt of statements) {
      const statementId = stmt.Id || 'unknown';
      const statementDate = extractDate(stmt.CreDtTm) || new Date().toISOString().split('T')[0];
      const currency = stmt.Acct?.Ccy || 'EUR';

      // Parse entries (transactions)
      const entries = ensureArray(stmt.Ntry);

      for (const entry of entries) {
        try {
          const parsed = parseEntry(entry, currency, statementDate);
          if (parsed) {
            lines.push(parsed);
          }
        } catch (error: any) {
          console.warn('Failed to parse CAMT entry:', error.message);
        }
      }
    }

    return lines;
  } catch (error: any) {
    console.error('CAMT parsing error:', error);
    throw new Error(`CAMT parse failed: ${error.message}`);
  }
}

function parseEntry(entry: any, currency: string, statementDate: string): CAMTLine | null {
  // Extract amount
  const amount = parseFloat(entry.Amt?._ || entry.Amt || '0');
  if (isNaN(amount) || amount === 0) {
    return null;
  }

  // Credit or debit?
  const creditDebitIndicator = entry.CdtDbtInd; // CRDT or DBIT
  const transaction_type = creditDebitIndicator === 'CRDT' ? 'credit' : 'debit';

  // Extract dates
  const bookingDate = extractDate(entry.BookgDt?.Dt);
  const valueDate = extractDate(entry.ValDt?.Dt) || bookingDate || statementDate;

  // Extract transaction details
  const details = entry.NtryDtls?.TxDtls || entry.NtryDtls;
  const detailsArray = ensureArray(details);

  // For simplicity, use first transaction detail (entries can have multiple)
  const txDetail = detailsArray[0] || {};

  // Extract references
  const endToEndId = txDetail.Refs?.EndToEndId;
  const txId = txDetail.Refs?.TxId;
  const mandateId = txDetail.Refs?.MndtId;
  const instructionId = txDetail.Refs?.InstrId;

  const { reference, provider_ref } = extractReferencesFromCAMT(endToEndId, txId, mandateId, instructionId);

  // Extract remittance information (description)
  const remittanceInfo = txDetail.RmtInf?.Ustrd || entry.AddtlNtryInf || 'Bank transaction';
  const description = Array.isArray(remittanceInfo) ? remittanceInfo.join(' ') : remittanceInfo;

  // Extract counterparty information
  const relatedParties = txDetail.RltdPties || {};
  const debtor = relatedParties.Dbtr;
  const creditor = relatedParties.Cdtr;
  const counterparty = transaction_type === 'credit' ? debtor : creditor;

  const beneficiary_name = counterparty?.Nm;
  const beneficiary_account = relatedParties.DbtrAcct?.Id?.IBAN || relatedParties.CdtrAcct?.Id?.IBAN;

  // Extract bank transaction code
  const bankTxCode = entry.BkTxCd?.Prtry?.Cd || entry.BkTxCd?.Domn?.Cd;

  return {
    statement_date: statementDate,
    value_date: valueDate,
    booking_date: bookingDate,
    amount: transaction_type === 'debit' ? -amount : amount,
    currency: entry.Amt?.Ccy || currency,
    description: description.trim(),
    reference,
    provider_ref,
    beneficiary_name,
    beneficiary_account,
    transaction_type,
    metadata: {
      bank_tx_code: bankTxCode,
      end_to_end_id: endToEndId,
      tx_id: txId,
      mandate_id: mandateId,
      instruction_id: instructionId,
    },
  };
}

function extractReferencesFromCAMT(
  endToEndId?: string,
  txId?: string,
  mandateId?: string,
  instructionId?: string
): { reference: string | null; provider_ref: string | null } {
  // Check all reference fields for known patterns
  const allRefs = [endToEndId, txId, mandateId, instructionId].filter(Boolean);

  for (const ref of allRefs) {
    if (!ref) continue;

    // Payout references
    if (/\b(PO_[A-Za-z0-9]+|PAYOUT_[A-Za-z0-9]+|po_[a-z0-9]+)\b/i.test(ref)) {
      const match = ref.match(/\b(PO_[A-Za-z0-9]+|PAYOUT_[A-Za-z0-9]+|po_[a-z0-9]+)\b/i);
      return { reference: match![1], provider_ref: match![1] };
    }

    // Stripe transfer IDs
    if (/\b(tr_[A-Za-z0-9]+)\b/.test(ref)) {
      const match = ref.match(/\b(tr_[A-Za-z0-9]+)\b/);
      return { reference: null, provider_ref: match![1] };
    }

    // Invoice references
    if (/\b(INV-[A-Z0-9\-]+)\b/i.test(ref)) {
      const match = ref.match(/\b(INV-[A-Z0-9\-]+)\b/i);
      return { reference: match![1], provider_ref: null };
    }
  }

  // Use EndToEndId as reference if available
  if (endToEndId && endToEndId !== 'NOTPROVIDED') {
    return { reference: endToEndId, provider_ref: null };
  }

  return { reference: null, provider_ref: null };
}

function extractDate(dateValue: any): string | undefined {
  if (!dateValue) return undefined;

  // Handle ISO date string
  if (typeof dateValue === 'string') {
    const match = dateValue.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Simplified synchronous CAMT parser (for testing)
 */
export function parseCAMTSync(content: string): CAMTLine[] {
  const lines: CAMTLine[] = [];

  // This is a simplified version for demo purposes
  // In production, always use the async parseCAMT function

  parseString(content, { trim: true, explicitArray: false }, (err, result) => {
    if (err) {
      throw new Error(`CAMT parse error: ${err.message}`);
    }

    const document = result?.Document || result?.BkToCstmrStmt || result;
    const statements = ensureArray(document?.BkToCstmrStmt?.Stmt || document?.Stmt);

    for (const stmt of statements) {
      const statementDate = extractDate(stmt.CreDtTm) || new Date().toISOString().split('T')[0];
      const currency = stmt.Acct?.Ccy || 'EUR';

      const entries = ensureArray(stmt.Ntry);

      for (const entry of entries) {
        try {
          const parsed = parseEntry(entry, currency, statementDate);
          if (parsed) {
            lines.push(parsed);
          }
        } catch (error: any) {
          console.warn('Failed to parse entry:', error.message);
        }
      }
    }
  });

  return lines;
}
