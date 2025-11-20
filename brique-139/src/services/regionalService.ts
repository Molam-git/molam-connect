/**
 * BRIQUE 139 — Internationalisation & Accessibilité
 * Regional settings service
 */

import { query } from '../db';
import {
  getCachedRegionalSettings,
  setCachedRegionalSettings,
} from '../cache';
import type { RegionalSettings, Language } from '../types';

/**
 * Get regional settings by country code
 */
export async function getRegionalSettings(
  countryCode: string,
  enableCache: boolean = true
): Promise<RegionalSettings | null> {
  // Try cache first
  if (enableCache) {
    const cached = await getCachedRegionalSettings(countryCode);
    if (cached) {
      console.log(`[Regional] Cache hit: ${countryCode}`);
      return cached;
    }
  }

  // Query database
  const result = await query<RegionalSettings>(
    'SELECT * FROM regional_settings WHERE country_code = $1 AND is_active = true',
    [countryCode]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const settings = result.rows[0];

  // Cache the result
  if (enableCache) {
    await setCachedRegionalSettings(countryCode, settings);
  }

  return settings;
}

/**
 * Get all active regional settings
 */
export async function getAllRegionalSettings(): Promise<RegionalSettings[]> {
  const result = await query<RegionalSettings>(
    'SELECT * FROM regional_settings WHERE is_active = true ORDER BY country_name'
  );
  return result.rows;
}

/**
 * Update regional settings
 */
export async function updateRegionalSettings(
  countryCode: string,
  updates: Partial<RegionalSettings>,
  updatedBy: string
): Promise<RegionalSettings> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  // Build dynamic UPDATE query
  Object.entries(updates).forEach(([key, value]) => {
    if (
      key !== 'id' &&
      key !== 'country_code' &&
      key !== 'created_at' &&
      key !== 'updated_at' &&
      value !== undefined
    ) {
      fields.push(`${key} = $${paramIndex++}`);
      values.push(value);
    }
  });

  if (fields.length === 0) {
    throw new Error('No valid fields to update');
  }

  fields.push(`updated_at = now()`);
  values.push(countryCode);

  const result = await query<RegionalSettings>(
    `UPDATE regional_settings
     SET ${fields.join(', ')}
     WHERE country_code = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rowCount === 0) {
    throw new Error(`Regional settings not found: ${countryCode}`);
  }

  // Invalidate cache
  await setCachedRegionalSettings(countryCode, result.rows[0]);

  // Log update
  await query(
    `INSERT INTO accessibility_logs (log_type, actor, action, severity, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'regional_settings_update',
      updatedBy,
      'update',
      'info',
      JSON.stringify({ country_code: countryCode, updates }),
    ]
  );

  return result.rows[0];
}

/**
 * Get all active languages
 */
export async function getActiveLanguages(): Promise<Language[]> {
  const result = await query<Language>(
    'SELECT * FROM languages WHERE is_active = true ORDER BY code'
  );
  return result.rows;
}

/**
 * Get language by code
 */
export async function getLanguage(code: string): Promise<Language | null> {
  const result = await query<Language>(
    'SELECT * FROM languages WHERE code = $1',
    [code]
  );
  return result.rowCount > 0 ? result.rows[0] : null;
}

/**
 * Add new language
 */
export async function addLanguage(
  language: Omit<Language, 'created_at' | 'updated_at'>,
  createdBy: string
): Promise<Language> {
  const result = await query<Language>(
    `INSERT INTO languages (code, name, native_name, direction, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      language.code,
      language.name,
      language.native_name,
      language.direction,
      language.is_active,
    ]
  );

  // Log creation
  await query(
    `INSERT INTO accessibility_logs (log_type, actor, action, severity, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'language_activation',
      createdBy,
      'create',
      'info',
      JSON.stringify({ code: language.code, name: language.name }),
    ]
  );

  return result.rows[0];
}

/**
 * Toggle language active status
 */
