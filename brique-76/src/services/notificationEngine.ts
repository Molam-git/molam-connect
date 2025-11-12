/**
 * Brique 76 - Notification Engine Service
 *
 * Multi-channel notification system with:
 * - Template rendering (multi-language)
 * - User preference checking (GDPR-compliant)
 * - Throttling/rate limiting
 * - Multi-channel dispatch (Email, SMS, Push, In-app, Webhook)
 * - Sira AI personalization
 * - Retry logic
 * - Engagement tracking
 *
 * @version 1.0.0
 * @date 2025-11-12
 */

import { Pool, PoolClient } from 'pg';
import Handlebars from 'handlebars';

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// =====================================================================
// TYPES & INTERFACES
// =====================================================================

export type NotifChannel = 'email' | 'sms' | 'push' | 'in_app' | 'webhook';
export type NotifCategory =
  | 'transaction'
  | 'account'
  | 'security'
  | 'marketing'
  | 'operational'
  | 'compliance'
  | 'fraud_alert'
  | 'payout'
  | 'subscription';
export type NotifPriority = 'critical' | 'high' | 'normal' | 'low';
export type NotifDeliveryStatus =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'bounced'
  | 'spam'
  | 'unsubscribed'
  | 'throttled'
  | 'skipped';

export interface NotifTemplate {
  id: string;
  template_key: string;
  version: number;
  scope: 'global' | 'merchant' | 'ops';
  scope_id?: string;
  category: NotifCategory;
  channels: NotifChannel[];
  content: Record<string, TemplateContent>;
  variables: string[];
  status: 'draft' | 'active' | 'archived' | 'deprecated';
  is_default: boolean;
  sira_personalization_enabled: boolean;
  sira_config: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface TemplateContent {
  subject?: string;
  body_text?: string;
  body_html?: string;
  sms_text?: string;
  push_title?: string;
  push_body?: string;
  webhook_payload?: Record<string, any>;
}

export interface NotifPreferences {
  id: string;
  user_type: string;
  user_id: string;
  email?: string;
  phone?: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  webhook_enabled: boolean;
  category_preferences: Record<string, boolean>;
  granular_preferences: Record<string, Record<string, boolean>>;
  quiet_hours_enabled: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  quiet_hours_timezone: string;
  preferred_language: string;
  gdpr_consent_given: boolean;
  unsubscribe_token: string;
}

export interface NotifRequest {
  id: string;
  template_key: string;
  template_version?: number;
  recipient_type: string;
  recipient_id: string;
  channels: NotifChannel[];
  priority: NotifPriority;
  variables: Record<string, any>;
  language_override?: string;
  send_at?: Date;
  idempotency_key?: string;
  context: Record<string, any>;
  created_by?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  processed_at?: Date;
  error_message?: string;
}

export interface NotifDelivery {
  id: string;
  request_id: string;
  channel: NotifChannel;
  recipient_email?: string;
  recipient_phone?: string;
  recipient_device_token?: string;
  recipient_webhook_url?: string;
  rendered_subject?: string;
  rendered_body_text?: string;
  rendered_body_html?: string;
  rendered_payload?: Record<string, any>;
  template_id: string;
  template_key: string;
  template_version: number;
  status: NotifDeliveryStatus;
  provider?: string;
  provider_message_id?: string;
  provider_response?: Record<string, any>;
  queued_at: Date;
  sent_at?: Date;
  delivered_at?: Date;
  failed_at?: Date;
  error_code?: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  next_retry_at?: Date;
  opened_at?: Date;
  clicked_at?: Date;
  clicked_links?: string[];
  metadata: Record<string, any>;
}

export interface SiraNotifInsights {
  user_type: string;
  user_id: string;
  preferred_channel?: NotifChannel;
  preferred_time_of_day?: number;
  email_engagement_score: number;
  sms_engagement_score: number;
  push_engagement_score: number;
  in_app_engagement_score: number;
  total_sent: number;
  total_opened: number;
  total_clicked: number;
}

export interface CreateNotificationParams {
  template_key: string;
  template_version?: number;
  recipient_type: string;
  recipient_id: string;
  channels?: NotifChannel[];
  priority?: NotifPriority;
  variables: Record<string, any>;
  language_override?: string;
  send_at?: Date;
  idempotency_key?: string;
  context?: Record<string, any>;
  created_by?: string;
}

export interface DispatchResult {
  request_id: string;
  deliveries: NotifDelivery[];
  skipped_channels: Array<{ channel: NotifChannel; reason: string }>;
}

// =====================================================================
// CORE FUNCTIONS
// =====================================================================

/**
 * Create a notification request
 * Entry point for all notifications
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<NotifRequest> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get template
    const template = await getActiveTemplate(
      client,
      params.template_key,
      'global',
      undefined
    );

    if (!template) {
      throw new Error(`Template not found: ${params.template_key}`);
    }

    // Determine channels (use template default if not specified)
    const channels = params.channels || template.channels;

    // Create request
    const result = await client.query<NotifRequest>(
      `INSERT INTO notif_requests (
        template_key, template_version, recipient_type, recipient_id,
        channels, priority, variables, language_override, send_at,
        idempotency_key, context, created_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
      RETURNING *`,
      [
        params.template_key,
        params.template_version || template.version,
        params.recipient_type,
        params.recipient_id,
        channels,
        params.priority || 'normal',
        JSON.stringify(params.variables),
        params.language_override,
        params.send_at,
        params.idempotency_key,
        JSON.stringify(params.context || {}),
        params.created_by,
      ]
    );

    await client.query('COMMIT');

    const request = result.rows[0];

    // If immediate send (not scheduled), process now
    if (!params.send_at || new Date(params.send_at) <= new Date()) {
      // Process async (don't block)
      processNotificationRequest(request.id).catch(err => {
        console.error(`[NotifEngine] Failed to process request ${request.id}:`, err);
      });
    }

    return request;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Process a notification request
 * Renders template, checks preferences, throttles, and dispatches
 */
export async function processNotificationRequest(
  requestId: string
): Promise<DispatchResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get request
    const requestResult = await client.query<NotifRequest>(
      `UPDATE notif_requests SET status = 'processing' WHERE id = $1 RETURNING *`,
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      throw new Error(`Notification request not found: ${requestId}`);
    }

