// src/routes/treasury.ts
import express from 'express';
import { TreasuryService } from '../services/treasuryService';
import { authzMiddleware } from '../middleware/auth';
import { db } from '../config';

const router = express.Router();
const treasuryService = new TreasuryService();

router.post("/payouts",
    authzMiddleware,
    requireRole(["pay_module", "finance_ops", "pay_admin"]),
    async (req: any, res) => {
        try {
            const idempotency = req.headers["idempotency-key"];
            if (!idempotency) {
                return res.status(400).json({ error: "idempotency_required" });
            }

            const {
                origin_module,
                origin_entity_id,
                amount,
                currency,
                beneficiary
            } = req.body;

            const payout = await treasuryService.createPayout(idempotency, {
                origin_module,
                origin_entity_id,
                amount,
                currency,
                bank_account: beneficiary
            });

            res.json(payout);
        } catch (error) {
            res.status(500).json({ error: "internal_server_error" });
        }
    }
);

router.get("/payouts/:id", authzMiddleware, async (req, res) => {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM payouts WHERE id = $1', [id]);

    if (result.rows.length === 0) {
        return res.status(404).json({ error: "payout_not_found" });
    }

    res.json(result.rows[0]);
});

// Autres routes...

export default router;

function requireRole(arg0: string[]): any {
    throw new Error('Function not implemented.');
}
