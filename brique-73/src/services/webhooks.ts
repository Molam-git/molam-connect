/**
 * Webhooks Service - Management & Delivery
 * Brique 73 - Industrial Version
 */

import { pool, transaction } from '../db';
import crypto from 'crypto';
import axios from 'axios';
import { encryptWithVault, decryptWithVault, generateWebhookSecret } from '../utils/secrets';

// ========================================
// Types
// ========================================

export interface CreateWebhookRequest {
  appId: string;
  tenantType: 'merchant' | 'partner' | 'internal';
  tenantId: string;
  url: string;
  eventTypes: string[];
  description?: string;
  customHeaders?: Record<string, string>;
  createdBy?: string;
}

export interface Webhook {
  id: string;
  appId: string;
  tenantType: string;
  tenantId: string;
  url: string;
  secret: string;
  enabled: boolean;
  eventTypes: string[];
  retryConfig: RetryConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetryConfig {
  maxAttempts: number;
  backoff: 'exponential' | 'linear';
  initialDelayMs: number;
  maxDelayMs: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  eventId?: string;
  payload: any;
  signature: string;
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
  attempts: number;
  responseCode?: number;
  responseBody?: string;
  latencyMs?: number;
  createdAt: Date;
}

// ========================================
// Create Webhook
// ========================================

export async function createWebhook(request: CreateWebhookRequest): Promise<Webhook> {
  return await transaction(async (client) => {
    // Validate URL
    if (!request.url.startsWith('https://') && !request.url.startsWith('http://')) {
      throw new Error('Webhook URL must use HTTP or HTTPS');
    }

    // Validate app exists
    const appCheck = await client.query(
      `SELECT id FROM dev_apps WHERE id = $1 AND status = 'active'`,
      [request.appId]
    );

    if (appCheck.rows.length === 0) {
      throw new Error('App not found or inactive');
    }

    // Validate event types
    const eventCheck = await client.query(
      `SELECT event_type FROM webhook_events WHERE event_type = ANY($1) AND enabled = TRUE`,
      [request.eventTypes]
    );

    const validEvents = eventCheck.rows.map(r => r.event_type);
    const invalidEvents = request.eventTypes.filter(e => !validEvents.includes(e));

    if (invalidEvents.length > 0) {
      throw new Error(`Invalid event types: ${invalidEvents.join(', ')}`);
    }

    // Generate secret
    const secret = generateWebhookSecret();
    const encryptedSecret = await encryptWithVault(secret);

    // Insert webhook
    const result = await client.query(
      `INSERT INTO webhooks (
        app_id, tenant_type, tenant_id, url, secret, event_types,
        description, custom_headers, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id, app_id, tenant_type, tenant_id, url, enabled, event_types, retry_config, created_at, updated_at`,
      [
        request.appId,
        request.tenantType,
        request.tenantId,
        request.url,
        encryptedSecret,
        request.eventTypes,
        request.description || null,
        request.customHeaders ? JSON.stringify(request.customHeaders) : null,
        request.createdBy || null,
      ]
    );

    const row = result.rows[0];

    console.log('Webhook created', {
      webhookId: row.id,
      url: request.url,
      eventTypes: request.eventTypes,
    });

    return {
      id: row.id,
      appId: row.app_id,
      tenantType: row.tenant_type,
      tenantId: row.tenant_id,
      url: row.url,
      secret, // Return secret ONCE (like API keys)
      enabled: row.enabled,
      eventTypes: row.event_types,
      retryConfig: row.retry_config,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

// ========================================
// Sign Webhook Payload
// ========================================

export function signWebhookPayload(payload: any, secret: string, timestamp: number): string {
  const payloadString = JSON.stringify(payload);
  const signedData = `${timestamp}.${payloadString}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedData)
    .digest('hex');

  return `v1=${signature}`;
}

/**
 * Verify webhook signature (for webhook receivers)
 */
export function verifyWebhookSignature(
  payload: any,
  signature: string,
  secret: string,
  timestamp: number,
  toleranceMs: number = 300000 // 5 minutes
): boolean {
  // Check timestamp tolerance (replay attack protection)
  const now = Date.now();
  if (Math.abs(now - timestamp) > toleranceMs) {
    return false;
  }

  // Verify signature
  const expectedSignature = signWebhookPayload(payload, secret, timestamp);

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// ========================================
// Queue Webhook for Delivery
// ========================================

export async function queueWebhookDelivery(
  eventType: string,
  eventId: string,
  payload: any,
  tenantType: string,
  tenantId: string,
  idempotencyKey?: string
): Promise<number> {
  let deliveryCount = 0;

  await transaction(async (client) => {
    // Check idempotency
    if (idempotencyKey) {
      const existing = await client.query(
        `SELECT COUNT(*) as count FROM webhook_deliveries WHERE idempotency_key = $1`,
        [idempotencyKey]
      );

      if (existing.rows[0].count > 0) {
        console.log('Webhook delivery already queued (idempotent)', { idempotencyKey });
        return;
      }
    }

    // Find all webhooks subscribed to this event
    const webhooks = await client.query(
      `SELECT id, url, secret, retry_config, custom_headers
       FROM webhooks
       WHERE enabled = TRUE
         AND tenant_type = $1
         AND tenant_id = $2
         AND $3 = ANY(event_types)`,
      [tenantType, tenantId, eventType]
    );

    if (webhooks.rows.length === 0) {
      console.log('No webhooks subscribed to event', { eventType, tenantType, tenantId });
      return;
    }

    // Queue delivery for each webhook
    for (const webhook of webhooks.rows) {
      const timestamp = Date.now();
      const secret = await decryptWithVault(Buffer.from(webhook.secret));
      const signature = signWebhookPayload(payload, secret, timestamp);

      const retryConfig = webhook.retry_config;

      await client.query(
        `INSERT INTO webhook_deliveries (
          webhook_id, event_type, event_id, payload, signature,
          status, attempts, max_attempts, idempotency_key, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'pending', 0, $6, $7, NOW())`,
        [
          webhook.id,
          eventType,
          eventId,
          JSON.stringify(payload),
          signature,
          retryConfig.maxAttempts || 3,
          idempotencyKey || null,
        ]
      );

      deliveryCount++;
    }

    console.log('Webhook deliveries queued', {
      eventType,
      eventId,
      deliveryCount,
    });
  });

  return deliveryCount;
}

// ========================================
// Deliver Webhook (called by worker)
// ========================================

export async function deliverWebhook(deliveryId: string): Promise<{
  success: boolean;
  responseCode?: number;
  latencyMs?: number;
  error?: string;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock delivery row
    const deliveryResult = await client.query(
      `SELECT wd.id, wd.webhook_id, wd.event_type, wd.payload, wd.signature, wd.attempts, wd.max_attempts,
              w.url, w.secret, w.custom_headers, w.retry_config
       FROM webhook_deliveries wd
       JOIN webhooks w ON wd.webhook_id = w.id
       WHERE wd.id = $1
       FOR UPDATE`,
      [deliveryId]
    );

    if (deliveryResult.rows.length === 0) {
      throw new Error('Delivery not found');
    }

    const delivery = deliveryResult.rows[0];

    // Check if already delivered or max attempts reached
    if (delivery.attempts >= delivery.max_attempts) {
      throw new Error('Max delivery attempts reached');
    }

    // Prepare request
    const timestamp = Date.now();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Molam-Webhooks/1.0',
      'X-Molam-Event': delivery.event_type,
      'X-Molam-Signature': delivery.signature,
      'X-Molam-Timestamp': timestamp.toString(),
      'X-Molam-Delivery-Id': delivery.id,
      'X-Molam-Delivery-Attempt': (delivery.attempts + 1).toString(),
    };

    // Add custom headers
    if (delivery.custom_headers) {
      Object.assign(headers, JSON.parse(delivery.custom_headers));
    }

    // Attempt delivery
    const startTime = Date.now();
    let success = false;
    let responseCode: number | undefined;
    let responseBody: string | undefined;
    let errorMessage: string | undefined;
    let errorType: string | undefined;

    try {
      const response = await axios.post(delivery.url, JSON.parse(delivery.payload), {
        headers,
        timeout: 10000, // 10 second timeout
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      success = true;
      responseCode = response.status;
      responseBody = JSON.stringify(response.data).substring(0, 1000); // Truncate
    } catch (error: any) {
      success = false;
      responseCode = error.response?.status;
      responseBody = error.response?.data ? JSON.stringify(error.response.data).substring(0, 1000) : undefined;

      if (error.code === 'ECONNREFUSED') {
        errorType = 'connection_refused';
        errorMessage = 'Connection refused';
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        errorType = 'timeout';
        errorMessage = 'Request timeout';
      } else if (error.response) {
        errorType = 'invalid_response';
        errorMessage = `HTTP ${error.response.status}`;
      } else {
        errorType = 'network_error';
        errorMessage = error.message;
      }
    }

    const latencyMs = Date.now() - startTime;

    // Update delivery record
    const newAttempts = delivery.attempts + 1;
    const newStatus = success
      ? 'delivered'
      : newAttempts >= delivery.max_attempts
      ? 'failed'
      : 'retrying';

    const nextRetryAt = !success && newAttempts < delivery.max_attempts
      ? await calculateNextRetry(newAttempts, delivery.retry_config)
      : null;

    await client.query(
      `UPDATE webhook_deliveries
       SET status = $1,
           attempts = $2,
           last_attempt_at = NOW(),
           next_retry_at = $3,
           response_code = $4,
           response_body = $5,
           latency_ms = $6,
           error_message = $7,
           error_type = $8,
           delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END
       WHERE id = $9`,
      [
        newStatus,
        newAttempts,
        nextRetryAt,
        responseCode || null,
        responseBody || null,
        latencyMs,
        errorMessage || null,
        errorType || null,
        deliveryId,
      ]
    );

    // Log attempt
    await client.query(
      `INSERT INTO webhook_delivery_attempts (
        delivery_id, attempt_number, attempted_at, request_url, request_headers, request_payload,
        response_code, response_body, latency_ms, success, error_type, error_message
      ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        deliveryId,
        newAttempts,
        delivery.url,
        JSON.stringify(headers),
        delivery.payload,
        responseCode || null,
        responseBody || null,
        latencyMs,
        success,
        errorType || null,
        errorMessage || null,
      ]
    );

    await client.query('COMMIT');

    console.log('Webhook delivery attempt', {
      deliveryId,
      attempt: newAttempts,
      success,
      responseCode,
      latencyMs,
    });

    // Track webhook metrics for observability (B73bis integration)
    await trackWebhookMetrics({
      webhookId: delivery.webhook_id,
      success,
      latencyMs,
      responseCode,
      errorType,
    }).catch(err => console.error('Failed to track webhook metrics', err));

    return { success, responseCode, latencyMs, error: errorMessage };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Webhook delivery error', { deliveryId, error });
    throw error;
  } finally {
    client.release();
  }
}

// ========================================
// Helpers
// ========================================

async function calculateNextRetry(attemptNumber: number, retryConfig: any): Promise<Date> {
  const initialDelay = retryConfig.initialDelayMs || 1000;
  const maxDelay = retryConfig.maxDelayMs || 60000;
  const backoff = retryConfig.backoff || 'exponential';

  let delayMs: number;

  if (backoff === 'exponential') {
    delayMs = Math.min(initialDelay * Math.pow(2, attemptNumber - 1), maxDelay);
  } else {
    delayMs = Math.min(initialDelay * attemptNumber, maxDelay);
  }

  const nextRetry = new Date();
  nextRetry.setMilliseconds(nextRetry.getMilliseconds() + delayMs);

  return nextRetry;
}

// ========================================
// Get Webhook Details
// ========================================

export async function getWebhook(webhookId: string): Promise<Webhook | null> {
  const result = await pool.query(
    `SELECT id, app_id, tenant_type, tenant_id, url, enabled, event_types, retry_config, created_at, updated_at
     FROM webhooks
     WHERE id = $1`,
    [webhookId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    appId: row.app_id,
    tenantType: row.tenant_type,
    tenantId: row.tenant_id,
    url: row.url,
    secret: '***', // Never return secret
    enabled: row.enabled,
    eventTypes: row.event_types,
    retryConfig: row.retry_config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ========================================
// List Webhooks for App
// ========================================

export async function listWebhooksForApp(appId: string): Promise<Webhook[]> {
  const result = await pool.query(
    `SELECT id, app_id, tenant_type, tenant_id, url, enabled, event_types, retry_config, created_at, updated_at
     FROM webhooks
     WHERE app_id = $1
     ORDER BY created_at DESC`,
    [appId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    appId: row.app_id,
    tenantType: row.tenant_type,
    tenantId: row.tenant_id,
    url: row.url,
    secret: '***',
    enabled: row.enabled,
    eventTypes: row.event_types,
    retryConfig: row.retry_config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// ========================================
// Update Webhook
// ========================================

export async function updateWebhook(
  webhookId: string,
  updates: {
    url?: string;
    enabled?: boolean;
    eventTypes?: string[];
  }
): Promise<void> {
  await transaction(async (client) => {
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramCount = 1;

    if (updates.url !== undefined) {
      updateFields.push(`url = $${paramCount++}`);
      updateValues.push(updates.url);
    }

    if (updates.enabled !== undefined) {
      updateFields.push(`enabled = $${paramCount++}`);
      updateValues.push(updates.enabled);
    }

    if (updates.eventTypes !== undefined) {
      updateFields.push(`event_types = $${paramCount++}`);
      updateValues.push(updates.eventTypes);
    }

    if (updateFields.length === 0) {
      return;
    }

    updateValues.push(webhookId);

    await client.query(
      `UPDATE webhooks SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount}`,
      updateValues
    );
  });
}

// ========================================
// Delete Webhook
// ========================================

export async function deleteWebhook(webhookId: string): Promise<void> {
  await pool.query(`DELETE FROM webhooks WHERE id = $1`, [webhookId]);
}

// ========================================
// Observability & Metrics (B73bis Integration)
// ========================================

interface WebhookMetrics {
  webhookId: string;
  success: boolean;
  latencyMs: number;
  responseCode?: number;
  errorType?: string;
}

/**
 * Track webhook delivery metrics for observability dashboard
 * This integrates with B73bis observability tables
 */
async function trackWebhookMetrics(metrics: WebhookMetrics): Promise<void> {
  try {
    // Aggregate metrics for webhook performance tracking
    // This can be expanded to write to api_request_traces table from B73bis
    const hourStart = new Date();
    hourStart.setMinutes(0, 0, 0);

    // Log to webhook delivery metrics (can be aggregated later by worker)
    await pool.query(
      `INSERT INTO webhook_delivery_metrics (
        webhook_id, period_start, period_type,
        total_deliveries, successful_deliveries, failed_deliveries,
        avg_latency_ms, max_latency_ms,
        status_distribution, error_types,
        created_at
      )
      VALUES ($1, $2, 'hour', 1, $3, $4, $5, $5, $6, $7, NOW())
      ON CONFLICT (webhook_id, period_start, period_type)
      DO UPDATE SET
        total_deliveries = webhook_delivery_metrics.total_deliveries + 1,
        successful_deliveries = webhook_delivery_metrics.successful_deliveries + EXCLUDED.successful_deliveries,
        failed_deliveries = webhook_delivery_metrics.failed_deliveries + EXCLUDED.failed_deliveries,
        avg_latency_ms = (webhook_delivery_metrics.avg_latency_ms * webhook_delivery_metrics.total_deliveries + EXCLUDED.avg_latency_ms) / (webhook_delivery_metrics.total_deliveries + 1),
        max_latency_ms = GREATEST(webhook_delivery_metrics.max_latency_ms, EXCLUDED.max_latency_ms),
        status_distribution = webhook_delivery_metrics.status_distribution || EXCLUDED.status_distribution,
        error_types = webhook_delivery_metrics.error_types || EXCLUDED.error_types`,
      [
        metrics.webhookId,
        hourStart,
        metrics.success ? 1 : 0,
        metrics.success ? 0 : 1,
        metrics.latencyMs,
        JSON.stringify({ [metrics.responseCode || 0]: 1 }),
        metrics.errorType ? JSON.stringify({ [metrics.errorType]: 1 }) : JSON.stringify({}),
      ]
    );
  } catch (error) {
    // Don't fail webhook delivery if metrics tracking fails
    console.error('Failed to track webhook metrics', { error, metrics });
  }
}

/**
 * Get webhook health metrics for dashboard
 */
export async function getWebhookMetrics(
  webhookId: string,
  periodHours: number = 24
): Promise<{
  totalDeliveries: number;
  successRate: number;
  avgLatency: number;
  p95Latency: number;
  errorDistribution: Record<string, number>;
}> {
  const result = await pool.query(
    `SELECT
       SUM(total_deliveries) as total,
       SUM(successful_deliveries) as successful,
       AVG(avg_latency_ms) as avg_latency,
       MAX(max_latency_ms) as max_latency,
       jsonb_object_agg(error_types) as errors
     FROM webhook_delivery_metrics
     WHERE webhook_id = $1
       AND period_start >= NOW() - INTERVAL '${periodHours} hours'
     GROUP BY webhook_id`,
    [webhookId]
  );

  if (result.rows.length === 0) {
    return {
      totalDeliveries: 0,
      successRate: 0,
      avgLatency: 0,
      p95Latency: 0,
      errorDistribution: {},
    };
  }

  const row = result.rows[0];
  const total = parseInt(row.total) || 0;
  const successful = parseInt(row.successful) || 0;

  return {
    totalDeliveries: total,
    successRate: total > 0 ? (successful / total) * 100 : 0,
    avgLatency: parseFloat(row.avg_latency) || 0,
    p95Latency: parseFloat(row.max_latency) || 0, // Simplified, should calculate from histogram
    errorDistribution: row.errors || {},
  };
}
