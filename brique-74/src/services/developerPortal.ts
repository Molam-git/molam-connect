// =====================================================
// Brique 74 - Developer Portal Services
// =====================================================
// Purpose: API key management, playground, SDK generation, and documentation services
// Version: 1.0.0
// =====================================================

import { Pool } from 'pg';
import crypto from 'crypto';
import axios from 'axios';

// Assuming PostgreSQL pool is configured
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/molam',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// =====================================================
// TYPES & INTERFACES
// =====================================================

export interface APIKey {
  id: string;
  tenant_type: string;
  tenant_id: string;
  created_by_user_id: string;
  name: string;
  key_prefix: string;
  environment: 'test' | 'production';
  status: 'active' | 'revoked' | 'expired';
  created_at: Date;
  expires_at?: Date;
  scopes: string[];
  allowed_ips?: string[];
  allowed_origins?: string[];
  rate_limit_per_second: number;
  rate_limit_per_hour: number;
  rate_limit_per_day: number;
  last_used_at?: Date;
  metadata: Record<string, any>;
}

export interface CreateAPIKeyRequest {
  tenant_type: string;
  tenant_id: string;
  user_id: string;
  name: string;
  environment: 'test' | 'production';
  scopes: string[];
  expires_in_days?: number;
  allowed_ips?: string[];
  allowed_origins?: string[];
  rate_limit_per_second?: number;
  rate_limit_per_hour?: number;
  rate_limit_per_day?: number;
  metadata?: Record<string, any>;
}

export interface APIKeyWithSecret extends APIKey {
  secret_key: string; // Only returned on creation
}

export interface PlaygroundSession {
  id: string;
  user_id: string;
  tenant_type: string;
  tenant_id: string;
  name: string;
  description?: string;
  environment: 'sandbox' | 'test';
  status: 'active' | 'archived';
  api_version: string;
  mock_data_enabled: boolean;
  created_at: Date;
  last_activity_at: Date;
}

export interface PlaygroundRequest {
  id: string;
  session_id: string;
  method: string;
  endpoint: string;
  headers: Record<string, string>;
  body?: any;
  query_params?: Record<string, string>;
  status_code?: number;
  response_body?: any;
  response_time_ms?: number;
  executed_at: Date;
  is_favorite: boolean;
  notes?: string;
}

export interface ExecutePlaygroundRequestParams {
  session_id: string;
  method: string;
  endpoint: string;
  headers?: Record<string, string>;
  body?: any;
  query_params?: Record<string, string>;
}

export interface SDKVersion {
  id: string;
  language: string;
  version: string;
  api_version: string;
  status: 'alpha' | 'beta' | 'stable' | 'deprecated';
  package_name: string;
  download_url: string;
  checksum_sha256: string;
  size_bytes: number;
  download_count: number;
  released_at: Date;
  changelog?: string;
  documentation_url?: string;
  repository_url?: string;
}

export interface DocumentationPage {
  id: string;
  slug: string;
  title: string;
  description?: string;
  content_markdown: string;
  category: string;
  subcategory?: string;
  api_version: string;
  is_deprecated: boolean;
  status: 'draft' | 'published' | 'archived';
  code_examples: Array<{ language: string; code: string; description?: string }>;
  has_live_demo: boolean;
  tags: string[];
  published_at?: Date;
}

export interface APIKeyStats {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  avg_response_time_ms: number;
  p95_response_time_ms: number;
  unique_ips: number;
  endpoints_used: string[];
}

// =====================================================
// 1. API KEY MANAGEMENT SERVICE
// =====================================================

/**
 * Generate a new API key with secure random generation
 */
