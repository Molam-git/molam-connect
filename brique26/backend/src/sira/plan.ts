import { Pool } from "pg";

export async function buildPlan(pool: Pool, country: string, currency: string, horizonMin: number) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1) Charger positions + règles
        const { rows: ents } = await client.query(`
      SELECT e.id, e.entity_type, e.display_name,
             p.available, r.min_level, r.target_level, r.max_level, r.lead_minutes
      FROM float_entities e
      JOIN LATERAL (
        SELECT available FROM float_positions fp
        WHERE fp.entity_id=e.id ORDER BY as_of DESC LIMIT 1
      ) p ON TRUE
      LEFT JOIN float_rules r ON r.entity_id=e.id
      WHERE e.status='active' AND e.country=$1 AND e.currency=$2
    `, [country, currency]);

        const deficits: any[] = [];
        const surpluses: any[] = [];

        for (const x of ents) {
            const available = parseFloat(x.available);
            const minLevel = parseFloat(x.min_level) || 0;
            const targetLevel = parseFloat(x.target_level) || 0;
            const maxLevel = parseFloat(x.max_level) || Infinity;

            if (available < minLevel) {
                deficits.push({
                    ...x,
                    need: targetLevel - available
                });
            }
            if (available > maxLevel) {
                surpluses.push({
                    ...x,
                    free: available - targetLevel
                });
            }
        }

        // 2) Appariement glouton (coût par type : bank->agent préféré)
        const orders: any[] = [];
        deficits.sort((a, b) => b.need - a.need);
        surpluses.sort((a, b) => b.free - a.free);

        for (const d of deficits) {
            let need = Number(d.need);
            for (const s of surpluses) {
                if (need <= 0) break;
                if (s.free <= 0) continue;
                const xfer = Math.min(need, Number(s.free));
                orders.push({ from: s.id, to: d.id, amount: round2(xfer), currency });
                s.free -= xfer;
                need -= xfer;
            }
        }

        // 3) Créer plan + ordres
        const { rows: planRow } = await client.query(`SELECT gen_random_uuid() AS id`);
        const planId = planRow[0].id as string;

        for (const o of orders) {
            await client.query(`
        INSERT INTO float_transfers(plan_id, from_entity_id, to_entity_id, amount, currency, reason, eta_minutes)
        VALUES($1,$2,$3,$4,$5,'replenish',60)
      `, [planId, o.from, o.to, o.amount, currency]);
        }

        await client.query("COMMIT");
        return { plan_id: planId, order_count: orders.length };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

function round2(n: number) {
    return Math.round(n * 100) / 100;
}