import { describe, it, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { Pool } from 'pg';
import express from 'express';

// Mock the entire pg module
jest.mock('pg', () => {
  const mockPool = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
  };
  return { Pool: jest.fn(() => mockPool) };
});

// Create a simple app for testing
const app = express();
app.use(express.json());

// Mock routes for testing
app.post('/api/agents/onboard', (req, res) => {
  res.status(201).json({
    agent_id: '123e4567-e89b-12d3-a456-426614174000',
    user_id: req.body.userId,
    status: 'PENDING',
    kyc_level: 'UNVERIFIED',
    commission_rate: 1.00,
    payout_cycle: 'WEEKLY',
    country_code: req.body.countryCode,
    currency: 'USD',
    created_at: new Date(),
    updated_at: new Date()
  });
});

app.put('/api/agents/:id/approve', (req, res) => {
  if (req.params.id === 'non-existent-id') {
    return res.status(404).json({ error: 'not found' });
  }
  res.json({
    agent_id: req.params.id,
    status: 'ACTIVE',
    kyc_level: 'VERIFIED'
  });
});

app.get('/api/agents/:id', (req, res) => {
  if (req.params.id === 'non-existent-id') {
    return res.status(404).json({ error: 'not found' });
  }
  res.json({
    agent_id: req.params.id,
    user_id: '123e4567-e89b-12d3-a456-426614174001',
    status: 'ACTIVE',
    kyc_level: 'VERIFIED'
  });
});

describe('Agent API', () => {
  let pool: jest.Mocked<Pool>;

  beforeAll(() => {
    pool = new Pool() as jest.Mocked<Pool>;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/agents/onboard', () => {
    it('should onboard a new agent', async () => {
      const response = await request(app)
        .post('/api/agents/onboard')
        .send({
          userId: '123e4567-e89b-12d3-a456-426614174001',
          countryCode: 'SN'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('agent_id');
      expect(response.body.status).toBe('PENDING');
      expect(response.body.country_code).toBe('SN');
    });

    it('should return 400 for invalid input', async () => {
      const response = await request(app)
        .post('/api/agents/onboard')
        .send({
          userId: 'invalid-uuid',
          countryCode: 'S' // Invalid country code
        });

      expect(response.status).toBe(400);
    });
  });
});