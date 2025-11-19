/**
 * BRIQUE 139 — Internationalisation & Accessibilité
 * Translation service with hierarchical fallback
 */

import { query } from '../db';
import {
  getCachedTranslations,
  setCachedTranslations,
  invalidateTranslationCache,
  incrementTranslationUsage,
} from '../cache';
import type {
  Translation,
  UpdateTranslationRequest,
  GetTranslationsResponse,
} from '../types';

/**
 * Get translations for a specific language and module
 * Implements hierarchical fallback: requested lang → fr → en
 */
export async function getTranslations(
  lang: string,
  module: string,
  enableCache: boolean = true
): Promise<GetTranslationsResponse> {
  // Try cache first
  if (enableCache) {
    const cached = await getCachedTranslations(lang, module);
    if (cached) {
      console.log(`[i18n] Cache hit: ${lang}/${module}`);
      return cached;
    }
  }

  // Query database
  const result = await query<Translation>(
    `SELECT key, value FROM translations
     WHERE lang_code = $1 AND module = $2
     ORDER BY key`,
    [lang, module]
  );

  if (result.rowCount === 0) {
    console.warn(`[i18n] No translations found for ${lang}/${module}, trying fallback`);

    // Try French fallback
    if (lang !== 'fr') {
      const frResult = await query<Translation>(
        `SELECT key, value FROM translations
         WHERE lang_code = 'fr' AND module = $1
         ORDER BY key`,
        [module]
      );

      if (frResult.rowCount > 0) {
        const translations = frResult.rows.reduce((acc, row) => {
          acc[row.key] = row.value;
          return acc;
        }, {} as GetTranslationsResponse);

        if (enableCache) {
          await setCachedTranslations(lang, module, translations);
        }
        return translations;
      }
    }

    // Try English fallback
    if (lang !== 'en') {
      const enResult = await query<Translation>(
        `SELECT key, value FROM translations
         WHERE lang_code = 'en' AND module = $1
         ORDER BY key`,
        [module]
      );

      if (enResult.rowCount > 0) {
        const translations = enResult.rows.reduce((acc, row) => {
          acc[row.key] = row.value;
          return acc;
        }, {} as GetTranslationsResponse);

        if (enableCache) {
          await setCachedTranslations(lang, module, translations);
        }
        return translations;
      }
    }

    // No translations found
    return {};
  }

  const translations = result.rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {} as GetTranslationsResponse);

  // Cache the result
  if (enableCache) {
    await setCachedTranslations(lang, module, translations);
  }

  return translations;
}

/**
 * Get a single translation by key with fallback
 */
export async function getTranslation(
  lang: string,
  module: string,
  key: string,
  defaultValue?: string
): Promise<string> {
  const translations = await getTranslations(lang, module);

  // Increment usage counter for analytics
  await incrementTranslationUsage(lang, module, key);

  return translations[key] || defaultValue || key;
}

/**
 * Update or create a translation
 */
export async function updateTranslation(
  request: UpdateTranslationRequest,
  updatedBy: string
): Promise<Translation> {
  const { lang_code, module, key, value, context } = request;

  // Validate language exists
  const langCheck = await query(
    'SELECT code FROM languages WHERE code = $1 AND is_active = true',
    [lang_code]
  );

  if (langCheck.rowCount === 0) {
    throw new Error(`Language '${lang_code}' is not active or does not exist`);
  }

  // Insert or update translation
  const result = await query<Translation>(
    `INSERT INTO translations (lang_code, module, key, value, context, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (lang_code, module, key)
     DO UPDATE SET
       value = EXCLUDED.value,
       context = EXCLUDED.context,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING *`,
    [lang_code, module, key, value, JSON.stringify(context || {}), updatedBy]
  );

  // Invalidate cache
  await invalidateTranslationCache(lang_code, module);

  // Log to accessibility_logs
  await query(
    `INSERT INTO accessibility_logs (log_type, actor, action, module, severity, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      'translation_update',
      updatedBy,
      'update',
      module,
      'info',
      JSON.stringify({ lang_code, key, value }),
    ]
  );

  return result.rows[0];
}

/**
 * Bulk update translations
 */
export async function bulkUpdateTranslations(
  translations: UpdateTranslationRequest[],
  updatedBy: string
): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  for (const trans of translations) {
    try {
      await updateTranslation(trans, updatedBy);
      updated++;
    } catch (error) {
      errors.push(`${trans.lang_code}/${trans.module}/${trans.key}: ${error}`);
    }
  }

  return { updated, errors };
}

/**
 * Delete a translation
 */
export async function deleteTranslation(
  lang: string,
  module: string,
  key: string,
  deletedBy: string
): Promise<void> {
  await query(
    'DELETE FROM translations WHERE lang_code = $1 AND module = $2 AND key = $3',
    [lang, module, key]
  );

  // Invalidate cache
  await invalidateTranslationCache(lang, module);

  // Log deletion
  await query(
    `INSERT INTO accessibility_logs (log_type, actor, action, module, severity, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      'translation_update',
      deletedBy,
      'delete',
      module,
      'info',
      JSON.stringify({ lang, key }),
    ]
  );
}

