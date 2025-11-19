/**
 * BRIQUE 143bis — SIRA Adaptive Profile Service
 * AI-driven automatic UI adaptation based on user behavior
 */

import { pool } from '../../db';

export interface AdaptiveProfile {
  user_id: string;
  lang: string;
  high_contrast: boolean;
  font_scale: number;
  prefers_minimal_ui: boolean;
  prefers_auto_complete: boolean;
  prefers_large_buttons: boolean;
  prefers_simplified_forms: boolean;
  detected_context?: 'low_bandwidth' | 'bright_light' | 'standard' | 'dark_environment';
  avg_interaction_time?: number;
  missed_click_rate?: number;
  form_abandon_rate?: number;
  typing_speed?: number;
  primary_device?: string;
  screen_size?: string;
  connection_type?: string;
  sira_confidence?: number;
  last_adapted_at?: Date;
}

/**
 * Get adaptive profile for user
 */
export async function getAdaptiveProfile(userId: string): Promise<AdaptiveProfile> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM adaptive_profiles WHERE user_id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      // Return default profile
      return {
        user_id: userId,
        lang: 'en',
        high_contrast: false,
        font_scale: 1.0,
        prefers_minimal_ui: false,
        prefers_auto_complete: false,
        prefers_large_buttons: false,
        prefers_simplified_forms: false,
        detected_context: 'standard',
      };
    }

    return rows[0];
  } catch (error) {
    console.error('[AdaptiveProfile] Error getting profile:', error);
    throw error;
  }
}

/**
 * Update adaptive profile
 */
export async function updateAdaptiveProfile(
  userId: string,
  updates: Partial<AdaptiveProfile>
): Promise<AdaptiveProfile> {
  try {
    const fields = [];
    const values = [];
    let paramCounter = 1;

    // Build dynamic UPDATE query
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramCounter}`);
        values.push(value);
        paramCounter++;
      }
    }

    fields.push(`updated_at = now()`);

    const { rows } = await pool.query(
      `INSERT INTO adaptive_profiles (user_id, ${Object.keys(updates).join(', ')})
       VALUES ($${paramCounter}, ${Object.values(updates).map((_, i) => `$${i + paramCounter + 1}`).join(', ')})
       ON CONFLICT (user_id) DO UPDATE
       SET ${fields.join(', ')}
       RETURNING *`,
      [userId, ...values, ...Object.values(updates)]
    );

    // Log adaptation
    await logAdaptation(userId, updates, 'manual');

    return rows[0];
  } catch (error) {
    console.error('[AdaptiveProfile] Error updating profile:', error);
    throw error;
  }
}

/**
 * Apply SIRA recommendation
 */
export async function applySiraRecommendation(
  userId: string,
  recommendationId: string
): Promise<AdaptiveProfile> {
  try {
    // Get recommendation
    const { rows: [recommendation] } = await pool.query(
      `SELECT * FROM sira_ui_recommendations WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
      [recommendationId, userId]
    );

    if (!recommendation) {
      throw new Error('Recommendation not found or already applied');
    }

    // Parse recommendation into profile updates
    const updates = parseRecommendation(recommendation.recommendation_type);

    // Update profile
    const updated = await pool.query(
      `INSERT INTO adaptive_profiles (user_id, ${Object.keys(updates).join(', ')})
       VALUES ($1, ${Object.keys(updates).map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (user_id) DO UPDATE
       SET ${Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ')},
           last_adapted_at = now(),
           updated_at = now()
       RETURNING *`,
      [userId, ...Object.values(updates)]
    );

    // Mark recommendation as applied
    await pool.query(
      `UPDATE sira_ui_recommendations SET status = 'applied', applied_at = now() WHERE id = $1`,
      [recommendationId]
    );

    // Log adaptation
    await logAdaptation(userId, updates, 'sira_auto', recommendationId);

    return updated.rows[0];
  } catch (error) {
    console.error('[AdaptiveProfile] Error applying recommendation:', error);
    throw error;
  }
}

/**
 * Detect context and auto-adjust profile
 */
