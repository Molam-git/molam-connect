/**
 * BRIQUE 143bis — SIRA Adaptive Analytics
 * Analyze user interactions and generate UI recommendations
 */

import { pool } from '../../db';

export interface InteractionMetrics {
  user_id: string;
  total_interactions: number;
  missed_clicks: number;
  form_abandons: number;
  form_completions: number;
  avg_interaction_time: number;
  avg_typing_speed: number;
  missed_click_rate: number;
  form_abandon_rate: number;
}

/**
 * Record UI interaction event
 */
export async function recordInteractionEvent(event: {
  user_id: string;
  session_id: string;
  event_type: string;
  component?: string;
  module?: string;
  page_url?: string;
  target_element?: string;
  intended_element?: string;
  interaction_duration?: number;
  typing_chars?: number;
  scroll_depth?: number;
  device_type?: string;
  screen_width?: number;
  screen_height?: number;
  connection_speed?: string;
  battery_level?: number;
  ambient_light?: string;
  metadata?: any;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ui_interaction_events(
        user_id, session_id, event_type, component, module, page_url,
        target_element, intended_element, interaction_duration, typing_chars,
        scroll_depth, device_type, screen_width, screen_height,
        connection_speed, battery_level, ambient_light, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        event.user_id,
        event.session_id,
        event.event_type,
        event.component || null,
        event.module || null,
        event.page_url || null,
        event.target_element || null,
        event.intended_element || null,
        event.interaction_duration || null,
        event.typing_chars || null,
        event.scroll_depth || null,
        event.device_type || null,
        event.screen_width || null,
        event.screen_height || null,
        event.connection_speed || null,
        event.battery_level || null,
        event.ambient_light || null,
        event.metadata || {},
      ]
    );
  } catch (error) {
    console.error('[AdaptiveAnalytics] Error recording event:', error);
  }
}

/**
 * Calculate interaction metrics for user
 */
export async function calculateInteractionMetrics(
  userId: string,
  timeframe: 'day' | 'week' | 'month' = 'week'
): Promise<InteractionMetrics> {
  try {
    const interval = timeframe === 'day' ? '1 day' : timeframe === 'week' ? '7 days' : '30 days';

    const { rows } = await pool.query(
      `SELECT
        user_id,
        COUNT(*) as total_interactions,
        SUM(CASE WHEN event_type = 'missed_click' THEN 1 ELSE 0 END) as missed_clicks,
        SUM(CASE WHEN event_type = 'form_abandon' THEN 1 ELSE 0 END) as form_abandons,
        SUM(CASE WHEN event_type = 'form_submit' THEN 1 ELSE 0 END) as form_completions,
        AVG(interaction_duration) FILTER (WHERE interaction_duration IS NOT NULL) as avg_interaction_time,
        AVG(typing_chars * 60000.0 / NULLIF(interaction_duration, 0)) FILTER (WHERE event_type = 'typing_end') as avg_typing_speed
      FROM ui_interaction_events
      WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
      GROUP BY user_id`,
      [userId]
    );

    if (rows.length === 0) {
      return {
        user_id: userId,
        total_interactions: 0,
        missed_clicks: 0,
        form_abandons: 0,
        form_completions: 0,
        avg_interaction_time: 0,
        avg_typing_speed: 0,
        missed_click_rate: 0,
        form_abandon_rate: 0,
      };
    }

    const metrics = rows[0];
    const totalClicks = metrics.total_interactions - metrics.missed_clicks;

    return {
      user_id: userId,
      total_interactions: parseInt(metrics.total_interactions),
      missed_clicks: parseInt(metrics.missed_clicks),
      form_abandons: parseInt(metrics.form_abandons),
      form_completions: parseInt(metrics.form_completions),
      avg_interaction_time: parseFloat(metrics.avg_interaction_time) || 0,
      avg_typing_speed: parseFloat(metrics.avg_typing_speed) || 0,
      missed_click_rate: totalClicks > 0 ? metrics.missed_clicks / totalClicks : 0,
      form_abandon_rate:
        metrics.form_abandons + metrics.form_completions > 0
          ? metrics.form_abandons / (metrics.form_abandons + metrics.form_completions)
          : 0,
    };
  } catch (error) {
    console.error('[AdaptiveAnalytics] Error calculating metrics:', error);
    throw error;
  }
}

