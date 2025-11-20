/**
 * BRIQUE 139 — i18n Service Tests
 * Tests for translation service with fallback logic
 */

import * as i18nService from './i18nService';
import { query } from '../db';

// Mock database
jest.mock('../db');
jest.mock('../cache');

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('i18nService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTranslations', () => {
    it('should return translations for requested language', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { key: 'app.name', value: 'Molam Pay' },
          { key: 'button.submit', value: 'Soumettre' },
        ],
        rowCount: 2,
      } as any);

      const result = await i18nService.getTranslations('fr', 'common', false);

      expect(result).toEqual({
        'app.name': 'Molam Pay',
        'button.submit': 'Soumettre',
      });
    });

    it('should fallback to French if requested language not found', async () => {
      // First query returns nothing (Wolof not found)
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      // Second query returns French translations
      mockQuery.mockResolvedValueOnce({
        rows: [
          { key: 'app.name', value: 'Molam Pay' },
          { key: 'button.submit', value: 'Soumettre' },
        ],
        rowCount: 2,
      } as any);

      const result = await i18nService.getTranslations('wo', 'common', false);

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(result['button.submit']).toBe('Soumettre');
    });

    it('should fallback to English if French not found', async () => {
      // First query returns nothing (requested lang)
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      // Second query returns nothing (French)
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      // Third query returns English translations
      mockQuery.mockResolvedValueOnce({
        rows: [
          { key: 'app.name', value: 'Molam Pay' },
          { key: 'button.submit', value: 'Submit' },
        ],
        rowCount: 2,
      } as any);

      const result = await i18nService.getTranslations('wo', 'common', false);

      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(result['button.submit']).toBe('Submit');
    });

    it('should return empty object if no translations found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await i18nService.getTranslations('xx', 'nonexistent', false);

      expect(result).toEqual({});
    });
  });

  describe('updateTranslation', () => {
    it('should update existing translation', async () => {
      // Language check
      mockQuery.mockResolvedValueOnce({
        rows: [{ code: 'fr' }],
        rowCount: 1,
      } as any);

      // Update query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '123',
            lang_code: 'fr',
            module: 'wallet',
            key: 'balance.label',
            value: 'Solde disponible',
          },
        ],
        rowCount: 1,
      } as any);

      // Audit log query
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as any);

      const result = await i18nService.updateTranslation(
        {
          lang_code: 'fr',
          module: 'wallet',
          key: 'balance.label',
          value: 'Solde disponible',
        },
        'user123'
      );

      expect(result.value).toBe('Solde disponible');
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should throw error if language not active', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      await expect(
        i18nService.updateTranslation(
          {
            lang_code: 'xx',
            module: 'wallet',
            key: 'test',
            value: 'test',
          },
          'user123'
        )
      ).rejects.toThrow("Language 'xx' is not active or does not exist");
    });
  });

  describe('getMissingTranslations', () => {
    it('should return missing translations per language', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            lang: 'wo',
            missing_keys: ['button.cancel', 'button.save'],
          },
          {
            lang: 'ar',
            missing_keys: ['dashboard.title'],
          },
        ],
        rowCount: 2,
      } as any);

      const result = await i18nService.getMissingTranslations('common');

      expect(result).toHaveLength(2);
      expect(result[0].lang).toBe('wo');
      expect(result[0].missing_keys).toContain('button.cancel');
    });
  });

  describe('getTranslationCoverage', () => {
    it('should return coverage statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            lang: 'fr',
            module: 'common',
            total_keys: 50,
            translated_keys: 50,
            coverage_percent: 100,
          },
          {
            lang: 'wo',
            module: 'common',
            total_keys: 50,
            translated_keys: 30,
            coverage_percent: 60,
          },
        ],
        rowCount: 2,
      } as any);

      const result = await i18nService.getTranslationCoverage();

      expect(result).toHaveLength(2);
      expect(result[0].coverage_percent).toBe(100);
      expect(result[1].coverage_percent).toBe(60);
    });
  });

  describe('searchTranslations', () => {
    it('should search translations by value', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            lang_code: 'fr',
            module: 'wallet',
            key: 'balance.label',
            value: 'Solde',
          },
          {
            id: '2',
            lang_code: 'fr',
            module: 'wallet',
            key: 'balance.available',
            value: 'Solde disponible',
          },
        ],
        rowCount: 2,
      } as any);

      const result = await i18nService.searchTranslations('Solde', 'fr');

      expect(result).toHaveLength(2);
      expect(result[0].value).toContain('Solde');
    });
  });

  describe('exportTranslationsToJSON', () => {
    it('should export translations grouped by module', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { module: 'common', key: 'app.name', value: 'Molam Pay' },
          { module: 'common', key: 'button.submit', value: 'Soumettre' },
          { module: 'wallet', key: 'balance.label', value: 'Solde' },
        ],
        rowCount: 3,
      } as any);

      const result = await i18nService.exportTranslationsToJSON('fr');

      expect(result.common).toEqual({
        'app.name': 'Molam Pay',
        'button.submit': 'Soumettre',
      });
      expect(result.wallet).toEqual({
        'balance.label': 'Solde',
      });
    });
  });

  describe('bulkUpdateTranslations', () => {
    it('should update multiple translations', async () => {
      // Mock language checks
      mockQuery
        .mockResolvedValueOnce({ rows: [{ code: 'fr' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{}], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ code: 'fr' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{}], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const translations = [
        {
          lang_code: 'fr',
          module: 'common',
          key: 'test1',
          value: 'Test 1',
        },
        {
          lang_code: 'fr',
          module: 'common',
          key: 'test2',
          value: 'Test 2',
        },
      ];

      const result = await i18nService.bulkUpdateTranslations(
        translations,
        'user123'
      );

      expect(result.updated).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect errors for failed updates', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const translations = [
        {
          lang_code: 'fr',
          module: 'common',
          key: 'test1',
          value: 'Test 1',
        },
      ];

      const result = await i18nService.bulkUpdateTranslations(
        translations,
        'user123'
      );

      expect(result.updated).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
