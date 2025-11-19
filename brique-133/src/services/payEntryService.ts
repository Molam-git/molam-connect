// ============================================================================
// Pay Entry Service - User preferences and module management
// ============================================================================

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface PayEntryPreferences {
  user_id: string;
  preferred_module?: string;
  last_module_used?: string;
  modules_enabled: string[];
  auto_redirect: boolean;
  redirect_target?: string;
  device_type?: string;
  locale: string;
}

export interface ModuleUsageEvent {
  user_id: string;
  module: string;
  session_duration?: number;
  device_type?: string;
  platform?: string;
  metadata?: any;
}

/**
 * Get or create user pay entry preferences
 */
export async function getUserPayEntry(userId: string): Promise<PayEntryPreferences> {
  // Try to get existing preferences
  let { rows: [prefs] } = await pool.query(
    `SELECT * FROM user_pay_entry_preferences WHERE user_id = $1`,
    [userId]
  );

  // Create default preferences if not exist
  if (!prefs) {
    const { rows } = await pool.query(
      `INSERT INTO user_pay_entry_preferences(user_id, modules_enabled)
       VALUES ($1, '["wallet"]'::jsonb)
       RETURNING *`,
      [userId]
    );
    prefs = rows[0];
  }

  return {
    user_id: prefs.user_id,
    preferred_module: prefs.preferred_module,
    last_module_used: prefs.last_module_used,
    modules_enabled: prefs.modules_enabled || ["wallet"],
    auto_redirect: prefs.auto_redirect || false,
    redirect_target: prefs.redirect_target,
    device_type: prefs.device_type,
    locale: prefs.locale || "fr",
  };
}

/**
 * Update user preferences
 */
export async function updatePayEntry(
  userId: string,
  updates: Partial<PayEntryPreferences>
) {
  const fields: string[] = [];
  const values: any[] = [userId];
  let paramIndex = 2;

  if (updates.preferred_module !== undefined) {
    fields.push(`preferred_module = $${paramIndex++}`);
    values.push(updates.preferred_module);
  }
  if (updates.last_module_used !== undefined) {
    fields.push(`last_module_used = $${paramIndex++}`);
    values.push(updates.last_module_used);
  }
  if (updates.modules_enabled !== undefined) {
    fields.push(`modules_enabled = $${paramIndex++}::jsonb`);
    values.push(JSON.stringify(updates.modules_enabled));
  }
  if (updates.auto_redirect !== undefined) {
    fields.push(`auto_redirect = $${paramIndex++}`);
    values.push(updates.auto_redirect);
  }
  if (updates.redirect_target !== undefined) {
    fields.push(`redirect_target = $${paramIndex++}`);
    values.push(updates.redirect_target);
  }
  if (updates.device_type !== undefined) {
    fields.push(`device_type = $${paramIndex++}`);
    values.push(updates.device_type);
  }
  if (updates.locale !== undefined) {
    fields.push(`locale = $${paramIndex++}`);
    values.push(updates.locale);
  }

  fields.push(`updated_at = now()`);

  const { rows } = await pool.query(
    `UPDATE user_pay_entry_preferences
     SET ${fields.join(", ")}
     WHERE user_id = $1
     RETURNING *`,
    values
  );

  return rows[0];
}

/**
 * Track module usage for SIRA learning
 */
export async function trackModuleUsage(event: ModuleUsageEvent) {
  await pool.query(
    `INSERT INTO pay_module_usage(user_id, module, session_duration, device_type, platform, metadata)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      event.user_id,
      event.module,
      event.session_duration || null,
      event.device_type || null,
      event.platform || null,
      event.metadata ? JSON.stringify(event.metadata) : null,
    ]
  );

  // Update last_module_used
  await pool.query(
    `UPDATE user_pay_entry_preferences
     SET last_module_used = $2, updated_at = now()
     WHERE user_id = $1`,
    [event.user_id, event.module]
  );
}

/**
 * Enable a module for user
 */
export async function enableModule(userId: string, module: string) {
  const prefs = await getUserPayEntry(userId);

  if (!prefs.modules_enabled.includes(module)) {
    const updatedModules = [...prefs.modules_enabled, module];

    await pool.query(
      `UPDATE user_pay_entry_preferences
       SET modules_enabled = $2::jsonb, updated_at = now()
       WHERE user_id = $1`,
      [userId, JSON.stringify(updatedModules)]
    );

    return { enabled: true, modules: updatedModules };
  }

  return { enabled: false, modules: prefs.modules_enabled };
}

/**
 * Request module activation (for gated modules)
 */
export async function requestModuleActivation(
  userId: string,
  module: string,
  reason?: string
) {
  const { rows } = await pool.query(
    `INSERT INTO module_activation_requests(user_id, module, reason)
     VALUES ($1,$2,$3)
     RETURNING *`,
    [userId, module, reason || null]
  );

  return rows[0];
}

/**
 * Get module usage statistics for user (SIRA input)
 */
export async function getUserModuleStats(
  userId: string,
  days: number = 30
): Promise<any> {
  const { rows } = await pool.query(
    `SELECT
       module,
       COUNT(*) as usage_count,
       AVG(session_duration) as avg_duration,
       MAX(accessed_at) as last_accessed
     FROM pay_module_usage
     WHERE user_id = $1
       AND accessed_at > now() - interval '${days} days'
     GROUP BY module
     ORDER BY usage_count DESC`,
    [userId]
  );

  return rows;
}

/**
 * Compute SIRA recommendation (simplified)
 */
export async function computeRecommendation(userId: string): Promise<{
  auto_redirect: boolean;
  redirect_target?: string;
  recommended_modules: string[];
}> {
  const stats = await getUserModuleStats(userId, 30);

  if (stats.length === 0) {
    // New user - no recommendation yet
    return {
      auto_redirect: false,
      recommended_modules: ["wallet"],
    };
  }

  // If user uses only one module >80% of time, enable auto-redirect
  const totalUsage = stats.reduce((sum: number, s: any) => sum + parseInt(s.usage_count), 0);
  const topModule = stats[0];
  const topModulePercent = parseInt(topModule.usage_count) / totalUsage;

  if (topModulePercent > 0.8 && stats.length === 1) {
    return {
      auto_redirect: true,
      redirect_target: topModule.module,
      recommended_modules: [topModule.module],
    };
  }

  // Otherwise, recommend top 2 modules
  return {
    auto_redirect: false,
    recommended_modules: stats.slice(0, 2).map((s: any) => s.module),
  };
}

/**
 * Apply SIRA recommendation to user preferences
 */
export async function applySiraRecommendation(userId: string) {
  const recommendation = await computeRecommendation(userId);

  await updatePayEntry(userId, {
    auto_redirect: recommendation.auto_redirect,
    redirect_target: recommendation.redirect_target,
  });

  // Log recommendation
  if (recommendation.auto_redirect && recommendation.redirect_target) {
    await pool.query(
      `INSERT INTO sira_module_recommendations(user_id, recommended_module, confidence_score, reason)
       VALUES ($1,$2,$3,$4)`,
      [
        userId,
        recommendation.redirect_target,
        0.85,
        "auto_redirect_enabled_based_on_usage",
      ]
    );
  }

  return recommendation;
}
