import { Pool } from 'pg';
import { sendEmail, sendSMS, sendPush, storeInApp, sendUSSD } from './providers';
import { exponentialBackoffMs } from './worker-utils';
import { Counter, Histogram } from 'prom-client';

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const deliveries = new Counter({ name: 'notify_deliveries_total', help: 'notifications by status', labelNames: ['channel', 'status'] });
const latency = new Histogram({ name: 'notify_delivery_latency_ms', help: 'send latency', buckets: [5, 10, 50, 100, 250, 500, 1000, 2000, 5000], labelNames: ['channel'] });

export async function queueOutbox(evt: any, payloads: Array<{ channel: string; subject?: string; body: string; }>) {
    const channels = payloads.map(p => p.channel);
    const idk = evt.idempotencyKey ?? `${evt.eventKey}:${evt.userId}:${evt.renderVars?.txRef ?? Date.now()}`;
    await db.query(`
    INSERT INTO notification_outbox (event_key, user_id, payload_json, channels, idempotency_key)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (idempotency_key) DO NOTHING
  `, [evt.eventKey, evt.userId, JSON.stringify({ evt, payloads }), channels, idk]);
}

export async function runWorkerLoop() {
    while (true) {
        const { rows } = await db.query(`
      UPDATE notification_outbox
      SET status='PENDING', updated_at=NOW()
      WHERE outbox_id IN (
        SELECT outbox_id FROM notification_outbox
        WHERE status='PENDING' AND available_at <= NOW()
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 100
      )
      RETURNING *
    `);

        for (const row of rows) {
            await processOutboxRow(row).catch(async () => {
                const attempts = row.attempt_count + 1;
                const delayMs = exponentialBackoffMs(attempts, 5000, 600000);
                await db.query(`UPDATE notification_outbox SET attempt_count=$1, available_at=NOW()+$2::interval WHERE outbox_id=$3`,
                    [attempts, `${Math.floor(delayMs / 1000)} seconds`, row.outbox_id]);
                if (attempts >= row.max_attempts) {
                    await db.query(`UPDATE notification_outbox SET status='DLQ' WHERE outbox_id=$1`, [row.outbox_id]);
                }
            });
        }

        await sleep(250);
    }
}

async function processOutboxRow(row: any) {
    const payload = row.payload_json;
    const payloads = payload.payloads as Array<{ channel: string; subject?: string; body: string; }>;
    let successes = 0;

    for (const p of payloads) {
        const end = latency.startTimer({ channel: p.channel });
        try {
            let providerMsgId: string | undefined;
            switch (p.channel) {
                case 'email': providerMsgId = await sendEmail(row.user_id, p.subject ?? '', p.body); break;
                case 'sms': providerMsgId = await sendSMS(row.user_id, p.body); break;
                case 'push': providerMsgId = await sendPush(row.user_id, p.subject ?? '', p.body); break;
                case 'inapp': providerMsgId = await storeInApp(row.user_id, payload.evt.eventKey, p.subject ?? '', p.body, payload.evt.locale); break;
                case 'ussd': providerMsgId = await sendUSSD(row.user_id, p.body); break;
            }
            end();
            deliveries.inc({ channel: p.channel, status: 'SENT' });
            successes++;
            await recordDelivery(row.outbox_id, row.user_id, p.channel, providerMsgId, 'SENT');
        } catch (e: any) {
            end();
            deliveries.inc({ channel: p.channel, status: 'FAILED' });
            await recordDelivery(row.outbox_id, row.user_id, p.channel, undefined, 'FAILED', e.code, e.message);
            throw e;
        }
    }

    const status = successes === payloads.length ? 'SENT' : (successes > 0 ? 'PARTIAL' : 'FAILED');
    await db.query(`UPDATE notification_outbox SET status=$1, updated_at=NOW() WHERE outbox_id=$2`, [status, row.outbox_id]);
}

async function recordDelivery(outboxId: number, userId: string, channel: string, providerId?: string, status = 'SENT', errorCode?: string, errorMsg?: string) {
    await db.query(`
    INSERT INTO notification_delivery (outbox_id,user_id,channel,provider,provider_msg_id,status,error_code,error_message)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  `, [outboxId, userId, channel, channel, providerId ?? null, status, errorCode ?? null, errorMsg ?? null]);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }