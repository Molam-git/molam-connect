import { db } from '../utils/db';
import { verifyHmac } from '../utils/hmac';
import { postLedger } from '../utils/ledger';
import { emitAudit } from '../utils/audit';

export async function bankWebhook(req: any, res: any) {
    const sig = req.headers['x-bank-signature'];
    if (!verifyHmac(req.rawBody, sig, process.env.BANK_WEBHOOK_SECRET!)) {
        return res.status(401).send('bad signature');
    }
    const { orderUuid, status, externalRef } = req.body;

    await db.tx(async t => {
        const o = await t.one(`SELECT * FROM bank_transfer_orders WHERE order_uuid=$1 FOR UPDATE`, [orderUuid]);
        if (o.status !== 'pending' && o.status !== 'processing') return res.status(200).send('ignored');

        if (status === 'succeeded') {
            await t.none(`UPDATE bank_transfer_orders SET status='succeeded', external_ref=$2, updated_at=now() WHERE order_uuid=$1`, [orderUuid, externalRef]);

            if (o.direction === 'deposit') {
                await postLedger(t, {
                    walletId: o.wallet_id,
                    currency: o.currency,
                    amount: o.amount_net,        // credit NET amount
                    type: 'BANK_DEPOSIT_SETTLE',
                    meta: { orderUuid, fees: { total: o.fee_total } }
                });
            }
        } else if (status === 'failed') {
            await t.none(`UPDATE bank_transfer_orders SET status='failed', reason_code=$2, updated_at=now() WHERE order_uuid=$1`, [orderUuid, 'BANK_FAILURE']);
            if (o.direction === 'withdraw') {
                // refund user (amount + fees) since it failed
                await postLedger(t, {
                    walletId: o.wallet_id,
                    currency: o.currency,
                    amount: (o.amount + o.fee_total),
                    type: 'BANK_WITHDRAW_REFUND',
                    meta: { orderUuid }
                });
            }
        }

        await emitAudit(t, {
            actorUserId: o.user_id,
            action: 'BANK_INTEROP_WEBHOOK',
            target: { type: 'bank_order', id: o.id },
            data: { status, externalRef }
        });
    });

    res.status(200).send('ok');
}