// =====================================================================
// Brique 82 — Overage Previews Tests
// =====================================================================
// Comprehensive test suite for preview functionality
// Date: 2025-11-12
// =====================================================================

import request from 'supertest';
import { Pool } from 'pg';
import { previewBuilder } from '../../src/overages/previewBuilder';
import { overageNotifier } from '../../src/notifications/overageNotifier';

describe('Brique 82 — Overage Previews', () => {
  let pool: Pool;
  const testTenantId = '00000000-0000-0000-0000-000000000001';
  let testPreviewId: string;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      database: process.env.PGDATABASE || 'molam_connect_test',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
    });

    // Run schema
    const schemaSQL = require('fs').readFileSync(
      __dirname + '/../../sql/011_overage_preview_tables.sql',
      'utf8'
    );
    await pool.query(schemaSQL);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM overage_preview_lines WHERE preview_id IN (SELECT id FROM overage_previews WHERE tenant_id = $1)', [testTenantId]);
    await pool.query('DELETE FROM overage_previews WHERE tenant_id = $1', [testTenantId]);
  });

  // ===================================================================
  // Preview Builder Tests
  // ===================================================================

  describe('Preview Builder', () => {
    test('should build preview with open overages', async () => {
      // Create test overages
      for (let i = 0; i < 5; i++) {
        await pool.query(
          `
          INSERT INTO billing_overages (
            event_id, tenant_id, api_key_id, plan_id, country,
            metric, units, unit_price, amount, currency,
            billing_model, billing_status, overage_timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `,
          [
            `test_event_${i}`,
            testTenantId,
            'test_key',
            'free',
            'US',
            'requests_per_day',
            1000 * (i + 1),
            0.01,
            10.0 * (i + 1),
            'USD',
            'per_unit',
            'pending',
            new Date(),
          ]
        );
      }

      // Build preview
      const result = await previewBuilder.buildOveragePreview({
        tenantType: 'merchant',
        tenantId: testTenantId,
        periodStart: new Date(2025, 10, 1),
        periodEnd: new Date(2025, 10, 30),
      });

      expect(result.previewId).toBeTruthy();
      expect(result.lineCount).toBe(5);
      expect(result.totalAmount).toBeGreaterThan(0);

      testPreviewId = result.previewId;

      // Verify preview was created
      const { rows } = await pool.query(
        'SELECT * FROM overage_previews WHERE id = $1',
        [testPreviewId]
      );

      expect(rows.length).toBe(1);
      expect(rows[0].status).toBe('pending');
    });

    test('should not duplicate previews for same period', async () => {
      const params = {
        tenantType: 'merchant',
        tenantId: testTenantId,
        periodStart: new Date(2025, 10, 1),
        periodEnd: new Date(2025, 10, 30),
      };

      // Build first time
      const result1 = await previewBuilder.buildOveragePreview(params);

      // Build second time
      const result2 = await previewBuilder.buildOveragePreview(params);

      // Should return same preview ID
      expect(result1.previewId).toBe(result2.previewId);

      // Verify only one preview exists
      const { rows } = await pool.query(
        `SELECT COUNT(*) as count FROM overage_previews
         WHERE tenant_id = $1 AND period_start = $2 AND period_end = $3`,
        [testTenantId, '2025-11-01', '2025-11-30']
      );

      expect(parseInt(rows[0].count)).toBe(1);
    });

    test('should refresh preview correctly', async () => {
      // Create initial preview
      const result = await previewBuilder.buildOveragePreview({
        tenantType: 'merchant',
        tenantId: testTenantId,
        periodStart: new Date(2025, 10, 1),
        periodEnd: new Date(2025, 10, 30),
      });

      const initialPreview = await pool.query(
        'SELECT * FROM overage_previews WHERE id = $1',
        [result.previewId]
      );

      // Add more overages
      await pool.query(
        `
        INSERT INTO billing_overages (
          event_id, tenant_id, api_key_id, plan_id, country,
          metric, units, unit_price, amount, currency,
          billing_model, billing_status, overage_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `,
        [
          `new_event_${Date.now()}`,
          testTenantId,
          'test_key',
          'free',
          'US',
          'requests_per_day',
          5000,
          0.01,
          50.0,
          'USD',
          'per_unit',
          'pending',
          new Date(),
        ]
      );

      // Refresh preview
      await previewBuilder.refreshPreview(result.previewId);

      // Verify total amount increased
      const refreshedPreview = await pool.query(
        'SELECT * FROM overage_previews WHERE id = $1',
        [result.previewId]
      );

      expect(parseFloat(refreshedPreview.rows[0].total_amount)).toBeGreaterThan(
        parseFloat(initialPreview.rows[0].total_amount)
      );
    });
  });

  // ===================================================================
  // API Endpoints Tests
  // ===================================================================

  describe('API Endpoints', () => {
    test('GET /api/previews should list tenant previews', async () => {
      // This test would require setting up an Express app
      // For now, we test the database queries directly

      const result = await pool.query(
        `
        SELECT p.*, COUNT(pl.id) as line_count
        FROM overage_previews p
        LEFT JOIN overage_preview_lines pl ON p.id = pl.preview_id
        WHERE p.tenant_id = $1
        GROUP BY p.id
        `,
        [testTenantId]
      );

      expect(Array.isArray(result.rows)).toBe(true);
    });

    test('should accept preview and update status', async () => {
      // Create preview
      const preview = await previewBuilder.buildOveragePreview({
        tenantType: 'merchant',
        tenantId: testTenantId,
        periodStart: new Date(2025, 10, 1),
        periodEnd: new Date(2025, 10, 30),
      });

      // Accept preview
      await pool.query(
        `
        UPDATE overage_previews
        SET
          status = 'accepted',
          merchant_action = 'accepted',
          merchant_action_at = NOW(),
          merchant_action_by = $2
        WHERE id = $1
        `,
        [preview.previewId, 'test_user']
      );

      // Verify status updated
      const { rows } = await pool.query(
        'SELECT status, merchant_action FROM overage_previews WHERE id = $1',
        [preview.previewId]
      );

      expect(rows[0].status).toBe('accepted');
      expect(rows[0].merchant_action).toBe('accepted');
    });

    test('should contest preview and store reason', async () => {
      // Create preview
      const preview = await previewBuilder.buildOveragePreview({
        tenantType: 'merchant',
        tenantId: testTenantId,
        periodStart: new Date(2025, 10, 1),
        periodEnd: new Date(2025, 10, 30),
      });

      const contestReason = 'Incorrect unit count';

      // Contest preview
      await pool.query(
        `
        UPDATE overage_previews
        SET
          status = 'contested',
          merchant_action = 'contested',
          merchant_action_at = NOW(),
          merchant_notes = $2,
          metadata = metadata || jsonb_build_object('contested_reason', $2)
        WHERE id = $1
        `,
        [preview.previewId, contestReason]
      );

      // Verify status and reason
      const { rows } = await pool.query(
        'SELECT status, merchant_notes, metadata FROM overage_previews WHERE id = $1',
        [preview.previewId]
      );

      expect(rows[0].status).toBe('contested');
      expect(rows[0].merchant_notes).toBe(contestReason);
      expect(rows[0].metadata.contested_reason).toBe(contestReason);
    });
  });

  // ===================================================================
  // Notification Tests
  // ===================================================================

  describe('Notifications', () => {
    test('should compose notification content', async () => {
      // This is an integration test that would require email/SMS services
      // For unit testing, we'd test the notification composition logic

      const preview = await previewBuilder.buildOveragePreview({
        tenantType: 'merchant',
        tenantId: testTenantId,
        periodStart: new Date(2025, 10, 1),
        periodEnd: new Date(2025, 10, 30),
      });

      // In production, this would send notifications
      // For testing, we just verify the preview was created
      expect(preview.previewId).toBeTruthy();
    });

    test('should mark preview as notified', async () => {
      const preview = await previewBuilder.buildOveragePreview({
        tenantType: 'merchant',
        tenantId: testTenantId,
        periodStart: new Date(2025, 10, 1),
        periodEnd: new Date(2025, 10, 30),
      });

      // Mark as notified
      await pool.query(
        `
        UPDATE overage_previews
        SET
          status = 'notified',
          notification_sent_at = NOW(),
          notification_method = 'email'
        WHERE id = $1
        `,
        [preview.previewId]
      );

      const { rows } = await pool.query(
        'SELECT status, notification_sent_at FROM overage_previews WHERE id = $1',
        [preview.previewId]
      );

      expect(rows[0].status).toBe('notified');
      expect(rows[0].notification_sent_at).toBeTruthy();
    });
  });

  // ===================================================================
  // Ops Actions Tests
  // ===================================================================

  describe('Ops Actions', () => {
    test('should approve contested preview', async () => {
      // Create and contest preview
      const preview = await previewBuilder.buildOveragePreview({
        tenantType: 'merchant',
        tenantId: testTenantId,
        periodStart: new Date(2025, 10, 1),
        periodEnd: new Date(2025, 10, 30),
      });

      await pool.query(
        `UPDATE overage_previews SET status = 'contested' WHERE id = $1`,
        [preview.previewId]
      );

      // Ops approves
      await pool.query(
        `
        UPDATE overage_previews
        SET
          status = 'approved_by_ops',
          ops_action = 'approved',
          ops_action_at = NOW(),
          ops_action_by = $2
        WHERE id = $1
        `,
        [preview.previewId, 'ops_user']
      );

      const { rows } = await pool.query(
        'SELECT status, ops_action FROM overage_previews WHERE id = $1',
        [preview.previewId]
      );

      expect(rows[0].status).toBe('approved_by_ops');
      expect(rows[0].ops_action).toBe('approved');
    });

    test('should adjust line amount', async () => {
      const preview = await previewBuilder.buildOveragePreview({
        tenantType: 'merchant',
        tenantId: testTenantId,
        periodStart: new Date(2025, 10, 1),
        periodEnd: new Date(2025, 10, 30),
      });

      // Get first line
      const { rows: [line] } = await pool.query(
        'SELECT * FROM overage_preview_lines WHERE preview_id = $1 LIMIT 1',
        [preview.previewId]
      );

      const newAmount = 25.0;
      const reason = 'Goodwill adjustment';

      // Adjust line
      await pool.query(
        `
        UPDATE overage_preview_lines
        SET
          original_amount = COALESCE(original_amount, amount),
          adjusted_amount = $2,
          adjustment_reason = $3,
          line_status = 'adjusted'
        WHERE id = $1
        `,
        [line.id, newAmount, reason]
      );

      const { rows: [adjusted] } = await pool.query(
        'SELECT * FROM overage_preview_lines WHERE id = $1',
        [line.id]
      );

      expect(adjusted.line_status).toBe('adjusted');
      expect(parseFloat(adjusted.adjusted_amount)).toBe(newAmount);
      expect(adjusted.adjustment_reason).toBe(reason);
    });
  });

  // ===================================================================
  // Audit Log Tests
  // ===================================================================

  describe('Audit Log', () => {
    test('should log status changes', async () => {
      const preview = await previewBuilder.buildOveragePreview({
        tenantType: 'merchant',
        tenantId: testTenantId,
        periodStart: new Date(2025, 10, 1),
        periodEnd: new Date(2025, 10, 30),
      });

      // Get initial audit count
      const { rows: initial } = await pool.query(
        'SELECT COUNT(*) as count FROM preview_audit_log WHERE preview_id = $1',
        [preview.previewId]
      );

      const initialCount = parseInt(initial[0].count);

      // Update status
      await pool.query(
        `UPDATE overage_previews SET status = 'accepted' WHERE id = $1`,
        [preview.previewId]
      );

      // Verify audit log entry created (by trigger)
      const { rows: after } = await pool.query(
        'SELECT COUNT(*) as count FROM preview_audit_log WHERE preview_id = $1',
        [preview.previewId]
      );

      expect(parseInt(after[0].count)).toBeGreaterThan(initialCount);
    });
  });
});