export async function createAPIKey(params: CreateAPIKeyRequest): Promise<APIKeyWithSecret> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generate secure random key
    const secretKey = await generateSecureAPIKey(params.environment);
    const keyHash = hashAPIKey(secretKey);
    const keyPrefix = secretKey.substring(0, 16); // pk_live_abc123... (first 16 chars)

    // Calculate expiration
    const expiresAt = params.expires_in_days
      ? new Date(Date.now() + params.expires_in_days * 24 * 60 * 60 * 1000)
      : null;

    // Insert key
    const insertQuery = `
      INSERT INTO developer_api_keys (
        tenant_type, tenant_id, created_by_user_id,
        name, key_prefix, key_hash, environment,
        expires_at, scopes, allowed_ips, allowed_origins,
        rate_limit_per_second, rate_limit_per_hour, rate_limit_per_day,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const result = await client.query(insertQuery, [
      params.tenant_type,
      params.tenant_id,
      params.user_id,
      params.name,
      keyPrefix,
      keyHash,
      params.environment,
      expiresAt,
      params.scopes,
      params.allowed_ips || null,
      params.allowed_origins || null,
      params.rate_limit_per_second || 10,
      params.rate_limit_per_hour || 1000,
      params.rate_limit_per_day || 10000,
      JSON.stringify(params.metadata || {}),
    ]);

    await client.query('COMMIT');

    const apiKey = result.rows[0];
    return {
      ...apiKey,
      secret_key: secretKey, // Only returned on creation
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[DevPortal] Failed to create API key:', error);
    throw new Error('Failed to create API key');
  } finally {
    client.release();
  }
}

/**
 * Generate secure API key with environment-specific prefix
 */
async function generateSecureAPIKey(environment: 'test' | 'production'): Promise<string> {
  const prefix = environment === 'production' ? 'pk_live_' : 'pk_test_';
  const randomBytes = crypto.randomBytes(32);
  const randomPart = randomBytes.toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 32);
  return prefix + randomPart;
}

/**
 * Hash API key for secure storage
 */
function hashAPIKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Validate API key and return key details
 */
export async function validateAPIKey(secretKey: string): Promise<APIKey | null> {
  try {
    const keyHash = hashAPIKey(secretKey);

    const query = `
      SELECT * FROM developer_api_keys
      WHERE key_hash = $1 AND status = 'active'
    `;

    const result = await pool.query(query, [keyHash]);

    if (result.rows.length === 0) {
      return null;
    }

    const apiKey = result.rows[0];

    // Check expiration
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      await revokeAPIKey(apiKey.id, 'system', 'Key expired');
      return null;
    }

    // Update last_used_at
    await pool.query(
      'UPDATE developer_api_keys SET last_used_at = now() WHERE id = $1',
      [apiKey.id]
    );

    return apiKey;
  } catch (error) {
    console.error('[DevPortal] Failed to validate API key:', error);
    return null;
  }
}

/**
 * Revoke an API key
 */
export async function revokeAPIKey(
  keyId: string,
  revokedByUserId: string,
  reason: string
): Promise<void> {
  try {
    await pool.query(
      `UPDATE developer_api_keys
       SET status = 'revoked', revoked_at = now(), revoked_by_user_id = $2, revoked_reason = $3
       WHERE id = $1`,
      [keyId, revokedByUserId, reason]
    );
  } catch (error) {
    console.error('[DevPortal] Failed to revoke API key:', error);
    throw new Error('Failed to revoke API key');
  }
}

/**
 * List API keys for a tenant
 */
export async function listAPIKeys(
  tenantType: string,
  tenantId: string,
  includeRevoked: boolean = false
): Promise<APIKey[]> {
  try {
    let query = `
      SELECT * FROM developer_api_keys
      WHERE tenant_type = $1 AND tenant_id = $2
    `;

    if (!includeRevoked) {
      query += ` AND status = 'active'`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, [tenantType, tenantId]);
    return result.rows;
  } catch (error) {
    console.error('[DevPortal] Failed to list API keys:', error);
    throw new Error('Failed to list API keys');
  }
}

/**
 * Get API key usage statistics
 */
export async function getAPIKeyStats(
  keyId: string,
  startDate?: Date,
  endDate?: Date
): Promise<APIKeyStats> {
  try {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const query = `SELECT * FROM get_api_key_stats($1, $2, $3)`;
    const result = await pool.query(query, [keyId, start, end]);

    if (result.rows.length === 0) {
      return {
        total_requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        avg_response_time_ms: 0,
        p95_response_time_ms: 0,
        unique_ips: 0,
        endpoints_used: [],
      };
    }

    return result.rows[0];
  } catch (error) {
    console.error('[DevPortal] Failed to get API key stats:', error);
    throw new Error('Failed to get API key stats');
  }
}

// =====================================================
// 2. API LOGS SERVICE
// =====================================================

/**
 * Log API request for developer observability
 */
export async function logAPIRequest(params: {
  api_key_id?: string;
  request_id: string;
  tenant_type: string;
  tenant_id: string;
  method: string;
  path: string;
  api_version?: string;
  query_params?: Record<string, any>;
  request_headers?: Record<string, any>;
  request_body?: any;
  status_code: number;
  response_headers?: Record<string, any>;
  response_body?: any;
  response_time_ms: number;
  ip_address: string;
  user_agent?: string;
  origin?: string;
  error_code?: string;
  error_message?: string;
  error_type?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    // Sanitize sensitive data
    const sanitizedRequestHeaders = sanitizeHeaders(params.request_headers);
    const sanitizedRequestBody = sanitizeBody(params.request_body);
    const sanitizedResponseBody = truncateIfNeeded(params.response_body, 100 * 1024);

    const query = `
      INSERT INTO developer_api_logs (
        api_key_id, request_id, tenant_type, tenant_id,
        method, path, api_version, query_params,
        request_headers, request_body,
        status_code, response_headers, response_body, response_time_ms,
        ip_address, user_agent, origin,
        error_code, error_message, error_type,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    `;

    await pool.query(query, [
      params.api_key_id || null,
      params.request_id,
      params.tenant_type,
      params.tenant_id,
      params.method,
      params.path,
      params.api_version || '2025-01',
      JSON.stringify(params.query_params || {}),
      JSON.stringify(sanitizedRequestHeaders),
      JSON.stringify(sanitizedRequestBody),
      params.status_code,
      JSON.stringify(params.response_headers || {}),
      JSON.stringify(sanitizedResponseBody),
      params.response_time_ms,
      params.ip_address,
      params.user_agent || null,
      params.origin || null,
      params.error_code || null,
      params.error_message || null,
      params.error_type || null,
      JSON.stringify(params.metadata || {}),
    ]);
  } catch (error) {
    // Don't throw - logging failures shouldn't break API requests
    console.error('[DevPortal] Failed to log API request:', error);
  }
}

/**
 * Query API logs with filters
 */
export async function queryAPILogs(params: {
  tenant_type: string;
  tenant_id: string;
  api_key_id?: string;
  start_date?: Date;
  end_date?: Date;
  status_code?: number;
  method?: string;
  path_pattern?: string;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  try {
    const conditions: string[] = ['tenant_type = $1', 'tenant_id = $2'];
    const values: any[] = [params.tenant_type, params.tenant_id];
    let paramIndex = 3;

    if (params.api_key_id) {
      conditions.push(`api_key_id = $${paramIndex++}`);
      values.push(params.api_key_id);
    }

    if (params.start_date) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(params.start_date);
    }

    if (params.end_date) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(params.end_date);
    }

    if (params.status_code) {
      conditions.push(`status_code = $${paramIndex++}`);
      values.push(params.status_code);
    }

    if (params.method) {
      conditions.push(`method = $${paramIndex++}`);
      values.push(params.method);
    }

    if (params.path_pattern) {
      conditions.push(`path LIKE $${paramIndex++}`);
      values.push(`%${params.path_pattern}%`);
    }

    const query = `
      SELECT * FROM developer_api_logs
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    values.push(params.limit || 100, params.offset || 0);

    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error('[DevPortal] Failed to query API logs:', error);
    throw new Error('Failed to query API logs');
  }
}

// =====================================================
// 3. PLAYGROUND SERVICE
// =====================================================

/**
 * Create a new playground session
 */
export async function createPlaygroundSession(params: {
  user_id: string;
  tenant_type: string;
  tenant_id: string;
  name?: string;
  description?: string;
  environment?: 'sandbox' | 'test';
  api_version?: string;
}): Promise<PlaygroundSession> {
  try {
    const query = `
      INSERT INTO dev_playground_sessions (
        user_id, tenant_type, tenant_id, name, description, environment, api_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await pool.query(query, [
      params.user_id,
      params.tenant_type,
      params.tenant_id,
      params.name || 'Untitled Session',
      params.description || null,
      params.environment || 'sandbox',
      params.api_version || '2025-01',
    ]);

    return result.rows[0];
  } catch (error) {
    console.error('[DevPortal] Failed to create playground session:', error);
    throw new Error('Failed to create playground session');
  }
}

/**
 * Execute API request in playground (sandbox environment)
 */
export async function executePlaygroundRequest(
  params: ExecutePlaygroundRequestParams
): Promise<PlaygroundRequest> {
  const startTime = Date.now();

  try {
    // Verify session exists and is active
    const sessionResult = await pool.query(
      'SELECT * FROM dev_playground_sessions WHERE id = $1 AND status = $2',
      [params.session_id, 'active']
    );

    if (sessionResult.rows.length === 0) {
      throw new Error('Playground session not found or inactive');
    }

    const session = sessionResult.rows[0];

    // Execute request in sandbox mode
    let statusCode: number | undefined;
    let responseBody: any;
    let responseTimeMs: number;

    if (session.mock_data_enabled) {
      // Return mock data
      const mockResponse = generateMockResponse(params.endpoint, params.method);
      statusCode = mockResponse.status;
      responseBody = mockResponse.body;
      responseTimeMs = Date.now() - startTime;
    } else {
      // Execute real request to test API
      try {
        const baseUrl = process.env.API_BASE_URL || 'http://localhost:3073';
        const url = `${baseUrl}${params.endpoint}`;

        const response = await axios({
          method: params.method.toLowerCase() as any,
          url,
          headers: {
            ...params.headers,
            'X-Molam-Playground': 'true',
            'X-Molam-Session-Id': params.session_id,
          },
          params: params.query_params,
          data: params.body,
          validateStatus: () => true, // Don't throw on error status codes
        });

        statusCode = response.status;
        responseBody = response.data;
        responseTimeMs = Date.now() - startTime;
      } catch (error: any) {
        statusCode = 500;
        responseBody = { error: error.message };
        responseTimeMs = Date.now() - startTime;
      }
    }

    // Save request to history
    const insertQuery = `
      INSERT INTO dev_playground_requests (
        session_id, method, endpoint, headers, body, query_params,
        status_code, response_body, response_time_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      params.session_id,
      params.method,
      params.endpoint,
      JSON.stringify(params.headers || {}),
      JSON.stringify(params.body),
      JSON.stringify(params.query_params || {}),
      statusCode,
      JSON.stringify(responseBody),
      responseTimeMs,
    ]);

    // Update session last_activity_at
    await pool.query(
      'UPDATE dev_playground_sessions SET last_activity_at = now() WHERE id = $1',
      [params.session_id]
    );

    return result.rows[0];
  } catch (error) {
    console.error('[DevPortal] Failed to execute playground request:', error);
    throw new Error('Failed to execute playground request');
  }
}

