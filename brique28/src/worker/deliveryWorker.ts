// src/worker/deliveryWorker.ts
import { pool } from "../db";
import { sendTwilioSms } from "../services/providerAdapters/twilioSms";
import { sendLocalSms } from "../services/providerAdapters/localSms";
import { publishSiraEvent } from "../services/sira";
import { computeCost, computeBackoff } from "./helpers";

interface Notification {
    id: string;
    user_id: string;
    agent_id: number;
    channel: string;
    zone_code: string;
    language: string;
    currency: string;
    payload: any;
    provider_attempts: any[];
}

interface Provider {
    id: string;
    name: string;
    channel: string;
    zone_code: string;
    priority: number;
    base_cost: number;
    currency: string;
    is_active: boolean;
    config: any;
}

async function fetchProviders(channel: string, zone_code: string): Promise<Provider[]> {
    const { rows } = await pool.query(
        `SELECT id,name,channel,zone_code,priority,base_cost,currency,is_active,config FROM notification_providers
     WHERE channel=$1 AND is_active=true AND (zone_code=$2 OR zone_code IS NULL) ORDER BY priority ASC`,
        [channel, zone_code]
    );
    return rows;
}

async function recordMetrics(
    zone_code: string,
    channel: string,
    latency_ms: number,
    cost: number,
    success: boolean
): Promise<void> {
    const updateQuery = success
        ? `INSERT INTO notification_metrics(day, zone_code, channel, sent_count, delivered_count, failed_count, avg_latency_ms, avg_cost)
       VALUES (CURRENT_DATE, $1, $2, 1, 1, 0, $3, $4)
       ON CONFLICT (day, zone_code, channel) DO UPDATE SET
          sent_count = notification_metrics.sent_count + 1,
          delivered_count = notification_metrics.delivered_count + 1,
          avg_latency_ms = ((notification_metrics.avg_latency_ms * notification_metrics.delivered_count) + $3) / (notification_metrics.delivered_count + 1),
          avg_cost = ((notification_metrics.avg_cost * notification_metrics.delivered_count) + $4) / (notification_metrics.delivered_count + 1)`
        : `INSERT INTO notification_metrics(day, zone_code, channel, sent_count, delivered_count, failed_count, avg_latency_ms, avg_cost)
       VALUES (CURRENT_DATE, $1, $2, 1, 0, 1, $3, $4)
       ON CONFLICT (day, zone_code, channel) DO UPDATE SET
          sent_count = notification_metrics.sent_count + 1,
          failed_count = notification_metrics.failed_count + 1`;

    await pool.query(updateQuery, [zone_code, channel, latency_ms, cost]);
}

export async function runOnce(): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // pick pending notifications due for send
        const { rows } = await client.query(
            `SELECT id, user_id, agent_id, channel, zone_code, language, currency, payload, provider_attempts
       FROM notifications
       WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now())
       ORDER BY priority DESC, created_at ASC
       LIMIT 20
       FOR UPDATE SKIP LOCKED`
        );

        for (const n of rows) {
            const zoneRes = await client.query(`SELECT * FROM notification_zones WHERE zone_code=$1`, [n.zone_code]);
            const zone = zoneRes.rows[0] || {
                max_retries: 5,
                max_backoff_sec: 300,
                min_fee: 0.01,
                max_fee: 5.0,
                pricing_markup_pct: 0
            };

            const providers = await fetchProviders(n.channel, n.zone_code);
            let attempts = Array.isArray(n.provider_attempts) ? n.provider_attempts.slice() : [];
            let delivered = false;

            for (const p of providers) {
                const cost = computeCost(Number(p.base_cost), zone);
                const start = Date.now();
                let result: any = { success: false, raw: null };

                try {
                    // Route by provider name: simple examples
                    if (p.name.includes("twilio")) {
                        result = await sendTwilioSms(p.config, n.payload.to, n.payload.body);
                    } else {
                        result = await sendLocalSms(p.config, n.payload.to, n.payload.body);
                    }
                } catch (err: any) {
                    result = { success: false, raw: err.message };
                }

                const latency_ms = Date.now() - start;
                attempts.push({
                    provider: p.name,
                    ts: new Date().toISOString(),
                    result: result.success ? "success" : "fail",
                    latency_ms,
                    cost,
                    raw: result.raw
                });

                await client.query(
                    `UPDATE notifications SET provider_attempts = $1, updated_at=now() WHERE id=$2`,
                    [JSON.stringify(attempts), n.id]
                );

                await client.query(
                    `INSERT INTO notification_audit(notification_id, actor, action, details) VALUES($1,$2,'send_attempt',$3)`,
                    [n.id, 'system', { provider: p.name, success: result.success, latency_ms, cost }]
                );

                if (result.success) {
                    await client.query(`UPDATE notifications SET status='delivered', updated_at=now() WHERE id=$1`, [n.id]);
                    await recordMetrics(n.zone_code, n.channel, latency_ms, cost, true);

                    // send SIRA event (async)
                    await publishSiraEvent({
                        notification_id: n.id,
                        result: 'delivered',
                        latency_ms,
                        cost,
                        provider: p.name,
                        fallback_used: attempts.length > 1
                    });

                    delivered = true;
                    break;
                } else {
                    await recordMetrics(n.zone_code, n.channel, latency_ms, cost, false);
                    // continue to next provider
                }
            }

            if (!delivered) {
                const retries = (Array.isArray(attempts) ? attempts.length : 0);
                if (retries >= (zone.max_retries || 5)) {
                    await client.query(`UPDATE notifications SET status='failed', updated_at=now() WHERE id=$1`, [n.id]);
                    await publishSiraEvent({
                        notification_id: n.id,
                        result: 'failed',
                        attempts
                    });
                    await client.query(
                        `INSERT INTO notification_audit(notification_id, actor, action, details) VALUES($1,'system','max_retries_exhausted',$2)`,
                        [n.id, { attempts }]
                    );
                } else {
                    const backoff = computeBackoff(retries, zone.max_backoff_sec || 300);
                    const nextAt = new Date(Date.now() + backoff * 1000);
                    await client.query(`UPDATE notifications SET next_attempt_at=$1, updated_at=now() WHERE id=$2`, [nextAt, n.id]);
                }
            }
        }

        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("worker error", err);
    } finally {
        client.release();
    }
}

// Simple loop runner for standalone process
if (require.main === module) {
    (async () => {
        while (true) {
            try {
                await runOnce();
            } catch (err) {
                console.error("runOnce failed", err);
            }
            // sleep 2s between batches
            await new Promise(r => setTimeout(r, 2000));
        }
    })();
}