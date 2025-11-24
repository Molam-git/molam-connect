import { q } from "../db.js";
import { siraDecide } from "../core/sira.js";
import { renderTemplate } from "../core/templates.js";
import { getUserPrefs } from "../core/preferences.js";
import { checkSpamAndQuiet } from "../core/spam.js";
import type { NotificationChannel, NotificationType, NotificationPriority } from "../core/engine.js";

export interface PublishInput {
    userId: string;
    type: NotificationType;
    templateCode: string;
    variables: Record<string, any>;
    suggestedChannels?: NotificationChannel[];
    idempotencyKey?: string;
}

export async function publishNotification(input: PublishInput) {
    // Deduplication check
    if (input.idempotencyKey) {
        const { rows } = await q(
            `SELECT id FROM molam_notifications WHERE idempotency_key=$1`,
            [input.idempotencyKey]
        );
        if (rows.length) return rows[0];
    }

    const prefs = await getUserPrefs(input.userId);
    const decision = await siraDecide(input.userId, {
        type: input.type,
        suggestedChannels: input.suggestedChannels
    });

    // Anti-spam & quiet hours check
    const gate = await checkSpamAndQuiet(
        input.userId,
        input.type,
        decision.priority as NotificationPriority,
        prefs.quiet_hours
    );

    if (gate.blocked) {
        const { rows } = await q(`
      INSERT INTO molam_notifications 
      (user_id, type, template_code, template_version, channel, locale, message, priority, status, spam_reason, idempotency_key)
      VALUES ($1, $2, $3, 0, 'system', $4, '', $5, 'blocked', $6, $7) 
      RETURNING id
    `, [
            input.userId, input.type, input.templateCode, decision.locale,
            decision.priority, gate.reason, input.idempotencyKey || null
        ]);

        await q(
            `INSERT INTO notif_audit_wal (notif_id, event, details) VALUES ($1, 'blocked', jsonb_build_object('reason',$2))`,
            [rows[0].id, gate.reason]
        );

        return rows[0];
    }

    // Enqueue one record per channel (render per channel)
    const results: any[] = [];

    for (const channel of decision.channels) {
        const rendered = await renderTemplate({
            templateCode: input.templateCode,
            channel: channel as "push" | "sms" | "email" | "ussd" | "whatsapp",
            locale: decision.locale,
            variables: input.variables
        });

        const title = ["push", "email"].includes(channel) ? rendered.subject : null;

        const { rows } = await q(`
      INSERT INTO molam_notifications 
      (user_id, type, template_code, template_version, channel, locale, title, message, currency, amount, tx_id, metadata, priority, status, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'queued', $14)
      RETURNING id
    `, [
            input.userId, input.type, input.templateCode, rendered.version, channel, decision.locale,
            title, rendered.body, decision.currency, input.variables.amount || null,
            input.variables.tx_id || null, JSON.stringify(input.variables),
            decision.priority, input.idempotencyKey || null
        ]);

        await q(
            `INSERT INTO notif_audit_wal (notif_id, event, details) VALUES ($1, 'queued', '{}'::jsonb)`,
            [rows[0].id]
        );

        results.push(rows[0]);
    }

    return results;
}