/**
 * Generate mock response for playground
 */
function generateMockResponse(endpoint: string, method: string): { status: number; body: any } {
  // Simple mock data generation based on endpoint
  if (endpoint.includes('/payments')) {
    return {
      status: 200,
      body: {
        id: 'pay_mock_' + crypto.randomBytes(8).toString('hex'),
        amount: 10000,
        currency: 'XOF',
        status: 'succeeded',
        created_at: new Date().toISOString(),
      },
    };
  }

  if (endpoint.includes('/webhooks')) {
    return {
      status: 200,
      body: {
        id: 'whk_mock_' + crypto.randomBytes(8).toString('hex'),
        url: 'https://example.com/webhook',
        events: ['payment.succeeded', 'payment.failed'],
        status: 'active',
      },
    };
  }

  return {
    status: 200,
    body: { message: 'Mock response', endpoint, method },
  };
}

/**
 * Get playground request history
 */
export async function getPlaygroundRequestHistory(
  sessionId: string,
  limit: number = 50
): Promise<PlaygroundRequest[]> {
  try {
    const query = `
      SELECT * FROM dev_playground_requests
      WHERE session_id = $1
      ORDER BY executed_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [sessionId, limit]);
    return result.rows;
  } catch (error) {
    console.error('[DevPortal] Failed to get playground history:', error);
    throw new Error('Failed to get playground history');
  }
}

// =====================================================
// 4. SDK SERVICE
// =====================================================

/**
 * List available SDK versions
 */
export async function listSDKVersions(language?: string): Promise<SDKVersion[]> {
  try {
    let query = `
      SELECT * FROM dev_sdk_versions
      WHERE status != 'deprecated'
    `;

    const values: any[] = [];

    if (language) {
      query += ` AND language = $1`;
      values.push(language);
    }

    query += ` ORDER BY released_at DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error('[DevPortal] Failed to list SDK versions:', error);
    throw new Error('Failed to list SDK versions');
  }
}

