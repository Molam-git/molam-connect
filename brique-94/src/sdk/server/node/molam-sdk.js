/**
 * Molam Form Core - Node.js Server SDK
 * For server-side payment intent creation and management
 *
 * Usage:
 * const Molam = require('molam-sdk');
 * const molam = new Molam('sk_test_xxx');
 *
 * const intent = await molam.paymentIntents.create({
 *   amount: 100.00,
 *   currency: 'USD',
 *   customer_email: 'customer@example.com'
 * });
 */

const https = require('https');
const http = require('http');

const SDK_VERSION = '1.0.0';
const API_BASE_URL = 'https://api.molam.com/form';

class MolamError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = 'MolamError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

class MolamSDK {
  constructor(apiKey, options = {}) {
    if (!apiKey || !apiKey.startsWith('sk_')) {
      throw new Error('Invalid API key. Must be a secret key starting with "sk_"');
    }

    this.apiKey = apiKey;
    this.environment = apiKey.startsWith('sk_test_') ? 'test' : 'live';
    this.baseUrl = options.baseUrl || API_BASE_URL;
    this.timeout = options.timeout || 30000;

    // Initialize resource handlers
    this.paymentIntents = new PaymentIntents(this);
    this.apiKeys = new ApiKeys(this);
    this.logs = new Logs(this);
  }

  /**
   * Make HTTP request to Molam API
   */
  async request(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': `Molam Node.js SDK/${SDK_VERSION}`,
        },
        timeout: this.timeout,
      };

      const req = httpModule.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(body);

            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              reject(new MolamError(
                json.message || 'API request failed',
                res.statusCode,
                json.error
              ));
            }
          } catch (e) {
            reject(new MolamError('Invalid JSON response', res.statusCode, 'parse_error'));
          }
        });
      });

      req.on('error', (error) => {
        reject(new MolamError(error.message, null, 'network_error'));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new MolamError('Request timeout', null, 'timeout'));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }
}

/**
 * Payment Intents Resource
 */
class PaymentIntents {
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Create a payment intent
   */
  async create(params) {
    const {
      amount,
      currency,
      customer_email,
      customer_name,
      description,
      metadata,
      payment_method_type,
      return_url
    } = params;

    if (!amount || amount <= 0) {
      throw new Error('amount must be a positive number');
    }

    if (!currency) {
      throw new Error('currency is required');
    }

    return await this.sdk.request('POST', '/payment-intents', {
      amount,
      currency: currency.toUpperCase(),
      customer_email,
      customer_name,
      description,
      metadata,
      payment_method_type,
      return_url
    });
  }

  /**
   * Retrieve a payment intent
   */
  async retrieve(intentId) {
    if (!intentId) {
      throw new Error('intentId is required');
    }

    return await this.sdk.request('GET', `/payment-intents/${intentId}`);
  }

  /**
   * Update a payment intent
   */
  async update(intentId, params) {
    if (!intentId) {
      throw new Error('intentId is required');
    }

    const { action, payment_method_token } = params;

    if (!action) {
      throw new Error('action is required (confirm, capture, cancel)');
    }

    return await this.sdk.request('PATCH', `/payment-intents/${intentId}`, {
      action,
      payment_method_token
    });
  }

  /**
   * Confirm a payment intent
   */
  async confirm(intentId, paymentMethodToken) {
    return await this.update(intentId, {
      action: 'confirm',
      payment_method_token: paymentMethodToken
    });
  }

  /**
   * Capture a payment intent
   */
  async capture(intentId) {
    return await this.update(intentId, {
      action: 'capture'
    });
  }

  /**
   * Cancel a payment intent
   */
  async cancel(intentId) {
    return await this.update(intentId, {
      action: 'cancel'
    });
  }
}

/**
 * API Keys Resource
 */
class ApiKeys {
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Generate a new API key
   */
  async create(params) {
    const { merchant_id, key_type, environment } = params;

    if (!merchant_id || !key_type || !environment) {
      throw new Error('merchant_id, key_type, and environment are required');
    }

    return await this.sdk.request('POST', '/api-keys', {
      merchant_id,
      key_type,
      environment
    });
  }

  /**
   * List API keys
   */
  async list(merchantId) {
    if (!merchantId) {
      throw new Error('merchantId is required');
    }

    return await this.sdk.request('GET', `/api-keys?merchant_id=${merchantId}`);
  }

  /**
   * Revoke an API key
   */
  async revoke(keyId) {
    if (!keyId) {
      throw new Error('keyId is required');
    }

    return await this.sdk.request('DELETE', `/api-keys/${keyId}`);
  }
}

/**
 * Logs Resource
 */
class Logs {
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Create a log entry
   */
  async create(params) {
    const { event_type, sdk_version, platform, payload, intent_reference } = params;

    if (!event_type) {
      throw new Error('event_type is required');
    }

    return await this.sdk.request('POST', '/logs', {
      event_type,
      sdk_version: sdk_version || SDK_VERSION,
      platform: platform || 'node',
      payload,
      intent_reference
    });
  }

  /**
   * List logs for a merchant
   */
  async list(params = {}) {
    const { merchant_id, limit = 100, offset = 0, event_type } = params;

    if (!merchant_id) {
      throw new Error('merchant_id is required');
    }

    let query = `merchant_id=${merchant_id}&limit=${limit}&offset=${offset}`;
    if (event_type) {
      query += `&event_type=${event_type}`;
    }

    return await this.sdk.request('GET', `/logs?${query}`);
  }
}

// Export
module.exports = MolamSDK;
module.exports.MolamError = MolamError;
