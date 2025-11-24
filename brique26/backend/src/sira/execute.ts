import { Pool } from "pg";
import { publishEvent } from "../utils/kafka";

export async function executePlan(pool: Pool, planId: string) {
    const { rows: orders } = await pool.query(
        `SELECT ft.id, ft.from_entity_id, ft.to_entity_id, ft.amount, ft.currency,
            fe_from.entity_type AS from_type, fe_to.entity_type AS to_type
     FROM float_transfers ft
     JOIN float_entities fe_from ON fe_from.id=ft.from_entity_id
     JOIN float_entities fe_to   ON fe_to.id=ft.to_entity_id
     WHERE ft.plan_id=$1 AND ft.status='planned'`, [planId]
    );

    for (const o of orders) {
        // Choix d'acheminement selon types
        if (o.from_type === 'bank' && o.to_type === 'agent') {
            await publishEvent("sira_bank_to_agent_replenish", {
                order_id: o.id,
                amount: o.amount,
                currency: o.currency
            });
        } else if (o.from_type === 'agent' && o.to_type === 'bank') {
            await publishEvent("sira_agent_collection", {
                order_id: o.id,
                amount: o.amount,
                currency: o.currency
            });
        } else {
            await publishEvent("sira_internal_rebalance", {
                order_id: o.id,
                amount: o.amount,
                currency: o.currency
            });
        }

        await pool.query(
            `UPDATE float_transfers SET status='sent', updated_at=now() WHERE id=$1`,
            [o.id]
        );
    }

    return { executed: orders.length };
}