    const request = requestResult.rows[0];

    // Get template
    const template = await getTemplateByVersion(
      client,
      request.template_key,
      request.template_version || undefined
    );

    if (!template) {
      throw new Error(`Template not found: ${request.template_key} v${request.template_version}`);
    }

    // Get user preferences
    const preferences = await getUserPreferences(
      client,
      request.recipient_type,
      request.recipient_id
    );

    // Determine language
    const language = request.language_override || preferences?.preferred_language || 'fr';

    // Check if language exists in template
    if (!template.content[language]) {
      throw new Error(`Template ${template.template_key} does not support language: ${language}`);
    }

    // Sira personalization (if enabled)
    let optimizedChannels = request.channels;
    if (template.sira_personalization_enabled) {
      optimizedChannels = await siraOptimizeChannels(
        request.recipient_type,
        request.recipient_id,
        request.channels,
        template.sira_config
      );
    }

    // Dispatch to each channel
    const deliveries: NotifDelivery[] = [];
    const skipped: Array<{ channel: NotifChannel; reason: string }> = [];

    for (const channel of optimizedChannels) {
      // Check user preference
      const prefAllowed = await checkUserPreference(
        client,
        request.recipient_type,
        request.recipient_id,
        channel,
        template.category
      );

      if (!prefAllowed) {
        skipped.push({ channel, reason: 'User opted out' });
        continue;
      }

      // Check throttle
      const throttleAllowed = await checkThrottleLimit(
        client,
        'merchant', // or 'global'
        request.recipient_id,
        channel,
        template.category,
        request.priority
      );

      if (!throttleAllowed) {
        skipped.push({ channel, reason: 'Throttle limit reached' });

        // Create delivery record with 'throttled' status
        const delivery = await createDeliveryRecord(
          client,
          request,
          template,
          channel,
          language,
          preferences,
          'throttled'
        );
        deliveries.push(delivery);
        continue;
      }

      // Render template
      const renderedContent = renderTemplate(
        template.content[language],
        request.variables,
        channel
      );

      // Create delivery record
      const delivery = await createDeliveryRecord(
        client,
        request,
        template,
        channel,
        language,
        preferences,
        'queued',
        renderedContent
      );

      deliveries.push(delivery);

      // Increment throttle counter
      await incrementThrottleCounter(
        client,
        'merchant',
        request.recipient_id,
        channel,
        template.category
      );

      // Dispatch to provider (async, don't block)
      dispatchToChannel(delivery).catch(err => {
        console.error(`[NotifEngine] Dispatch failed for delivery ${delivery.id}:`, err);
      });
    }

