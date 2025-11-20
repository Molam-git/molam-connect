/**
 * BRIQUE 139 — Internationalisation & Accessibilité
 * REST API Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as i18nService from './services/i18nService';
import * as currencyService from './services/currencyService';
import * as regionalService from './services/regionalService';

const router = Router();

// =============================================================================
// Middleware
// =============================================================================

/**
 * Validate request body against Zod schema
 */
function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
      }
      next(error);
    }
  };
}

/**
 * Mock auth middleware (replace with real auth in production)
 */
function requireAuth(req: Request, res: Response, next: NextFunction) {
  // In production, verify JWT token and extract user info
  const userId = req.headers['x-user-id'] as string || 'system';
  const userRole = req.headers['x-user-role'] as string || 'user';

  (req as any).user = { id: userId, role: userRole };
  next();
}

/**
 * Require specific role
 */
function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req as any).user?.role;
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// =============================================================================
// Zod Schemas
// =============================================================================

const UpdateTranslationSchema = z.object({
  lang_code: z.string().min(2).max(3),
  module: z.string().min(1),
  key: z.string().min(1),
  value: z.string(),
  context: z.record(z.any()).optional(),
});

const BulkUpdateTranslationsSchema = z.object({
  translations: z.array(UpdateTranslationSchema),
});

const CreateLanguageSchema = z.object({
  code: z.string().min(2).max(3),
  name: z.string().min(1),
  native_name: z.string().min(1),
  direction: z.enum(['ltr', 'rtl']),
});

const UpdateCurrencyFormatSchema = z.object({
  code: z.string().min(3).max(3),
  symbol: z.string().optional(),
  decimal_separator: z.string().optional(),
  thousand_separator: z.string().optional(),
  precision: z.number().int().min(0).max(4).optional(),
  rounding_mode: z.enum(['HALF_UP', 'HALF_DOWN', 'CEILING', 'FLOOR']).optional(),
  active: z.boolean().optional(),
});

const FormatCurrencySchema = z.object({
  amount: z.number(),
  currency: z.string().min(3).max(3),
  locale: z.string().optional(),
});

const UpdateRegionalSettingsSchema = z.object({
  country_code: z.string().length(2),
  default_language: z.string().optional(),
  supported_languages: z.array(z.string()).optional(),
  default_currency: z.string().optional(),
  timezone: z.string().optional(),
});

// =============================================================================
// Translation Routes
// =============================================================================

/**
 * GET /api/i18n/:lang/:module
 * Get translations for a specific language and module
 */
router.get('/i18n/:lang/:module', async (req: Request, res: Response) => {
  try {
    const { lang, module } = req.params;
    const translations = await i18nService.getTranslations(lang, module);
    res.json(translations);
  } catch (error) {
    console.error('[API] Error getting translations:', error);
    res.status(500).json({ error: 'Failed to get translations' });
  }
});

/**
 * GET /api/i18n/:lang/:module/:key
 * Get a single translation by key
 */
router.get('/i18n/:lang/:module/:key', async (req: Request, res: Response) => {
  try {
    const { lang, module, key } = req.params;
    const value = await i18nService.getTranslation(lang, module, key);
    res.json({ key, value, lang, module });
  } catch (error) {
    console.error('[API] Error getting translation:', error);
    res.status(500).json({ error: 'Failed to get translation' });
  }
});

/**
 * POST /api/i18n/update
 * Update or create a translation
 */
