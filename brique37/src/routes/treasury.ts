import express from 'express';
import { processApprovedClaim } from '../workers/claimProcessor';
import { pool } from '../db';

const router = express.Router();

// Helper pour gérer les erreurs
function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

router.post('/execute-payout/:claimId', async (req, res) => {
    try {
        await processApprovedClaim(req.params.claimId);
        res.json({ success: true, message: 'Payout executed successfully' });
    } catch (error) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

router.get('/insurance/overview', async (req, res) => {
    try {
        const { rows: policies } = await pool.query(
            `SELECT COUNT(*) as total_policies, 
              SUM(premium_amount) as total_premiums,
              currency
       FROM agent_insurance_policies 
       WHERE policy_status = 'active'
       GROUP BY currency`
        );

        const { rows: claims } = await pool.query(
            `SELECT COUNT(*) as total_claims,
              SUM(claim_amount) as total_claims_amount,
              currency
       FROM agent_insurance_claims 
       WHERE status IN ('approved', 'paid')
       GROUP BY currency`
        );

        res.json({
            policies: policies[0],
            claims: claims[0],
            summary: {
                active_policies: parseInt(policies[0]?.total_policies || '0'),
                total_premiums: parseFloat(policies[0]?.total_premiums || '0'),
                total_claims: parseInt(claims[0]?.total_claims || '0'),
                claims_amount: parseFloat(claims[0]?.total_claims_amount || '0')
            }
        });
    } catch (error) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

export default router;