/**
 * Generate SIRA recommendations based on metrics
 */
export async function generateRecommendations(userId: string): Promise<void> {
  try {
    const metrics = await calculateInteractionMetrics(userId, 'week');

    const recommendations: Array<{
      type: string;
      reason: string;
      confidence: number;
      supporting_data: any;
    }> = [];

    // High missed click rate → larger buttons
    if (metrics.missed_click_rate > 0.15) {
      recommendations.push({
        type: 'enable_large_buttons',
        reason: 'High missed click rate detected',
        confidence: Math.min(0.95, metrics.missed_click_rate * 2),
        supporting_data: {
          missed_click_rate: metrics.missed_click_rate,
          missed_clicks: metrics.missed_clicks,
          total_interactions: metrics.total_interactions,
        },
      });
    }

    // High form abandon rate → simplify forms or enable autocomplete
    if (metrics.form_abandon_rate > 0.3) {
      recommendations.push({
        type: 'simplify_forms',
        reason: 'High form abandon rate detected',
        confidence: Math.min(0.9, metrics.form_abandon_rate * 1.5),
        supporting_data: {
          form_abandon_rate: metrics.form_abandon_rate,
          form_abandons: metrics.form_abandons,
          form_completions: metrics.form_completions,
        },
      });

      if (metrics.avg_typing_speed < 100) {
        // slow typing → autocomplete
        recommendations.push({
          type: 'enable_auto_complete',
          reason: 'Slow typing speed with high form abandon rate',
          confidence: 0.8,
          supporting_data: {
            avg_typing_speed: metrics.avg_typing_speed,
            form_abandon_rate: metrics.form_abandon_rate,
          },
        });
      }
    }

    // Slow interaction time → minimal UI
    if (metrics.avg_interaction_time > 5000) {
      // > 5 seconds
      recommendations.push({
        type: 'enable_minimal_ui',
        reason: 'Slow average interaction time',
        confidence: 0.75,
        supporting_data: {
          avg_interaction_time: metrics.avg_interaction_time,
        },
      });
    }

    // Save recommendations to database
    for (const rec of recommendations) {
      await pool.query(
        `INSERT INTO sira_ui_recommendations(user_id, recommendation_type, reason, confidence, supporting_data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [userId, rec.type, rec.reason, rec.confidence, rec.supporting_data]
      );
    }

    console.log(`[AdaptiveAnalytics] Generated ${recommendations.length} recommendations for user ${userId}`);
  } catch (error) {
    console.error('[AdaptiveAnalytics] Error generating recommendations:', error);
  }
}

/**
 * Get pending recommendations for user
 */
export async function getPendingRecommendations(userId: string) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM sira_ui_recommendations
       WHERE user_id = $1 AND status = 'pending' AND expires_at > NOW()
       ORDER BY confidence DESC, created_at DESC`,
      [userId]
    );

    return rows;
  } catch (error) {
    console.error('[AdaptiveAnalytics] Error getting recommendations:', error);
    return [];
  }
}

/**
 * Dismiss recommendation
 */
export async function dismissRecommendation(recommendationId: string, userId: string) {
  try {
    await pool.query(
      `UPDATE sira_ui_recommendations
       SET status = 'dismissed', dismissed_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [recommendationId, userId]
    );
  } catch (error) {
    console.error('[AdaptiveAnalytics] Error dismissing recommendation:', error);
  }
}

/**
 * Update adaptive profile with latest metrics
 */
export async function updateProfileMetrics(userId: string): Promise<void> {
  try {
    const metrics = await calculateInteractionMetrics(userId, 'week');

    await pool.query(
      `UPDATE adaptive_profiles
       SET avg_interaction_time = $2,
           missed_click_rate = $3,
           form_abandon_rate = $4,
           typing_speed = $5,
           updated_at = NOW()
       WHERE user_id = $1`,
      [
        userId,
        metrics.avg_interaction_time,
        metrics.missed_click_rate,
        metrics.form_abandon_rate,
        metrics.avg_typing_speed,
      ]
    );
  } catch (error) {
    console.error('[AdaptiveAnalytics] Error updating profile metrics:', error);
  }
}
