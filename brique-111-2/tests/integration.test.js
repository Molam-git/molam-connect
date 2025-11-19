/**
 * Brique 111-2: AI Config Advisor - Integration Tests
 *
 * Tests the full lifecycle of recommendations from creation to execution
 */

const request = require('supertest');
const { Pool } = require('pg');

describe('AI Config Advisor Integration Tests', () => {
  let app;
  let pool;
  let testMerchantId;
  let testWebhookId;

  beforeAll(async () => {
    // Initialize test database connection
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    });

    // Initialize Express app
    app = require('../../server');

    // Create test merchant and webhook
    const { rows: [merchant] } = await pool.query(
      `INSERT INTO merchants (name, email, country)
       VALUES ('Test Merchant', 'test@example.com', 'SN')
       RETURNING id`
    );
    testMerchantId = merchant.id;

    const { rows: [webhook] } = await pool.query(
      `INSERT INTO webhook_endpoints (merchant_id, url, event_types, timeout_ms)
       VALUES ($1, 'https://example.com/webhook', ARRAY['payment.success'], 30000)
       RETURNING id`,
      [testMerchantId]
    );
    testWebhookId = webhook.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await pool.query(`DELETE FROM config_recommendations WHERE merchant_id = $1`, [testMerchantId]);
    await pool.query(`DELETE FROM webhook_endpoints WHERE id = $1`, [testWebhookId]);
    await pool.query(`DELETE FROM merchants WHERE id = $1`, [testMerchantId]);
    await pool.end();
  });

  describe('Recommendation Lifecycle - Auto-Apply', () => {
    test('should create and auto-apply low-priority high-confidence recommendation', async () => {
      // Step 1: Create recommendation (simulating SIRA)
      const recommendation = {
        merchantId: testMerchantId,
        targetType: 'webhook',
        targetId: testWebhookId,
        action: 'suggest_config',
        params: {
          timeout: 120000,
          retry_config: {
            max_attempts: 5,
            backoff: 'exponential'
          }
        },
        evidence: {
          webhook_fail_rate: 0.42,
          avg_response_time_ms: 85000,
          timeout_ms: 30000
        },
        confidence: 0.96,
        priority: 'low'
      };

      const createRes = await request(app)
        .post('/api/ai-recommendations')
        .send(recommendation)
        .expect(201);

      expect(createRes.body.id).toBeDefined();
      expect(createRes.body.status).toBeDefined();

      const recId = createRes.body.id;

      // Step 2: Wait for auto-apply (may take a moment)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 3: Verify recommendation was applied
      const getRes = await request(app)
        .get(`/api/ai-recommendations/${recId}`)
        .expect(200);

      expect(getRes.body.status).toBe('applied');

      // Step 4: Verify config was actually updated
      const { rows: [webhook] } = await pool.query(
        `SELECT timeout_ms FROM webhook_endpoints WHERE id = $1`,
        [testWebhookId]
      );

      expect(webhook.timeout_ms).toBe(120000);

      // Step 5: Verify snapshot was created
      const { rows: snapshots } = await pool.query(
        `SELECT * FROM config_snapshots WHERE target_type = 'webhook' AND target_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [testWebhookId]
      );

      expect(snapshots.length).toBe(1);
      expect(snapshots[0].snapshot.timeout_ms).toBe(30000); // Original value
    });
  });

  describe('Recommendation Lifecycle - Manual Approval', () => {
    test('should require approval for high-priority recommendation', async () => {
      // Step 1: Create high-priority recommendation
      const recommendation = {
        merchantId: testMerchantId,
        targetType: 'webhook',
        targetId: testWebhookId,
        action: 'suggest_config',
        params: {
          timeout: 180000
        },
        evidence: {
          webhook_fail_rate: 0.55
        },
        confidence: 0.88,
        priority: 'high'
      };

      const createRes = await request(app)
        .post('/api/ai-recommendations')
        .send(recommendation)
        .expect(201);

      const recId = createRes.body.id;

      // Step 2: Verify status is 'proposed' (not auto-applied)
      await new Promise(resolve => setTimeout(resolve, 500));

      const getRes = await request(app)
        .get(`/api/ai-recommendations/${recId}`)
        .expect(200);

      expect(getRes.body.status).toBe('proposed');

      // Step 3: Attempt to apply without approval (should fail for critical)
      // For high priority with medium confidence, might work depending on policy

      // Step 4: Approve recommendation
      const approveRes = await request(app)
        .post(`/api/ai-recommendations/${recId}/approve`)
        .send({ note: 'Reviewed and approved' })
        .expect(200);

      expect(approveRes.body.approval_count).toBeGreaterThan(0);

      // Step 5: Apply recommendation
      const applyRes = await request(app)
        .post(`/api/ai-recommendations/${recId}/apply`)
        .expect(200);

      expect(applyRes.body.ok).toBe(true);
      expect(applyRes.body.snapshot_id).toBeDefined();

      // Step 6: Verify applied
      const finalRes = await request(app)
        .get(`/api/ai-recommendations/${recId}`)
        .expect(200);

      expect(finalRes.body.status).toBe('applied');
    });
  });

  describe('Recommendation Lifecycle - Rollback', () => {
    test('should rollback applied recommendation', async () => {
      // Step 1: Get current webhook config
      const { rows: [originalWebhook] } = await pool.query(
        `SELECT timeout_ms FROM webhook_endpoints WHERE id = $1`,
        [testWebhookId]
      );

      const originalTimeout = originalWebhook.timeout_ms;

      // Step 2: Create and apply recommendation
      const recommendation = {
        merchantId: testMerchantId,
        targetType: 'webhook',
        targetId: testWebhookId,
        action: 'suggest_config',
        params: {
          timeout: 90000 // Different from original
        },
        evidence: {
          test: 'rollback_scenario'
        },
        confidence: 0.95,
        priority: 'low'
      };

      const createRes = await request(app)
        .post('/api/ai-recommendations')
        .send(recommendation)
        .expect(201);

      const recId = createRes.body.id;

      // Wait for auto-apply
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 3: Verify applied
      const { rows: [updatedWebhook] } = await pool.query(
        `SELECT timeout_ms FROM webhook_endpoints WHERE id = $1`,
        [testWebhookId]
      );

      expect(updatedWebhook.timeout_ms).toBe(90000);

      // Step 4: Rollback
      const rollbackRes = await request(app)
        .post(`/api/ai-recommendations/${recId}/rollback`)
        .send({ reason: 'Testing rollback functionality' })
        .expect(200);

      expect(rollbackRes.body.ok).toBe(true);
      expect(rollbackRes.body.snapshot_id).toBeDefined();

      // Step 5: Verify configuration restored
      const { rows: [rolledBackWebhook] } = await pool.query(
        `SELECT timeout_ms FROM webhook_endpoints WHERE id = $1`,
        [testWebhookId]
      );

      expect(rolledBackWebhook.timeout_ms).toBe(originalTimeout);

      // Step 6: Verify status updated
      const finalRes = await request(app)
        .get(`/api/ai-recommendations/${recId}`)
        .expect(200);

      expect(finalRes.body.status).toBe('rolled_back');
    });
  });

  describe('Recommendation Lifecycle - Rejection', () => {
    test('should reject proposed recommendation', async () => {
      // Step 1: Create recommendation
      const recommendation = {
        merchantId: testMerchantId,
        targetType: 'webhook',
        targetId: testWebhookId,
        action: 'suggest_config',
        params: {
          timeout: 60000
        },
        evidence: {
          test: 'rejection_scenario'
        },
        confidence: 0.75,
        priority: 'medium'
      };

      const createRes = await request(app)
        .post('/api/ai-recommendations')
        .send(recommendation)
        .expect(201);

      const recId = createRes.body.id;

      // Step 2: Reject
      const rejectRes = await request(app)
        .post(`/api/ai-recommendations/${recId}/reject`)
        .send({ reason: 'Not applicable for this merchant' })
        .expect(200);

      expect(rejectRes.body.ok).toBe(true);

      // Step 3: Verify status
      const getRes = await request(app)
        .get(`/api/ai-recommendations/${recId}`)
        .expect(200);

      expect(getRes.body.status).toBe('rejected');

      // Step 4: Verify cannot apply rejected recommendation
      const applyRes = await request(app)
        .post(`/api/ai-recommendations/${recId}/apply`)
        .expect(400);

      expect(applyRes.body.error).toBe('invalid_status');
    });
  });

  describe('Multi-Signature Approval', () => {
    test('should require multiple approvals for critical priority', async () => {
      // Step 1: Create critical recommendation
      const recommendation = {
        merchantId: testMerchantId,
        targetType: 'webhook',
        targetId: testWebhookId,
        action: 'suggest_config',
        params: {
          timeout: 200000
        },
        evidence: {
          critical_issue: true
        },
        confidence: 0.92,
        priority: 'critical'
      };

      const createRes = await request(app)
        .post('/api/ai-recommendations')
        .send(recommendation)
        .expect(201);

      const recId = createRes.body.id;

      // Step 2: Get recommendation details
      const getRes = await request(app)
        .get(`/api/ai-recommendations/${recId}`)
        .expect(200);

      expect(getRes.body.requires_multisig).toBe(true);
      expect(getRes.body.can_auto_apply).toBe(false);

      // Step 3: First approval
      await request(app)
        .post(`/api/ai-recommendations/${recId}/approve`)
        .send({ note: 'First approval' })
        .expect(200);

      // Step 4: Verify still needs more approvals
      const afterFirstApproval = await request(app)
        .get(`/api/ai-recommendations/${recId}`)
        .expect(200);

      expect(afterFirstApproval.body.approval_count).toBe(1);
      expect(afterFirstApproval.body.status).toBe('proposed'); // Still needs more

      // Step 5: Attempt to apply (should fail - insufficient approvals)
      const prematureApplyRes = await request(app)
        .post(`/api/ai-recommendations/${recId}/apply`)
        .expect(403);

      expect(prematureApplyRes.body.error).toBe('insufficient_approvals');

      // Step 6: Second approval (simulating different user)
      // Note: In real system, would check actor is different
      await request(app)
        .post(`/api/ai-recommendations/${recId}/approve`)
        .send({ note: 'Second approval' })
        .expect(200);

      // Step 7: Now should be approved
      const afterSecondApproval = await request(app)
        .get(`/api/ai-recommendations/${recId}`)
        .expect(200);

      expect(afterSecondApproval.body.status).toBe('approved');
    });
  });

  describe('Idempotency', () => {
    test('should not create duplicate recommendations with same evidence', async () => {
      const recommendation = {
        merchantId: testMerchantId,
        targetType: 'webhook',
        targetId: testWebhookId,
        action: 'suggest_config',
        params: {
          timeout: 150000
        },
        evidence: {
          unique_test_id: 'idempotency_test_12345',
          webhook_fail_rate: 0.40
        },
        confidence: 0.90,
        priority: 'medium'
      };

      // Step 1: Create first recommendation
      const firstRes = await request(app)
        .post('/api/ai-recommendations')
        .send(recommendation)
        .expect(201);

      const firstId = firstRes.body.id;

      // Step 2: Create duplicate (same evidence)
      const secondRes = await request(app)
        .post('/api/ai-recommendations')
        .send(recommendation)
        .expect(200); // Not 201 - returns existing

      // Should return same recommendation
      expect(secondRes.body.id).toBe(firstId);
    });
  });

  describe('Audit Trail', () => {
    test('should maintain complete audit trail', async () => {
      // Step 1: Create recommendation
      const recommendation = {
        merchantId: testMerchantId,
        targetType: 'webhook',
        targetId: testWebhookId,
        action: 'suggest_config',
        params: {
          timeout: 100000
        },
        evidence: {
          audit_test: true
        },
        confidence: 0.93,
        priority: 'medium'
      };

      const createRes = await request(app)
        .post('/api/ai-recommendations')
        .send(recommendation)
        .expect(201);

      const recId = createRes.body.id;

      // Step 2: Approve
      await request(app)
        .post(`/api/ai-recommendations/${recId}/approve`)
        .send({ note: 'Audit trail test approval' })
        .expect(200);

      // Step 3: Apply
      await request(app)
        .post(`/api/ai-recommendations/${recId}/apply`)
        .expect(200);

      // Step 4: Get audit trail
      const auditRes = await request(app)
        .get(`/api/ai-recommendations/${recId}/audit`)
        .expect(200);

      // Should have multiple entries
      expect(auditRes.body.length).toBeGreaterThan(0);

      // Verify entries
      const actions = auditRes.body.map(entry => entry.action_taken);
      expect(actions).toContain('propose');
      expect(actions).toContain('approve');
      expect(actions).toContain('apply');

      // Verify each entry has required fields
      auditRes.body.forEach(entry => {
        expect(entry.id).toBeDefined();
        expect(entry.recommendation_id).toBe(recId);
        expect(entry.actor).toBeDefined();
        expect(entry.action_taken).toBeDefined();
        expect(entry.created_at).toBeDefined();
      });
    });
  });

  describe('Evidence Retrieval', () => {
    test('should retrieve evidence for recommendation', async () => {
      const evidence = {
        webhook_fail_rate: 0.45,
        avg_response_time_ms: 92000,
        failed_count_24h: 150,
        sample_errors: ['timeout', 'connection_reset']
      };

      const recommendation = {
        merchantId: testMerchantId,
        targetType: 'webhook',
        targetId: testWebhookId,
        action: 'suggest_config',
        params: {
          timeout: 130000
        },
        evidence: evidence,
        confidence: 0.91,
        priority: 'medium'
      };

      const createRes = await request(app)
        .post('/api/ai-recommendations')
        .send(recommendation)
        .expect(201);

      const recId = createRes.body.id;

      // Get evidence
      const evidenceRes = await request(app)
        .get(`/api/ai-recommendations/${recId}/evidence`)
        .expect(200);

      expect(evidenceRes.body).toEqual(evidence);
    });
  });

  describe('Filtering and Listing', () => {
    test('should filter recommendations by status', async () => {
      const listRes = await request(app)
        .get('/api/ai-recommendations?status=proposed')
        .expect(200);

      expect(Array.isArray(listRes.body)).toBe(true);

      listRes.body.forEach(rec => {
        expect(rec.status).toBe('proposed');
      });
    });

    test('should filter recommendations by priority', async () => {
      const listRes = await request(app)
        .get('/api/ai-recommendations?priority=high')
        .expect(200);

      expect(Array.isArray(listRes.body)).toBe(true);

      listRes.body.forEach(rec => {
        expect(rec.priority).toBe('high');
      });
    });

    test('should filter recommendations by target type', async () => {
      const listRes = await request(app)
        .get('/api/ai-recommendations?targetType=webhook')
        .expect(200);

      expect(Array.isArray(listRes.body)).toBe(true);

      listRes.body.forEach(rec => {
        expect(rec.target_type).toBe('webhook');
      });
    });
  });
});
