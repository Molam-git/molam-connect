/**
 * Brique 112: Data Ingestion Worker
 * Ingests events from various sources and stores feature snapshots for training
 */

const crypto = require('crypto');

let pool;

function setPool(pgPool) {
  pool = pgPool;
}

/**
 * Redact PII from features
 */
function redactPII(features) {
  const redacted = { ...features };

  // Hash sensitive fields
  const sensitiveFields = ['phone', 'email', 'pan', 'card_number', 'iban'];

  for (const field of sensitiveFields) {
    if (redacted[field]) {
      // Replace with hash
      redacted[field] = crypto
        .createHash('sha256')
        .update(redacted[field])
        .digest('hex')
        .substring(0, 16);
    }
  }

  // Remove completely
  const removeFields = ['cvv', 'pin', 'password'];
  for (const field of removeFields) {
    delete redacted[field];
  }

  return redacted;
}

/**
 * Extract features from wallet transaction
 */
function extractFeaturesFromWalletTxn(txn) {
  return {
    // Transaction details
    amount: txn.amount,
    currency: txn.currency,
    country: txn.country,
    payment_method: txn.payment_method,

    // Merchant/customer
    merchant_id: txn.merchant_id,
    customer_id: txn.customer_id,

    // Risk signals
    is_international: txn.country !== txn.merchant_country,
    hour_of_day: new Date(txn.created_at).getHours(),
    day_of_week: new Date(txn.created_at).getDay(),

    // Device/session
    device_type: txn.device_type,
    ip_address: txn.ip_address, // Will be redacted
    user_agent: txn.user_agent,

    // PII (will be redacted)
    phone: txn.phone,
    email: txn.email,

    // Transaction metadata
    retry_count: txn.retry_count || 0,
    previous_failed: txn.previous_failed || false
  };
}

/**
 * Ingest event into SIRA dataset
 */
async function ingestEvent(eventId, sourceModule, features, country, currency) {
  try {
    // Redact PII
    const redactedFeatures = redactPII(features);

    // Insert into dataset
    await pool.query(
      `INSERT INTO siradata_events(
        event_id,
        source_module,
        country,
        currency,
        features
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (event_id) DO NOTHING`,
      [eventId, sourceModule, country, currency, redactedFeatures]
    );

    return { ok: true, event_id: eventId };
  } catch (error) {
    console.error('Ingest event error:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Add label to event
 */
async function addLabel(eventId, label, labelledBy, confidence = 1.0, reviewNotes = null) {
  try {
    // Validate label
    const validLabels = [
      'fraudulent',
      'legit',
      'dispute_won',
      'dispute_lost',
      'chargeback',
      'false_positive',
      'true_positive',
      'review',
      'unknown'
    ];

    if (!validLabels.includes(label)) {
      throw new Error(`Invalid label: ${label}`);
    }

    // Insert label
    const { rows: [result] } = await pool.query(
      `INSERT INTO siradata_labels(
        event_id,
        label,
        labelled_by,
        confidence,
        review_notes
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [eventId, label, labelledBy, confidence, reviewNotes]
    );

    return result;
  } catch (error) {
    console.error('Add label error:', error);
    throw error;
  }
}

/**
 * Process wallet transaction event
 */
async function processWalletTransaction(txn) {
  try {
    const features = extractFeaturesFromWalletTxn(txn);

    const result = await ingestEvent(
      txn.id,
      'wallet',
      features,
      txn.country,
      txn.currency
    );

    // Auto-label based on transaction outcome
    if (txn.status === 'completed' && !txn.is_fraud) {
      await addLabel(txn.id, 'legit', 'sira', 0.8, 'Auto-labeled from successful txn');
    } else if (txn.is_fraud) {
      await addLabel(txn.id, 'fraudulent', 'sira', 0.9, 'Auto-labeled from fraud flag');
    }

    return result;
  } catch (error) {
    console.error('Process wallet transaction error:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Batch ingest events
 */
async function batchIngest(events) {
  const results = [];

  for (const event of events) {
    const result = await ingestEvent(
      event.event_id,
      event.source_module,
      event.features,
      event.country,
      event.currency
    );

    results.push(result);
  }

  return {
    total: events.length,
    success: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length
  };
}

/**
 * Get dataset summary
 */
async function getDatasetSummary() {
  try {
    const { rows } = await pool.query(`SELECT * FROM v_training_dataset_summary`);
    return rows;
  } catch (error) {
    console.error('Get dataset summary error:', error);
    throw error;
  }
}

/**
 * Get label distribution
 */
async function getLabelDistribution(startDate, endDate) {
  try {
    const { rows } = await pool.query(
      `SELECT
        label,
        COUNT(*) as count,
        AVG(confidence) as avg_confidence
       FROM siradata_labels
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY label
       ORDER BY count DESC`,
      [startDate, endDate]
    );

    return rows;
  } catch (error) {
    console.error('Get label distribution error:', error);
    throw error;
  }
}

module.exports = {
  setPool,
  redactPII,
  extractFeaturesFromWalletTxn,
  ingestEvent,
  addLabel,
  processWalletTransaction,
  batchIngest,
  getDatasetSummary,
  getLabelDistribution
};