/**
 * Track SDK download
 */
export async function trackSDKDownload(params: {
  sdk_version_id: string;
  tenant_type?: string;
  tenant_id?: string;
  user_id?: string;
  ip_address: string;
  user_agent?: string;
  referrer?: string;
}): Promise<void> {
  try {
    const query = `
      INSERT INTO dev_sdk_downloads (
        sdk_version_id, tenant_type, tenant_id, user_id,
        ip_address, user_agent, referrer
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await pool.query(query, [
      params.sdk_version_id,
      params.tenant_type || null,
      params.tenant_id || null,
      params.user_id || null,
      params.ip_address,
      params.user_agent || null,
      params.referrer || null,
    ]);
  } catch (error) {
    console.error('[DevPortal] Failed to track SDK download:', error);
    // Don't throw - tracking failures shouldn't block downloads
  }
}

// =====================================================
// 5. DOCUMENTATION SERVICE
// =====================================================

/**
 * Search documentation pages
 */
export async function searchDocumentation(params: {
  query?: string;
  category?: string;
  api_version?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}): Promise<DocumentationPage[]> {
  try {
    const conditions: string[] = ["status = 'published'"];
    const values: any[] = [];
    let paramIndex = 1;

    if (params.category) {
      conditions.push(`category = $${paramIndex++}`);
      values.push(params.category);
    }

    if (params.api_version) {
      conditions.push(`api_version = $${paramIndex++}`);
      values.push(params.api_version);
    }

    if (params.query) {
      conditions.push(
        `(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR content_markdown ILIKE $${paramIndex})`
      );
      values.push(`%${params.query}%`);
      paramIndex++;
    }

    if (params.tags && params.tags.length > 0) {
      conditions.push(`tags && $${paramIndex++}::TEXT[]`);
      values.push(params.tags);
    }

    const query = `
      SELECT * FROM dev_documentation_pages
      WHERE ${conditions.join(' AND ')}
      ORDER BY sort_order ASC, published_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    values.push(params.limit || 50, params.offset || 0);

    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error('[DevPortal] Failed to search documentation:', error);
    throw new Error('Failed to search documentation');
  }
}

/**
 * Get documentation page by slug
 */