export async function toggleLanguageStatus(
  code: string,
  isActive: boolean,
  updatedBy: string
): Promise<Language> {
  const result = await query<Language>(
    `UPDATE languages
     SET is_active = $1, updated_at = now()
     WHERE code = $2
     RETURNING *`,
    [isActive, code]
  );

  if (result.rowCount === 0) {
    throw new Error(`Language not found: ${code}`);
  }

  // Log status change
  await query(
    `INSERT INTO accessibility_logs (log_type, actor, action, severity, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'language_activation',
      updatedBy,
      isActive ? 'activate' : 'deactivate',
      'info',
      JSON.stringify({ code, is_active: isActive }),
    ]
  );

  return result.rows[0];
}

/**
 * Detect user's regional settings based on IP, headers, or country code
 */
export async function detectUserRegion(
  countryCode?: string,
  acceptLanguage?: string
): Promise<{
  regional_settings: RegionalSettings | null;
  detected_language: string;
  fallback_used: boolean;
}> {
  let regionalSettings: RegionalSettings | null = null;
  let fallbackUsed = false;

  // Try to get regional settings by country code
  if (countryCode) {
    regionalSettings = await getRegionalSettings(countryCode);
  }

  // Fallback to default (Senegal)
  if (!regionalSettings) {
    regionalSettings = await getRegionalSettings('SN');
    fallbackUsed = true;
  }

  // Detect language from Accept-Language header
  let detectedLanguage = regionalSettings?.default_language || 'fr';

  if (acceptLanguage && regionalSettings) {
    const supportedLangs = regionalSettings.supported_languages || [];
    const requestedLangs = parseAcceptLanguage(acceptLanguage);

    for (const lang of requestedLangs) {
      if (supportedLangs.includes(lang)) {
        detectedLanguage = lang;
        break;
      }
    }
  }

  return {
    regional_settings: regionalSettings,
    detected_language: detectedLanguage,
    fallback_used: fallbackUsed,
  };
}

/**
 * Parse Accept-Language header
 */
function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((lang) => {
      const parts = lang.split(';');
      const code = parts[0].trim().toLowerCase();
      // Extract just the language code (e.g., 'fr' from 'fr-FR')
      return code.split('-')[0];
    })
    .filter((code) => code.length === 2);
}

/**
 * Get complete localization context for a user
 */
export async function getLocalizationContext(
  countryCode: string,
  languageCode?: string
): Promise<{
  country: string;
  language: string;
  currency: string;
  direction: 'ltr' | 'rtl';
  timezone: string;
  date_format: string;
  time_format: string;
}> {
  const regional = await getRegionalSettings(countryCode);

  if (!regional) {
    throw new Error(`Regional settings not found for: ${countryCode}`);
  }

  const lang = languageCode || regional.default_language;
  const language = await getLanguage(lang);

  if (!language) {
    throw new Error(`Language not found: ${lang}`);
  }

  return {
    country: countryCode,
    language: lang,
    currency: regional.default_currency,
    direction: language.direction,
    timezone: regional.timezone,
    date_format: regional.date_format,
    time_format: regional.time_format,
  };
}

/**
 * Format date according to regional settings
 */
export function formatDate(
  date: Date,
  format: string,
  timezone: string
): string {
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
    };

    // Parse format string (simplified - in production use a proper date library)
    if (format.includes('DD')) {
      options.day = '2-digit';
    }
    if (format.includes('MM')) {
      options.month = '2-digit';
    }
    if (format.includes('YYYY')) {
      options.year = 'numeric';
    }

    return new Intl.DateTimeFormat('fr-FR', options).format(date);
  } catch (error) {
    console.error('[Regional] Date formatting error:', error);
    return date.toISOString();
  }
}

/**
 * Format time according to regional settings
 */
export function formatTime(
  date: Date,
  format: '12h' | '24h',
  timezone: string
): string {
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: format === '12h',
    };

    return new Intl.DateTimeFormat('fr-FR', options).format(date);
  } catch (error) {
    console.error('[Regional] Time formatting error:', error);
    return date.toISOString();
  }
}
