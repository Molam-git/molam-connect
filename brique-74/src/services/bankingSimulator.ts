// =====================================================
// Brique 74bis - Banking Network Simulator Service
// =====================================================
// Purpose: Advanced payment simulation with network-specific behaviors, 3DS/OTP flows
// Version: 1.0.0
// =====================================================

import { Pool } from 'pg';
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/molam',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// =====================================================
// TYPES & INTERFACES
// =====================================================

export interface SimulationScenario {
  id: string;
  name: string;
  description?: string;
  category: string;
  network: string;
  provider?: string;
  parameters: Record<string, any>;
  expected_outcome: string;
  response_delay_ms: number;
  failure_rate: number;
  requires_3ds: boolean;
  requires_otp: boolean;
  is_active: boolean;
  is_preset: boolean;
  tags: string[];
}

export interface SimulationRequest {
  scenario_id?: string;
  session_id?: string;
  user_id: string;
  tenant_type: string;
  tenant_id: string;
  amount: number;
  currency: string;
  card?: {
    number: string;
    exp_month: number;
    exp_year: number;
    cvv: string;
    holder_name?: string;
  };
  mobile_money?: {
    phone_number: string;
    provider: string;
  };
  bank_account?: {
    account_number: string;
    routing_number: string;
    account_type: 'checking' | 'savings';
  };
  metadata?: Record<string, any>;
}

export interface SimulationResult {
  id: string;
  success: boolean;
  status: string;
  outcome: string;
  response_payload: Record<string, any>;
  response_time_ms: number;
  requires_3ds?: boolean;
  three_ds_flow?: ThreeDSFlow;
  requires_otp?: boolean;
  otp_flow?: OTPFlow;
  webhook_events?: WebhookEvent[];
  error?: {
    code: string;
    message: string;
    type: string;
  };
}

export interface ThreeDSFlow {
  id: string;
  version: string;
  challenge_type: string;
  challenge_required: boolean;
  challenge_url?: string;
  authentication_status: string;
  transaction_id: string;
  risk_score?: number;
}

export interface OTPFlow {
  id: string;
  delivery_method: string;
  phone_number?: string;
  email_address?: string;
  otp_code: string; // Visible in sandbox
  expires_at: Date;
  verification_status: string;
}

export interface WebhookEvent {
  id: string;
  event_type: string;
  payload: Record<string, any>;
  target_url?: string;
}

// =====================================================
// 1. SCENARIO MANAGEMENT
// =====================================================

/**
 * List available simulation scenarios
 */
export async function listScenarios(filters?: {
  category?: string;
  network?: string;
  tags?: string[];
  is_preset?: boolean;
}): Promise<SimulationScenario[]> {
  try {
    const conditions: string[] = ['is_active = true'];
    const values: any[] = [];
    let paramIndex = 1;

    if (filters?.category) {
      conditions.push(`category = $${paramIndex++}`);
      values.push(filters.category);
    }

    if (filters?.network) {
      conditions.push(`network = $${paramIndex++}`);
      values.push(filters.network);
    }

    if (filters?.is_preset !== undefined) {
      conditions.push(`is_preset = $${paramIndex++}`);
      values.push(filters.is_preset);
    }

    if (filters?.tags && filters.tags.length > 0) {
      conditions.push(`tags && $${paramIndex++}::TEXT[]`);
      values.push(filters.tags);
    }

    const query = `
      SELECT * FROM dev_playground_scenarios
      WHERE ${conditions.join(' AND ')}
      ORDER BY is_preset DESC, name ASC
    `;

    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error('[BankingSimulator] Failed to list scenarios:', error);
    throw new Error('Failed to list scenarios');
  }
}

/**
 * Get scenario by ID
 */
