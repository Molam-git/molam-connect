// =====================================================
// Brique 74ter - API Mock Generator Service
// =====================================================
// Purpose: Auto-generate API mocks from OpenAPI specs with SIRA learning
// Version: 1.0.0
// =====================================================

import { Pool } from 'pg';
import crypto from 'crypto';
import axios from 'axios';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/molam',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// =====================================================
// TYPES & INTERFACES
// =====================================================

export interface MockEnvironment {
  id: string;
  name: string;
  description?: string;
  base_url: string;
  tenant_type: string;
  tenant_id: string;
  created_by_user_id: string;
  is_public: boolean;
  public_token?: string;
  openapi_spec_url?: string;
  openapi_spec?: any;
  openapi_version?: string;
  latency_min_ms: number;
  latency_max_ms: number;
  error_rate: number;
  rules: Record<string, any>;
  active_scenario_id?: string;
  status: string;
  sira_learning_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MockScenario {
  id: string;
  name: string;
  description?: string;
  category: string;
  latency_override_ms?: number;
  error_rate_override?: number;
  status_code_distribution: Record<string, number>;
  response_template?: any;
  trigger_conditions: Record<string, any>;
  is_preset: boolean;
  tags: string[];
}

export interface MockEndpoint {
  id: string;
  env_id: string;
  method: string;
  path_pattern: string;
  status_code: number;
  response_template: any;
  response_headers: Record<string, string>;
  latency_ms: number;
  failure_rate: number;
  request_schema?: any;
  response_schema?: any;
  is_active: boolean;
}

export interface MockRequestLog {
  id: string;
  env_id: string;
  scenario_id?: string;
  endpoint_id?: string;
  method: string;
  path: string;
  query_params: Record<string, any>;
  request_headers: Record<string, any>;
  request_body?: any;
  status_code: number;
  response_headers: Record<string, any>;
  response_body: any;
  latency_ms: number;
  client_ip?: string;
  user_agent?: string;
  request_id: string;
}

export interface MockRequest {
  method: string;
  path: string;
  query?: Record<string, any>;
  headers?: Record<string, any>;
  body?: any;
  client_ip?: string;
  user_agent?: string;
}

export interface MockResponse {
  status_code: number;
  headers: Record<string, any>;
  body: any;
  latency_ms: number;
}

// =====================================================
// 1. MOCK ENVIRONMENT MANAGEMENT
// =====================================================

/**
 * Create a new mock environment
 */
export async function createMockEnvironment(params: {
  name: string;
  description?: string;
  base_url: string;
  tenant_type: string;
  tenant_id: string;
  created_by_user_id: string;
  is_public?: boolean;
  openapi_spec_url?: string;
  latency_min_ms?: number;
  latency_max_ms?: number;
  error_rate?: number;
  rules?: Record<string, any>;
  sira_learning_enabled?: boolean;
}): Promise<MockEnvironment> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generate public token if public
    const publicToken = params.is_public ? await generatePublicToken() : null;

    // Download and parse OpenAPI spec if URL provided
    let openApiSpec = null;
    let openApiVersion = null;
    if (params.openapi_spec_url) {
      const specData = await fetchOpenAPISpec(params.openapi_spec_url);
      openApiSpec = specData.spec;
      openApiVersion = specData.version;
    }

    const query = `
      INSERT INTO dev_api_mock_envs (
        name, description, base_url, tenant_type, tenant_id, created_by_user_id,
        is_public, public_token, openapi_spec_url, openapi_spec, openapi_version,
        latency_min_ms, latency_max_ms, error_rate, rules, sira_learning_enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const result = await client.query(query, [
      params.name,
      params.description || null,
      params.base_url,
      params.tenant_type,
      params.tenant_id,
      params.created_by_user_id,
      params.is_public || false,
      publicToken,
      params.openapi_spec_url || null,
      openApiSpec ? JSON.stringify(openApiSpec) : null,
      openApiVersion,
      params.latency_min_ms || 0,
      params.latency_max_ms || 0,
      params.error_rate || 0,
      JSON.stringify(params.rules || {}),
      params.sira_learning_enabled !== false,
    ]);

    // If OpenAPI spec provided, auto-generate endpoints
    if (openApiSpec) {
      await generateEndpointsFromOpenAPI(client, result.rows[0].id, openApiSpec);
    }

    await client.query('COMMIT');

    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[MockGenerator] Failed to create environment:', error);
    throw new Error('Failed to create mock environment');
  } finally {
    client.release();
  }
}

/**
 * Get mock environment by ID or public token
 */
export async function getMockEnvironment(
  identifier: string,
  byPublicToken: boolean = false
): Promise<MockEnvironment | null> {
  try {
    const query = byPublicToken
      ? 'SELECT * FROM dev_api_mock_envs WHERE public_token = $1 AND is_public = true AND status = $2'
      : 'SELECT * FROM dev_api_mock_envs WHERE id = $1';

    const result = await pool.query(query, byPublicToken ? [identifier, 'active'] : [identifier]);

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('[MockGenerator] Failed to get environment:', error);
    throw new Error('Failed to get mock environment');
  }
}

/**
 * List mock environments for a tenant
 */
export async function listMockEnvironments(tenantType: string, tenantId: string): Promise<MockEnvironment[]> {
  try {
    const query = `
      SELECT * FROM dev_api_mock_envs
      WHERE tenant_type = $1 AND tenant_id = $2 AND status != 'archived'
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [tenantType, tenantId]);
    return result.rows;
  } catch (error) {
    console.error('[MockGenerator] Failed to list environments:', error);
    throw new Error('Failed to list mock environments');
  }
}

