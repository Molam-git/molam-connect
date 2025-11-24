import { q } from "../db.js";
import { NotificationMetrics } from "../metrics.js";

export interface WebhookPayload {
    notificationId: string;
    userId: string;
    type: string;
    channel: string;
    status: string;
    message: string;
    title?: string;
    sentAt?: string;
    metadata?: Record<string, any>;
}

export interface WebhookConfig {
    url: string;
    secret: string;
    events: string[]; // 'sent', 'failed', 'delivered', etc.
    timeoutMs?: number;
    retryAttempts?: number;
}

export class OutboundWebhookService {
    private static webhookConfigs: Map<string, WebhookConfig> = new Map();

    static async registerWebhook(service: string, config: WebhookConfig) {
        this.webhookConfigs.set(service, config);
        console.log(`Webhook registered for service: ${service}`);
    }

    static async notifyWebhooks(notificationId: string, event: string) {
        // Get notification details
        const { rows } = await q(`
      SELECT n.*, u.external_id as user_external_id
      FROM molam_notifications n
      LEFT JOIN molam_users u ON n.user_id = u.id
      WHERE n.id = $1
    `, [notificationId]);

        if (!rows.length) {
            console.warn(`Notification ${notificationId} not found for webhook`);
            return;
        }

        const notification = rows[0];
        const payload: WebhookPayload = {
            notificationId: notification.id,
            userId: notification.user_external_id || notification.user_id,
            type: notification.type,
            channel: notification.channel,
            status: event,
            message: notification.message,
            title: notification.title || undefined,
            sentAt: notification.sent_at ? notification.sent_at.toISOString() : undefined,
            metadata: notification.metadata || {}
        };

        // Notify all registered webhooks that are interested in this event
        for (const [service, config] of this.webhookConfigs.entries()) {
            if (config.events.includes(event)) {
                await this.sendWebhook(service, config, payload, event);
            }
        }
    }

    private static async sendWebhook(
        service: string,
        config: WebhookConfig,
        payload: WebhookPayload,
        event: string
    ) {
        const timeout = config.timeoutMs || 5000;
        const maxRetries = config.retryAttempts || 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                const response = await fetch(config.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'MolamPay-Notifier/1.0',
                        'X-Molam-Signature': await this.generateSignature(payload, config.secret),
                        'X-Molam-Event': event,
                        'X-Molam-Delivery-Id': `${Notification}-${Date.now()}`,
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    console.log(`Webhook to ${service} successful for event ${event}`);
                    await this.recordWebhookDelivery(service, payload.notificationId, event, true);
                    NotificationMetrics.recordSent('webhook', event);
                    return;
                } else {
                    console.warn(`Webhook to ${service} failed with status ${response.status}`);
                    if (attempt === maxRetries) {
                        await this.recordWebhookDelivery(service, payload.notificationId, event, false, `HTTP ${response.status}`);
                        NotificationMetrics.recordFailed('webhook', event);
                    }
                }
            } catch (error: any) {
                console.error(`Webhook to ${service} attempt ${attempt} failed:`, error);

                if (attempt === maxRetries) {
                    await this.recordWebhookDelivery(service, payload.notificationId, event, false, error.message);
                    NotificationMetrics.recordFailed('webhook', event);
                }

                // Exponential backoff
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                }
            }
        }
    }

    private static async generateSignature(payload: WebhookPayload, secret: string): Promise<string> {
        // Simple HMAC signature for webhook verification
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(payload));
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', key, data);
        return Array.from(new Uint8Array(signature))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    private static async recordWebhookDelivery(
        service: string,
        notificationId: string,
        event: string,
        success: boolean,
        error?: string
    ) {
        await q(`
      INSERT INTO notif_audit_wal (notif_id, event, details)
      VALUES ($1, $2, $3::jsonb)
    `, [
            notificationId,
            success ? 'webhook_delivered' : 'webhook_failed',
            JSON.stringify({
                service,
                event,
                success,
                error: error || null,
                timestamp: new Date().toISOString()
            })
        ]);
    }

    // API endpoints for webhook management
    static async getWebhookEndpoints(): Promise<Map<string, WebhookConfig>> {
        return new Map(this.webhookConfigs);
    }

    static async updateWebhook(service: string, config: Partial<WebhookConfig>): Promise<boolean> {
        const existing = this.webhookConfigs.get(service);
        if (!existing) return false;

        this.webhookConfigs.set(service, { ...existing, ...config });
        return true;
    }

    static async removeWebhook(service: string): Promise<boolean> {
        return this.webhookConfigs.delete(service);
    }
}

// Initialize with some default webhooks from environment
export async function initializeWebhooks() {
    const webhookConfigs = process.env.WEBHOOK_CONFIGS;
    if (webhookConfigs) {
        try {
            const configs = JSON.parse(webhookConfigs);
            for (const [service, config] of Object.entries(configs)) {
                await OutboundWebhookService.registerWebhook(service, config as WebhookConfig);
            }
            console.log(`Initialized ${Object.keys(configs).length} webhook configurations`);
        } catch (error) {
            console.error('Failed to parse webhook configurations:', error);
        }
    }
}