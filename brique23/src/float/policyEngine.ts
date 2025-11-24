import { db } from './db';
import { scoreMove } from './sira';
import { RebalancePlan } from './types';

export async function computePlans(currency: string): Promise<RebalancePlan[]> {
    // 1) Lire soldes + policies
    const rows = await db.any(`
    SELECT a.id, a.kind, a.country_code, b.balance_available, b.balance_reserved,
           p.min_target, p.max_target, p.hard_floor, p.hard_ceiling, p.allow_inbound, p.allow_outbound
    FROM float_accounts a
    JOIN float_balances b ON b.account_id = a.id
    JOIN float_policies p ON p.account_id = a.id
    WHERE a.is_active = TRUE AND a.currency = $1
  `, [currency]);

    const deficits: Array<any> = [];  // comptes sous hard_floor ou sous min_target
    const surpluses: Array<any> = []; // comptes au-dessus hard_ceiling ou max_target

    for (const r of rows) {
        const avail = Number(r.balance_available) - Number(r.balance_reserved);
        if (avail < Number(r.hard_floor) || avail < Number(r.min_target)) {
            deficits.push({
                ...r,
                need: Math.max(Number(r.min_target) - avail, Number(r.hard_floor) - avail),
                current: avail
            });
        }
        if (avail > Number(r.hard_ceiling) || avail > Number(r.max_target)) {
            surpluses.push({
                ...r,
                free: avail - Math.max(Number(r.max_target), Number(r.hard_ceiling)),
                current: avail
            });
        }
    }

    // 2) Appariement glouton (greedy) avec scoring SIRA
    const plans: RebalancePlan[] = [];
    for (const d of deficits) {
        if (d.need <= 0) continue;

        // trier les surpluses par coût/ETA/risque
        const candidates = await Promise.all(
            surpluses.filter(s => s.free > 0).map(async s => {
                const cost = await estimateCost(s.id, d.id, currency);
                const eta = await estimateEta(s.id, d.id);
                const conc = await dstConcentrationRatio(d.id);
                const score = scoreMove({ cost, etaSec: eta, dstConcentration: conc });
                return { s, score, cost, eta };
            })
        );

        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        if (!best) continue;

        const amount = Math.min(d.need, best.s.free);
        if (amount <= 0) continue;

        plans.push({
            srcAccountId: best.s.id,
            dstAccountId: d.id,
            currency,
            amount: Number(amount.toFixed(2)),
            reason: 'HARD_FLOOR',
            siraScore: best.score,
            costEstimate: Number(best.cost.toFixed(2))
        });

        // mettre à jour le surplus restant localement
        best.s.free -= amount;
    }

    return plans;
}

// Estimations (stubs industriels à brancher sur B22)
async function estimateCost(srcId: number, dstId: number, currency: string): Promise<number> {
    // Exemple: coût fixe 1 + 0.05% de l'amount simulé
    return 1.0;
}

async function estimateEta(srcId: number, dstId: number): Promise<number> {
    // Exemple: 2h par défaut; real impl: rail SLA (B22.partner_bank_routes.sla_seconds)
    return 7200;
}

async function dstConcentrationRatio(dstId: number): Promise<number> {
    // % du float total dans ce compte (risque concentration)
    const { total } = await db.one(`SELECT SUM(balance_available) AS total FROM float_balances`);
    const { bal } = await db.one(`SELECT balance_available AS bal FROM float_balances WHERE account_id=$1`, [dstId]);
    return Number(bal) / Number(total || 1);
}