// GL (General Ledger) Mapping Logic
// Maps adjustment types to debit/credit GL codes

export interface GLLine {
  gl_code: string;
  debit: number;
  credit: number;
  description: string;
}

export interface AdjustmentContext {
  adjustment_type: string;
  amount: number;
  currency: string;
  reason: string;
  source_type?: string;
  metadata?: Record<string, any>;
}

/**
 * Map adjustment to GL journal lines (double-entry)
 * Returns array of GL lines that must balance (total debit = total credit)
 */
export function mapAdjustmentToGL(adj: AdjustmentContext): GLLine[] {
  const amount = Math.abs(adj.amount);

  switch (adj.adjustment_type) {
    case 'bank_fee':
    case 'bank_fee_diff':
      return [
        {
          gl_code: 'EXP:BANK_FEES',
          debit: amount,
          credit: 0,
          description: `Bank fee adjustment: ${adj.reason}`,
        },
        {
          gl_code: 'LIA:ADJUSTMENTS_PAYABLE',
          debit: 0,
          credit: amount,
          description: 'Adjustment payable to beneficiary',
        },
      ];

    case 'fx_variance':
      return [
        {
          gl_code: 'EXP:FX_VARIANCE',
          debit: amount,
          credit: 0,
          description: `FX variance adjustment: ${adj.reason}`,
        },
        {
          gl_code: 'LIA:ADJUSTMENTS_PAYABLE',
          debit: 0,
          credit: amount,
          description: 'FX variance payable',
        },
      ];

    case 'partial_settlement':
      // Partial settlement: reduce accounts receivable
      return [
        {
          gl_code: 'REV:ACCOUNTS_RECEIVABLE',
          debit: 0,
          credit: amount,
          description: `Partial settlement adjustment: ${adj.reason}`,
        },
        {
          gl_code: 'LIA:ADJUSTMENTS_PAYABLE',
          debit: amount,
          credit: 0,
          description: 'Adjustment for partial settlement',
        },
      ];

    case 'fee_refund':
      // Refund to customer
      return [
        {
          gl_code: 'EXP:FEE_REFUNDS',
          debit: amount,
          credit: 0,
          description: `Fee refund: ${adj.reason}`,
        },
        {
          gl_code: 'LIA:CUSTOMER_REFUNDS',
          debit: 0,
          credit: amount,
          description: 'Customer refund payable',
        },
      ];

    case 'fee_shortfall':
      // Fee collected was less than expected
      return [
        {
          gl_code: 'EXP:FEE_SHORTFALL',
          debit: amount,
          credit: 0,
          description: `Fee shortfall: ${adj.reason}`,
        },
        {
          gl_code: 'REV:FEE_INCOME',
          debit: 0,
          credit: amount,
          description: 'Fee income adjustment',
        },
      ];

    case 'merchant_credit':
      // Credit to merchant account
      return [
        {
          gl_code: 'EXP:MERCHANT_CREDITS',
          debit: amount,
          credit: 0,
          description: `Merchant credit: ${adj.reason}`,
        },
        {
          gl_code: 'LIA:MERCHANT_PAYABLES',
          debit: 0,
          credit: amount,
          description: 'Merchant payable',
        },
      ];

    case 'chargeback_adjustment':
      return [
        {
          gl_code: 'EXP:CHARGEBACKS',
          debit: amount,
          credit: 0,
          description: `Chargeback adjustment: ${adj.reason}`,
        },
        {
          gl_code: 'LIA:CHARGEBACK_RESERVES',
          debit: 0,
          credit: amount,
          description: 'Chargeback reserve',
        },
      ];

    case 'reconciliation_correction':
      // Generic reconciliation correction
      return [
        {
          gl_code: 'EXP:RECON_CORRECTIONS',
          debit: amount,
          credit: 0,
          description: `Reconciliation correction: ${adj.reason}`,
        },
        {
          gl_code: 'LIA:ADJUSTMENTS_PAYABLE',
          debit: 0,
          credit: amount,
          description: 'Adjustment payable',
        },
      ];

    default:
      // Fallback: generic adjustment
      console.warn(`Unknown adjustment_type: ${adj.adjustment_type}, using generic mapping`);
      return [
        {
          gl_code: 'EXP:MISC_ADJUSTMENTS',
          debit: amount,
          credit: 0,
          description: `${adj.adjustment_type}: ${adj.reason}`,
        },
        {
          gl_code: 'LIA:ADJUSTMENTS_PAYABLE',
          debit: 0,
          credit: amount,
          description: 'Adjustment payable',
        },
      ];
  }
}

/**
 * Validate that GL lines balance (total debit = total credit)
 */
export function validateGLBalance(lines: GLLine[]): { balanced: boolean; debitTotal: number; creditTotal: number } {
  const debitTotal = lines.reduce((sum, line) => sum + line.debit, 0);
  const creditTotal = lines.reduce((sum, line) => sum + line.credit, 0);

  const balanced = Math.abs(debitTotal - creditTotal) < 0.01; // Allow tiny floating point diff

  return { balanced, debitTotal, creditTotal };
}

/**
 * Get GL mapping from config (allows dynamic configuration)
 */
export async function getGLMappingFromConfig(adjustmentType: string): Promise<any> {
  // TODO: Load from adjustment_config table
  // For now, use hardcoded mappings above
  return null;
}

/**
 * Create reversal journal lines (opposite of original)
 */
export function createReversalLines(originalLines: GLLine[]): GLLine[] {
  return originalLines.map(line => ({
    ...line,
    debit: line.credit, // Swap debit/credit
    credit: line.debit,
    description: `REVERSAL: ${line.description}`,
  }));
}