export async function getScenario(scenarioId: string): Promise<SimulationScenario | null> {
  try {
    const query = `SELECT * FROM dev_playground_scenarios WHERE id = $1 AND is_active = true`;
    const result = await pool.query(query, [scenarioId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('[BankingSimulator] Failed to get scenario:', error);
    throw new Error('Failed to get scenario');
  }
}

/**
 * Create custom scenario
 */
export async function createScenario(params: {
  user_id: string;
  name: string;
  description?: string;
  category: string;
  network: string;
  provider?: string;
  parameters: Record<string, any>;
  expected_outcome: string;
  response_delay_ms?: number;
  failure_rate?: number;
  requires_3ds?: boolean;
  requires_otp?: boolean;
  tags?: string[];
}): Promise<SimulationScenario> {
  try {
    const query = `
      INSERT INTO dev_playground_scenarios (
        name, description, category, network, provider, parameters,
        expected_outcome, response_delay_ms, failure_rate,
        requires_3ds, requires_otp, created_by_user_id, tags, is_preset
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, false)
      RETURNING *
    `;

    const result = await pool.query(query, [
      params.name,
      params.description || null,
      params.category,
      params.network,
      params.provider || null,
      JSON.stringify(params.parameters),
      params.expected_outcome,
      params.response_delay_ms || 500,
      params.failure_rate || 0.0,
      params.requires_3ds || false,
      params.requires_otp || false,
      params.user_id,
      params.tags || [],
    ]);

    return result.rows[0];
  } catch (error) {
    console.error('[BankingSimulator] Failed to create scenario:', error);
    throw new Error('Failed to create scenario');
  }
}

// =====================================================
// 2. SIMULATION EXECUTION
// =====================================================

/**
 * Execute a payment simulation
 */
export async function executeSimulation(request: SimulationRequest): Promise<SimulationResult> {
  const startTime = Date.now();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get scenario
    let scenario: SimulationScenario | null = null;
    if (request.scenario_id) {
      const scenarioResult = await client.query(
        'SELECT * FROM dev_playground_scenarios WHERE id = $1 AND is_active = true',
        [request.scenario_id]
      );
      scenario = scenarioResult.rows[0] || null;
    }

    if (!scenario) {
      throw new Error('Scenario not found');
    }

    // Apply artificial delay
    if (scenario.response_delay_ms > 0) {
      await sleep(scenario.response_delay_ms);
    }

    // Apply failure rate (chaos testing)
    const shouldFail = Math.random() < scenario.failure_rate;

    // Execute simulation based on network
    let result: SimulationResult;

    if (scenario.requires_3ds) {
      result = await execute3DSSimulation(client, request, scenario);
    } else if (scenario.requires_otp) {
      result = await executeOTPSimulation(client, request, scenario);
    } else {
      result = await executeStandardSimulation(client, request, scenario, shouldFail);
    }

    // Calculate response time
    const responseTime = Date.now() - startTime;
    result.response_time_ms = responseTime;

    // Log execution
    await logSimulationExecution(client, {
      session_id: request.session_id,
      scenario_id: scenario.id,
      user_id: request.user_id,
      tenant_type: request.tenant_type,
      tenant_id: request.tenant_id,
      request_payload: request,
      network: scenario.network,
      provider: scenario.provider,
      expected_outcome: scenario.expected_outcome,
      actual_outcome: result.outcome,
      response_status_code: result.success ? 200 : 400,
      response_payload: result.response_payload,
      response_time_ms: responseTime,
      delay_injected_ms: scenario.response_delay_ms,
      requires_3ds: scenario.requires_3ds,
      three_ds_version: result.three_ds_flow?.version,
      requires_otp: scenario.requires_otp,
      otp_delivery_method: result.otp_flow?.delivery_method,
      webhook_events_generated: result.webhook_events?.map((e) => e.event_type),
      success: result.success,
      error_code: result.error?.code,
      error_message: result.error?.message,
      error_type: result.error?.type,
    });

    await client.query('COMMIT');

    return result;
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[BankingSimulator] Simulation failed:', error);
    throw new Error(error.message || 'Simulation execution failed');
  } finally {
    client.release();
  }
}

/**
 * Execute standard payment simulation (no 3DS/OTP)
 */
async function executeStandardSimulation(
  client: any,
  request: SimulationRequest,
  scenario: SimulationScenario,
  forceFail: boolean
): Promise<SimulationResult> {
  const shouldSucceed = scenario.expected_outcome === 'success' && !forceFail;

  if (shouldSucceed) {
    // Success scenario
    const transactionId = generateTransactionId(scenario.network);
    const authCode = generateAuthCode();

    const webhookEvents: WebhookEvent[] = [];

    // Generate payment.succeeded webhook
    const successEvent = await createWebhookEvent(client, {
      event_type: 'payment.succeeded',
      payload: {
        id: transactionId,
        amount: request.amount,
        currency: request.currency,
        network: scenario.network,
        status: 'succeeded',
        auth_code: authCode,
        created_at: new Date().toISOString(),
      },
    });
    webhookEvents.push(successEvent);

    return {
      id: transactionId,
      success: true,
      status: 'succeeded',
      outcome: 'success',
      response_payload: {
        id: transactionId,
        object: 'payment',
        amount: request.amount,
        currency: request.currency,
        status: 'succeeded',
        network: scenario.network,
        authorization_code: authCode,
        created_at: new Date().toISOString(),
        metadata: request.metadata || {},
      },
      response_time_ms: 0, // Will be set by caller
      webhook_events: webhookEvents,
    };
  } else {
    // Failure scenario
    const errorMapping = getErrorMapping(scenario.network, scenario.expected_outcome);

    const webhookEvents: WebhookEvent[] = [];

    // Generate payment.failed webhook
    const failEvent = await createWebhookEvent(client, {
      event_type: 'payment.failed',
      payload: {
        id: generateTransactionId(scenario.network),
        amount: request.amount,
        currency: request.currency,
        network: scenario.network,
        status: 'failed',
        error: errorMapping,
        created_at: new Date().toISOString(),
      },
    });
    webhookEvents.push(failEvent);

    return {
      id: generateTransactionId(scenario.network),
      success: false,
      status: 'failed',
      outcome: scenario.expected_outcome,
      response_payload: {
        error: errorMapping,
      },
      response_time_ms: 0,
      webhook_events: webhookEvents,
      error: errorMapping,
    };
  }
}

/**
 * Execute 3D Secure simulation
 */
async function execute3DSSimulation(
  client: any,
  request: SimulationRequest,
  scenario: SimulationScenario
): Promise<SimulationResult> {
  const transactionId = generateTransactionId(scenario.network);
  const threeDSVersion = scenario.parameters['3ds_version'] || '2.1';
  const challengeType = scenario.parameters['challenge_type'] || 'challenge';

  // Calculate risk score
  const riskScore = calculateRiskScore(request.amount, scenario.network);

  // Create 3DS authentication record
  const threeDSId = crypto.randomUUID();
  await client.query(
    `INSERT INTO dev_3ds_authentications (
      id, version, challenge_type, authentication_request,
      challenge_required, challenge_url, authentication_status,
      transaction_id, risk_score, risk_level
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      threeDSId,
      threeDSVersion,
      challengeType,
      JSON.stringify({
        amount: request.amount,
        currency: request.currency,
        card_number: request.card?.number?.slice(-4),
      }),
      challengeType === 'challenge',
      challengeType === 'challenge' ? `https://3ds-simulator.molam.com/${threeDSId}` : null,
      challengeType === 'frictionless' ? 'authenticated' : 'challenge_required',
      transactionId,
      riskScore,
      riskScore < 30 ? 'low' : riskScore < 70 ? 'medium' : 'high',
    ]
  );

  const threeDSFlow: ThreeDSFlow = {
    id: threeDSId,
    version: threeDSVersion,
    challenge_type: challengeType,
    challenge_required: challengeType === 'challenge',
    challenge_url:
      challengeType === 'challenge' ? `https://3ds-simulator.molam.com/${threeDSId}` : undefined,
    authentication_status: challengeType === 'frictionless' ? 'authenticated' : 'challenge_required',
    transaction_id: transactionId,
    risk_score: riskScore,
  };

  return {
    id: transactionId,
    success: challengeType === 'frictionless',
    status: challengeType === 'frictionless' ? 'succeeded' : 'requires_action',
    outcome: '3ds_required',
    response_payload: {
      id: transactionId,
      status: challengeType === 'frictionless' ? 'succeeded' : 'requires_action',
      three_ds: {
        version: threeDSVersion,
        challenge_url: threeDSFlow.challenge_url,
        authentication_status: threeDSFlow.authentication_status,
        risk_score: riskScore,
      },
    },
    response_time_ms: 0,
    requires_3ds: true,
    three_ds_flow: threeDSFlow,
  };
}

