// Unit tests for GL Mapping Service
import {
  mapAdjustmentToGL,
  validateGLBalance,
  createReversalLines,
} from './gl-mapping';

describe('GL Mapping Service', () => {
  describe('mapAdjustmentToGL', () => {
    test('bank_fee maps to correct GL codes', () => {
      const lines = mapAdjustmentToGL({
        adjustment_type: 'bank_fee',
        amount: 15.0,
        currency: 'USD',
        reason: 'Bank fee withheld',
      });

      expect(lines).toHaveLength(2);
      expect(lines[0].gl_code).toBe('EXP:BANK_FEES');
      expect(lines[0].debit).toBe(15.0);
      expect(lines[0].credit).toBe(0);
      expect(lines[1].gl_code).toBe('LIA:ADJUSTMENTS_PAYABLE');
      expect(lines[1].debit).toBe(0);
      expect(lines[1].credit).toBe(15.0);
    });

    test('fx_variance maps to correct GL codes', () => {
      const lines = mapAdjustmentToGL({
        adjustment_type: 'fx_variance',
        amount: 250.5,
        currency: 'EUR',
        reason: 'FX variance on settlement',
      });

      expect(lines).toHaveLength(2);
      expect(lines[0].gl_code).toBe('EXP:FX_VARIANCE');
      expect(lines[0].debit).toBe(250.5);
      expect(lines[1].gl_code).toBe('LIA:ADJUSTMENTS_PAYABLE');
      expect(lines[1].credit).toBe(250.5);
    });

    test('partial_settlement maps to correct GL codes', () => {
      const lines = mapAdjustmentToGL({
        adjustment_type: 'partial_settlement',
        amount: 100.0,
        currency: 'GBP',
        reason: 'Partial settlement - difference adjusted',
      });

      expect(lines).toHaveLength(2);
      expect(lines[0].gl_code).toBe('LIA:ADJUSTMENTS_PAYABLE');
      expect(lines[0].debit).toBe(100.0);
      expect(lines[1].gl_code).toBe('REV:ACCOUNTS_RECEIVABLE');
      expect(lines[1].credit).toBe(100.0);
    });

    test('fee_refund maps to correct GL codes', () => {
      const lines = mapAdjustmentToGL({
        adjustment_type: 'fee_refund',
        amount: 50.0,
        currency: 'USD',
        reason: 'Refund transaction fee',
      });

      expect(lines).toHaveLength(2);
      expect(lines[0].gl_code).toBe('EXP:FEE_REFUNDS');
      expect(lines[0].debit).toBe(50.0);
      expect(lines[1].gl_code).toBe('LIA:CUSTOMER_REFUNDS');
      expect(lines[1].credit).toBe(50.0);
    });

    test('merchant_credit maps to correct GL codes', () => {
      const lines = mapAdjustmentToGL({
        adjustment_type: 'merchant_credit',
        amount: 75.25,
        currency: 'EUR',
        reason: 'Credit for merchant',
      });

      expect(lines).toHaveLength(2);
      expect(lines[0].gl_code).toBe('EXP:MERCHANT_CREDITS');
      expect(lines[0].debit).toBe(75.25);
      expect(lines[1].gl_code).toBe('LIA:MERCHANT_PAYABLES');
      expect(lines[1].credit).toBe(75.25);
    });

    test('chargeback maps to correct GL codes', () => {
      const lines = mapAdjustmentToGL({
        adjustment_type: 'chargeback',
        amount: 200.0,
        currency: 'USD',
        reason: 'Chargeback from customer',
      });

      expect(lines).toHaveLength(2);
      expect(lines[0].gl_code).toBe('EXP:CHARGEBACKS');
      expect(lines[0].debit).toBe(200.0);
      expect(lines[1].gl_code).toBe('LIA:CHARGEBACK_RESERVE');
      expect(lines[1].credit).toBe(200.0);
    });

    test('settlement_variance maps to correct GL codes', () => {
      const lines = mapAdjustmentToGL({
        adjustment_type: 'settlement_variance',
        amount: 10.5,
        currency: 'XOF',
        reason: 'Settlement variance adjustment',
      });

      expect(lines).toHaveLength(2);
      expect(lines[0].gl_code).toBe('EXP:SETTLEMENT_VARIANCE');
      expect(lines[0].debit).toBe(10.5);
      expect(lines[1].gl_code).toBe('LIA:ADJUSTMENTS_PAYABLE');
      expect(lines[1].credit).toBe(10.5);
    });

    test('interest_earned maps to correct GL codes', () => {
      const lines = mapAdjustmentToGL({
        adjustment_type: 'interest_earned',
        amount: 5.0,
        currency: 'USD',
        reason: 'Interest on account',
      });

      expect(lines).toHaveLength(2);
      expect(lines[0].gl_code).toBe('ASS:CASH');
      expect(lines[0].debit).toBe(5.0);
      expect(lines[1].gl_code).toBe('REV:INTEREST_INCOME');
      expect(lines[1].credit).toBe(5.0);
    });

    test('throws error for unknown adjustment type', () => {
      expect(() => {
        mapAdjustmentToGL({
          adjustment_type: 'unknown_type',
          amount: 100.0,
          currency: 'USD',
          reason: 'Test',
        });
      }).toThrow('Unknown adjustment type: unknown_type');
    });

    test('includes currency and description in lines', () => {
      const lines = mapAdjustmentToGL({
        adjustment_type: 'bank_fee',
        amount: 15.0,
        currency: 'EUR',
        reason: 'Test bank fee',
      });

      expect(lines[0].currency).toBe('EUR');
      expect(lines[1].currency).toBe('EUR');
      expect(lines[0].description).toContain('Bank fee');
      expect(lines[1].description).toContain('Adjustment payable');
    });
  });

  describe('validateGLBalance', () => {
    test('validates balanced entry', () => {
      const lines = [
        { gl_code: 'EXP:BANK_FEES', debit: 100.0, credit: 0, currency: 'USD', description: 'Fee' },
        { gl_code: 'LIA:ADJUSTMENTS_PAYABLE', debit: 0, credit: 100.0, currency: 'USD', description: 'Payable' },
      ];

      const { balanced, debitTotal, creditTotal } = validateGLBalance(lines);

      expect(balanced).toBe(true);
      expect(debitTotal).toBe(100.0);
      expect(creditTotal).toBe(100.0);
    });

    test('detects unbalanced entry', () => {
      const lines = [
        { gl_code: 'EXP:BANK_FEES', debit: 100.0, credit: 0, currency: 'USD', description: 'Fee' },
        { gl_code: 'LIA:ADJUSTMENTS_PAYABLE', debit: 0, credit: 95.0, currency: 'USD', description: 'Payable' },
      ];

      const { balanced, debitTotal, creditTotal } = validateGLBalance(lines);

      expect(balanced).toBe(false);
      expect(debitTotal).toBe(100.0);
      expect(creditTotal).toBe(95.0);
    });

    test('handles multiple lines', () => {
      const lines = [
        { gl_code: 'EXP:BANK_FEES', debit: 50.0, credit: 0, currency: 'USD', description: 'Fee 1' },
        { gl_code: 'EXP:FX_VARIANCE', debit: 25.0, credit: 0, currency: 'USD', description: 'FX' },
        { gl_code: 'LIA:ADJUSTMENTS_PAYABLE', debit: 0, credit: 75.0, currency: 'USD', description: 'Payable' },
      ];

      const { balanced, debitTotal, creditTotal } = validateGLBalance(lines);

      expect(balanced).toBe(true);
      expect(debitTotal).toBe(75.0);
      expect(creditTotal).toBe(75.0);
    });

    test('handles rounding differences within tolerance', () => {
      const lines = [
        { gl_code: 'EXP:BANK_FEES', debit: 100.003, credit: 0, currency: 'USD', description: 'Fee' },
        { gl_code: 'LIA:ADJUSTMENTS_PAYABLE', debit: 0, credit: 100.002, currency: 'USD', description: 'Payable' },
      ];

      const { balanced } = validateGLBalance(lines);

      // 0.001 difference should be within 0.01 tolerance
      expect(balanced).toBe(true);
    });

    test('rejects rounding differences outside tolerance', () => {
      const lines = [
        { gl_code: 'EXP:BANK_FEES', debit: 100.02, credit: 0, currency: 'USD', description: 'Fee' },
        { gl_code: 'LIA:ADJUSTMENTS_PAYABLE', debit: 0, credit: 100.0, currency: 'USD', description: 'Payable' },
      ];

      const { balanced } = validateGLBalance(lines);

      // 0.02 difference should be outside 0.01 tolerance
      expect(balanced).toBe(false);
    });

    test('handles empty lines array', () => {
      const { balanced, debitTotal, creditTotal } = validateGLBalance([]);

      expect(balanced).toBe(true);
      expect(debitTotal).toBe(0);
      expect(creditTotal).toBe(0);
    });
  });

  describe('createReversalLines', () => {
    test('reverses debit/credit amounts', () => {
      const originalLines = [
        { gl_code: 'EXP:BANK_FEES', debit: 100.0, credit: 0, currency: 'USD', description: 'Original fee' },
        { gl_code: 'LIA:ADJUSTMENTS_PAYABLE', debit: 0, credit: 100.0, currency: 'USD', description: 'Original payable' },
      ];

      const reversalLines = createReversalLines(originalLines);

      expect(reversalLines).toHaveLength(2);
      expect(reversalLines[0].gl_code).toBe('EXP:BANK_FEES');
      expect(reversalLines[0].debit).toBe(0);
      expect(reversalLines[0].credit).toBe(100.0);
      expect(reversalLines[1].gl_code).toBe('LIA:ADJUSTMENTS_PAYABLE');
      expect(reversalLines[1].debit).toBe(100.0);
      expect(reversalLines[1].credit).toBe(0);
    });

    test('updates descriptions to indicate reversal', () => {
      const originalLines = [
        { gl_code: 'EXP:BANK_FEES', debit: 50.0, credit: 0, currency: 'EUR', description: 'Bank fee' },
        { gl_code: 'LIA:ADJUSTMENTS_PAYABLE', debit: 0, credit: 50.0, currency: 'EUR', description: 'Payable' },
      ];

      const reversalLines = createReversalLines(originalLines);

      expect(reversalLines[0].description).toContain('REVERSAL');
      expect(reversalLines[0].description).toContain('Bank fee');
      expect(reversalLines[1].description).toContain('REVERSAL');
      expect(reversalLines[1].description).toContain('Payable');
    });

    test('preserves GL codes and currency', () => {
      const originalLines = [
        { gl_code: 'EXP:FX_VARIANCE', debit: 25.5, credit: 0, currency: 'GBP', description: 'FX' },
        { gl_code: 'LIA:ADJUSTMENTS_PAYABLE', debit: 0, credit: 25.5, currency: 'GBP', description: 'Payable' },
      ];

      const reversalLines = createReversalLines(originalLines);

      expect(reversalLines[0].gl_code).toBe('EXP:FX_VARIANCE');
      expect(reversalLines[0].currency).toBe('GBP');
      expect(reversalLines[1].gl_code).toBe('LIA:ADJUSTMENTS_PAYABLE');
      expect(reversalLines[1].currency).toBe('GBP');
    });

    test('reverses multiple lines correctly', () => {
      const originalLines = [
        { gl_code: 'EXP:BANK_FEES', debit: 30.0, credit: 0, currency: 'USD', description: 'Fee 1' },
        { gl_code: 'EXP:FX_VARIANCE', debit: 20.0, credit: 0, currency: 'USD', description: 'FX' },
        { gl_code: 'LIA:ADJUSTMENTS_PAYABLE', debit: 0, credit: 50.0, currency: 'USD', description: 'Payable' },
      ];

      const reversalLines = createReversalLines(originalLines);

      expect(reversalLines).toHaveLength(3);

      const totalDebit = reversalLines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredit = reversalLines.reduce((sum, line) => sum + line.credit, 0);

      expect(totalDebit).toBe(50.0);
      expect(totalCredit).toBe(50.0);
    });
  });
});
