// src/workers/voiceWorker.ts
import { Kafka } from "kafkajs";
import { pool } from "../db";
import fetch from "node-fetch";
import { publishKafka } from "../lib/kafka";
import { selectProviderFor } from "../lib/providerSelector";
import { loadRule } from "../lib/ruleLoader";
import { recordMetrics } from "../utils/metrics";

const kafka = new Kafka({
    clientId: "voice-worker",
    brokers: (process.env.KAFKA_BROKERS || "").split(",")
});

export async function handleMessage(evt: any) {
    const start = Date.now();

    // Charger la règle applicable
    const rule = await loadRule(evt.country, evt.region, evt.city);
    if (!rule.fallback_enabled) {
        await publishKafka("notification_events", {
            type: "voice_failed",
            reason: "fallback_disabled",
            template_id: evt.template_id,
            user_id: evt.user_id
        });
        return;
    }

    const providerRow = (await pool.query(
        "SELECT * FROM tts_providers WHERE id=$1 AND is_active=true",
        [evt.provider_id]
    )).rows[0];

    if (!providerRow) {
        await publishKafka("notification_events", {
            type: "voice_failed",
            reason: "no_provider",
            template_id: evt.template_id,
            user_id: evt.user_id
        });
        return;
    }

    try {
        const resp = await fetch(providerRow.endpoint + "/speak", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.TTS_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                phone: evt.phone,
                text: evt.text,
                lang: providerRow.supported_langs[0]
            })
        });

        const json = await resp.json().catch(() => null);
        const provider_request_id = json?.request_id || null;
        const status = resp.ok ? "sent" : "failed";
        const cost = json?.cost_usd || 0;

        await pool.query(
            `INSERT INTO notification_delivery(id, user_id, template_id, channel, provider, 
       provider_request_id, status, attempts, last_attempt_at, cost_usd, country, rule_id)
      VALUES (gen_random_uuid(), $1,$2,'voice',$3,$4,$5,1,now(),$6,$7,$8)`,
            [evt.user_id, evt.template_id, providerRow.id, provider_request_id, status, cost, evt.country, rule.id]
        );

        await publishKafka("notification_events", {
            type: status === "sent" ? "voice_sent" : "voice_failed",
            user_id: evt.user_id,
            provider_request_id,
            provider_id: providerRow.id,
            template_id: evt.template_id,
            cost_usd: cost,
            duration_ms: Date.now() - start,
            country: evt.country
        });

        recordMetrics('vocal_requests_total', { country: evt.country, status });
        recordMetrics('vocal_cost_usd_total', cost);

    } catch (err) {
        console.error("Provider call failed:", err);
        await publishKafka("notification_events", {
            type: "voice_failed",
            reason: "provider_error",
            user_id: evt.user_id
        });
    }
}

export async function runVoiceWorker() {
    const consumer = kafka.consumer({ groupId: "voice-worker-g" });
    await consumer.connect();
    await consumer.subscribe({ topic: "voice_send_requests" });
    await consumer.run({
        eachMessage: async ({ message }) => {
            const evt = JSON.parse(message.value!.toString());
            try {
                await handleMessage(evt);
            } catch (err) {
                console.error("voice worker error", err);
            }
        }
    });
}