/**
 * Execute OTP simulation (mobile money, banking)
 */
async function executeOTPSimulation(
  client: any,
  request: SimulationRequest,
  scenario: SimulationScenario
): Promise<SimulationResult> {
  const transactionId = generateTransactionId(scenario.network);
  const deliveryMethod = scenario.parameters['otp_delivery_method'] || 'sms';
  const otpCode = generateOTPCode();

  // Create OTP verification record
  const otpId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await client.query(
    `INSERT INTO dev_otp_verifications (
      id, delivery_method, phone_number, otp_code, expires_at
    ) VALUES ($1, $2, $3, $4, $5)`,
    [
      otpId,
      deliveryMethod,
      request.mobile_money?.phone_number || request.metadata?.phone_number || '+1234567890',
      otpCode,
      expiresAt,
    ]
  );

  const otpFlow: OTPFlow = {
    id: otpId,
    delivery_method: deliveryMethod,
    phone_number: request.mobile_money?.phone_number || request.metadata?.phone_number,
    otp_code: otpCode, // Visible in sandbox
    expires_at: expiresAt,
    verification_status: 'pending',
  };

  return {
    id: transactionId,
    success: false, // Pending OTP verification
    status: 'pending',
    outcome: 'otp_required',
    response_payload: {
      id: transactionId,
      status: 'pending',
      otp: {
        delivery_method: deliveryMethod,
        phone_number: otpFlow.phone_number,
        // In sandbox mode, show OTP code
        otp_code_sandbox: otpCode,
        expires_at: expiresAt.toISOString(),
        verification_url: `https://otp-simulator.molam.com/${otpId}`,
      },
    },
    response_time_ms: 0,
    requires_otp: true,
    otp_flow: otpFlow,
  };
}

