/**
 * BRIQUE 139 — Internationalisation & Accessibilité
 * TypeScript type definitions
 */

// =============================================================================
// Language & Translation Types
// =============================================================================

export type LanguageDirection = 'ltr' | 'rtl';

export interface Language {
  code: string;
  name: string;
  native_name: string;
  direction: LanguageDirection;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Translation {
  id: string;
  lang_code: string;
  module: string;
  key: string;
  value: string;
  fallback_lang: string;
  context?: Record<string, any>;
  version: number;
  updated_by?: string;
  updated_at: Date;
  created_at: Date;
}

export interface TranslationHistory {
  id: string;
  translation_id: string;
  lang_code: string;
  module: string;
  key: string;
  old_value?: string;
  new_value: string;
  changed_by: string;
  change_reason?: string;
  version: number;
  created_at: Date;
}

// =============================================================================
// Currency Types
// =============================================================================

export type RoundingMode = 'HALF_UP' | 'HALF_DOWN' | 'CEILING' | 'FLOOR';
export type SymbolPosition = 'before' | 'after';

export interface CurrencyFormat {
  code: string;
  name: string;
  symbol: string;
  decimal_separator: string;
  thousand_separator: string;
  precision: number;
  rounding_mode: RoundingMode;
  symbol_position: SymbolPosition;
  space_between: boolean;
  active: boolean;
  iso_code: string;
  regions: string[];
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// Regional Settings Types
// =============================================================================

export interface RegionalSettings {
  id: string;
  country_code: string;
  country_name: string;
  default_language: string;
  supported_languages: string[];
  default_currency: string;
  timezone: string;
  date_format: string;
  time_format: '12h' | '24h';
  first_day_of_week: number;
  phone_code: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// Accessibility Types
// =============================================================================

export type AccessibilityLogType =
  | 'translation_update'
  | 'currency_update'
  | 'accessibility_check'
  | 'wcag_audit'
  | 'language_activation'
  | 'regional_settings_update';

export type AccessibilityAction = 'create' | 'update' | 'delete' | 'audit';

export type SeverityLevel = 'info' | 'warning' | 'error' | 'critical';

export interface AccessibilityLog {
  id: string;
  log_type: AccessibilityLogType;
  actor?: string;
  action: AccessibilityAction;
  module?: string;
  severity?: SeverityLevel;
  details: Record<string, any>;
  metadata: Record<string, any>;
  resolved: boolean;
  resolved_at?: Date;
  resolved_by?: string;
  created_at: Date;
}

// =============================================================================
// SIRA Suggestions Types
// =============================================================================

export type SuggestionStatus = 'pending' | 'approved' | 'rejected';

export interface SiraTranslationSuggestion {
  id: string;
  lang_code: string;
  module: string;
  key: string;
  suggested_value: string;
  confidence_score: number;
  context: Record<string, any>;
  status: SuggestionStatus;
  reviewed_by?: string;
  reviewed_at?: Date;
  created_at: Date;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

export interface GetTranslationsRequest {
  lang: string;
  module: string;
}

export interface GetTranslationsResponse {
  [key: string]: string;
}

export interface UpdateTranslationRequest {
  lang_code: string;
  module: string;
  key: string;
  value: string;
  context?: Record<string, any>;
}

export interface BulkUpdateTranslationsRequest {
  translations: UpdateTranslationRequest[];
}

export interface CreateLanguageRequest {
  code: string;
  name: string;
  native_name: string;
  direction: LanguageDirection;
}

export interface UpdateCurrencyFormatRequest {
  code: string;
  symbol?: string;
  decimal_separator?: string;
  thousand_separator?: string;
  precision?: number;
  rounding_mode?: RoundingMode;
  active?: boolean;
}

export interface FormatCurrencyRequest {
  amount: number;
  currency: string;
  locale?: string;
}

export interface FormatCurrencyResponse {
  formatted: string;
  amount: number;
  currency: string;
  locale: string;
}

export interface GetRegionalSettingsRequest {
  country_code: string;
}

export interface UpdateRegionalSettingsRequest {
  country_code: string;
  default_language?: string;
  supported_languages?: string[];
  default_currency?: string;
  timezone?: string;
}

export interface AccessibilityAuditRequest {
  module: string;
  url?: string;
  html?: string;
}

export interface AccessibilityAuditResponse {
  passed: boolean;
  issues: AccessibilityIssue[];
  score: number;
  summary: {
    errors: number;
    warnings: number;
    notices: number;
  };
}

export interface AccessibilityIssue {
  type: string;
  severity: SeverityLevel;
  message: string;
  element?: string;
  wcag_criterion?: string;
  suggestion?: string;
}

export interface SiraReviewRequest {
  lang_code: string;
  module: string;
}

export interface SiraReviewResponse {
  suggestions: SiraTranslationSuggestion[];
  missing_translations: string[];
  quality_score: number;
}

// =============================================================================
// Service Options
// =============================================================================

export interface I18nServiceOptions {
  defaultLanguage?: string;
  fallbackLanguage?: string;
  cacheTTL?: number;
  enableLogging?: boolean;
}

export interface CurrencyServiceOptions {
  defaultCurrency?: string;
  enableConversion?: boolean;
  conversionAPI?: string;
}

// =============================================================================
// Cache Types
// =============================================================================

export interface CachedTranslations {
  [langModule: string]: {
    [key: string]: string;
  };
}

export interface CachedCurrencyFormats {
  [currencyCode: string]: CurrencyFormat;
}

export interface CachedRegionalSettings {
  [countryCode: string]: RegionalSettings;
}
