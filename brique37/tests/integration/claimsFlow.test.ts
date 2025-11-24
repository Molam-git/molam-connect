import request from 'supertest';
import { app } from '../../src/app'; // Supposons que app est exporté depuis src/app.ts
import { pool } from '../../src/db';

describe('Claims Flow', () => {
  let policyId: string;

  beforeAll(async () => {
    // Créer une police de test
    const res = await pool.query(
      `INSERT INTO agent_insurance_policies (agent_id, cover_pct, currency, start_date, end_date, policy_status) 
       VALUES (123, 50, 'USD', '2023-01-01', '2024-01-01', 'active') RETURNING id`
    );
    policyId = res.rows[0].id;
  });

  afterAll(async () => {
    // Nettoyer la base de données
    await pool.query(`DELETE FROM agent_insurance_claims WHERE policy_id=$1`, [policyId]);
    await pool.query(`DELETE FROM agent_insurance_policies WHERE id=$1`, [policyId]);
  });

  it('should submit, approve and process a claim', async () => {
    // Soumettre un claim
    const submitResponse = await request(app)
      .post('/api/agents/claims')
      .send({
        policyId,
        agentId: 123,
        amount: 1000,
        evidence: { reason: 'test' }
      });

    expect(submitResponse.status).toBe(200);
    const claimId = submitResponse.body.id;

    // Approuver le claim
    const resolveResponse = await request(app)
      .post(`/api/agents/claims/${claimId}/resolve`)
      .send({ approve: true, approver: 'test' });

    expect(resolveResponse.status).toBe(200);

    // Vérifier que le claim est approuvé
    const { rows } = await pool.query(`SELECT status FROM agent_insurance_claims WHERE id=$1`, [claimId]);
    expect(rows[0].status).toBe('approved');

    // Ici, on pourrait aussi simuler l'appel Treasury et vérifier que le claim est payé
  });
});