/**
 * BRIQUE 145 — Consumer Unit Tests
 */
import { mapCountryToZone, normalizeEvent } from '../services/analytics-consumer/src/utils';

describe('Analytics Consumer Utils', () => {
  describe('mapCountryToZone', () => {
    it('should map CEDEAO countries correctly', () => {
      expect(mapCountryToZone('SN')).toBe('CEDEAO');
      expect(mapCountryToZone('ML')).toBe('CEDEAO');
      expect(mapCountryToZone('CI')).toBe('CEDEAO');
    });

    it('should map CEMAC countries correctly', () => {
      expect(mapCountryToZone('CM')).toBe('CEMAC');
      expect(mapCountryToZone('GA')).toBe('CEMAC');
    });

    it('should map EU countries correctly', () => {
      expect(mapCountryToZone('FR')).toBe('EU');
      expect(mapCountryToZone('DE')).toBe('EU');
    });

    it('should return GLOBAL for unknown countries', () => {
      expect(mapCountryToZone('XX')).toBe('GLOBAL');
      expect(mapCountryToZone()).toBe('GLOBAL');
    });

    it('should handle lowercase country codes', () => {
      expect(mapCountryToZone('sn')).toBe('CEDEAO');
    });
  });

  describe('normalizeEvent', () => {
    it('should normalize wallet transaction event', () => {
      const event = {
        type: 'wallet_txn_created',
        data: {
          id: 'txn_123',
          amount: 10000,
          currency: 'XOF',
          status: 'succeeded',
          country: 'SN',
          city: 'Dakar'
        },
        timestamp: '2025-01-19T10:00:00Z'
      };

      const normalized = normalizeEvent(event);

      expect(normalized).toMatchObject({
        event_id: 'txn_123',
        event_type: 'transaction',
        amount: 10000,
        currency: 'XOF',
        status: 'succeeded',
        country: 'SN',
        zone: 'CEDEAO',
        city: 'Dakar'
      });
    });

    it('should handle missing optional fields', () => {
      const event = {
        type: 'wallet_txn_created',
        data: {
          id: 'txn_456',
          amount: 5000,
          currency: 'XOF',
          status: 'succeeded'
        },
        timestamp: '2025-01-19T10:00:00Z'
      };

      const normalized = normalizeEvent(event);

      expect(normalized.country).toBeNull();
      expect(normalized.zone).toBe('GLOBAL');
      expect(normalized.city).toBeNull();
    });

    it('should calculate fee correctly', () => {
      const event = {
        type: 'wallet_txn_created',
        data: {
          id: 'txn_789',
          amount: 10000,
          fee: 200,
          currency: 'XOF',
          status: 'succeeded'
        },
        timestamp: '2025-01-19T10:00:00Z'
      };

      const normalized = normalizeEvent(event);

      expect(normalized.fee).toBe(200);
    });
  });
});
