// Unit tests for MT940 parser
import { parseMT940, parse86Field } from '../../src/parsers/mt940';

describe('MT940 Parser', () => {
  describe('parseMT940', () => {
    it('should parse a valid MT940 statement', () => {
      const mt940Content = `
:20:STATEMENT123
:25:DE89370400440532013000
:28C:00001/001
:60F:C231101EUR1234,56
:61:2311151115C1000,00NTRFNONREF//PO_123456789
:86:Payment from customer
:62F:C231115EUR2234,56
`;

      const lines = parseMT940(mt940Content);

      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        value_date: '2023-11-15',
        amount: 1000.00,
        currency: 'EUR',
        transaction_type: 'credit',
      });
      expect(lines[0].provider_ref).toBe('PO_123456789');
    });

    it('should handle debit transactions', () => {
      const mt940Content = `
:20:STATEMENT123
:60F:C231101EUR1234,56
:61:2311151115D500,00NTRFNONREF//INV-2023-001
:62F:C231115EUR734,56
`;

      const lines = parseMT940(mt940Content);

      expect(lines[0].amount).toBe(-500.00);
      expect(lines[0].transaction_type).toBe('debit');
      expect(lines[0].reference).toBe('INV-2023-001');
    });

    it('should extract Stripe transfer references', () => {
      const mt940Content = `
:20:STATEMENT123
:60F:C231101EUR1000,00
:61:2311151115C2500,50NTRFNONREF//tr_1A2B3C4D5E6F7G8H
:62F:C231115EUR3500,50
`;

      const lines = parseMT940(mt940Content);

      expect(lines[0].provider_ref).toBe('tr_1A2B3C4D5E6F7G8H');
    });

    it('should handle malformed dates gracefully', () => {
      const mt940Content = `
:20:STATEMENT123
:60F:C231101EUR1000,00
:61:INVALIDC100,00NTRFNONREF//TEST
:62F:C231115EUR1100,00
`;

      expect(() => parseMT940(mt940Content)).not.toThrow();
    });

    it('should parse multiple transactions', () => {
      const mt940Content = `
:20:STATEMENT123
:60F:C231101EUR1000,00
:61:2311151115C100,00NTRFNONREF//PO_001
:61:2311161116D50,00NTRFNONREF//PO_002
:61:2311171117C200,00NTRFNONREF//PO_003
:62F:C231117EUR1250,00
`;

      const lines = parseMT940(mt940Content);

      expect(lines).toHaveLength(3);
      expect(lines[0].amount).toBe(100.00);
      expect(lines[1].amount).toBe(-50.00);
      expect(lines[2].amount).toBe(200.00);
    });
  });

  describe('parse86Field', () => {
    it('should parse SEPA structured format', () => {
      const content = '?20Payment for invoice?21Additional info?30DEUTDEFF?31DE89370400440532013000?32John Doe';

      const result = parse86Field(content);

      expect(result.description).toContain('Payment for invoice');
      expect(result.bic).toBe('DEUTDEFF');
      expect(result.iban).toBe('DE89370400440532013000');
      expect(result.beneficiary_name).toContain('John Doe');
    });

    it('should handle unstructured content', () => {
      const content = 'Simple payment description';

      const result = parse86Field(content);

      expect(result.description).toBe('Simple payment description');
    });
  });
});
