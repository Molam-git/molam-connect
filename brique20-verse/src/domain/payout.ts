import { db } from '../db/knex.js';
import { v4 as uuid } from 'uuid';
import { scoreCycleRisk } from './sira.js';
import { sendPayout } from './provider.js';

export async function upsertPreference(agentId: string, currency: string, payload: {
    frequency: 'WEEKLY' | 'MONTHLY',
    min_payout_threshold?: number,
    auto_withhold?: boolean
}) {
    const exists = await db('agent_payout_preferences').where({ agent_id: agentId, currency }).first();
    if (exists) {
        await db('agent_payout_preferences')
            .update({
                frequency: payload.frequency,
                min_payout_threshold: payload.min_payout_threshold ?? exists.min_payout_threshold,
                auto_withhold: payload.auto_withhold ?? exists.auto_withhold
            })
            .where({ agent_id: agentId, currency });
    } else {
        await db('agent_payout_preferences').insert({
            agent_id: agentId,
            currency,
            frequency: payload.frequency,
            min_payout_threshold: payload.min_payout_threshold ?? 10,
            auto_withhold: payload.auto_withhold ?? false
        });
    }
}

export async function preview(agentId: string, currency: string, periodStart: string, periodEnd: string) {
    const events = await db('agent_commission_events')
        .where({ agent_id: agentId, currency })
        .andWhere('created_at', '>=', periodStart)
        .andWhere('created_at', '<=', periodEnd)
        .andWhere({ accounted: false })
        .select(['event_id', 'amount', 'source_txn_id', 'source_type', 'created_at']);
    const gross = events.reduce((s: number, e: any) => s + Number(e.amount), 0);
    const fees = 0;
    const net = Math.max(0, gross - fees);
    return { events, gross, fees, net };
}

export async function createCycleForPeriod(agentId: string, currency: string, frequency: 'WEEKLY' | 'MONTHLY', periodStart: string, periodEnd: string) {
    const pref = await db('agent_payout_preferences').where({ agent_id: agentId, currency }).first();
    const threshold = pref?.min_payout_threshold ?? 10;

    const { events, gross, fees, net } = await preview(agentId, currency, periodStart, periodEnd);
    if (net < threshold) {
        return { created: false, reason: 'BELOW_THRESHOLD', net };
    }

    const cycleId = uuid();
    await db.transaction(async trx => {
        await trx('agent_payout_cycles').insert({
            cycle_id: cycleId, agent_id: agentId, currency, frequency,
            period_start: periodStart, period_end: periodEnd,
            total_events: events.length, gross_amount: gross, fees_amount: fees, net_amount: net,
            status: 'DRAFT'
        });

        for (const ev of events) {
            await trx('agent_payout_items').insert({
                item_id: uuid(),
                cycle_id: cycleId,
                event_id: ev.event_id,
                amount: ev.amount
            });
            await trx('agent_commission_events').where({ event_id: ev.event_id }).update({ accounted: true });
        }

        const bal = await trx('agent_commission_balances').where({ agent_id: agentId, currency }).first();
        if (!bal) {
            await trx('agent_commission_balances').insert({
                agent_id: agentId, currency, available_amount: 0, pending_amount: net
            });
        } else {
            await trx('agent_commission_balances')
                .update({
                    available_amount: Number(bal.available_amount) - net,
                    pending_amount: Number(bal.pending_amount) + net,
                    updated_at: trx.fn.now()
                })
                .where({ agent_id: agentId, currency });
        }
    });

    const risk = await scoreCycleRisk({ agentId, currency, gross, events: events.length });
    let status = 'READY';
    if (risk >= 60 || (pref?.auto_withhold ?? false)) status = 'ON_HOLD';
    await db('agent_payout_cycles').update({ sira_risk_score: risk, status }).where({ cycle_id: cycleId });
    return { created: true, cycleId, status, risk, net };
}

export async function executePayout(cycleId: string, idempotencyKey: string) {
    const cycle = await db('agent_payout_cycles').where({ cycle_id: cycleId }).first();
    if (!cycle) throw new Error('CYCLE_NOT_FOUND');
    if (!['READY'].includes(cycle.status)) throw new Error('CYCLE_NOT_READY');

    const agent = await db('molam_agents').where({ agent_id: cycle.agent_id }).first();
    const profile = await db('agent_bank_profiles').where({ agent_id: cycle.agent_id, currency: cycle.currency }).first();
    if (!profile || !profile.is_verified) throw new Error('DESTINATION_NOT_VERIFIED');

    const dest = {
        payout_channel: profile.payout_channel,
        bank_name: profile.bank_name,
        bank_account_no: profile.bank_account_no,
        bank_swift: profile.bank_swift,
        wallet_provider: profile.wallet_provider,
        wallet_msisdn: profile.wallet_msisdn
    };

    const payoutId = uuid();
    await db('agent_payouts').insert({
        payout_id: payoutId,
        cycle_id: cycleId,
        agent_id: cycle.agent_id,
        currency: cycle.currency,
        destination: dest,
        requested_amount: cycle.net_amount,
        status: 'REQUESTED',
        provider_name: null,
        provider_ref: null,
        idempotency_key: idempotencyKey
    });
    await db('agent_payout_cycles').update({ status: 'PROCESSING' }).where({ cycle_id: cycleId });

    const { providerRef } = await sendPayout({
        payoutId,
        amount: String(cycle.net_amount),
        currency: cycle.currency,
        destination: dest
    });

    await db('agent_payouts').update({ status: 'SENT', provider_name: 'BANK_MTLS', provider_ref: providerRef }).where({ payout_id: payoutId });
    return { payoutId, providerRef };
}

export async function reconcileProviderWebhook(payload: any) {
    const payout = await db('agent_payouts').where({ payout_id: payload.payoutId }).first();
    if (!payout) throw new Error('PAYOUT_NOT_FOUND');

    if (payload.status === 'CONFIRMED') {
        await db.transaction(async trx => {
            await trx('agent_payouts').update({ status: 'CONFIRMED', updated_at: trx.fn.now() }).where({ payout_id: payout.payout_id });
            await trx('agent_payout_cycles').update({ status: 'PAID', updated_at: trx.fn.now() }).where({ cycle_id: payout.cycle_id });

            const cyc = await trx('agent_payout_cycles').where({ cycle_id: payout.cycle_id }).first();
            const bal = await trx('agent_commission_balances').where({ agent_id: payout.agent_id, currency: payout.currency }).first();
            await trx('agent_commission_balances')
                .update({
                    pending_amount: Number(bal.pending_amount) - Number(cyc.net_amount),
                    updated_at: trx.fn.now()
                })
                .where({ agent_id: payout.agent_id, currency: payout.currency });
        });
    } else if (payload.status === 'FAILED') {
        await db.transaction(async trx => {
            await trx('agent_payouts').update({ status: 'FAILED', updated_at: trx.fn.now() }).where({ payout_id: payout.payout_id });
            await trx('agent_payout_cycles').update({ status: 'REJECTED', updated_at: trx.fn.now() }).where({ cycle_id: payout.cycle_id });

            const cyc = await trx('agent_payout_cycles').where({ cycle_id: payout.cycle_id }).first();
            const bal = await trx('agent_commission_balances').where({ agent_id: payout.agent_id, currency: payout.currency }).first();
            await trx('agent_commission_balances')
                .update({
                    available_amount: Number(bal.available_amount) + Number(cyc.net_amount),
                    pending_amount: Number(bal.pending_amount) - Number(cyc.net_amount),
                    updated_at: trx.fn.now()
                })
                .where({ agent_id: payout.agent_id, currency: payout.currency });
        });
    }
}