/**
 * BRIQUE 143 — i18n Service
 * Backend internationalization service integrated with Molam ID
 */

import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../db';

const SUPPORTED_LANGS = ['fr', 'en', 'wo', 'ar'] as const;
type SupportedLang = typeof SUPPORTED_LANGS[number];

let translations: Record<string, any> = {};

/**
 * Load translation files at startup
 */
export function loadTranslations() {
  for (const lang of SUPPORTED_LANGS) {
    const file = path.join(__dirname, `../../locales/${lang}.json`);
    try {
      if (fs.existsSync(file)) {
        translations[lang] = JSON.parse(fs.readFileSync(file, 'utf8'));
        console.log(`[i18n] Loaded ${lang} translations`);
      } else {
        console.warn(`[i18n] Missing translation file: ${file}`);
        translations[lang] = {};
      }
    } catch (error) {
      console.error(`[i18n] Error loading ${lang}:`, error);
      translations[lang] = {};
    }
  }
}

/**
 * Get translated string
 */
export function t(lang: string, key: string, fallback?: string): string {
  const translation = translations[lang]?.[key] || translations['en']?.[key] || fallback || key;
  return translation;
}

/**
 * Detect language from request headers
 */
export function detectLang(req: Request): SupportedLang {
  // 1. Check user preferences (if authenticated)
  if ((req as any).user?.language) {
    const userLang = (req as any).user.language;
    if (SUPPORTED_LANGS.includes(userLang)) {
      return userLang as SupportedLang;
    }
  }

  // 2. Check Accept-Language header
  const acceptLang = req.headers['accept-language'];
  if (acceptLang) {
    const lang = acceptLang.split(',')[0].split('-')[0];
    if (SUPPORTED_LANGS.includes(lang as any)) {
      return lang as SupportedLang;
    }
  }

  // 3. Default to English
  return 'en';
}

/**
 * Express middleware to attach language to request
 */
export function i18nMiddleware(req: Request, res: Response, next: NextFunction) {
  const userLang = detectLang(req);
  (req as any).lang = userLang;
  (req as any).t = (key: string, fallback?: string) => t(userLang, key, fallback);
  next();
}

/**
 * Get user preferences from database
 */
export async function getUserPreferences(userId: string) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM user_preferences WHERE user_id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0];
  } catch (error) {
    console.error('[i18n] Error fetching user preferences:', error);
    return null;
  }
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(userId: string, preferences: any) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO user_preferences (user_id, language, currency, timezone, high_contrast, dark_mode, font_size, reduce_motion, screen_reader, keyboard_nav_only, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (user_id) DO UPDATE
       SET language = EXCLUDED.language,
           currency = EXCLUDED.currency,
           timezone = EXCLUDED.timezone,
           high_contrast = EXCLUDED.high_contrast,
           dark_mode = EXCLUDED.dark_mode,
           font_size = EXCLUDED.font_size,
           reduce_motion = EXCLUDED.reduce_motion,
           screen_reader = EXCLUDED.screen_reader,
           keyboard_nav_only = EXCLUDED.keyboard_nav_only,
           updated_at = now()
       RETURNING *`,
      [
        userId,
        preferences.language || 'en',
        preferences.currency || 'XOF',
        preferences.timezone || 'UTC',
        preferences.high_contrast || false,
        preferences.dark_mode || false,
        preferences.font_size || 'medium',
        preferences.reduce_motion || false,
        preferences.screen_reader || false,
        preferences.keyboard_nav_only || false,
      ]
    );

    return rows[0];
  } catch (error) {
    console.error('[i18n] Error updating user preferences:', error);
    throw error;
  }
}

/**
 * Get translations from database (for CMS-managed content)
 */
export async function getTranslationsFromDB(language: string, keys?: string[]) {
  try {
    let query = `
      SELECT tk.key, t.value
      FROM translation_keys tk
      JOIN translations t ON t.translation_key_id = tk.id
      WHERE t.language = $1
    `;

    const params: any[] = [language];

    if (keys && keys.length > 0) {
      query += ` AND tk.key = ANY($2)`;
      params.push(keys);
    }

    const { rows } = await pool.query(query, params);

    const translations: Record<string, string> = {};
    rows.forEach((row) => {
      translations[row.key] = row.value;
    });

    return translations;
  } catch (error) {
    console.error('[i18n] Error fetching translations from DB:', error);
    return {};
  }
}

/**
 * Log language usage stats
 */
export async function logLanguageUsage(language: string, pageViews: number = 1) {
  try {
    await pool.query(
      `INSERT INTO language_usage_stats (language, date, page_views)
       VALUES ($1, CURRENT_DATE, $2)
       ON CONFLICT (language, date) DO UPDATE
       SET page_views = language_usage_stats.page_views + EXCLUDED.page_views`,
      [language, pageViews]
    );
  } catch (error) {
    console.error('[i18n] Error logging language usage:', error);
  }
}

/**
 * Get supported languages
 */
export function getSupportedLanguages() {
  return SUPPORTED_LANGS.map((lang) => ({
    code: lang,
    name: getLanguageName(lang),
    native: getLanguageNativeName(lang),
  }));
}

function getLanguageName(lang: string): string {
  const names: Record<string, string> = {
    en: 'English',
    fr: 'French',
    wo: 'Wolof',
    ar: 'Arabic',
  };
  return names[lang] || lang;
}

function getLanguageNativeName(lang: string): string {
  const nativeNames: Record<string, string> = {
    en: 'English',
    fr: 'Français',
    wo: 'Wolof',
    ar: 'العربية',
  };
  return nativeNames[lang] || lang;
}

// Load translations on module initialization
loadTranslations();
