/**
 * BRIQUE 143bis — Adaptive UI Tests
 * Tests for SIRA adaptive UI system
 */

import {
  getAdaptiveProfile,
  updateAdaptiveProfile,
  detectAndAdaptContext,
} from '../server/services/sira/adaptiveProfile';
import {
  recordInteractionEvent,
  calculateInteractionMetrics,
  generateRecommendations,
} from '../server/services/sira/adaptiveAnalytics';
import { pool } from '../server/db';

describe('Adaptive Profile Service', () => {
  const testUserId = 'test-user-adaptive-123';

  afterAll(async () => {
    // Cleanup
    await pool.query(`DELETE FROM adaptive_profiles WHERE user_id = $1`, [testUserId]);
    await pool.query(`DELETE FROM ui_interaction_events WHERE user_id = $1`, [testUserId]);
    await pool.query(`DELETE FROM sira_ui_recommendations WHERE user_id = $1`, [testUserId]);
    await pool.end();
  });

  test('returns default profile when none exists', async () => {
    const profile = await getAdaptiveProfile('nonexistent-user');

    expect(profile.user_id).toBe('nonexistent-user');
    expect(profile.lang).toBe('en');
    expect(profile.high_contrast).toBe(false);
    expect(profile.font_scale).toBe(1.0);
    expect(profile.prefers_minimal_ui).toBe(false);
  });

  test('creates and retrieves adaptive profile', async () => {
    await updateAdaptiveProfile(testUserId, {
      lang: 'fr',
      high_contrast: true,
      font_scale: 1.2,
    });

    const profile = await getAdaptiveProfile(testUserId);

    expect(profile.user_id).toBe(testUserId);
    expect(profile.lang).toBe('fr');
    expect(profile.high_contrast).toBe(true);
    expect(profile.font_scale).toBe(1.2);
  });

  test('updates are merged into existing profile', async () => {
    await updateAdaptiveProfile(testUserId, { prefers_minimal_ui: true });

    const profile = await getAdaptiveProfile(testUserId);

    expect(profile.high_contrast).toBe(true); // from previous test
    expect(profile.prefers_minimal_ui).toBe(true); // new update
  });

  test('detects bright light context and adjusts', async () => {
    const updated = await detectAndAdaptContext(testUserId, {
      ambient_light: 'bright',
      screen_brightness: 85,
    });

    expect(updated).not.toBeNull();
    expect(updated?.detected_context).toBe('bright_light');
    expect(updated?.high_contrast).toBe(true);
    expect(updated?.font_scale).toBeGreaterThanOrEqual(1.2);
  });

  test('detects low bandwidth context and adjusts', async () => {
    const updated = await detectAndAdaptContext(testUserId, {
      connection_type: '2g',
    });

    expect(updated).not.toBeNull();
    expect(updated?.detected_context).toBe('low_bandwidth');
    expect(updated?.prefers_minimal_ui).toBe(true);
  });
});

describe('Adaptive Analytics Service', () => {
  const testUserId = 'test-user-analytics-456';
  const sessionId = 'test-session-789';

  beforeAll(async () => {
    // Create test profile
    await updateAdaptiveProfile(testUserId, {
      lang: 'en',
      font_scale: 1.0,
    });
  });

  afterAll(async () => {
    // Cleanup
    await pool.query(`DELETE FROM adaptive_profiles WHERE user_id = $1`, [testUserId]);
    await pool.query(`DELETE FROM ui_interaction_events WHERE user_id = $1`, [testUserId]);
    await pool.query(`DELETE FROM sira_ui_recommendations WHERE user_id = $1`, [testUserId]);
  });

  test('records interaction event', async () => {
    await recordInteractionEvent({
      user_id: testUserId,
      session_id: sessionId,
      event_type: 'click',
      component: 'PayButton',
      module: 'pay',
      page_url: '/checkout',
      target_element: 'BUTTON',
      interaction_duration: 250,
    });

    const { rows } = await pool.query(
      `SELECT * FROM ui_interaction_events WHERE user_id = $1 AND session_id = $2`,
      [testUserId, sessionId]
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].event_type).toBe('click');
    expect(rows[0].component).toBe('PayButton');
  });

  test('calculates interaction metrics', async () => {
    // Record multiple events
    await recordInteractionEvent({
      user_id: testUserId,
      session_id: sessionId,
      event_type: 'click',
      component: 'Button1',
      module: 'pay',
    });

    await recordInteractionEvent({
      user_id: testUserId,
      session_id: sessionId,
      event_type: 'missed_click',
      component: 'Button2',
      module: 'pay',
    });

    await recordInteractionEvent({
      user_id: testUserId,
      session_id: sessionId,
      event_type: 'form_abandon',
      component: 'CheckoutForm',
      module: 'pay',
    });

    const metrics = await calculateInteractionMetrics(testUserId, 'day');

    expect(metrics.user_id).toBe(testUserId);
    expect(metrics.total_interactions).toBeGreaterThan(0);
    expect(metrics.missed_clicks).toBeGreaterThanOrEqual(1);
    expect(metrics.form_abandons).toBeGreaterThanOrEqual(1);
  });

  test('generates recommendations based on high missed click rate', async () => {
    // Record many missed clicks
    for (let i = 0; i < 10; i++) {
      await recordInteractionEvent({
        user_id: testUserId,
        session_id: sessionId,
        event_type: 'missed_click',
        component: `Button${i}`,
        module: 'pay',
      });
    }

    await generateRecommendations(testUserId);

    const { rows } = await pool.query(
      `SELECT * FROM sira_ui_recommendations WHERE user_id = $1 AND status = 'pending'`,
      [testUserId]
    );

    expect(rows.length).toBeGreaterThan(0);

    const largeButtonsRec = rows.find((r: any) => r.recommendation_type === 'enable_large_buttons');
    expect(largeButtonsRec).toBeDefined();
    expect(largeButtonsRec.confidence).toBeGreaterThan(0.5);
  });

  test('generates recommendations for high form abandon rate', async () => {
    // Record form abandons
    for (let i = 0; i < 5; i++) {
      await recordInteractionEvent({
        user_id: testUserId,
        session_id: sessionId,
        event_type: 'form_abandon',
        component: 'Form',
        module: 'pay',
      });
    }

    // Record a few completions to get a ratio
    for (let i = 0; i < 2; i++) {
      await recordInteractionEvent({
        user_id: testUserId,
        session_id: sessionId,
        event_type: 'form_submit',
        component: 'Form',
        module: 'pay',
      });
    }

    await generateRecommendations(testUserId);

    const { rows } = await pool.query(
      `SELECT * FROM sira_ui_recommendations WHERE user_id = $1 AND recommendation_type IN ('simplify_forms', 'enable_auto_complete')`,
      [testUserId]
    );

    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('Cross-Module Adaptive UI', () => {
  const testUserId = 'test-user-cross-module';

  afterAll(async () => {
    await pool.query(`DELETE FROM adaptive_profiles WHERE user_id = $1`, [testUserId]);
  });

  test('profile changes persist across modules', async () => {
    // Simulate Molam Shop setting high contrast
    await updateAdaptiveProfile(testUserId, {
      high_contrast: true,
      font_scale: 1.3,
    });

    // Simulate Molam Pay fetching profile
    const profile = await getAdaptiveProfile(testUserId);

    expect(profile.high_contrast).toBe(true);
    expect(profile.font_scale).toBe(1.3);

    // Verify it's the same user_id
    expect(profile.user_id).toBe(testUserId);
  });
});