/**
 * Verify OTP code
 */
export async function verifyOTP(otpId: string, otpCode: string): Promise<{ verified: boolean; message: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query('SELECT * FROM dev_otp_verifications WHERE id = $1', [otpId]);

    if (result.rows.length === 0) {
      await client.query('COMMIT');
      return { verified: false, message: 'OTP verification not found' };
    }

    const otp = result.rows[0];

    // Check expiration
    if (new Date() > new Date(otp.expires_at)) {
      await client.query("UPDATE dev_otp_verifications SET verification_status = 'expired' WHERE id = $1", [otpId]);
      await client.query('COMMIT');
      return { verified: false, message: 'OTP expired' };
    }

    // Check max attempts
    if (otp.attempts_made >= otp.attempts_allowed) {
      await client.query(
        "UPDATE dev_otp_verifications SET verification_status = 'max_attempts_exceeded' WHERE id = $1",
        [otpId]
      );
      await client.query('COMMIT');
      return { verified: false, message: 'Maximum attempts exceeded' };
    }

    // Increment attempts
    await client.query('UPDATE dev_otp_verifications SET attempts_made = attempts_made + 1 WHERE id = $1', [otpId]);

    // Verify code
    if (otp.otp_code === otpCode) {
      await client.query(
        "UPDATE dev_otp_verifications SET verification_status = 'verified', verified_at = now() WHERE id = $1",
        [otpId]
      );
      await client.query('COMMIT');
      return { verified: true, message: 'OTP verified successfully' };
    } else {
      await client.query(
        "UPDATE dev_otp_verifications SET verification_status = 'failed', failed_reason = 'incorrect_code' WHERE id = $1",
        [otpId]
      );
      await client.query('COMMIT');
      return { verified: false, message: 'Incorrect OTP code' };
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[BankingSimulator] OTP verification failed:', error);
    throw new Error('OTP verification failed');
  } finally {
    client.release();
  }
}

// =====================================================
// 3. WEBHOOK SIMULATION
// =====================================================

/**
 * Create webhook event for simulation
 */
async function createWebhookEvent(
  client: any,
  params: {
    event_type: string;
    payload: Record<string, any>;
    target_url?: string;
  }
): Promise<WebhookEvent> {
  const eventId = crypto.randomUUID();

  await client.query(
    `INSERT INTO dev_webhook_simulation_events (id, event_type, event_payload, target_url)
     VALUES ($1, $2, $3, $4)`,
    [eventId, params.event_type, JSON.stringify(params.payload), params.target_url || null]
  );

  return {
    id: eventId,
    event_type: params.event_type,
    payload: params.payload,
    target_url: params.target_url,
  };
}

