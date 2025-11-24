import { db } from '../db/knex.js';

type Range = { from: string; to: string; };
type AgentFilter = { agentId: string; currency?: string; };

export async function getSummary(filter: AgentFilter, range: Range) {
    const { agentId, currency } = filter;

    const kpis = db('mv_agent_kpis_daily')
        .where({ agent_id: agentId })
        .andWhere('day', '>=', range.from)
        .andWhere('day', '<=', range.to);
    if (currency) kpis.andWhere({ currency });

    const rows = await kpis.select(
        'day', 'currency', 'txn_count',
        'cash_in_total', 'cash_out_total', 'p2p_agent_total', 'p2p_app_total'
    ).orderBy('day', 'asc');

    const comm = db('mv_agent_commissions_daily')
        .where({ agent_id: agentId })
        .andWhere('day', '>=', range.from)
        .andWhere('day', '<=', range.to);
    if (currency) comm.andWhere({ currency });
    const commRows = await comm.select('day', 'currency', 'events_count', 'commission_gross').orderBy('day', 'asc');

    const payouts = db('mv_agent_payouts_daily')
        .where({ agent_id: agentId })
        .andWhere('day', '>=', range.from)
        .andWhere('day', '<=', range.to);
    if (currency) payouts.andWhere({ currency });
    const payoutRows = await payouts.select('day', 'currency', 'payouts_count', 'payouts_net').orderBy('day', 'asc');

    return { rows, commRows, payoutRows };
}

export async function getBalances(agentId: string) {
    return db('agent_commission_balances')
        .where({ agent_id: agentId })
        .select('currency', 'available_amount', 'pending_amount', 'updated_at')
        .orderBy('currency', 'asc');
}

export async function getEvents(agentId: string, range: Range, currency?: string) {
    const q = db('agent_commission_events')
        .where({ agent_id: agentId })
        .andWhere('created_at', '>=', range.from)
        .andWhere('created_at', '<=', range.to);
    if (currency) q.andWhere({ currency });
    return q.select('event_id', 'currency', 'amount', 'source_txn_id', 'source_type', 'created_at')
        .orderBy('created_at', 'asc');
}

export async function getPayouts(agentId: string, range: Range, currency?: string) {
    const q = db('agent_payouts')
        .where({ agent_id: agentId })
        .andWhere('requested_at', '>=', range.from)
        .andWhere('requested_at', '<=', range.to);
    if (currency) q.andWhere({ currency });
    return q.select('payout_id', 'currency', 'requested_amount', 'status', 'requested_at', 'updated_at', 'provider_name', 'provider_ref')
        .orderBy('requested_at', 'asc');
}