    // Mark request as completed
    await client.query(
      `UPDATE notif_requests SET status = 'completed', processed_at = now() WHERE id = $1`,
      [requestId]
    );

    await client.query('COMMIT');

    return {
      request_id: requestId,
      deliveries,
      skipped_channels: skipped,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');

    // Mark request as failed
    await pool.query(
      `UPDATE notif_requests SET status = 'failed', error_message = $1 WHERE id = $2`,
      [error.message, requestId]
    );

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Render template with variables using Handlebars
 */
function renderTemplate(
  content: TemplateContent,
  variables: Record<string, any>,
  channel: NotifChannel
): Partial<TemplateContent> {
  const rendered: Partial<TemplateContent> = {};

  try {
    if (channel === 'email') {
      if (content.subject) {
        rendered.subject = Handlebars.compile(content.subject)(variables);
      }
      if (content.body_text) {
        rendered.body_text = Handlebars.compile(content.body_text)(variables);
      }
      if (content.body_html) {
        rendered.body_html = Handlebars.compile(content.body_html)(variables);
      }
    } else if (channel === 'sms') {
      if (content.sms_text) {
        rendered.body_text = Handlebars.compile(content.sms_text)(variables);
      }
    } else if (channel === 'push') {
      if (content.push_title) {
        rendered.subject = Handlebars.compile(content.push_title)(variables);
      }
      if (content.push_body) {
        rendered.body_text = Handlebars.compile(content.push_body)(variables);
      }
    } else if (channel === 'in_app') {
      if (content.push_title) {
        rendered.subject = Handlebars.compile(content.push_title)(variables);
      }
      if (content.body_text) {
        rendered.body_text = Handlebars.compile(content.body_text)(variables);
      }
    } else if (channel === 'webhook') {
      if (content.webhook_payload) {
        // Render each value in webhook payload
        rendered.rendered_payload = JSON.parse(
          Handlebars.compile(JSON.stringify(content.webhook_payload))(variables)
        );
      }
    }
  } catch (error: any) {
    console.error(`[NotifEngine] Template rendering failed:`, error);
    throw new Error(`Template rendering failed: ${error.message}`);
  }

  return rendered;
}

/**
 * Create delivery record in database
 */
async function createDeliveryRecord(
  client: PoolClient,
  request: NotifRequest,
  template: NotifTemplate,
  channel: NotifChannel,
  language: string,
  preferences: NotifPreferences | null,
  status: NotifDeliveryStatus,
  renderedContent?: Partial<TemplateContent>
): Promise<NotifDelivery> {
  const result = await client.query<NotifDelivery>(
    `INSERT INTO notif_deliveries (
      request_id, channel, recipient_email, recipient_phone,
      rendered_subject, rendered_body_text, rendered_body_html, rendered_payload,
      template_id, template_key, template_version, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      request.id,
      channel,
      preferences?.email,
      preferences?.phone,
      renderedContent?.subject,
      renderedContent?.body_text,
      renderedContent?.body_html,
      renderedContent?.rendered_payload ? JSON.stringify(renderedContent.rendered_payload) : null,
      template.id,
      template.template_key,
      template.version,
      status,
    ]
  );

  return result.rows[0];
}

/**
 * Dispatch notification to channel provider
 */
async function dispatchToChannel(delivery: NotifDelivery): Promise<void> {
  const client = await pool.connect();

  try {
    let provider: string;
    let providerMessageId: string | undefined;
    let providerResponse: any;

    switch (delivery.channel) {
      case 'email':
        ({ provider, messageId: providerMessageId, response: providerResponse } =
          await sendEmail(delivery));
        break;

      case 'sms':
        ({ provider, messageId: providerMessageId, response: providerResponse } =
          await sendSMS(delivery));
        break;

      case 'push':
        ({ provider, messageId: providerMessageId, response: providerResponse } =
          await sendPush(delivery));
        break;

      case 'in_app':
        ({ provider, messageId: providerMessageId, response: providerResponse } =
          await sendInApp(delivery));
        break;

      case 'webhook':
        ({ provider, messageId: providerMessageId, response: providerResponse } =
          await sendWebhook(delivery));
        break;

      default:
        throw new Error(`Unsupported channel: ${delivery.channel}`);
    }

    // Update delivery as sent
    await client.query(
      `UPDATE notif_deliveries
       SET status = 'sent', sent_at = now(),
           provider = $1, provider_message_id = $2, provider_response = $3
       WHERE id = $4`,
      [provider, providerMessageId, JSON.stringify(providerResponse), delivery.id]
    );
  } catch (error: any) {
    console.error(`[NotifEngine] Dispatch failed for ${delivery.channel}:`, error);

    // Update delivery as failed
    await client.query(
      `UPDATE notif_deliveries
       SET status = 'failed', failed_at = now(),
           error_code = $1, error_message = $2, retry_count = retry_count + 1,
           next_retry_at = now() + INTERVAL '5 minutes'
       WHERE id = $3`,
      [error.code || 'DISPATCH_ERROR', error.message, delivery.id]
    );

    // Schedule retry if below max
    if (delivery.retry_count < delivery.max_retries) {
      // TODO: Add to retry queue
    }
  } finally {
    client.release();
  }
}

// =====================================================================
// CHANNEL PROVIDERS (Stub implementations)
// =====================================================================

/**
 * Send email via provider (e.g., SendGrid, AWS SES)
 */
async function sendEmail(delivery: NotifDelivery): Promise<{
  provider: string;
  messageId: string;
  response: any;
}> {
  // TODO: Integrate with actual email provider
  console.log(`[NotifEngine] Sending email to ${delivery.recipient_email}`);
  console.log(`Subject: ${delivery.rendered_subject}`);
  console.log(`Body: ${delivery.rendered_body_text?.substring(0, 100)}...`);

  // Simulate SendGrid
  return {
    provider: 'sendgrid',
    messageId: `email_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    response: { status: 'accepted' },
  };
}

/**
 * Send SMS via provider (e.g., Twilio, SMPP)
 */
async function sendSMS(delivery: NotifDelivery): Promise<{
  provider: string;
  messageId: string;
  response: any;
}> {
  // TODO: Integrate with actual SMS provider
  console.log(`[NotifEngine] Sending SMS to ${delivery.recipient_phone}`);
  console.log(`Body: ${delivery.rendered_body_text}`);

  // Simulate Twilio
  return {
    provider: 'twilio',
    messageId: `sms_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    response: { status: 'queued' },
  };
}

/**
 * Send push notification via provider (e.g., FCM, APNs)
 */
async function sendPush(delivery: NotifDelivery): Promise<{
  provider: string;
  messageId: string;
  response: any;
}> {
  // TODO: Integrate with actual push provider
  console.log(`[NotifEngine] Sending push to device ${delivery.recipient_device_token}`);
  console.log(`Title: ${delivery.rendered_subject}`);
  console.log(`Body: ${delivery.rendered_body_text}`);

  // Simulate FCM
  return {
    provider: 'fcm',
    messageId: `push_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    response: { success: 1 },
  };
}

/**
 * Send in-app notification (store in database)
 */
async function sendInApp(delivery: NotifDelivery): Promise<{
  provider: string;
  messageId: string;
  response: any;
}> {
  const client = await pool.connect();

  try {
    // Get recipient from delivery request
    const requestResult = await client.query<NotifRequest>(
      `SELECT * FROM notif_requests WHERE id = $1`,
      [delivery.request_id]
    );

    const request = requestResult.rows[0];

    // Insert into in-app logs
    const result = await client.query(
      `INSERT INTO notif_in_app_logs (
        user_type, user_id, delivery_id, title, body, category, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [
        request.recipient_type,
        request.recipient_id,
        delivery.id,
        delivery.rendered_subject,
        delivery.rendered_body_text,
        'transaction', // TODO: Get from template
        'normal',
      ]
    );

    return {
      provider: 'internal',
      messageId: result.rows[0].id,
      response: { stored: true },
    };
  } finally {
    client.release();
  }
}

/**
 * Send webhook notification
 */
async function sendWebhook(delivery: NotifDelivery): Promise<{
  provider: string;
  messageId: string;
  response: any;
}> {
  // TODO: Fetch merchant webhook config and dispatch
  console.log(`[NotifEngine] Sending webhook`);
  console.log(`Payload:`, delivery.rendered_payload);

  // Simulate webhook dispatch
  return {
    provider: 'webhook',
    messageId: `webhook_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    response: { dispatched: true },
  };
}

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Get active template
 */
async function getActiveTemplate(
  client: PoolClient,
  templateKey: string,
  scope: string,
  scopeId?: string
): Promise<NotifTemplate | null> {
  const result = await client.query<NotifTemplate>(
    `SELECT * FROM get_active_template($1, $2, $3)`,
    [templateKey, scope, scopeId]
  );

  return result.rows[0] || null;
}

/**
 * Get template by specific version
 */
async function getTemplateByVersion(
  client: PoolClient,
  templateKey: string,
  version?: number
): Promise<NotifTemplate | null> {
  if (version) {
    const result = await client.query<NotifTemplate>(
      `SELECT * FROM notif_templates WHERE template_key = $1 AND version = $2`,
      [templateKey, version]
    );
    return result.rows[0] || null;
  } else {
    return getActiveTemplate(client, templateKey, 'global');
  }
}

/**
 * Get user notification preferences
 */
async function getUserPreferences(
  client: PoolClient,
  userType: string,
  userId: string
): Promise<NotifPreferences | null> {
  const result = await client.query<NotifPreferences>(
    `SELECT * FROM notif_preferences WHERE user_type = $1 AND user_id = $2`,
    [userType, userId]
  );

  return result.rows[0] || null;
}

/**
 * Check if user has opted in for channel + category
 */
async function checkUserPreference(
  client: PoolClient,
  userType: string,
  userId: string,
  channel: NotifChannel,
  category: NotifCategory
): Promise<boolean> {
  const result = await client.query<{ allowed: boolean }>(
    `SELECT check_user_preference($1, $2, $3, $4) as allowed`,
    [userType, userId, channel, category]
  );

  return result.rows[0]?.allowed ?? true;
}

/**
 * Check throttle limit
 */
async function checkThrottleLimit(
  client: PoolClient,
  scope: string,
  scopeId: string,
  channel: NotifChannel,
  category: NotifCategory,
  priority: NotifPriority
): Promise<boolean> {
  const result = await client.query<{ allowed: boolean }>(
    `SELECT check_throttle_limit($1, $2, $3, $4, $5) as allowed`,
    [scope, scopeId, channel, category, priority]
  );

  return result.rows[0]?.allowed ?? true;
}

/**
 * Increment throttle counter
 */
async function incrementThrottleCounter(
  client: PoolClient,
  scope: string,
  scopeId: string,
  channel: NotifChannel,
  category: NotifCategory
): Promise<void> {
  await client.query(
    `SELECT increment_throttle_counter($1, $2, $3, $4)`,
    [scope, scopeId, channel, category]
  );
}

/**
 * Sira AI: Optimize channel selection based on engagement
 */
async function siraOptimizeChannels(
  userType: string,
  userId: string,
  channels: NotifChannel[],
  siraConfig: Record<string, any>
): Promise<NotifChannel[]> {
  // If Sira channel optimization disabled, return original
  if (!siraConfig.optimize_channel) {
    return channels;
  }

  // Get Sira insights
  const result = await pool.query<SiraNotifInsights>(
    `SELECT * FROM sira_notif_insights WHERE user_type = $1 AND user_id = $2`,
    [userType, userId]
  );

  if (result.rows.length === 0) {
    return channels;
  }

  const insights = result.rows[0];

  // Sort channels by engagement score
  const channelScores: Array<{ channel: NotifChannel; score: number }> = [];

  for (const channel of channels) {
    let score = 0.5; // Default

    switch (channel) {
      case 'email':
        score = insights.email_engagement_score;
        break;
      case 'sms':
        score = insights.sms_engagement_score;
        break;
      case 'push':
        score = insights.push_engagement_score;
        break;
      case 'in_app':
        score = insights.in_app_engagement_score;
        break;
      default:
        score = 0.5;
    }

    channelScores.push({ channel, score });
  }

  // Sort by score descending
  channelScores.sort((a, b) => b.score - a.score);

  // Return top 2 channels (or all if fewer)
  return channelScores.slice(0, 2).map(cs => cs.channel);
}

// =====================================================================
// PUBLIC API FUNCTIONS
// =====================================================================

/**
 * Get notification request by ID
 */
export async function getNotificationRequest(requestId: string): Promise<NotifRequest | null> {
  const result = await pool.query<NotifRequest>(
    `SELECT * FROM notif_requests WHERE id = $1`,
    [requestId]
  );

  return result.rows[0] || null;
}

/**
 * Get deliveries for a request
 */
export async function getDeliveriesForRequest(requestId: string): Promise<NotifDelivery[]> {
  const result = await pool.query<NotifDelivery>(
    `SELECT * FROM notif_deliveries WHERE request_id = $1 ORDER BY queued_at DESC`,
    [requestId]
  );

  return result.rows;
}

/**
 * Get in-app notifications for user
 */
export async function getInAppNotifications(
  userType: string,
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM notif_in_app_logs
     WHERE user_type = $1 AND user_id = $2
       AND dismissed = false
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [userType, userId, limit, offset]
  );

  return result.rows;
}

/**
 * Mark in-app notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  await pool.query(
    `UPDATE notif_in_app_logs SET read = true, read_at = now() WHERE id = $1`,
    [notificationId]
  );
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userType: string, userId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `SELECT get_unread_notif_count($1, $2) as count`,
    [userType, userId]
  );

  return result.rows[0]?.count || 0;
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(
  userType: string,
  userId: string,
  updates: Partial<NotifPreferences>
): Promise<NotifPreferences> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  // Build dynamic UPDATE query
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'user_type' || key === 'user_id' || key === 'id') continue; // Skip identity fields
    fields.push(`${key} = $${paramIndex}`);
    values.push(
      typeof value === 'object' && value !== null ? JSON.stringify(value) : value
    );
    paramIndex++;
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(userType, userId);

  const result = await pool.query<NotifPreferences>(
    `UPDATE notif_preferences
     SET ${fields.join(', ')}, updated_at = now()
     WHERE user_type = $${paramIndex} AND user_id = $${paramIndex + 1}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    // Create new preference record
    return createUserPreferences(userType, userId, updates);
  }

  return result.rows[0];
}

/**
 * Create user preferences
 */
export async function createUserPreferences(
  userType: string,
  userId: string,
  prefs: Partial<NotifPreferences>
): Promise<NotifPreferences> {
  const result = await pool.query<NotifPreferences>(
    `INSERT INTO notif_preferences (
      user_type, user_id, email, phone, preferred_language,
      email_enabled, sms_enabled, push_enabled, in_app_enabled, webhook_enabled,
      category_preferences, granular_preferences
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      userType,
      userId,
      prefs.email,
      prefs.phone,
      prefs.preferred_language || 'fr',
      prefs.email_enabled ?? true,
      prefs.sms_enabled ?? true,
      prefs.push_enabled ?? true,
      prefs.in_app_enabled ?? true,
      prefs.webhook_enabled ?? true,
      JSON.stringify(prefs.category_preferences || {}),
      JSON.stringify(prefs.granular_preferences || {}),
    ]
  );

  return result.rows[0];
}

/**
 * Unsubscribe using token (GDPR one-click unsubscribe)
 */
export async function unsubscribeByToken(token: string, channel?: NotifChannel): Promise<void> {
  if (channel) {
    await pool.query(
      `UPDATE notif_preferences SET ${channel}_enabled = false WHERE unsubscribe_token = $1`,
      [token]
    );
  } else {
    // Unsubscribe from all
    await pool.query(
      `UPDATE notif_preferences
       SET email_enabled = false, sms_enabled = false,
           push_enabled = false, in_app_enabled = false
       WHERE unsubscribe_token = $1`,
      [token]
    );
  }
}

/**
 * Record engagement (opened/clicked)
 */
export async function recordEngagement(
  deliveryId: string,
  eventType: 'opened' | 'clicked',
  clickedUrl?: string
): Promise<void> {
  await pool.query(
    `SELECT record_notification_engagement($1, $2, $3)`,
    [deliveryId, eventType, clickedUrl]
  );
}

// =====================================================================
// SCHEDULED JOBS
// =====================================================================

/**
 * Retry failed deliveries
 * Should be run periodically (e.g., every 5 minutes via cron)
 */
export async function retryFailedDeliveries(): Promise<number> {
  const result = await pool.query<NotifDelivery>(
    `SELECT * FROM notif_deliveries
     WHERE status = 'failed'
       AND retry_count < max_retries
       AND next_retry_at <= now()
     LIMIT 100`
  );

  const deliveries = result.rows;

  for (const delivery of deliveries) {
    await dispatchToChannel(delivery);
  }

  return deliveries.length;
}

/**
 * Process scheduled notifications
 * Should be run every minute via cron
 */
export async function processScheduledNotifications(): Promise<number> {
  const result = await pool.query<NotifRequest>(
    `SELECT * FROM notif_requests
     WHERE status = 'pending'
       AND send_at IS NOT NULL
       AND send_at <= now()
     LIMIT 100`
  );

  const requests = result.rows;

  for (const request of requests) {
    await processNotificationRequest(request.id);
  }

  return requests.length;
}

/**
 * Cleanup old throttle counters
 * Should be run daily via cron
 */
export async function cleanupThrottleCounters(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM notif_throttle_counters WHERE window_start < now() - INTERVAL '7 days'`
  );

  return result.rowCount || 0;
}

// Export pool for external use
export { pool };