/**
 * Replay webhook event
 */
export async function replayWebhook(eventId: string, targetUrl: string): Promise<void> {
  try {
    const result = await pool.query('SELECT * FROM dev_webhook_simulation_events WHERE id = $1', [eventId]);

    if (result.rows.length === 0) {
      throw new Error('Webhook event not found');
    }

    const event = result.rows[0];

    // TODO: Send webhook to target URL
    // const response = await axios.post(targetUrl, event.event_payload);

    // Update replay count
    await pool.query(
      'UPDATE dev_webhook_simulation_events SET replay_count = replay_count + 1, last_replayed_at = now() WHERE id = $1',
      [eventId]
    );
  } catch (error) {
    console.error('[BankingSimulator] Webhook replay failed:', error);
    throw new Error('Webhook replay failed');
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateTransactionId(network: string): string {
  const prefix = {
    visa: 'visa',
    mastercard: 'mc',
    amex: 'amex',
    mobile_money: 'momo',
    bank_ach: 'ach',
    sepa: 'sepa',
  }[network] || 'pay';

  return `${prefix}_sim_${crypto.randomBytes(12).toString('hex')}`;
}

function generateAuthCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateOTPCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function calculateRiskScore(amount: number, network: string): number {
  let score = 50; // Base score

  // Amount-based adjustment
  if (amount > 100000) score += 20;
  else if (amount < 1000) score -= 10;

  // Network-based adjustment
  if (network === 'mobile_money') score += 5;

  // Random variation
  score += Math.floor(Math.random() * 20) - 10;

  return Math.max(0, Math.min(100, score));
}

function getErrorMapping(network: string, expectedOutcome: string): { code: string; message: string; type: string } {
  const errorMappings: Record<string, Record<string, any>> = {
    visa: {
      insufficient_funds: { code: '51', message: 'Insufficient funds', type: 'card_error' },
      card_declined: { code: '05', message: 'Card declined', type: 'card_error' },
      fraud_detected: { code: '59', message: 'Suspected fraud', type: 'fraud_error' },
      expired_card: { code: '54', message: 'Expired card', type: 'card_error' },
    },
    mastercard: {
      insufficient_funds: { code: '51', message: 'Insufficient funds', type: 'card_error' },
      card_declined: { code: '05', message: 'Card declined', type: 'card_error' },
    },
    mobile_money: {
      insufficient_funds: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance', type: 'balance_error' },
      invalid_number: { code: 'INVALID_MSISDN', message: 'Invalid phone number', type: 'validation_error' },
    },
  };

  return errorMappings[network]?.[expectedOutcome] || {
    code: 'generic_error',
    message: 'An error occurred',
    type: 'api_error',
  };
}

async function logSimulationExecution(client: any, params: any): Promise<void> {
  await client.query(
    `INSERT INTO dev_simulation_executions (
      session_id, scenario_id, user_id, tenant_type, tenant_id,
      request_payload, network, provider, expected_outcome, actual_outcome,
      response_status_code, response_payload, response_time_ms, delay_injected_ms,
      requires_3ds, three_ds_version, requires_otp, otp_delivery_method,
      webhook_events_generated, success, error_code, error_message, error_type
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
    [
      params.session_id,
      params.scenario_id,
      params.user_id,
      params.tenant_type,
      params.tenant_id,
      JSON.stringify(params.request_payload),
      params.network,
      params.provider,
      params.expected_outcome,
      params.actual_outcome,
      params.response_status_code,
      JSON.stringify(params.response_payload),
      params.response_time_ms,
      params.delay_injected_ms,
      params.requires_3ds || false,
      params.three_ds_version || null,
      params.requires_otp || false,
      params.otp_delivery_method || null,
      params.webhook_events_generated || [],
      params.success,
      params.error_code || null,
      params.error_message || null,
      params.error_type || null,
    ]
  );
}

// =====================================================
// EXPORTS
// =====================================================

export default {
  listScenarios,
  getScenario,
  createScenario,
  executeSimulation,
  verifyOTP,
  replayWebhook,
};