/**
 * Get missing translations for a module across all languages
 */
export async function getMissingTranslations(module: string): Promise<{
  lang: string;
  missing_keys: string[];
}[]> {
  const result = await query<{ lang: string; missing_keys: string[] }>(`
    WITH all_keys AS (
      SELECT DISTINCT key
      FROM translations
      WHERE module = $1
    ),
    lang_keys AS (
      SELECT
        l.code as lang,
        array_agg(t.key) as existing_keys
      FROM languages l
      LEFT JOIN translations t ON t.lang_code = l.code AND t.module = $1
      WHERE l.is_active = true
      GROUP BY l.code
    )
    SELECT
      lk.lang,
      array_agg(ak.key) FILTER (WHERE ak.key NOT IN (SELECT unnest(COALESCE(lk.existing_keys, ARRAY[]::text[])))) as missing_keys
    FROM lang_keys lk
    CROSS JOIN all_keys ak
    GROUP BY lk.lang
    HAVING COUNT(ak.key) FILTER (WHERE ak.key NOT IN (SELECT unnest(COALESCE(lk.existing_keys, ARRAY[]::text[])))) > 0
  `, [module]);

  return result.rows;
}

/**
 * Get translation coverage statistics
 */
export async function getTranslationCoverage(): Promise<{
  lang: string;
  module: string;
  total_keys: number;
  translated_keys: number;
  coverage_percent: number;
}[]> {
  const result = await query<{
    lang: string;
    module: string;
    total_keys: number;
    translated_keys: number;
    coverage_percent: number;
  }>(`
    WITH module_keys AS (
      SELECT module, COUNT(DISTINCT key) as total_keys
      FROM translations
      GROUP BY module
    ),
    lang_module_keys AS (
      SELECT
        t.lang_code as lang,
        t.module,
        COUNT(t.key) as translated_keys
      FROM translations t
      JOIN languages l ON l.code = t.lang_code
      WHERE l.is_active = true
      GROUP BY t.lang_code, t.module
    )
    SELECT
      lmk.lang,
      lmk.module,
      mk.total_keys,
      lmk.translated_keys,
      ROUND((lmk.translated_keys::decimal / mk.total_keys) * 100, 2) as coverage_percent
    FROM lang_module_keys lmk
    JOIN module_keys mk ON mk.module = lmk.module
    ORDER BY lmk.lang, lmk.module
  `);

  return result.rows;
}

/**
 * Search translations by value (useful for finding specific text)
 */
export async function searchTranslations(
  searchTerm: string,
  lang?: string,
  module?: string
): Promise<Translation[]> {
  let queryText = `
    SELECT * FROM translations
    WHERE value ILIKE $1
  `;
  const params: any[] = [`%${searchTerm}%`];

  if (lang) {
    queryText += ` AND lang_code = $${params.length + 1}`;
    params.push(lang);
  }

  if (module) {
    queryText += ` AND module = $${params.length + 1}`;
    params.push(module);
  }

  queryText += ' ORDER BY lang_code, module, key LIMIT 100';

  const result = await query<Translation>(queryText, params);
  return result.rows;
}

/**
 * Export translations to JSON format for CDN distribution
 */
export async function exportTranslationsToJSON(
  lang: string,
  module?: string
): Promise<Record<string, any>> {
  let queryText = 'SELECT module, key, value FROM translations WHERE lang_code = $1';
  const params: any[] = [lang];

  if (module) {
    queryText += ' AND module = $2';
    params.push(module);
  }

  queryText += ' ORDER BY module, key';

  const result = await query<{ module: string; key: string; value: string }>(
    queryText,
    params
  );

  // Group by module
  const exports: Record<string, any> = {};
  for (const row of result.rows) {
    if (!exports[row.module]) {
      exports[row.module] = {};
    }
    exports[row.module][row.key] = row.value;
  }

  return exports;
}

/**
 * Import translations from JSON format
 */
export async function importTranslationsFromJSON(
  lang: string,
  data: Record<string, Record<string, string>>,
  importedBy: string
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;

  for (const [module, translations] of Object.entries(data)) {
    for (const [key, value] of Object.entries(translations)) {
      try {
        await updateTranslation(
          { lang_code: lang, module, key, value },
          importedBy
        );
        imported++;
      } catch (error) {
        errors.push(`${module}.${key}: ${error}`);
      }
    }
  }

  return { imported, errors };
}
