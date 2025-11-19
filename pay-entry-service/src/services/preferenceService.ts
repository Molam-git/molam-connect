// ============================================================================
// Preference Service - User module preferences management
// ============================================================================

import { pool } from "../db";
import { logger } from "../logger";

export interface UserPreferences {
  user_id: string;
  preferred_module: string | null;
  last_module_used: string | null;
  modules_enabled: string[];
  auto_redirect: boolean;
  country?: string | null;
  currency?: string | null;
  lang: string;
}

export interface UpsertPreferencesPayload {
  preferred_module?: string | null;
  last_module_used?: string | null;
  modules_enabled?: string[];
  auto_redirect?: boolean;
  country?: string;
  currency?: string;
  lang?: string;
  updated_by?: string;
}

/**
 * Get user preferences
 */
export async function getPreferences(
  userId: string
): Promise<UserPreferences | null> {
  try {
    const { rows } = await pool.query(
      `SELECT user_id, preferred_module, last_module_used,
              modules_enabled, auto_redirect, country, currency, lang
       FROM user_pay_entry_preferences
       WHERE user_id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0];
  } catch (error: any) {
    logger.error("Failed to get user preferences", {
      user_id: userId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Upsert user preferences (create or update)
 */
export async function upsertPreferences(
  userId: string,
  payload: UpsertPreferencesPayload
): Promise<UserPreferences> {
  const {
    preferred_module,
    last_module_used,
    modules_enabled,
    auto_redirect,
    country,
    currency,
    lang,
    updated_by,
  } = payload;

  try {
    // Get old values for audit log
    const oldPrefs = await getPreferences(userId);

    const { rows } = await pool.query(
      `INSERT INTO user_pay_entry_preferences(
        user_id, preferred_module, last_module_used, modules_enabled,
        auto_redirect, country, currency, lang, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (user_id) DO UPDATE SET
        preferred_module = COALESCE(EXCLUDED.preferred_module, user_pay_entry_preferences.preferred_module),
        last_module_used = COALESCE(EXCLUDED.last_module_used, user_pay_entry_preferences.last_module_used),
        modules_enabled = EXCLUDED.modules_enabled,
        auto_redirect = EXCLUDED.auto_redirect,
        country = COALESCE(EXCLUDED.country, user_pay_entry_preferences.country),
        currency = COALESCE(EXCLUDED.currency, user_pay_entry_preferences.currency),
        lang = COALESCE(EXCLUDED.lang, user_pay_entry_preferences.lang),
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      RETURNING *`,
      [
        userId,
        preferred_module,
        last_module_used,
        JSON.stringify(modules_enabled || ["wallet"]),
        auto_redirect !== undefined ? auto_redirect : false,
        country,
        currency,
        lang || "fr",
        updated_by || userId,
      ]
    );

    const newPrefs = rows[0];

    // Audit log
    await logPreferenceChange(userId, oldPrefs, newPrefs, updated_by || userId);

    logger.info("User preferences updated", {
      user_id: userId,
      updated_by: updated_by || userId,
    });

    return newPrefs;
  } catch (error: any) {
    logger.error("Failed to upsert user preferences", {
      user_id: userId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Log preference changes to audit table
 */
async function logPreferenceChange(
  userId: string,
  oldValues: UserPreferences | null,
  newValues: UserPreferences,
  changedBy: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO pay_entry_audit_log(user_id, action, old_values, new_values, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        oldValues ? "update" : "create",
        oldValues ? JSON.stringify(oldValues) : null,
        JSON.stringify(newValues),
        changedBy,
      ]
    );
  } catch (error: any) {
    // Non-blocking - log but don't fail
    logger.warn("Failed to write audit log", {
      user_id: userId,
      error: error.message,
    });
  }
}

/**
 * Get default preferences for new user
 */
export function getDefaultPreferences(
  userId: string,
  userMeta?: { country?: string; currency?: string; lang?: string }
): UserPreferences {
  return {
    user_id: userId,
    preferred_module: "wallet",
    last_module_used: null,
    modules_enabled: ["wallet"],
    auto_redirect: false,
    country: userMeta?.country || null,
    currency: userMeta?.currency || null,
    lang: userMeta?.lang || "fr",
  };
}