export async function getDocumentationBySlug(slug: string): Promise<DocumentationPage | null> {
  try {
    const query = `
      SELECT * FROM dev_documentation_pages
      WHERE slug = $1 AND status = 'published'
    `;

    const result = await pool.query(query, [slug]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('[DevPortal] Failed to get documentation:', error);
    throw new Error('Failed to get documentation');
  }
}

/**
 * Get compliance guide by slug
 */
export async function getComplianceGuide(slug: string): Promise<any> {
  try {
    const query = `
      SELECT * FROM dev_compliance_guides
      WHERE slug = $1 AND status = 'published'
    `;

    const result = await pool.query(query, [slug]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('[DevPortal] Failed to get compliance guide:', error);
    throw new Error('Failed to get compliance guide');
  }
}

/**
 * List compliance guides by regulation type
 */
export async function listComplianceGuides(regulationType?: string, region?: string): Promise<any[]> {
  try {
    const conditions: string[] = ["status = 'published'"];
    const values: any[] = [];
    let paramIndex = 1;

    if (regulationType) {
      conditions.push(`regulation_type = $${paramIndex++}`);
      values.push(regulationType);
    }

    if (region) {
      conditions.push(`region = $${paramIndex++}`);
      values.push(region);
    }

    const query = `
      SELECT * FROM dev_compliance_guides
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error('[DevPortal] Failed to list compliance guides:', error);
    throw new Error('Failed to list compliance guides');
  }
}

// =====================================================
// 6. DEVELOPER FEEDBACK SERVICE
// =====================================================

/**
 * Submit developer feedback
 */
export async function submitFeedback(params: {
  user_id?: string;
  tenant_type?: string;
  tenant_id?: string;
  email?: string;
  type: string;
  title: string;
  description: string;
  severity?: string;
  page_url?: string;
  api_endpoint?: string;
  sdk_language?: string;
  api_version?: string;
}): Promise<any> {
  try {
    const query = `
      INSERT INTO dev_feedback (
        user_id, tenant_type, tenant_id, email, type, title, description,
        severity, page_url, api_endpoint, sdk_language, api_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const result = await pool.query(query, [
      params.user_id || null,
      params.tenant_type || null,
      params.tenant_id || null,
      params.email || null,
      params.type,
      params.title,
      params.description,
      params.severity || null,
      params.page_url || null,
      params.api_endpoint || null,
      params.sdk_language || null,
      params.api_version || null,
    ]);

    return result.rows[0];
  } catch (error) {
    console.error('[DevPortal] Failed to submit feedback:', error);
    throw new Error('Failed to submit feedback');
  }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Sanitize request/response headers (remove sensitive data)
 */
function sanitizeHeaders(headers?: Record<string, any>): Record<string, any> {
  if (!headers) return {};

  const sanitized = { ...headers };
  const sensitiveKeys = ['authorization', 'cookie', 'x-api-key', 'x-molam-key'];

  for (const key of sensitiveKeys) {
    if (sanitized[key.toLowerCase()]) {
      sanitized[key.toLowerCase()] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Sanitize request body (remove sensitive fields)
 */
function sanitizeBody(body?: any): any {
  if (!body) return null;
  if (typeof body !== 'object') return body;

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'secret', 'token', 'api_key', 'credit_card', 'cvv', 'ssn'];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Truncate response body if too large
 */
function truncateIfNeeded(data: any, maxBytes: number): any {
  if (!data) return null;

  const jsonString = JSON.stringify(data);
  if (jsonString.length <= maxBytes) {
    return data;
  }

  return {
    __truncated: true,
    __original_size: jsonString.length,
    data: JSON.parse(jsonString.substring(0, maxBytes)),
  };
}

// =====================================================
// EXPORTS
// =====================================================

export default {
  // API Keys
  createAPIKey,
  validateAPIKey,
  revokeAPIKey,
  listAPIKeys,
  getAPIKeyStats,

  // API Logs
  logAPIRequest,
  queryAPILogs,

  // Playground
  createPlaygroundSession,
  executePlaygroundRequest,
  getPlaygroundRequestHistory,

  // SDK
  listSDKVersions,
  trackSDKDownload,

  // Documentation
  searchDocumentation,
  getDocumentationBySlug,
  getComplianceGuide,
  listComplianceGuides,

  // Feedback
  submitFeedback,
};
