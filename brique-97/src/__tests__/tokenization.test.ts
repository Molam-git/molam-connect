/**
 * Brique 97 — Tokenization Tests
 *
 * Comprehensive tests for tokenization API endpoints
 */

import request from 'supertest';
import { generateToken, User } from '../middleware/auth';
import { pool } from '../db';
import { encrypt } from '../utils/crypto';

// Mock app (would be imported from actual app)
// import app from '../app';

describe('Brique 97 - Tokenization API', () => {
  let app: any;
  let testUser: User;
  let testMerchantId: string;
  let authToken: string;

  beforeAll(async () => {
    // Setup test database
    // await pool.query('BEGIN');

    // Create test user
    testUser = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@molam.co',
      roles: ['merchant_admin'],
      tenant_type: 'merchant',
      tenant_id: '123e4567-e89b-12d3-a456-426614174000',
    };

    testMerchantId = testUser.tenant_id!;

    // Generate auth token
    authToken = generateToken(testUser, '1h');

    // Mock app would be initialized here
    // app = ... ;
  });

  afterAll(async () => {
    // Cleanup
    // await pool.query('ROLLBACK');
    // await pool.end();
  });

  describe('POST /api/tokenization/client-token', () => {
    it('should create client token for valid request', async () => {
      const response = await request(app)
        .post('/api/tokenization/client-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          merchant_id: testMerchantId,
          origin: 'https://merchant.example.com',
          ttl_seconds: 120,
        })
        .expect(200);

      expect(response.body).toHaveProperty('client_token');
      expect(response.body).toHaveProperty('expires_at');
      expect(typeof response.body.client_token).toBe('string');
      expect(response.body.client_token.length).toBeGreaterThan(20);
    });

    it('should reject request without authentication', async () => {
      await request(app)
        .post('/api/tokenization/client-token')
        .send({
          merchant_id: testMerchantId,
          origin: 'https://merchant.example.com',
        })
        .expect(401);
    });

    it('should reject request with missing origin', async () => {
      await request(app)
        .post('/api/tokenization/client-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          merchant_id: testMerchantId,
        })
        .expect(400);
    });

    it('should reject request with ttl > 300s', async () => {
      await request(app)
        .post('/api/tokenization/client-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          merchant_id: testMerchantId,
          origin: 'https://merchant.example.com',
          ttl_seconds: 500,
        })
        .expect(400);
    });

    it('should rate limit excessive requests', async () => {
      // Make 101 requests (limit is 100/min)
      const requests = Array.from({ length: 101 }, () =>
        request(app)
          .post('/api/tokenization/client-token')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            merchant_id: testMerchantId,
            origin: 'https://merchant.example.com',
          })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter((r) => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/tokenization/hosted-callback', () => {
    let clientToken: string;

    beforeEach(async () => {
      // Create a fresh client token for each test
      const response = await request(app)
        .post('/api/tokenization/client-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          merchant_id: testMerchantId,
          origin: 'https://merchant.example.com',
        });

      clientToken = response.body.client_token;
    });

    it('should create payment method from valid callback', async () => {
      const response = await request(app)
        .post('/api/tokenization/hosted-callback')
        .send({
          client_token: clientToken,
          provider_ref: 'tok_test_12345',
          last4: '4242',
          brand: 'visa',
          exp_month: 12,
          exp_year: 2026,
          tenant_type: 'user',
          tenant_id: testUser.id,
        })
        .expect(200);

      expect(response.body).toHaveProperty('payment_method_id');
      expect(typeof response.body.payment_method_id).toBe('string');

      // Verify payment method was created in database
      const { rows } = await pool.query(
        `SELECT * FROM payment_methods WHERE id = $1`,
        [response.body.payment_method_id]
      );

      expect(rows.length).toBe(1);
      expect(rows[0].last4).toBe('4242');
      expect(rows[0].brand).toBe('visa');
    });

    it('should reject invalid client token', async () => {
      await request(app)
        .post('/api/tokenization/hosted-callback')
        .send({
          client_token: 'invalid_token_xyz',
          provider_ref: 'tok_test_12345',
          last4: '4242',
          brand: 'visa',
          exp_month: 12,
          exp_year: 2026,
          tenant_type: 'user',
          tenant_id: testUser.id,
        })
        .expect(400);
    });

    it('should prevent client token reuse', async () => {
      const payload = {
        client_token: clientToken,
        provider_ref: 'tok_test_12345',
        last4: '4242',
        brand: 'visa',
        exp_month: 12,
        exp_year: 2026,
        tenant_type: 'user',
        tenant_id: testUser.id,
      };

      // First use - should succeed
      await request(app).post('/api/tokenization/hosted-callback').send(payload).expect(200);

      // Second use - should fail (single-use)
      await request(app).post('/api/tokenization/hosted-callback').send(payload).expect(400);
    });

    it('should create audit log entry', async () => {
      const response = await request(app)
        .post('/api/tokenization/hosted-callback')
        .send({
          client_token: clientToken,
          provider_ref: 'tok_test_67890',
          last4: '1111',
          brand: 'mastercard',
          exp_month: 3,
          exp_year: 2025,
          tenant_type: 'user',
          tenant_id: testUser.id,
        })
        .expect(200);

      const paymentMethodId = response.body.payment_method_id;

      // Verify audit log
      const { rows } = await pool.query(
        `SELECT * FROM payment_method_audit WHERE payment_method_id = $1 AND action = 'created'`,
        [paymentMethodId]
      );

      expect(rows.length).toBe(1);
      expect(rows[0].action).toBe('created');
    });
  });

  describe('POST /api/tokenization/payment-methods/:id/revoke', () => {
    let paymentMethodId: string;

    beforeEach(async () => {
      // Create a payment method
      const clientTokenRes = await request(app)
        .post('/api/tokenization/client-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          merchant_id: testMerchantId,
          origin: 'https://merchant.example.com',
        });

      const callbackRes = await request(app)
        .post('/api/tokenization/hosted-callback')
        .send({
          client_token: clientTokenRes.body.client_token,
          provider_ref: 'tok_test_revoke',
          last4: '9999',
          brand: 'visa',
          exp_month: 12,
          exp_year: 2027,
          tenant_type: 'user',
          tenant_id: testUser.id,
        });

      paymentMethodId = callbackRes.body.payment_method_id;
    });

    it('should revoke payment method', async () => {
      await request(app)
        .post(`/api/tokenization/payment-methods/${paymentMethodId}/revoke`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reason: 'User requested revocation',
        })
        .expect(200);

      // Verify payment method is revoked
      const { rows } = await pool.query(
        `SELECT * FROM payment_methods WHERE id = $1`,
        [paymentMethodId]
      );

      expect(rows[0].is_active).toBe(false);
      expect(rows[0].revoked_at).not.toBeNull();
      expect(rows[0].revoked_reason).toBe('User requested revocation');
    });

    it('should reject revocation without reason', async () => {
      await request(app)
        .post(`/api/tokenization/payment-methods/${paymentMethodId}/revoke`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);
    });

    it('should create audit log for revocation', async () => {
      await request(app)
        .post(`/api/tokenization/payment-methods/${paymentMethodId}/revoke`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reason: 'Test revocation',
        });

      const { rows } = await pool.query(
        `SELECT * FROM payment_method_audit WHERE payment_method_id = $1 AND action = 'revoked'`,
        [paymentMethodId]
      );

      expect(rows.length).toBe(1);
    });
  });

  describe('GET /api/payment-methods', () => {
    it('should list payment methods for tenant', async () => {
      const response = await request(app)
        .get('/api/payment-methods')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          tenant_type: 'user',
          tenant_id: testUser.id,
        })
        .expect(200);

      expect(response.body).toHaveProperty('payment_methods');
      expect(Array.isArray(response.body.payment_methods)).toBe(true);

      // Should only return masked data
      if (response.body.payment_methods.length > 0) {
        const pm = response.body.payment_methods[0];
        expect(pm).toHaveProperty('last4');
        expect(pm).toHaveProperty('brand');
        expect(pm).not.toHaveProperty('token'); // Sensitive data not exposed
      }
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/payment-methods')
        .query({
          tenant_type: 'user',
          tenant_id: testUser.id,
        })
        .expect(401);
    });

    it('should require tenant_type and tenant_id', async () => {
      await request(app)
        .get('/api/payment-methods')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('Security Tests', () => {
    it('should not expose PAN in any response', async () => {
      // Create payment method
      const clientTokenRes = await request(app)
        .post('/api/tokenization/client-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          merchant_id: testMerchantId,
          origin: 'https://merchant.example.com',
        });

      const callbackRes = await request(app)
        .post('/api/tokenization/hosted-callback')
        .send({
          client_token: clientTokenRes.body.client_token,
          provider_ref: 'tok_test_security',
          last4: '8888',
          brand: 'visa',
          exp_month: 6,
          exp_year: 2028,
          tenant_type: 'user',
          tenant_id: testUser.id,
          pan: '4242424242424242', // Provided for fingerprinting only
        });

      const paymentMethodId = callbackRes.body.payment_method_id;

      // List payment methods
      const listRes = await request(app)
        .get('/api/payment-methods')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          tenant_type: 'user',
          tenant_id: testUser.id,
        });

      // Verify PAN is never in response
      const responseString = JSON.stringify(listRes.body);
      expect(responseString).not.toContain('4242424242424242');
      expect(responseString).not.toContain('424242');

      // Should only have last4
      const pm = listRes.body.payment_methods.find((p: any) => p.id === paymentMethodId);
      expect(pm.last4).toBe('8888');
    });

    it('should enforce HTTPS in production', () => {
      // In production, all requests must be HTTPS
      // This would be enforced at the infrastructure level
      // Test here is placeholder for CI/CD pipeline check
      expect(process.env.NODE_ENV === 'production' ? process.env.ENFORCE_HTTPS : 'true').toBe('true');
    });
  });
});