router.post(
  '/i18n/update',
  requireAuth,
  requireRole(['ops_admin', 'i18n_editor']),
  validateBody(UpdateTranslationSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const translation = await i18nService.updateTranslation(req.body, userId);
      res.json(translation);
    } catch (error) {
      console.error('[API] Error updating translation:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

/**
 * POST /api/i18n/bulk-update
 * Bulk update translations
 */
router.post(
  '/i18n/bulk-update',
  requireAuth,
  requireRole(['ops_admin', 'i18n_editor']),
  validateBody(BulkUpdateTranslationsSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const result = await i18nService.bulkUpdateTranslations(
        req.body.translations,
        userId
      );
      res.json(result);
    } catch (error) {
      console.error('[API] Error bulk updating translations:', error);
      res.status(500).json({ error: 'Failed to bulk update translations' });
    }
  }
);

/**
 * DELETE /api/i18n/:lang/:module/:key
 * Delete a translation
 */
router.delete(
  '/i18n/:lang/:module/:key',
  requireAuth,
  requireRole(['ops_admin']),
  async (req: Request, res: Response) => {
    try {
      const { lang, module, key } = req.params;
      const userId = (req as any).user.id;
      await i18nService.deleteTranslation(lang, module, key, userId);
      res.json({ success: true, message: 'Translation deleted' });
    } catch (error) {
      console.error('[API] Error deleting translation:', error);
      res.status(500).json({ error: 'Failed to delete translation' });
    }
  }
);

/**
 * GET /api/i18n/missing/:module
 * Get missing translations for a module
 */
router.get('/i18n/missing/:module', async (req: Request, res: Response) => {
  try {
    const { module } = req.params;
    const missing = await i18nService.getMissingTranslations(module);
    res.json(missing);
  } catch (error) {
    console.error('[API] Error getting missing translations:', error);
    res.status(500).json({ error: 'Failed to get missing translations' });
  }
});

/**
 * GET /api/i18n/coverage
 * Get translation coverage statistics
 */
router.get('/i18n/coverage', async (req: Request, res: Response) => {
  try {
    const coverage = await i18nService.getTranslationCoverage();
    res.json(coverage);
  } catch (error) {
    console.error('[API] Error getting coverage:', error);
    res.status(500).json({ error: 'Failed to get coverage' });
  }
});

/**
 * GET /api/i18n/search
 * Search translations by value
 */
router.get('/i18n/search', async (req: Request, res: Response) => {
  try {
    const { q, lang, module } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query required' });
    }
    const results = await i18nService.searchTranslations(
      q,
      lang as string,
      module as string
    );
    res.json(results);
  } catch (error) {
    console.error('[API] Error searching translations:', error);
    res.status(500).json({ error: 'Failed to search translations' });
  }
});

/**
 * GET /api/i18n/export/:lang
 * Export translations to JSON
 */
router.get('/i18n/export/:lang', async (req: Request, res: Response) => {
  try {
    const { lang } = req.params;
    const { module } = req.query;
    const exported = await i18nService.exportTranslationsToJSON(
      lang,
      module as string
    );
    res.json(exported);
  } catch (error) {
    console.error('[API] Error exporting translations:', error);
    res.status(500).json({ error: 'Failed to export translations' });
  }
});

/**
 * POST /api/i18n/import/:lang
 * Import translations from JSON
 */
router.post(
  '/i18n/import/:lang',
  requireAuth,
  requireRole(['ops_admin', 'i18n_editor']),
  async (req: Request, res: Response) => {
    try {
      const { lang } = req.params;
      const userId = (req as any).user.id;
      const result = await i18nService.importTranslationsFromJSON(
        lang,
        req.body,
        userId
      );
      res.json(result);
    } catch (error) {
      console.error('[API] Error importing translations:', error);
      res.status(500).json({ error: 'Failed to import translations' });
    }
  }
);

// =============================================================================
// Currency Routes
// =============================================================================

/**
 * GET /api/currency/:code
 * Get currency format by code
 */
router.get('/currency/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const format = await currencyService.getCurrencyFormat(code);
    if (!format) {
      return res.status(404).json({ error: 'Currency not found' });
    }
    res.json(format);
  } catch (error) {
    console.error('[API] Error getting currency:', error);
    res.status(500).json({ error: 'Failed to get currency' });
  }
});

/**
 * GET /api/currency
 * Get all active currencies
 */
router.get('/currency', async (req: Request, res: Response) => {
  try {
    const currencies = await currencyService.getAllCurrencyFormats();
    res.json(currencies);
  } catch (error) {
    console.error('[API] Error getting currencies:', error);
    res.status(500).json({ error: 'Failed to get currencies' });
  }
});

/**
 * POST /api/currency/format
 * Format a currency amount
 */
