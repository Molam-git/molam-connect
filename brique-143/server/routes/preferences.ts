/**
 * BRIQUE 143 — Preferences API Routes
 * User language and accessibility preferences management
 */

import { Router } from 'express';
import { pool } from '../db';
import { requireAuth } from '../utils/authz';
import {
  getUserPreferences,
  updateUserPreferences,
  getTranslationsFromDB,
  logLanguageUsage,
  getSupportedLanguages,
} from '../services/i18n';

const router = Router();

/**
 * Get current user's preferences
 * GET /api/preferences
 */
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const prefs = await getUserPreferences(userId);

    if (!prefs) {
      // Return defaults
      return res.json({
        language: 'en',
        currency: 'XOF',
        timezone: 'UTC',
        high_contrast: false,
        dark_mode: false,
        font_size: 'medium',
        reduce_motion: false,
        screen_reader: false,
        keyboard_nav_only: false,
      });
    }

    res.json(prefs);
  } catch (error: any) {
    console.error('[Preferences] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update user preferences
 * PATCH /api/preferences
 */
router.patch('/', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;

    // Validate language
    if (updates.language && !['en', 'fr', 'wo', 'ar'].includes(updates.language)) {
      return res.status(400).json({ error: 'invalid_language' });
    }

    // Validate currency
    if (updates.currency && !['XOF', 'EUR', 'USD', 'GBP'].includes(updates.currency)) {
      return res.status(400).json({ error: 'invalid_currency' });
    }

    // Validate font_size
    if (
      updates.font_size &&
      !['small', 'medium', 'large', 'xlarge'].includes(updates.font_size)
    ) {
      return res.status(400).json({ error: 'invalid_font_size' });
    }

    const updated = await updateUserPreferences(userId, updates);

    // Log language usage if language changed
    if (updates.language) {
      await logLanguageUsage(updates.language);
    }

    res.json(updated);
  } catch (error: any) {
    console.error('[Preferences] Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get translations for current language
 * GET /api/translations
 */
router.get('/translations', async (req: any, res) => {
  try {
    const language = req.query.language || req.lang || 'en';
    const keys = req.query.keys ? req.query.keys.split(',') : undefined;

    const translations = await getTranslationsFromDB(language, keys);

    res.json(translations);
  } catch (error: any) {
    console.error('[Preferences] Translations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get supported languages
 * GET /api/languages
 */
router.get('/languages', (req, res) => {
  try {
    const languages = getSupportedLanguages();
    res.json(languages);
  } catch (error: any) {
    console.error('[Preferences] Languages error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Log accessibility audit issue
 * POST /api/accessibility/audit
 */
router.post('/accessibility/audit', async (req: any, res) => {
  try {
    const { page_url, component, issue_type, severity, wcag_criterion, description, metadata } =
      req.body;

    const { rows } = await pool.query(
      `INSERT INTO accessibility_audit_log(page_url, component, issue_type, severity, wcag_criterion, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [page_url, component, issue_type, severity, wcag_criterion, description, metadata || {}]
    );

    res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('[Preferences] Accessibility audit error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get accessibility audit log
 * GET /api/accessibility/audit
 */
router.get('/accessibility/audit', async (req: any, res) => {
  try {
    const { resolved, severity, page_url } = req.query;

    let query = `SELECT * FROM accessibility_audit_log WHERE 1=1`;
    const params: any[] = [];

    if (resolved !== undefined) {
      params.push(resolved === 'true');
      query += ` AND resolved = $${params.length}`;
    }

    if (severity) {
      params.push(severity);
      query += ` AND severity = $${params.length}`;
    }

    if (page_url) {
      params.push(page_url);
      query += ` AND page_url = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT 100`;

    const { rows } = await pool.query(query, params);

    res.json(rows);
  } catch (error: any) {
    console.error('[Preferences] Accessibility audit list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Mark accessibility issue as resolved
 * PATCH /api/accessibility/audit/:id/resolve
 */
router.patch('/accessibility/audit/:id/resolve', async (req: any, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `UPDATE accessibility_audit_log SET resolved = true WHERE id = $1 RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'not_found' });
    }

    res.json(rows[0]);
  } catch (error: any) {
    console.error('[Preferences] Resolve audit issue error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get language usage statistics
 * GET /api/stats/languages
 */
router.get('/stats/languages', async (req: any, res) => {
  try {
    const { days } = req.query;
    const daysInt = parseInt(days || '7');

    const { rows } = await pool.query(
      `SELECT language, SUM(page_views) as total_views, SUM(active_users) as total_users
       FROM language_usage_stats
       WHERE date > CURRENT_DATE - INTERVAL '${daysInt} days'
       GROUP BY language
       ORDER BY total_views DESC`
    );

    res.json(rows);
  } catch (error: any) {
    console.error('[Preferences] Language stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
