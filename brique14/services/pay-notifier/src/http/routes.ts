import { Router } from "express";
import { requireScopes } from "../security/auth.js";
import { q } from "../db.js";
import { publishNotification } from "../queue/publisher.js";
import { OutboundWebhookService } from "../webhooks/outbound.js";

export const router = Router();

// Helper function to safely handle errors
function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function getErrorDetails(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
        return {
            message: error.message,
            stack: error.stack
        };
    }
    return {
        message: String(error)
    };
}

// List last notifications for current user
router.get("/list", requireScopes(["pay:notif:read"]), async (req, res) => {
    try {
        const userId = (req as any).user.sub;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

        const { rows } = await q(
            `SELECT id, type, channel, locale, title, message, priority, status, sent_at, created_at
       FROM molam_notifications 
       WHERE user_id=$1 
       ORDER BY created_at DESC 
       LIMIT $2`,
            [userId, limit]
        );

        res.json(rows);
    } catch (error) {
        console.error("List notifications error:", error);
        res.status(500).json({ error: "internal_server_error" });
    }
});

// Publish notification (async)
router.post("/publish", requireScopes(["pay:notif:send"]), async (req, res) => {
    try {
        const {
            user_id,
            type,
            template_code,
            variables,
            suggested_channels,
            idempotency_key,
            priority
        } = req.body;

        if (!user_id || !template_code) {
            return res.status(400).json({ error: "missing_required_fields", details: "user_id and template_code are required" });
        }

        // Validate channels if provided
        if (suggested_channels) {
            const validChannels = ["push", "sms", "email", "ussd", "whatsapp"];
            const invalidChannels = suggested_channels.filter((ch: string) => !validChannels.includes(ch));
            if (invalidChannels.length > 0) {
                return res.status(400).json({
                    error: "invalid_channels",
                    details: `Invalid channels: ${invalidChannels.join(', ')}. Valid channels are: ${validChannels.join(', ')}`
                });
            }
        }

        const result = await publishNotification({
            userId: user_id,
            type: type || "system",
            templateCode: template_code,
            variables: variables || {},
            suggestedChannels: suggested_channels,
            idempotencyKey: idempotency_key
        });

        res.status(202).json({
            queued: result,
            message: "Notification queued for processing"
        });
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        console.error("Publish notification error:", error);

        if (errorMessage.includes("template_not_found")) {
            return res.status(404).json({ error: "template_not_found", details: errorMessage });
        }

        if (errorMessage.includes("spam_blocked") || errorMessage.includes("rate_limit")) {
            return res.status(429).json({ error: "rate_limited", details: "Notification blocked by spam protection" });
        }

        res.status(500).json({ error: "internal_server_error", details: errorMessage });
    }
});

// Get notification details by ID
router.get("/:id", requireScopes(["pay:notif:read"]), async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = (req as any).user.sub;

        const { rows } = await q(
            `SELECT id, type, channel, locale, title, message, priority, status, 
              currency, amount, tx_id, metadata, spam_reason, retries, 
              sent_at, created_at
       FROM molam_notifications 
       WHERE id=$1 AND user_id=$2`,
            [notificationId, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ error: "notification_not_found" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Get notification error:", error);
        res.status(500).json({ error: "internal_server_error" });
    }
});

// Admin: create/update template
router.post("/templates", requireScopes(["pay:notif:admin"]), async (req, res) => {
    try {
        const { code, channel, subject, body, variables, is_active } = req.body;

        if (!code || !channel || !body) {
            return res.status(400).json({
                error: "missing_required_fields",
                details: "code, channel, and body are required"
            });
        }

        // Validate channel
        const validChannels = ["push", "sms", "email", "ussd", "whatsapp"];
        if (!validChannels.includes(channel)) {
            return res.status(400).json({
                error: "invalid_channel",
                details: `Invalid channel: ${channel}. Valid channels are: ${validChannels.join(', ')}`
            });
        }

        const { rows } = await q(
            `INSERT INTO notification_templates (code, channel, subject, body, variables, is_active, version)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, COALESCE(
          (SELECT max(version) + 1 FROM notification_templates WHERE code=$1 AND channel=$2), 1
       ))
       RETURNING id, version, code, channel, is_active, created_at`,
            [code, channel, subject || null, body, variables || [], is_active !== false]
        );

        res.status(201).json(rows[0]);
    } catch (error) {
        const errorDetails = getErrorDetails(error);
        console.error("Create template error:", error);

        if (errorDetails.message.includes('unique constraint') || errorDetails.message.includes('23505')) {
            return res.status(409).json({ error: "template_already_exists" });
        }

        res.status(500).json({ error: "internal_server_error", details: errorDetails.message });
    }
});

