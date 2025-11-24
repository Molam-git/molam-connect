import { FastifyInstance } from 'fastify';
import { db } from '../db/knex.js';

export default async function internalRoutes(app: FastifyInstance) {
    app.get('/api/internal/reports/exports', async (req, rep) => {
        const rows = await db('report_exports').select('*').orderBy('created_at', 'desc').limit(500);
        return rep.send(rows);
    });

    app.get('/api/internal/reports/agent/:agentId/kpis-aggregate', async (req: any, rep) => {
        const { agentId } = req.params;
        const { from, to, currency } = req.query;
        const rows = await db('mv_agent_kpis_daily')
            .where({ agent_id: agentId })
            .andWhere('day', '>=', from).andWhere('day', '<=', to)
            .modify(q => { if (currency) q.andWhere({ currency }); })
            .select(db.raw(`
        currency,
        SUM(txn_count) AS txn_count,
        SUM(cash_in_total) AS cash_in_total,
        SUM(cash_out_total) AS cash_out_total,
        SUM(p2p_agent_total) AS p2p_agent_total,
        SUM(p2p_app_total) AS p2p_app_total
      `))
            .groupBy('currency');
        return rep.send(rows);
    });
}