router.post(
  '/currency/format',
  validateBody(FormatCurrencySchema),
  async (req: Request, res: Response) => {
    try {
      const result = await currencyService.formatCurrency(req.body);
      res.json(result);
    } catch (error) {
      console.error('[API] Error formatting currency:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

/**
 * PUT /api/currency/:code
 * Update currency format
 */
router.put(
  '/currency/:code',
  requireAuth,
  requireRole(['ops_admin']),
  validateBody(UpdateCurrencyFormatSchema),
  async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const userId = (req as any).user.id;
      const updated = await currencyService.updateCurrencyFormat(
        code,
        req.body,
        userId
      );
      res.json(updated);
    } catch (error) {
      console.error('[API] Error updating currency:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// =============================================================================
// Regional Settings Routes
// =============================================================================

/**
 * GET /api/regional/:countryCode
 * Get regional settings by country code
 */
router.get('/regional/:countryCode', async (req: Request, res: Response) => {
  try {
    const { countryCode } = req.params;
    const settings = await regionalService.getRegionalSettings(countryCode);
    if (!settings) {
      return res.status(404).json({ error: 'Regional settings not found' });
    }
    res.json(settings);
  } catch (error) {
    console.error('[API] Error getting regional settings:', error);
    res.status(500).json({ error: 'Failed to get regional settings' });
  }
});

/**
 * GET /api/regional
 * Get all regional settings
 */
router.get('/regional', async (req: Request, res: Response) => {
  try {
    const settings = await regionalService.getAllRegionalSettings();
    res.json(settings);
  } catch (error) {
    console.error('[API] Error getting regional settings:', error);
    res.status(500).json({ error: 'Failed to get regional settings' });
  }
});

/**
 * PUT /api/regional/:countryCode
 * Update regional settings
 */
router.put(
  '/regional/:countryCode',
  requireAuth,
  requireRole(['ops_admin']),
  validateBody(UpdateRegionalSettingsSchema),
  async (req: Request, res: Response) => {
    try {
      const { countryCode } = req.params;
      const userId = (req as any).user.id;
      const updated = await regionalService.updateRegionalSettings(
        countryCode,
        req.body,
        userId
      );
      res.json(updated);
    } catch (error) {
      console.error('[API] Error updating regional settings:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

/**
 * GET /api/regional/detect
 * Auto-detect user's regional settings
 */
router.get('/regional/detect', async (req: Request, res: Response) => {
  try {
    const countryCode = req.query.country as string;
    const acceptLanguage = req.headers['accept-language'];

    const detected = await regionalService.detectUserRegion(
      countryCode,
      acceptLanguage
    );
    res.json(detected);
  } catch (error) {
    console.error('[API] Error detecting region:', error);
    res.status(500).json({ error: 'Failed to detect region' });
  }
});

/**
 * GET /api/regional/:countryCode/context
 * Get complete localization context
 */
router.get(
  '/regional/:countryCode/context',
  async (req: Request, res: Response) => {
    try {
      const { countryCode } = req.params;
      const lang = req.query.lang as string;
      const context = await regionalService.getLocalizationContext(
        countryCode,
        lang
      );
      res.json(context);
    } catch (error) {
      console.error('[API] Error getting localization context:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// =============================================================================
// Language Routes
// =============================================================================

/**
 * GET /api/languages
 * Get all active languages
 */
router.get('/languages', async (req: Request, res: Response) => {
  try {
    const languages = await regionalService.getActiveLanguages();
    res.json(languages);
  } catch (error) {
    console.error('[API] Error getting languages:', error);
    res.status(500).json({ error: 'Failed to get languages' });
  }
});

/**
 * POST /api/languages
 * Add new language
 */
router.post(
  '/languages',
  requireAuth,
  requireRole(['ops_admin']),
  validateBody(CreateLanguageSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const language = await regionalService.addLanguage(req.body, userId);
      res.status(201).json(language);
    } catch (error) {
      console.error('[API] Error adding language:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

/**
 * PATCH /api/languages/:code/toggle
 * Toggle language active status
 */
router.patch(
  '/languages/:code/toggle',
  requireAuth,
  requireRole(['ops_admin']),
  async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const { is_active } = req.body;
      const userId = (req as any).user.id;

      if (typeof is_active !== 'boolean') {
        return res.status(400).json({ error: 'is_active must be boolean' });
      }

      const language = await regionalService.toggleLanguageStatus(
        code,
        is_active,
        userId
      );
      res.json(language);
    } catch (error) {
      console.error('[API] Error toggling language:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// =============================================================================
// Health Check
// =============================================================================

router.get('/health', async (req: Request, res: Response) => {
  try {
    const { healthCheck } = await import('./db');
    const { redisHealthCheck } = await import('./cache');

    const [dbHealthy, redisHealthy] = await Promise.all([
      healthCheck(),
      redisHealthCheck(),
    ]);

    const healthy = dbHealthy && redisHealthy;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'unhealthy',
      database: dbHealthy ? 'up' : 'down',
      redis: redisHealthy ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: (error as Error).message,
    });
  }
});

export default router;
