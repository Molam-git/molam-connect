import { pool } from "../db";
import ws from "./ws";
import { convertToUSD } from "./fx";
import { fetchMatchingRules, insertDashboardAlert, logDelivery } from "./rules";
import VoiceWorker from "./voice_worker";
import { sendEmail, sendWebhook, sendSms } from "./notifiers";

const voiceWorker = new VoiceWorker();

export async function processTxn(evt: any, ws: any) {
    // normalize
    const { agent_id, country, zone, amount, currency, status, fee_molam, fee_partner, occurred_at, id } = evt;

    // write realtime metric rows (txn.count, txn.amount) - lightweight
    await pool.query(
        `INSERT INTO realtime_metrics(metric_key, dimension, value, currency, ts)
     VALUES ($1,$2,$3,$4,$5)`,
        ["txn.amount", JSON.stringify({ agent_id, country, zone }), amount, currency, occurred_at]
    );
    await pool.query(
        `INSERT INTO realtime_metrics(metric_key, dimension, value, currency)
     VALUES ($1,$2,$3,$4)`,
        ["txn.count", JSON.stringify({ agent_id, country, zone, status }), 1, 'USD']
    );

    // After normal processing, run rule engine
    const rules = await fetchMatchingRules({
        metric: "txn.amount",
        country: country,
        zone: zone,
        amount: amount,
        type: 'txn'
    });

    for (const rule of rules) {
        // create alert record, link to rule.id
        const alert = await insertDashboardAlert({
            alert_type: rule.name,
            severity: rule.severity,
            payload: { evt },
            triggered_by: `aggregator:${id}`,
            rule_id: rule.id
        });

        // prepare channels based on rule.notify_channels and country_priority
        const channels = rule.notify_channels || ['webhook', 'email'];
        // country-level override
        const countryPref = rule.country_priority && rule.country_priority[country];
        // if countryPref exists and is an array, prefer that order
        const orderedChannels = (countryPref && Array.isArray(countryPref) && countryPref.length) ? countryPref : channels;

        // for each channel trigger sending and log
        for (const ch of orderedChannels) {
            try {
                if (ch === 'webhook' && rule.webhook_url) {
                    await sendWebhook(rule.webhook_url, { alert_id: alert.id, rule_id: rule.id, payload: alert.payload });
                    await logDelivery(alert.id, rule.id, 'webhook', rule.webhook_url, 'sent', {});

                } else if (ch === 'email' && rule.email_list?.length) {
                    await sendEmail(rule.email_list, `Molam Alert: ${rule.name}`, `See dashboard for alert ${alert.id}`);
                    await logDelivery(alert.id, rule.id, 'email', rule.email_list.join(','), 'sent', {});

                } else if (ch === 'sms' && evt.agent_phone) {
                    const smsRes = await sendSms(evt.agent_phone, rule.sms_template || `Alert: ${rule.name}`);
                    await logDelivery(alert.id, rule.id, 'sms', evt.agent_phone, smsRes.status, {});

                } else if (ch === 'voice' && rule.voice_template_id && evt.agent_phone) {
                    // enqueue voice worker, async but return delivery log
                    const voiceRes = await voiceWorker.enqueueCall({
                        phone: evt.agent_phone,
                        templateId: rule.voice_template_id,
                        lang: evt.lang || 'en',
                        attempt: 1,
                        metadata: { alert_id: alert.id, rule_id: rule.id }
                    });
                    await logDelivery(alert.id, rule.id, 'voice', evt.agent_phone, voiceRes.status, {});
                }
            } catch (err: any) {
                console.error("notify channel error", ch, err);
                await logDelivery(alert.id, rule.id, ch, (evt.agent_phone || rule.webhook_url || rule.email_list), 'failed', { error: err.message });
                // policy: if critical & voice failed, escalate via webhook to ops
                if (rule.severity === 'critical' && ch === 'voice') {
                    // escalate
                    if (process.env.OPS_WEBHOOK) {
                        await sendWebhook(process.env.OPS_WEBHOOK, { alert_id: alert.id, reason: 'voice_failed', original_rule: rule.id });
                    }
                }
            }
        } // end channels loop

        // send a condensed event to WS for dashboards
        ws.broadcastToRelevantClients({
            type: "alert",
            data: {
                alert_id: alert.id,
                rule_id: rule.id,
                name: rule.name,
                severity: rule.severity
            }
        }, { country: country, zone: zone });
    } // end rules loop

    // Emit to WS: we send aggregated delta to connected clients (filtered)
    const payload = {
        type: "txn_delta",
        data: { agent_id, country, zone, amount, currency, status, fee_molam }
    };
    ws.broadcastToRelevantClients(payload, { agentId: agent_id, country, zone });
}

export async function handleAgentFloat(evt: any, ws: any) {
    const { agent_id, country, zone, float_amount, currency, change_type } = evt;

    await pool.query(
        `INSERT INTO realtime_metrics(metric_key, dimension, value, currency)
     VALUES ($1,$2,$3,$4)`,
        ["float.amount", JSON.stringify({ agent_id, country, zone, change_type }), float_amount, currency]
    );

    const payload = {
        type: "float_delta",
        data: { agent_id, country, zone, float_amount, currency, change_type }
    };
    ws.broadcastToRelevantClients(payload, { agentId: agent_id, country, zone });
}

export async function handleSiraAlert(evt: any, ws: any) {
    const { signal_id, agent_id, country, zone, risk_level, description } = evt;

    const alert = await insertDashboardAlert({
        alert_type: "sira_signal",
        severity: risk_level,
        payload: { signal_id, description, agent_id, country, zone },
        triggered_by: `sira:${signal_id}`,
        rule_id: null
    });

    const payload = {
        type: "sira_alert",
        data: { alert_id: alert.id, signal_id, risk_level, description, agent_id, country, zone }
    };
    ws.broadcastToRelevantClients(payload, { agentId: agent_id, country, zone });
}