// Get template by code and channel
router.get("/templates/:code/:channel", requireScopes(["pay:notif:read"]), async (req, res) => {
    try {
        const { code, channel } = req.params;

        const { rows } = await q(
            `SELECT id, code, channel, subject, body, variables, version, is_active, created_at
       FROM notification_templates 
       WHERE code=$1 AND channel=$2 AND is_active=true
       ORDER BY version DESC 
       LIMIT 1`,
            [code, channel]
        );

        if (!rows.length) {
            return res.status(404).json({ error: "template_not_found" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Get template error:", error);
        res.status(500).json({ error: "internal_server_error" });
    }
});

// List all templates (admin)
router.get("/templates", requireScopes(["pay:notif:admin"]), async (req, res) => {
    try {
        const { channel, active } = req.query;

        let query = `
      SELECT DISTINCT ON (code, channel) 
        id, code, channel, subject, body, variables, version, is_active, created_at
      FROM notification_templates
    `;
        const params: any[] = [];

        if (channel || active !== undefined) {
            query += ` WHERE `;
            const conditions = [];

            if (channel) {
                params.push(channel);
                conditions.push(`channel = $${params.length}`);
            }

            if (active !== undefined) {
                params.push(active === 'true');
                conditions.push(`is_active = $${params.length}`);
            }

            query += conditions.join(' AND ');
        }

        query += ` ORDER BY code, channel, version DESC`;

        const { rows } = await q(query, params);
        res.json(rows);
    } catch (error) {
        console.error("List templates error:", error);
        res.status(500).json({ error: "internal_server_error" });
    }
});

// Update user notification preferences
router.put("/preferences", requireScopes(["pay:notif:read"]), async (req, res) => {
    try {
        const userId = (req as any).user.sub;
        const {
            lang,
            currency,
            country_code,
            channels,
            marketing_opt_in,
            quiet_hours
        } = req.body;

        const { rows } = await q(
            `INSERT INTO user_notification_prefs 
       (user_id, lang, currency, country_code, channels, marketing_opt_in, quiet_hours, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, now())
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         lang = EXCLUDED.lang,
         currency = EXCLUDED.currency,
         country_code = EXCLUDED.country_code,
         channels = EXCLUDED.channels,
         marketing_opt_in = EXCLUDED.marketing_opt_in,
         quiet_hours = EXCLUDED.quiet_hours,
         updated_at = now()
       RETURNING *`,
            [
                userId,
                lang || 'en',
                currency || 'USD',
                country_code,
                JSON.stringify(channels || {}),
                marketing_opt_in || false,
                JSON.stringify(quiet_hours || { start: "22:00", end: "07:00" })
            ]
        );

        res.json(rows[0]);
    } catch (error) {
        console.error("Update preferences error:", error);
        res.status(500).json({ error: "internal_server_error" });
    }
});

// Get user notification preferences
router.get("/preferences", requireScopes(["pay:notif:read"]), async (req, res) => {
    try {
        const userId = (req as any).user.sub;

        const { rows } = await q(
            `SELECT lang, currency, country_code, channels, marketing_opt_in, quiet_hours, updated_at
       FROM user_notification_prefs 
       WHERE user_id=$1`,
            [userId]
        );

        if (rows.length) {
            res.json(rows[0]);
        } else {
            // Return default preferences if not set
            res.json({
                lang: "en",
                currency: "USD",
                channels: { push: true, sms: true, email: true, ussd: false, whatsapp: false },
                marketing_opt_in: false,
                quiet_hours: { start: "22:00", end: "07:00" }
            });
        }
    } catch (error) {
        console.error("Get preferences error:", error);
        res.status(500).json({ error: "internal_server_error" });
    }
});

// Webhook management endpoints (admin only)

// List all registered webhooks
router.get("/webhooks", requireScopes(["pay:notif:admin"]), async (req, res) => {
    try {
        const webhooks = await OutboundWebhookService.getWebhookEndpoints();
        const result = Object.fromEntries(webhooks);
        res.json(result);
    } catch (error) {
        console.error("Get webhooks error:", error);
        res.status(500).json({ error: "internal_server_error" });
    }
});

// Register a new webhook
router.post("/webhooks/:service", requireScopes(["pay:notif:admin"]), async (req, res) => {
    try {
        const { service } = req.params;
        const { url, secret, events, timeout_ms, retry_attempts } = req.body;

        if (!url || !secret || !events) {
            return res.status(400).json({
                error: "missing_required_fields",
                details: "url, secret, and events are required"
            });
        }

        const config = {
            url,
            secret,
            events,
            timeoutMs: timeout_ms || 5000,
            retryAttempts: retry_attempts || 3
        };

        await OutboundWebhookService.registerWebhook(service, config);
        res.status(201).json({
            status: "registered",
            service,
            config
        });
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        console.error("Register webhook error:", error);
        res.status(500).json({ error: "internal_server_error", details: errorMessage });
    }
});

// Update an existing webhook
router.put("/webhooks/:service", requireScopes(["pay:notif:admin"]), async (req, res) => {
    try {
        const { service } = req.params;
        const { url, secret, events, timeout_ms, retry_attempts } = req.body;

        const updates: any = {};
        if (url) updates.url = url;
        if (secret) updates.secret = secret;
        if (events) updates.events = events;
        if (timeout_ms !== undefined) updates.timeoutMs = timeout_ms;
        if (retry_attempts !== undefined) updates.retryAttempts = retry_attempts;

        const success = await OutboundWebhookService.updateWebhook(service, updates);

        if (success) {
            res.json({ status: "updated", service });
        } else {
            res.status(404).json({ error: "webhook_not_found" });
        }
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        console.error("Update webhook error:", error);
        res.status(500).json({ error: "internal_server_error", details: errorMessage });
    }
});

// Remove a webhook
router.delete("/webhooks/:service", requireScopes(["pay:notif:admin"]), async (req, res) => {
    try {
        const { service } = req.params;
        const success = await OutboundWebhookService.removeWebhook(service);

        if (success) {
            res.json({ status: "removed", service });
        } else {
            res.status(404).json({ error: "webhook_not_found" });
        }
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        console.error("Remove webhook error:", error);
        res.status(500).json({ error: "internal_server_error", details: errorMessage });
    }
});

// Get notification statistics (admin)
router.get("/stats/overview", requireScopes(["pay:notif:admin"]), async (req, res) => {
    try {
        const { period = '24h' } = req.query; // 24h, 7d, 30d

        let interval = '1 day';
        if (period === '7d') interval = '7 days';
        if (period === '30d') interval = '30 days';

        const { rows } = await q(
            `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'queued') as queued,
        COUNT(*) FILTER (WHERE status = 'blocked') as blocked,
        COUNT(*) FILTER (WHERE created_at >= now() - interval $1) as recent_total,
        channel,
        type
       FROM molam_notifications
       WHERE created_at >= now() - interval $1
       GROUP BY channel, type
       ORDER BY channel, type`,
            [interval]
        );

        res.json(rows);
    } catch (error) {
        console.error("Get stats error:", error);
        res.status(500).json({ error: "internal_server_error" });
    }
});

// Get audit trail for a notification
router.get("/:id/audit", requireScopes(["pay:notif:read"]), async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = (req as any).user.sub;

        // Verify the notification belongs to the user (or user is admin)
        const { rows: notifRows } = await q(
            `SELECT id FROM molam_notifications WHERE id=$1 AND user_id=$2`,
            [notificationId, userId]
        );

        if (!notifRows.length) {
            return res.status(404).json({ error: "notification_not_found" });
        }

        const { rows } = await q(
            `SELECT seq, event, details, at
       FROM notif_audit_wal
       WHERE notif_id=$1
       ORDER BY seq ASC`,
            [notificationId]
        );

        res.json(rows);
    } catch (error) {
        console.error("Get audit trail error:", error);
        res.status(500).json({ error: "internal_server_error" });
    }
});

// Health check endpoint for notification service
router.get("/health/detailed", requireScopes(["pay:notif:read"]), async (req, res) => {
    try {
        // Check database connection
        await q('SELECT 1');

        // Get queue status
        const { rows: queueStats } = await q(`
      SELECT 
        status,
        COUNT(*) as count
      FROM molam_notifications 
      WHERE created_at >= now() - interval '1 hour'
      GROUP BY status
    `);

        // Get template count
        const { rows: templateStats } = await q(`
      SELECT 
        COUNT(DISTINCT code) as unique_templates,
        COUNT(*) as total_versions
      FROM notification_templates 
      WHERE is_active = true
    `);

        res.json({
            status: "healthy",
            database: "connected",
            queue: Object.fromEntries(queueStats.map(row => [row.status, parseInt(row.count)])),
            templates: {
                unique: parseInt(templateStats[0]?.unique_templates || 0),
                versions: parseInt(templateStats[0]?.total_versions || 0)
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        console.error("Health check error:", error);
        res.status(503).json({
            status: "unhealthy",
            database: "disconnected",
            error: errorMessage,
            timestamp: new Date().toISOString()
        });
    }
});

export default router;