import { runFloatCron } from '../float/cron';
import { db } from '../float/db';
import { authAdmin } from '../utils/auth';

export default function register(app: any): void {
    // Aperçu balances & targets
    app.get('/api/pay/float/accounts', authAdmin('float:read'), async (req: any, res: any) => {
        try {
            const data = await db.any(`
        SELECT a.id, a.kind, a.name, a.country_code, a.currency,
               b.balance_available, b.balance_reserved,
               p.min_target, p.max_target, p.hard_floor, p.hard_ceiling
        FROM float_accounts a
        JOIN float_balances b ON b.account_id=a.id
        JOIN float_policies p ON p.account_id=a.id
        ORDER BY a.currency, a.kind, a.name
      `);
            res.json(data);
        } catch (error) {
            console.error('Error fetching float accounts:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Lancer le cron manuellement (sinon kubernetes cronjob)
    app.post('/api/pay/float/rebalance/run', authAdmin('float:rebalance'), async (_req: any, res: any) => {
        try {
            const result = await runFloatCron();
            res.status(202).json({
                status: 'scheduled',
                plans_computed: result.plans,
                orders_created: result.orders
            });
        } catch (error) {
            console.error('Error running float cron:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Ajuster targets (écrit par SIRA en routine)
    app.post('/api/pay/float/targets', authAdmin('float:write'), async (req: any, res: any) => {
        try {
            const { accountId, minTarget, maxTarget } = req.body;
            await db.none(
                `UPDATE float_policies SET min_target=$2, max_target=$3, updated_at=now() WHERE account_id=$1`,
                [accountId, minTarget, maxTarget]
            );
            res.status(200).json({ ok: true });
        } catch (error) {
            console.error('Error updating float targets:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Obtenir les ordres de rebalancement
    app.get('/api/pay/float/rebalance-orders', authAdmin('float:read'), async (req: any, res: any) => {
        try {
            const { status, currency } = req.query;
            let query = `
        SELECT * FROM float_rebalance_orders 
        WHERE 1=1
      `;
            const params = [];

            if (status) {
                params.push(status);
                query += ` AND status = $${params.length}`;
            }

            if (currency) {
                params.push(currency);
                query += ` AND currency = $${params.length}`;
            }

            query += ` ORDER BY created_at DESC LIMIT 100`;

            const data = await db.any(query, params);
            res.json(data);
        } catch (error) {
            console.error('Error fetching rebalance orders:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}