// =====================================================
// 2. MOCK REQUEST HANDLING
// =====================================================

/**
 * Handle a mock API request
 */
export async function handleMockRequest(
  envId: string,
  request: MockRequest
): Promise<MockResponse> {
  const startTime = Date.now();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get environment
    const envResult = await client.query('SELECT * FROM dev_api_mock_envs WHERE id = $1', [envId]);
    if (envResult.rows.length === 0) {
      throw new Error('Mock environment not found');
    }

    const env: MockEnvironment = envResult.rows[0];

    // Get active scenario if any
    let scenario: MockScenario | null = null;
    if (env.active_scenario_id) {
      const scenarioResult = await client.query(
        'SELECT * FROM dev_api_mock_scenarios WHERE id = $1',
        [env.active_scenario_id]
      );
      scenario = scenarioResult.rows[0] || null;
    }

    // Find matching endpoint
    const endpoint = await findMatchingEndpoint(client, envId, request.method, request.path);

    // Determine latency
    const latencyMs = calculateLatency(env, scenario, endpoint);

    // Apply latency
    if (latencyMs > 0) {
      await sleep(latencyMs);
    }

    // Determine status code
    const statusCode = determineStatusCode(env, scenario, endpoint);

    // Generate response
    const responseBody = await generateResponse(client, env, endpoint, request, statusCode);

    const responseHeaders = {
      'Content-Type': 'application/json',
      'X-Mock-Environment': env.name,
      'X-Mock-Latency': latencyMs.toString(),
      ...(endpoint?.response_headers || {}),
    };

    const actualLatency = Date.now() - startTime;

    // Log request
    const requestId = crypto.randomUUID();
    await logMockRequest(client, {
      env_id: envId,
      scenario_id: scenario?.id,
      endpoint_id: endpoint?.id,
      method: request.method,
      path: request.path,
      query_params: request.query || {},
      request_headers: request.headers || {},
      request_body: request.body,
      status_code: statusCode,
      response_headers: responseHeaders,
      response_body: responseBody,
      latency_ms: actualLatency,
      client_ip: request.client_ip,
      user_agent: request.user_agent,
      request_id: requestId,
    });

    // SIRA learning (async, non-blocking)
    if (env.sira_learning_enabled) {
      analyzeMockRequestForSIRA(env.id, request, responseBody).catch((err) =>
        console.error('[MockGenerator] SIRA analysis failed:', err)
      );
    }

    await client.query('COMMIT');

    return {
      status_code: statusCode,
      headers: responseHeaders,
      body: responseBody,
      latency_ms: actualLatency,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[MockGenerator] Failed to handle request:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Find matching endpoint for request
 */
async function findMatchingEndpoint(
  client: any,
  envId: string,
  method: string,
  path: string
): Promise<MockEndpoint | null> {
  const query = `
    SELECT * FROM dev_api_mock_endpoints
    WHERE env_id = $1 AND method = $2 AND is_active = true
    ORDER BY path_pattern DESC
  `;

  const result = await client.query(query, [envId, method]);

  // Find first matching pattern
  for (const endpoint of result.rows) {
    if (matchPathPattern(path, endpoint.path_pattern)) {
      return endpoint;
    }
  }

  return null;
}

/**
 * Calculate latency for request
 */
function calculateLatency(
  env: MockEnvironment,
  scenario: MockScenario | null,
  endpoint: MockEndpoint | null
): number {
  // Priority: endpoint > scenario > environment
  if (endpoint && endpoint.latency_ms > 0) {
    return endpoint.latency_ms;
  }

  if (scenario && scenario.latency_override_ms) {
    return scenario.latency_override_ms;
  }

  // Random latency within environment range
  if (env.latency_max_ms > env.latency_min_ms) {
    return Math.floor(Math.random() * (env.latency_max_ms - env.latency_min_ms) + env.latency_min_ms);
  }

  return env.latency_min_ms;
}

/**
 * Determine status code for response
 */
function determineStatusCode(
  env: MockEnvironment,
  scenario: MockScenario | null,
  endpoint: MockEndpoint | null
): number {
  // Priority: endpoint > scenario > environment

  // Scenario status code distribution
  if (scenario && scenario.status_code_distribution) {
    return weightedRandomStatusCode(scenario.status_code_distribution);
  }

  // Endpoint default
  if (endpoint) {
    // Check failure rate
    if (endpoint.failure_rate > 0 && Math.random() * 100 < endpoint.failure_rate) {
      return 500;
    }
    return endpoint.status_code;
  }

  // Environment error rate
  if (env.error_rate > 0 && Math.random() * 100 < env.error_rate) {
    return 500;
  }

  return 200;
}

/**
 * Generate response body
 */
async function generateResponse(
  client: any,
  env: MockEnvironment,
  endpoint: MockEndpoint | null,
  request: MockRequest,
  statusCode: number
): Promise<any> {
  // Use endpoint template if available
  if (endpoint && endpoint.response_template) {
    return processTemplate(endpoint.response_template, request);
  }

  // Use SIRA learned patterns if available
  if (env.sira_learning_enabled) {
    const learnedResponse = await getSIRALearnedResponse(client, request.path, request.method);
    if (learnedResponse) {
      return learnedResponse;
    }
  }

  // Default responses
  if (statusCode >= 400) {
    return {
      error: {
        type: 'mock_error',
        code: statusCode === 404 ? 'not_found' : statusCode === 429 ? 'rate_limited' : 'internal_error',
        message: 'Mock error response',
      },
    };
  }

  return {
    mock: true,
    path: request.path,
    method: request.method,
    timestamp: new Date().toISOString(),
    data: {},
  };
}

// =====================================================
// 3. OPENAPI INTEGRATION
// =====================================================

/**
 * Fetch and parse OpenAPI specification
 */
async function fetchOpenAPISpec(url: string): Promise<{ spec: any; version: string }> {
  try {
    const response = await axios.get(url);
    const spec = response.data;

    // Detect version
    const version = spec.openapi || spec.swagger || '3.0';

    return { spec, version };
  } catch (error) {
    console.error('[MockGenerator] Failed to fetch OpenAPI spec:', error);
    throw new Error('Failed to fetch OpenAPI specification');
  }
}

/**
 * Generate endpoints from OpenAPI spec
 */
async function generateEndpointsFromOpenAPI(client: any, envId: string, spec: any): Promise<void> {
  try {
    const paths = spec.paths || {};

    for (const [path, pathItem] of Object.entries(paths)) {
      const methods = ['get', 'post', 'put', 'delete', 'patch'];

      for (const method of methods) {
        const operation = (pathItem as any)[method];
        if (!operation) continue;

        // Generate response template from OpenAPI responses
        const responseTemplate = generateResponseFromSchema(operation.responses);

        await client.query(
          `INSERT INTO dev_api_mock_endpoints (
            env_id, method, path_pattern, status_code, response_template,
            openapi_operation_id, openapi_path
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (env_id, method, path_pattern) DO NOTHING`,
          [
            envId,
            method.toUpperCase(),
            path,
            200,
            JSON.stringify(responseTemplate),
            operation.operationId || null,
            path,
          ]
        );
      }
    }
  } catch (error) {
    console.error('[MockGenerator] Failed to generate endpoints from OpenAPI:', error);
    throw error;
  }
}

/**
 * Generate response from OpenAPI response schema
 */
function generateResponseFromSchema(responses: any): any {
  // Get 200 response
  const successResponse = responses['200'] || responses['201'] || responses['default'];
  if (!successResponse) {
    return { message: 'Success' };
  }

  // Extract schema
  const schema =
    successResponse.content?.['application/json']?.schema ||
    successResponse.schema ||
    {};

  // Generate example from schema
  return generateExampleFromSchema(schema);
}

/**
 * Generate example data from JSON Schema
 */
function generateExampleFromSchema(schema: any): any {
  if (schema.example) return schema.example;
  if (schema.examples && schema.examples.length > 0) return schema.examples[0];

  if (schema.type === 'object') {
    const result: any = {};
    const properties = schema.properties || {};

    for (const [key, propSchema] of Object.entries(properties)) {
      result[key] = generateExampleFromSchema(propSchema as any);
    }

    return result;
  }

  if (schema.type === 'array') {
    return [generateExampleFromSchema(schema.items || {})];
  }

  if (schema.type === 'string') {
    if (schema.format === 'date-time') return new Date().toISOString();
    if (schema.format === 'uuid') return crypto.randomUUID();
    if (schema.format === 'email') return 'user@example.com';
    return 'string';
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    return schema.minimum || 0;
  }

  if (schema.type === 'boolean') {
    return true;
  }

  return null;
}

// =====================================================
// 4. SIRA LEARNING INTEGRATION
// =====================================================

/**
 * Analyze mock request for SIRA learning
 */
async function analyzeMockRequestForSIRA(
  envId: string,
  request: MockRequest,
  response: any
): Promise<void> {
  // This would integrate with SIRA AI to learn patterns
  // For now, just store the pattern

  try {
    // Extract common fields
    const commonFields = Object.keys(request.body || {});

    const patternDefinition = {
      common_fields: commonFields,
      typical_values: {},
      request_example: request.body,
      response_example: response,
    };

    await pool.query(
      `INSERT INTO dev_sira_learned_patterns (
        pattern_type, endpoint_pattern, method, pattern_definition, source, confidence_score
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING`,
      [
        'request_pattern',
        request.path,
        request.method,
        JSON.stringify(patternDefinition),
        'simulations',
        0.7,
      ]
    );
  } catch (error) {
    console.error('[MockGenerator] Failed to analyze for SIRA:', error);
  }
}

/**
 * Get SIRA learned response for endpoint
 */
async function getSIRALearnedResponse(
  client: any,
  path: string,
  method: string
): Promise<any | null> {
  try {
    const query = `
      SELECT pattern_definition FROM dev_sira_learned_patterns
      WHERE endpoint_pattern = $1 AND method = $2 AND pattern_type = 'response_pattern'
      ORDER BY confidence_score DESC, learned_at DESC
      LIMIT 1
    `;

    const result = await client.query(query, [path, method]);

    if (result.rows.length > 0) {
      return result.rows[0].pattern_definition.response_example || null;
    }

    return null;
  } catch (error) {
    console.error('[MockGenerator] Failed to get SIRA learned response:', error);
    return null;
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generatePublicToken(): Promise<string> {
  const result = await pool.query('SELECT generate_mock_public_token() AS token');
  return result.rows[0].token;
}

function matchPathPattern(path: string, pattern: string): boolean {
  // Convert OpenAPI path pattern to regex
  // /api/payments/{id} -> /api/payments/[^/]+
  const regexPattern = pattern
    .replace(/\{[^}]+\}/g, '[^/]+')
    .replace(/\*/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

function weightedRandomStatusCode(distribution: Record<string, number>): number {
  const random = Math.random();
  let cumulative = 0;

  for (const [statusCode, weight] of Object.entries(distribution)) {
    cumulative += weight;
    if (random <= cumulative) {
      return parseInt(statusCode);
    }
  }

  return 200; // Default fallback
}

function processTemplate(template: any, request: MockRequest): any {
  // Simple template processing
  // In production, would use Handlebars or similar
  let result = JSON.stringify(template);

  // Replace {{uuid}}
  result = result.replace(/\{\{uuid\}\}/g, crypto.randomUUID());

  // Replace {{timestamp}}
  result = result.replace(/\{\{timestamp\}\}/g, new Date().toISOString());

  // Replace {{email}}
  result = result.replace(/\{\{email\}\}/g, 'user@example.com');

  // Replace {{name}}
  result = result.replace(/\{\{name\}\}/g, 'John Doe');

  return JSON.parse(result);
}

async function logMockRequest(client: any, log: Partial<MockRequestLog>): Promise<void> {
  await client.query(
    `INSERT INTO dev_api_mock_logs (
      env_id, scenario_id, endpoint_id, method, path, query_params,
      request_headers, request_body, status_code, response_headers,
      response_body, latency_ms, client_ip, user_agent, request_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      log.env_id,
      log.scenario_id || null,
      log.endpoint_id || null,
      log.method,
      log.path,
      JSON.stringify(log.query_params || {}),
      JSON.stringify(log.request_headers || {}),
      log.request_body ? JSON.stringify(log.request_body) : null,
      log.status_code,
      JSON.stringify(log.response_headers || {}),
      JSON.stringify(log.response_body),
      log.latency_ms,
      log.client_ip || null,
      log.user_agent || null,
      log.request_id,
    ]
  );
}

// =====================================================
// EXPORTS
// =====================================================

export default {
  createMockEnvironment,
  getMockEnvironment,
  listMockEnvironments,
  handleMockRequest,
};
