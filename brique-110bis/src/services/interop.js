// src/services/interop.js
// Interop Layer Service - Universal Event Normalization

let pool; // Initialized by setPool()

/**
 * Receive and normalize interop event
 * @param {Object} params - Event parameters
 * @returns {Promise<Object>} Stored event
 */
async function receiveEvent({ plugin_id, merchant_id, event_type, event_category, payload, source_platform }) {
  try {
    // Normalize payload
    const normalized = await normalizePayload(source_platform, event_type, payload);

    // Store event
    const { rows: [event] } = await pool.query(
      `INSERT INTO plugin_interop_events (
        plugin_id, merchant_id, event_type, event_category,
        payload, normalized_payload, source_platform
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        plugin_id,
        merchant_id,
        event_type,
        event_category || detectCategory(event_type),
        payload,
        normalized,
        source_platform
      ]
    );

    console.log(`[INTEROP] Event received: ${event_type} from ${source_platform}`);

    // Process event asynchronously
    processEvent(event.id).catch(err => {
      console.error(`[INTEROP] Failed to process event ${event.id}:`, err);
    });

    return event;
  } catch (error) {
    console.error('[INTEROP] Failed to receive event:', error);
    throw error;
  }
}

/**
 * Normalize payload according to platform mappings
 * @param {string} source_platform - Source platform
 * @param {string} event_type - Event type
 * @param {Object} payload - Raw payload
 * @returns {Promise<Object>} Normalized payload
 */
async function normalizePayload(source_platform, event_type, payload) {
  try {
    const { rows: [result] } = await pool.query(
      'SELECT normalize_interop_event($1, $2, $3) as normalized',
      [source_platform, event_type, payload]
    );

    return result.normalized;
  } catch (error) {
    console.error('[INTEROP] Normalization failed:', error);
    return payload; // Return raw payload if normalization fails
  }
}

/**
 * Process interop event (dispatch to other services)
 * @param {string} event_id - Event ID
 */
async function processEvent(event_id) {
  try {
    // Get event
    const { rows: [event] } = await pool.query(
      'SELECT * FROM plugin_interop_events WHERE id = $1',
      [event_id]
    );

    if (!event) {
      throw new Error('Event not found');
    }

    // Dispatch based on category
    switch (event.event_category) {
      case 'checkout':
        await dispatchCheckoutEvent(event);
        break;
      case 'payment':
        await dispatchPaymentEvent(event);
        break;
      case 'refund':
        await dispatchRefundEvent(event);
        break;
      case 'subscription':
        await dispatchSubscriptionEvent(event);
        break;
      case 'error':
        await dispatchErrorEvent(event);
        break;
      default:
        console.log(`[INTEROP] Unknown category: ${event.event_category}`);
    }

    // Mark as processed
    await pool.query(
      `UPDATE plugin_interop_events
       SET processing_status = 'processed',
           processed_at = now()
       WHERE id = $1`,
      [event_id]
    );

    console.log(`[INTEROP] Event processed: ${event_id}`);
  } catch (error) {
    console.error(`[INTEROP] Event processing failed:`, error);

    // Mark as failed and increment retry
    await pool.query(
      `UPDATE plugin_interop_events
       SET processing_status = 'failed',
           error_message = $1,
           retry_count = retry_count + 1
       WHERE id = $2`,
      [error.message, event_id]
    );
  }
}

/**
 * Dispatch checkout event
 */
async function dispatchCheckoutEvent(event) {
  // TODO: Integrate with Brique 109 checkout
  console.log(`[INTEROP] Dispatching checkout event: ${event.event_type}`);

  // Example: Create checkout session
  // await createCheckoutSession(event.normalized_payload);
}

/**
 * Dispatch payment event
 */
async function dispatchPaymentEvent(event) {
  // TODO: Integrate with Brique 108 payment intents
  console.log(`[INTEROP] Dispatching payment event: ${event.event_type}`);

  // Example: Update payment intent
  // await updatePaymentIntent(event.normalized_payload);
}

/**
 * Dispatch refund event
 */
async function dispatchRefundEvent(event) {
  // TODO: Integrate with refunds system
  console.log(`[INTEROP] Dispatching refund event: ${event.event_type}`);
}

/**
 * Dispatch subscription event
 */
async function dispatchSubscriptionEvent(event) {
  // TODO: Integrate with subscriptions
  console.log(`[INTEROP] Dispatching subscription event: ${event.event_type}`);
}

/**
 * Dispatch error event (trigger auto-healing)
 */
async function dispatchErrorEvent(event) {
  console.log(`[INTEROP] Dispatching error event: ${event.event_type}`);

  // Check if auto-healing rules match
  const autoHealing = require('./autoHealing');
  const errorMessage = event.normalized_payload?.error_message || event.payload?.message || '';

  if (errorMessage) {
    await autoHealing.checkAndApplyRules(event.plugin_id, errorMessage);
  }
}

/**
 * Detect event category from event type
 */
function detectCategory(event_type) {
  if (event_type.includes('checkout')) return 'checkout';
  if (event_type.includes('payment')) return 'payment';
  if (event_type.includes('refund')) return 'refund';
  if (event_type.includes('subscription')) return 'subscription';
  if (event_type.includes('error')) return 'error';
  return 'other';
}

/**
 * Get interop events
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Events
 */
async function getEvents(filters = {}) {
  try {
    let query = `
      SELECT ie.*,
             pi.merchant_id,
             pi.cms,
             pi.plugin_version
      FROM plugin_interop_events ie
      JOIN plugin_installations pi ON pi.id = ie.plugin_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (filters.plugin_id) {
      params.push(filters.plugin_id);
      query += ` AND ie.plugin_id = $${paramIndex++}`;
    }

    if (filters.merchant_id) {
      params.push(filters.merchant_id);
      query += ` AND ie.merchant_id = $${paramIndex++}`;
    }

    if (filters.event_type) {
      params.push(filters.event_type);
      query += ` AND ie.event_type = $${paramIndex++}`;
    }

    if (filters.event_category) {
      params.push(filters.event_category);
      query += ` AND ie.event_category = $${paramIndex++}`;
    }

    if (filters.source_platform) {
      params.push(filters.source_platform);
      query += ` AND ie.source_platform = $${paramIndex++}`;
    }

    if (filters.processing_status) {
      params.push(filters.processing_status);
      query += ` AND ie.processing_status = $${paramIndex++}`;
    }

    query += ` ORDER BY ie.received_at DESC LIMIT ${filters.limit || 100}`;

    const { rows } = await pool.query(query, params);
    return rows;
  } catch (error) {
    console.error('[INTEROP] Failed to get events:', error);
    return [];
  }
}

/**
 * Get event statistics
 * @param {number} days - Days to look back
 * @returns {Promise<Object>} Statistics
 */
async function getStats(days = 30) {
  try {
    const { rows: [stats] } = await pool.query(
      `SELECT
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE processing_status = 'processed') as processed,
        COUNT(*) FILTER (WHERE processing_status = 'failed') as failed,
        COUNT(*) FILTER (WHERE processing_status = 'pending') as pending,
        COUNT(DISTINCT plugin_id) as unique_plugins,
        COUNT(DISTINCT source_platform) as platforms,
        ROUND(
          (COUNT(*) FILTER (WHERE processing_status = 'processed')::NUMERIC /
           NULLIF(COUNT(*)::NUMERIC, 0)) * 100,
          2
        ) as success_rate
      FROM plugin_interop_events
      WHERE received_at >= CURRENT_DATE - $1 * INTERVAL '1 day'`,
      [days]
    );

    // Get events by category
    const { rows: byCategory } = await pool.query(
      `SELECT event_category, COUNT(*) as count
       FROM plugin_interop_events
       WHERE received_at >= CURRENT_DATE - $1 * INTERVAL '1 day'
       GROUP BY event_category
       ORDER BY count DESC`,
      [days]
    );

    // Get events by platform
    const { rows: byPlatform } = await pool.query(
      `SELECT source_platform, COUNT(*) as count
       FROM plugin_interop_events
       WHERE received_at >= CURRENT_DATE - $1 * INTERVAL '1 day'
       GROUP BY source_platform
       ORDER BY count DESC`,
      [days]
    );

    return {
      ...stats,
      by_category: byCategory,
      by_platform: byPlatform
    };
  } catch (error) {
    console.error('[INTEROP] Failed to get stats:', error);
    return {
      total_events: 0,
      processed: 0,
      failed: 0,
      pending: 0,
      unique_plugins: 0,
      platforms: 0,
      success_rate: 0,
      by_category: [],
      by_platform: []
    };
  }
}

/**
 * Retry failed events
 * @param {number} maxRetries - Maximum retry count
 * @returns {Promise<number>} Number of events retried
 */
async function retryFailedEvents(maxRetries = 3) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM plugin_interop_events
       WHERE processing_status = 'failed'
         AND retry_count < $1
       ORDER BY received_at DESC
       LIMIT 100`,
      [maxRetries]
    );

    let retried = 0;
    for (const event of rows) {
      try {
        await processEvent(event.id);
        retried++;
      } catch (error) {
        console.error(`[INTEROP] Retry failed for event ${event.id}:`, error);
      }
    }

    console.log(`[INTEROP] Retried ${retried} failed events`);
    return retried;
  } catch (error) {
    console.error('[INTEROP] Failed to retry events:', error);
    return 0;
  }
}

/**
 * Create or update event mapping
 * @param {Object} mapping - Mapping configuration
 * @returns {Promise<Object>} Created/updated mapping
 */
async function upsertMapping(mapping) {
  try {
    const { rows: [result] } = await pool.query(
      `INSERT INTO interop_event_mappings (
        source_platform, source_event_type, normalized_event_type,
        field_mappings, transformation_rules, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (source_platform, source_event_type)
      DO UPDATE SET
        normalized_event_type = EXCLUDED.normalized_event_type,
        field_mappings = EXCLUDED.field_mappings,
        transformation_rules = EXCLUDED.transformation_rules,
        is_active = EXCLUDED.is_active,
        updated_at = now()
      RETURNING *`,
      [
        mapping.source_platform,
        mapping.source_event_type,
        mapping.normalized_event_type,
        mapping.field_mappings,
        mapping.transformation_rules || null,
        mapping.is_active !== false
      ]
    );

    console.log(`[INTEROP] Mapping upserted: ${mapping.source_platform}.${mapping.source_event_type}`);
    return result;
  } catch (error) {
    console.error('[INTEROP] Failed to upsert mapping:', error);
    throw error;
  }
}

/**
 * Get event mappings
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Mappings
 */
async function getMappings(filters = {}) {
  try {
    let query = 'SELECT * FROM interop_event_mappings WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.source_platform) {
      params.push(filters.source_platform);
      query += ` AND source_platform = $${paramIndex++}`;
    }

    if (filters.is_active !== undefined) {
      params.push(filters.is_active);
      query += ` AND is_active = $${paramIndex++}`;
    }

    query += ' ORDER BY source_platform, source_event_type';

    const { rows } = await pool.query(query, params);
    return rows;
  } catch (error) {
    console.error('[INTEROP] Failed to get mappings:', error);
    return [];
  }
}

/**
 * Set database pool
 */
function setPool(dbPool) {
  pool = dbPool;
}

module.exports = {
  setPool,
  receiveEvent,
  normalizePayload,
  processEvent,
  getEvents,
  getStats,
  retryFailedEvents,
  upsertMapping,
  getMappings
};