export async function detectAndAdaptContext(
  userId: string,
  contextData: {
    connection_type?: string;
    ambient_light?: string;
    battery_level?: number;
    screen_brightness?: number;
    time_of_day?: string;
  }
): Promise<AdaptiveProfile | null> {
  try {
    // Get applicable context detection rules
    const { rows: rules } = await pool.query(
      `SELECT * FROM context_detection_rules WHERE active = true ORDER BY priority DESC`
    );

    // Find matching context
    let matchedContext: any = null;
    for (const rule of rules) {
      if (matchesContext(contextData, rule.detection_criteria)) {
        matchedContext = rule;
        break;
      }
    }

    if (!matchedContext) {
      return null;
    }

    // Apply UI adjustments from matched context
    const adjustments = matchedContext.ui_adjustments;
    const updates: any = {
      detected_context: matchedContext.context_name,
      last_context_update: new Date(),
    };

    // Map adjustments to profile fields
    if (adjustments.high_contrast !== undefined) {
      updates.high_contrast = adjustments.high_contrast;
    }
    if (adjustments.font_scale !== undefined) {
      updates.font_scale = adjustments.font_scale;
    }
    if (adjustments.prefers_minimal_ui !== undefined) {
      updates.prefers_minimal_ui = adjustments.prefers_minimal_ui;
    }

    // Update profile
    const { rows } = await pool.query(
      `INSERT INTO adaptive_profiles (user_id, ${Object.keys(updates).join(', ')})
       VALUES ($1, ${Object.keys(updates).map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (user_id) DO UPDATE
       SET ${Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ')},
           updated_at = now()
       RETURNING *`,
      [userId, ...Object.values(updates)]
    );

    // Log adaptation
    await logAdaptation(userId, updates, 'context_detection');

    return rows[0];
  } catch (error) {
    console.error('[AdaptiveProfile] Error detecting context:', error);
    return null;
  }
}

/**
 * Parse recommendation type into profile updates
 */
function parseRecommendation(type: string): Partial<AdaptiveProfile> {
  const updates: any = {};

  switch (type) {
    case 'increase_font_size':
      updates.font_scale = 1.2;
      break;
    case 'enable_high_contrast':
      updates.high_contrast = true;
      break;
    case 'enable_minimal_ui':
      updates.prefers_minimal_ui = true;
      break;
    case 'enable_large_buttons':
      updates.prefers_large_buttons = true;
      break;
    case 'enable_auto_complete':
      updates.prefers_auto_complete = true;
      break;
    case 'simplify_forms':
      updates.prefers_simplified_forms = true;
      break;
  }

  return updates;
}

/**
 * Check if context data matches detection criteria
 */
function matchesContext(contextData: any, criteria: any): boolean {
  // Simple matching logic - can be enhanced
  if (criteria.connection_type && contextData.connection_type) {
    if (Array.isArray(criteria.connection_type)) {
      if (!criteria.connection_type.includes(contextData.connection_type)) {
        return false;
      }
    }
  }

  if (criteria.ambient_light && contextData.ambient_light !== criteria.ambient_light) {
    return false;
  }

  if (criteria.screen_brightness?.min && contextData.screen_brightness < criteria.screen_brightness.min) {
    return false;
  }

  return true;
}

/**
 * Log UI adaptation to history
 */
async function logAdaptation(
  userId: string,
  updates: any,
  trigger: string,
  triggeredBy?: string
): Promise<void> {
  try {
    for (const [key, value] of Object.entries(updates)) {
      await pool.query(
        `INSERT INTO ui_adaptation_history(user_id, adaptation_type, new_value, trigger, triggered_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, key, String(value), trigger, triggeredBy || null]
      );
    }
  } catch (error) {
    console.error('[AdaptiveProfile] Error logging adaptation:', error);
  }
}

/**
 * Get adaptation history for user
 */
export async function getAdaptationHistory(userId: string, limit: number = 50) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ui_adaptation_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );

    return rows;
  } catch (error) {
    console.error('[AdaptiveProfile] Error getting adaptation history:', error);
    return [];
  }
}
