/**
 * BRIQUE 142-SIRA — Approval Workflow Tests
 * Jest tests for multi-signature approval system
 */

import request from 'supertest';
import { pool } from '../src/db';
import app from '../src/server'; // Express app

describe('Approval Workflow', () => {
  let policyId: string;
  let approvalRequestId: string;

  beforeAll(async () => {
    // Create test approval policy
    const res = await pool.query(
      `INSERT INTO approval_policies(entity_type, threshold_type, threshold_value, require_roles, auto_execute)
       VALUES ('playbook', 'absolute', 2, ARRAY['pay_admin','compliance'], false)
       RETURNING id`
    );
    policyId = res.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    if (policyId) {
      await pool.query(`DELETE FROM approval_policies WHERE id = $1`, [policyId]);
    }
    await pool.end();
  });

  describe('Create Approval Request', () => {
    it('should create approval request with valid policy', async () => {
      const response = await request(app)
        .post('/api/approvals')
        .send({
          request_type: 'playbook_activation',
          reference_id: null,
          policy_id: policyId,
          metadata: { test: true },
        })
        .set('Authorization', 'Bearer testadmin')
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('open');
      expect(response.body.request_type).toBe('playbook_activation');
      expect(response.body.policy_id).toBe(policyId);

      approvalRequestId = response.body.id;
    });

    it('should fail without required fields', async () => {
      await request(app)
        .post('/api/approvals')
        .send({
          request_type: 'playbook_activation',
          // missing policy_id
        })
        .set('Authorization', 'Bearer testadmin')
        .expect(400);
    });

    it('should fail with invalid policy', async () => {
      await request(app)
        .post('/api/approvals')
        .send({
          request_type: 'playbook_activation',
          policy_id: '00000000-0000-0000-0000-000000000000',
        })
        .set('Authorization', 'Bearer testadmin')
        .expect(400);
    });
  });

  describe('Sign Approval Request', () => {
    it('should add signature from authorized user', async () => {
      const response = await request(app)
        .post(`/api/approvals/${approvalRequestId}/sign`)
        .send({ comment: 'First approval' })
        .set('Authorization', 'Bearer user1')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.thresholdReached).toBe(false); // only 1/2
    });

    it('should detect threshold reached on second signature', async () => {
      const response = await request(app)
        .post(`/api/approvals/${approvalRequestId}/sign`)
        .send({ comment: 'Second approval' })
        .set('Authorization', 'Bearer user2')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.thresholdReached).toBe(true); // 2/2
    });

    it('should prevent duplicate signatures', async () => {
      const response = await request(app)
        .post(`/api/approvals/${approvalRequestId}/sign`)
        .send({ comment: 'Duplicate attempt' })
        .set('Authorization', 'Bearer user1')
        .expect(200);

      // Should succeed but not add duplicate (ON CONFLICT DO NOTHING)
      expect(response.body.ok).toBe(true);
    });

    it('should fail for non-existent request', async () => {
      await request(app)
        .post(`/api/approvals/00000000-0000-0000-0000-000000000000/sign`)
        .send({ comment: 'Test' })
        .set('Authorization', 'Bearer user1')
        .expect(400);
    });
  });

  describe('Get Approval Request', () => {
    it('should retrieve approval request with signatures', async () => {
      const response = await request(app)
        .get(`/api/approvals/${approvalRequestId}`)
        .set('Authorization', 'Bearer testadmin')
        .expect(200);

      expect(response.body.id).toBe(approvalRequestId);
      expect(response.body.signatures).toBeDefined();
      expect(response.body.signatures.length).toBeGreaterThanOrEqual(2);
      expect(response.body.status).toMatch(/approved|open/);
    });

    it('should fail for non-existent request', async () => {
      await request(app)
        .get(`/api/approvals/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', 'Bearer testadmin')
        .expect(404);
    });
  });

  describe('List Approval Requests', () => {
    it('should list approval requests', async () => {
      const response = await request(app)
        .get('/api/approvals')
        .set('Authorization', 'Bearer testadmin')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/approvals?status=approved')
        .set('Authorization', 'Bearer testadmin')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((req: any) => {
        expect(req.status).toBe('approved');
      });
    });

    it('should filter by request type', async () => {
      const response = await request(app)
        .get('/api/approvals?request_type=playbook_activation')
        .set('Authorization', 'Bearer testadmin')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((req: any) => {
        expect(req.request_type).toBe('playbook_activation');
      });
    });
  });

  describe('Reject Approval Request', () => {
    let rejectRequestId: string;

    beforeAll(async () => {
      // Create a new request to reject
      const response = await request(app)
        .post('/api/approvals')
        .send({
          request_type: 'test_reject',
          policy_id: policyId,
        })
        .set('Authorization', 'Bearer testadmin');

      rejectRequestId = response.body.id;
    });

    it('should reject approval request', async () => {
      const response = await request(app)
        .post(`/api/approvals/${rejectRequestId}/reject`)
        .send({ reason: 'Test rejection' })
        .set('Authorization', 'Bearer user1')
        .expect(200);

      expect(response.body.ok).toBe(true);

      // Verify status changed
      const getResponse = await request(app)
        .get(`/api/approvals/${rejectRequestId}`)
        .set('Authorization', 'Bearer testadmin');

      expect(getResponse.body.status).toBe('rejected');
    });
  });

  describe('Approval Policies', () => {
    it('should list approval policies', async () => {
      const response = await request(app)
        .get('/api/approvals/policies/list')
        .set('Authorization', 'Bearer testadmin')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('Threshold Evaluation', () => {
    let percentPolicyId: string;

    beforeAll(async () => {
      // Create percent-based policy
      const res = await pool.query(
        `INSERT INTO approval_policies(entity_type, threshold_type, threshold_value, require_roles)
         VALUES ('test_percent', 'percent', 0.5, ARRAY['pay_admin','fraud_ops','compliance'])
         RETURNING id`
      );
      percentPolicyId = res.rows[0].id;
    });

    afterAll(async () => {
      if (percentPolicyId) {
        await pool.query(`DELETE FROM approval_policies WHERE id = $1`, [percentPolicyId]);
      }
    });

    it('should handle percent-based threshold', async () => {
      const createResponse = await request(app)
        .post('/api/approvals')
        .send({
          request_type: 'test_percent',
          policy_id: percentPolicyId,
        })
        .set('Authorization', 'Bearer testadmin');

      const requestId = createResponse.body.id;

      // Add signature from user with required role (1/3 roles = 33%)
      const sign1 = await request(app)
        .post(`/api/approvals/${requestId}/sign`)
        .send({})
        .set('Authorization', 'Bearer user_pay_admin');

      expect(sign1.body.thresholdReached).toBe(false); // 33% < 50%

      // Add second signature (2/3 roles = 66%)
      const sign2 = await request(app)
        .post(`/api/approvals/${requestId}/sign`)
        .send({})
        .set('Authorization', 'Bearer user_fraud_ops');

      expect(sign2.body.thresholdReached).toBe(true); // 66% >= 50%
    });
  });
});
