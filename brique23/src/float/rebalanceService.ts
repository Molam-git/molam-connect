import { db } from './db';
import { v4 as uuidv4 } from 'uuid';
import { RebalancePlan } from './types';

export async function createOrders(plans: RebalancePlan[]): Promise<string[]> {
    const created: string[] = [];

    await db.tx(async t => {
        for (const p of plans) {
            const { order_uuid } = await t.one(`
        INSERT INTO float_rebalance_orders
          (order_uuid, src_account_id, dst_account_id, currency, amount, reason, sira_score, cost_estimate)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING order_uuid
      `, [uuidv4(), p.srcAccountId, p.dstAccountId, p.currency, p.amount, p.reason, p.siraScore, p.costEstimate]);

            // Réserver le montant sur src (diminuer available, augmenter reserved)
            await t.none(`
        UPDATE float_balances
           SET balance_available = balance_available - $2,
               balance_reserved  = balance_reserved + $2,
               updated_at = now()
         WHERE account_id = $1
      `, [p.srcAccountId, p.amount]);

            // Journaliser l'événement
            await t.none(`
        INSERT INTO float_events(account_id, kind, message, data)
        VALUES ($1, 'REBALANCE_CREATED', 'Rebalance order created', $2)
      `, [p.srcAccountId, JSON.stringify({
                order_uuid: order_uuid,
                amount: p.amount,
                destination: p.dstAccountId,
                reason: p.reason
            })]);

            created.push(order_uuid);
        }
    });

    return created;
}

export async function settleOrder(orderUuid: string, externalRef: string): Promise<void> {
    // appelé par le connecteur bancaire/agent une fois l'ordre exécuté
    await db.tx(async t => {
        const o = await t.one(`SELECT * FROM float_rebalance_orders WHERE order_uuid=$1 FOR UPDATE`, [orderUuid]);
        if (o.status !== 'pending' && o.status !== 'processing') return;

        await t.none(
            `UPDATE float_rebalance_orders SET status='succeeded', ext_ref=$2, updated_at=now() WHERE order_uuid=$1`,
            [orderUuid, externalRef]
        );

        // Libérer la réserve sur src, créditer dst
        await t.none(`
      UPDATE float_balances SET balance_reserved = balance_reserved - $2, updated_at=now() WHERE account_id=$1
    `, [o.src_account_id, o.amount]);

        await t.none(`
      UPDATE float_balances SET balance_available = balance_available + $2, updated_at=now() WHERE account_id=$1
    `, [o.dst_account_id, o.amount]);

        await t.none(`
      INSERT INTO float_events(account_id, kind, message, data)
      VALUES ($1,'REBALANCE_SETTLED','Order settled', $2)`,
            [o.dst_account_id, JSON.stringify({
                order_uuid: orderUuid,
                amount: o.amount,
                external_ref: externalRef
            })]
        );
    });
}

export async function failOrder(orderUuid: string, reason: string): Promise<void> {
    await db.tx(async t => {
        const o = await t.one(`SELECT * FROM float_rebalance_orders WHERE order_uuid=$1 FOR UPDATE`, [orderUuid]);
        await t.none(`UPDATE float_rebalance_orders SET status='failed', updated_at=now() WHERE order_uuid=$1`, [orderUuid]);

        // restituer la réserve sur src
        await t.none(`
      UPDATE float_balances
         SET balance_reserved = balance_reserved - $2,
             balance_available = balance_available + $2,
             updated_at = now()
       WHERE account_id = $1
    `, [o.src_account_id, o.amount]);

        await t.none(`
      INSERT INTO float_events(account_id, kind, message, data)
      VALUES ($1,'ALERT','Rebalance failed', $2)`,
            [o.src_account_id, JSON.stringify({
                order_uuid: orderUuid,
                reason: reason
            })]
        );
    });
}

export async function getOrderStatus(orderUuid: string): Promise<any> {
    return await db.one(`SELECT * FROM float_rebalance_orders WHERE order_uuid=$1`, [orderUuid]);
}