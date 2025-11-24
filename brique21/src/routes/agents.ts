import { FastifyInstance } from 'fastify';
import { getSummary, getBalances, getEvents, getPayouts } from '../domain/kpis.js';
import { exportCSV, exportPDF, persistExport } from '../domain/exports.js';
import { v4 as uuid } from 'uuid';

export default async function agentRoutes(app: FastifyInstance) {
    app.get('/api/agents/:agentId/reports/summary', async (req: any, rep) => {
        const { agentId } = req.params;
        const { from, to, currency } = req.query;
        const data = await getSummary({ agentId, currency }, { from, to });
        return rep.send(data);
    });

    app.get('/api/agents/:agentId/reports/balances', async (req: any, rep) => {
        const { agentId } = req.params;
        const rows = await getBalances(agentId);
        return rep.send(rows);
    });

    app.get('/api/agents/:agentId/reports/events', async (req: any, rep) => {
        const { agentId } = req.params;
        const { from, to, currency } = req.query;
        const rows = await getEvents(agentId, { from, to }, currency);
        return rep.send(rows);
    });

    app.get('/api/agents/:agentId/reports/payouts', async (req: any, rep) => {
        const { agentId } = req.params;
        const { from, to, currency } = req.query;
        const rows = await getPayouts(agentId, { from, to }, currency);
        return rep.send(rows);
    });

    app.post('/api/agents/:agentId/reports/export', async (req: any, rep) => {
        const { agentId } = req.params;
        const { reportType, from, to, currency, format } = req.body;
        const createdBy = req.user?.user_id || uuid();

        let rows: any[] = [];
        let title = '';
        if (reportType === 'KPIS') {
            const s = await getSummary({ agentId, currency }, { from, to });
            rows = s.rows.map((r: any) => ({
                day: r.day, currency: r.currency,
                txn_count: r.txn_count,
                cash_in_total: r.cash_in_total,
                cash_out_total: r.cash_out_total,
                p2p_agent_total: r.p2p_agent_total,
                p2p_app_total: r.p2p_app_total
            }));
            title = `KPIs Agent ${agentId} (${from} → ${to})`;
        } else if (reportType === 'EVENTS') {
            rows = await getEvents(agentId, { from, to }, currency);
            title = `Commissions (Events) Agent ${agentId}`;
        } else if (reportType === 'PAYOUTS') {
            rows = await getPayouts(agentId, { from, to }, currency);
            title = `Versements Agent ${agentId}`;
        } else if (reportType === 'BALANCES') {
            rows = await getBalances(agentId);
            title = `Soldes commissions Agent ${agentId}`;
        } else {
            return rep.code(400).send({ error: 'INVALID_REPORT_TYPE' });
        }

        const filename = `${reportType.toLowerCase()}_${agentId}_${from}_${to}.${String(format).toLowerCase()}`;
        const filePath = (String(format).toUpperCase() === 'PDF')
            ? await exportPDF(title, rows, filename)
            : await exportCSV(rows, filename);

        const persisted = await persistExport('AGENT', agentId, reportType, { from, to, currency, format }, filePath, createdBy);

        return rep.send({
            file_path: filePath,
            file_sha256: persisted.file_sha256,
            signature_algo: persisted.signature.algo,
            signature_value: persisted.signature.signature
        });
    });
}