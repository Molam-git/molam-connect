import express from 'express';
import { createPolicy, quotePremium } from '../services/policyService';
import { submitClaim, resolveClaim } from '../services/claimsService';
import { getLatestRiskScore } from '../services/riskService';
import { pool } from '../db';

const router = express.Router();

// Helper pour gérer les erreurs de type unknown
function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

router.post('/policies', async (req, res) => {
    try {
        const policy = await createPolicy(
            req.body.agentId,
            req.body.coverPct,
            req.body.currency,
            req.body.startDate,
            req.body.endDate,
            req.body.reinsurancePartnerId
        );
        res.json(policy);
    } catch (error) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

router.get('/policies/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM agent_insurance_policies WHERE id=$1`, [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Policy not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

router.post('/policies/:id/activate', async (req, res) => {
    try {
        await pool.query(`UPDATE agent_insurance_policies SET policy_status='active' WHERE id=$1`, [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

router.post('/policies/:id/cancel', async (req, res) => {
    try {
        await pool.query(`UPDATE agent_insurance_policies SET policy_status='cancelled' WHERE id=$1`, [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

router.get('/:agentId/risk', async (req, res) => {
    try {
        const riskScore = await getLatestRiskScore(Number(req.params.agentId));
        if (!riskScore) {
            return res.status(404).json({ error: 'Risk score not found' });
        }
        res.json(riskScore);
    } catch (error) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

router.post('/claims', async (req, res) => {
    try {
        const claim = await submitClaim(
            req.body.policyId,
            req.body.agentId,
            req.body.amount,
            req.body.evidence
        );
        res.json(claim);
    } catch (error) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

router.get('/claims/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM agent_insurance_claims WHERE id=$1`, [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Claim not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

router.post('/claims/:id/resolve', async (req, res) => {
    try {
        await resolveClaim(req.params.id, req.body.approve, req.body.approver);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

export default router;