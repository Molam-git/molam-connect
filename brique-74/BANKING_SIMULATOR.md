## Brique 74bis - Banking Network Simulator

**Advanced Payment Simulation with Network-Specific Behaviors**
Version: 1.0.0
Status: ✅ Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Supported Networks](#supported-networks)
5. [3DS & OTP Flows](#3ds--otp-flows)
6. [API Reference](#api-reference)
7. [Usage Examples](#usage-examples)
8. [Best Practices](#best-practices)

---

## Overview

### What is the Banking Network Simulator?

Brique 74bis extends the Developer Portal Playground with **advanced banking network simulation** capabilities, allowing developers to:

- **Test realistic payment flows** across Visa, Mastercard, Mobile Money, Bank ACH, and SEPA
- **Simulate 3D Secure (3DS)** authentication flows (versions 1.0, 2.0, 2.1)
- **Test OTP verification** for mobile money and African banking scenarios
- **Generate webhook events** for integration testing
- **Inject failures, delays, and fraud scenarios** for chaos engineering

### Why is this needed?

**Problem**: Traditional payment testing is limited:
- Stripe test mode: Only basic success/failure scenarios
- PayPal sandbox: Slow, unreliable, limited African payment methods
- Real testing: Expensive, risky, slow feedback loops

**Solution**: Brique 74bis provides:
- ✅ **20+ preset scenarios** covering all common payment flows
- ✅ **Network-specific behaviors** (Visa response codes, MTN Mobile Money delays, etc.)
- ✅ **3DS 2.1 compliance testing** with challenge/frictionless flows
- ✅ **OTP simulation** for African mobile payments
- ✅ **Webhook replay** for integration testing
- ✅ **Fraud pattern simulation** for security testing
- ✅ **Zero cost, instant feedback** in sandbox mode

---

## Features

### 1. Multi-Network Support

**Supported Payment Networks:**
- **Card Networks**: Visa, Mastercard, AmEx, Discover
- **Mobile Money**: MTN Mobile Money, Orange Money, Wave, Moov
- **Bank Transfers**: ACH (US), SEPA (EU), SWIFT (International)

**Network-Specific Behaviors:**
- Visa: Standard response codes (00, 05, 51, 59)
- Mastercard: 3DS 2.0 compliance, SecureCode
- Mobile Money: OTP flows, USSD sessions, delayed settlement
- ACH: Pending status, return codes (R01, R02, R03)

### 2. 3D Secure (3DS) Simulation

**Versions Supported:**
- 3DS 1.0: Browser redirect, MPI flows
- 3DS 2.0: Frictionless, challenge, fallback
- 3DS 2.1: Latest EMVCo specification

**Challenge Types:**
- **Frictionless**: Low-risk transactions, instant approval
- **Challenge**: User must complete authentication (OTP, biometric)
- **Fallback**: 3DS unavailable, fallback to 3DS 1.0

**Risk Assessment:**
- Dynamic risk scoring (0-100) based on:
  - Transaction amount
  - Merchant category
  - Customer history
  - Device fingerprinting (simulated)

### 3. OTP Verification

**Delivery Methods:**
- SMS: Standard SMS OTP
- USSD: Interactive USSD session
- Email: Backup OTP delivery
- App Push: Mobile app notification
- Voice: Automated voice call

**Features:**
- 6-digit OTP codes
- 5-minute expiration
- 3 attempts limit
- Resend functionality
- **Sandbox mode**: OTP code visible in response

### 4. Scenario Management

**Preset Scenarios (20+):**
- Visa payment success
- Visa payment declined (insufficient funds)
- Visa 3DS required
- Mastercard 3DS challenge
- MTN Mobile Money success
- MTN Mobile Money OTP required
- ACH payment pending
- Refund scenarios
- Dispute scenarios

**Custom Scenarios:**
- Create your own scenarios
- Configure network, outcome, delays, failure rates
- Tag and categorize for organization

### 5. Webhook Simulation

**Automatic Webhook Generation:**
- `payment.succeeded`
- `payment.failed`
- `charge.captured`
- `refund.processed`
- `dispute.created`
- `payout.paid`

**Replay Functionality:**
- Replay webhooks to your endpoint
- Test webhook handling logic
- Simulate delayed/failed webhook deliveries

### 6. Fraud Pattern Simulation

**Fraud Types:**
- Card testing attacks
- Velocity abuse
- Account takeover
- Friendly fraud
- BIN attacks

**SIRA Integration:**
- Simulations feed into SIRA AI
- Test fraud detection algorithms
- Measure false positive/negative rates

---

## Architecture

### System Design

```
┌─────────────────────────────────────────────────┐
│        Banking Simulator Frontend (React)        │
│  - Scenario Selector (Apple-like UI)            │
│  - Simulation Executor                           │
│  - 3DS/OTP Flow Components                       │
└─────────────────┬───────────────────────────────┘
                  │ HTTPS
┌─────────────────▼───────────────────────────────┐
│         Banking Simulator API Routes             │
│  - POST /dev/simulator/simulate                  │
│  - POST /dev/simulator/3ds/:id/complete          │
│  - POST /dev/simulator/otp/:id/verify            │
│  - POST /dev/simulator/webhooks/:id/replay       │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│      Banking Simulator Service Layer             │
│  - executeSimulation()                           │
│  - execute3DSSimulation()                        │
│  - executeOTPSimulation()                        │
│  - verifyOTP()                                   │
│  - replayWebhook()                               │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│              PostgreSQL Database                 │
│  Tables (7):                                     │
│  - dev_playground_scenarios                      │
│  - dev_simulation_executions                     │
│  - dev_3ds_authentications                       │
│  - dev_otp_verifications                         │
│  - dev_webhook_simulation_events                 │
│  - dev_network_configurations                    │
│  - dev_fraud_simulation_patterns                 │
└──────────────────────────────────────────────────┘
```

### Data Flow - Standard Payment Simulation

```
1. User selects scenario in UI
   ↓
2. POST /dev/simulator/simulate with amount, currency
   ↓
3. Service fetches scenario configuration
   ↓
4. Apply artificial delay (response_delay_ms)
   ↓
5. Execute network-specific logic
   - Visa: Generate auth code, apply Visa response codes
   - Mobile Money: Simulate USSD/OTP flow
   - ACH: Set pending status, settlement date
   ↓
6. Generate webhook events (payment.succeeded/failed)
   ↓
7. Log execution to dev_simulation_executions
   ↓
8. Return result to UI
   ↓
9. UI displays response with status badges, webhook events
```

### Data Flow - 3DS Authentication

```
1. User selects 3DS scenario
   ↓
2. Service calculates risk score (0-100)
   ↓
3. If risk score < 30: Frictionless flow
   If risk score >= 30: Challenge required
   ↓
4. Create dev_3ds_authentications record
   ↓
5. Generate challenge URL (if needed)
   ↓
6. Return 3DS flow details to UI
   ↓
7. User "completes" challenge (simulated)
   ↓
8. POST /dev/simulator/3ds/:id/complete
   ↓
9. Payment proceeds after successful authentication
```

---

## Supported Networks

### Visa

**Network Code**: `visa`

**Features**:
- Standard Visa response codes
- 3DS 1.0 and 2.0 support
- Verified by Visa (VbV) simulation

**Response Codes**:
- `00`: Approved
- `05`: Do not honor (declined)
- `51`: Insufficient funds
- `54`: Expired card
- `59`: Suspected fraud

### Mastercard

**Network Code**: `mastercard`

**Features**:
- Mastercard SecureCode
- 3DS 2.0/2.1 with challenge flows
- Identity Check support

**Response Codes**:
- `00`: Approved
- `05`: Generic decline
- `51`: Insufficient funds
- `33`: Expired card

### Mobile Money

**Network Code**: `mobile_money`

**Providers**:
- MTN Mobile Money (`mtn_momo`)
- Orange Money (`orange_money`)
- Wave (`wave`)
- Moov Money (`moov_money`)

**Features**:
- OTP verification flows
- USSD session simulation
- Delayed settlement (T+1, T+2)
- Provider-specific error codes

**Status Codes**:
- `SUCCESSFUL`: Payment completed
- `PENDING`: Awaiting user confirmation
- `FAILED`: Transaction failed
- `INSUFFICIENT_FUNDS`: Not enough balance

### Bank ACH

**Network Code**: `bank_ach`

**Features**:
- Pending status (next-day settlement)
- ACH return codes
- Micro-deposit verification

**Return Codes**:
- `R01`: Insufficient funds
- `R02`: Account closed
- `R03`: No account/unable to locate

---

## 3DS & OTP Flows

### 3D Secure (3DS) Flows

#### Frictionless Flow

```javascript
// Low-risk transaction, instant approval
const result = await apiClient.post('/dev/simulator/simulate', {
  scenario_id: 'visa_3ds_frictionless_scenario_id',
  amount: 1000, // Low amount
  currency: 'XOF',
});

// Result:
{
  success: true,
  status: 'succeeded',
  three_ds_flow: {
    version: '2.1',
    challenge_type: 'frictionless',
    authentication_status: 'authenticated',
    risk_score: 25  // Low risk
  }
}
```

#### Challenge Flow

```javascript
// High-risk transaction, user must authenticate
const result = await apiClient.post('/dev/simulator/simulate', {
  scenario_id: 'visa_3ds_challenge_scenario_id',
  amount: 100000, // High amount
  currency: 'XOF',
});

// Result:
{
  success: false,  // Pending authentication
  status: 'requires_action',
  three_ds_flow: {
    version: '2.1',
    challenge_type: 'challenge',
    challenge_url: 'https://3ds-simulator.molam.com/auth123',
    authentication_status: 'challenge_required',
    risk_score: 75  // High risk
  }
}

// User completes challenge (simulated)
await apiClient.post('/dev/simulator/3ds/auth123/complete', {
  authentication_result: 'authenticated'
});

// Payment proceeds
```

### OTP Verification Flows

#### SMS OTP Flow

```javascript
// Mobile money payment with OTP
const result = await apiClient.post('/dev/simulator/simulate', {
  scenario_id: 'mtn_momo_otp_scenario_id',
  amount: 10000,
  currency: 'XOF',
  mobile_money: {
    phone_number: '+221771234567',
    provider: 'mtn_momo'
  }
});

// Result:
{
  success: false,  // Pending OTP verification
  status: 'pending',
  otp_flow: {
    id: 'otp_abc123',
    delivery_method: 'sms',
    phone_number: '+221771234567',
    otp_code_sandbox: '123456',  // Visible in sandbox!
    expires_at: '2025-11-11T10:35:00Z'
  }
}

// User enters OTP
await apiClient.post('/dev/simulator/otp/otp_abc123/verify', {
  otp_code: '123456'
});

// Result:
{
  verified: true,
  message: 'OTP verified successfully'
}

// Payment proceeds
```

---

## API Reference

### 1. List Scenarios

```http
GET /dev/simulator/scenarios?network=visa&category=payment

Response 200:
{
  "success": true,
  "count": 5,
  "scenarios": [
    {
      "id": "scenario_abc123",
      "name": "Visa Payment Success",
      "category": "payment",
      "network": "visa",
      "expected_outcome": "success",
      "response_delay_ms": 500,
      "requires_3ds": false,
      "requires_otp": false,
      "is_preset": true,
      "tags": ["visa", "success", "basic"]
    }
  ]
}
```

### 2. Execute Simulation

```http
POST /dev/simulator/simulate
Content-Type: application/json

{
  "scenario_id": "scenario_abc123",
  "amount": 10000,
  "currency": "XOF",
  "card": {
    "number": "4242424242424242",
    "exp_month": 12,
    "exp_year": 2025,
    "cvv": "123"
  }
}

Response 200:
{
  "success": true,
  "simulation": {
    "id": "sim_xyz789",
    "success": true,
    "status": "succeeded",
    "outcome": "success",
    "response_payload": {
      "id": "pay_123",
      "amount": 10000,
      "currency": "XOF",
      "status": "succeeded",
      "authorization_code": "456789"
    },
    "response_time_ms": 523,
    "webhook_events": [
      {
        "id": "evt_abc",
        "event_type": "payment.succeeded",
        "payload": {...}
      }
    ]
  }
}
```

### 3. Quick Simulation (No Scenario ID)

```http
POST /dev/simulator/simulate/quick
Content-Type: application/json

{
  "network": "visa",
  "outcome": "success",
  "amount": 10000,
  "currency": "XOF"
}

Response 200:
{
  "success": true,
  "simulation": {...},
  "scenario_used": {
    "id": "preset_visa_success",
    "name": "Visa Payment Success"
  }
}
```

### 4. Verify OTP

```http
POST /dev/simulator/otp/:otpId/verify
Content-Type: application/json

{
  "otp_code": "123456"
}

Response 200:
{
  "success": true,
  "verified": true,
  "message": "OTP verified successfully"
}

Response 400 (Failed):
{
  "success": false,
  "verified": false,
  "error": {
    "type": "verification_error",
    "code": "otp_verification_failed",
    "message": "Incorrect OTP code"
  }
}
```

### 5. Replay Webhook

```http
POST /dev/simulator/webhooks/:eventId/replay
Content-Type: application/json

{
  "target_url": "https://example.com/webhooks"
}

Response 200:
{
  "success": true,
  "message": "Webhook replayed successfully",
  "event_id": "evt_abc123",
  "target_url": "https://example.com/webhooks"
}
```

---

## Usage Examples

### Example 1: Test Visa Payment Success

```javascript
const apiClient = axios.create({
  baseURL: 'http://localhost:3074',
  headers: {
    'X-User-Id': 'user-123',
    'X-Tenant-Id': 'tenant-123',
  },
});

// Quick simulation
const result = await apiClient.post('/dev/simulator/simulate/quick', {
  network: 'visa',
  outcome: 'success',
  amount: 10000,
  currency: 'XOF',
});

console.log('Payment result:', result.data.simulation);
// Output: { success: true, status: 'succeeded', ... }
```

### Example 2: Test 3DS Challenge Flow

```javascript
// 1. Execute simulation
const result = await apiClient.post('/dev/simulator/simulate', {
  scenario_id: 'visa_3ds_challenge_scenario',
  amount: 100000,  // High amount triggers challenge
  currency: 'XOF',
  card: {
    number: '4242424242424242',
    exp_month: 12,
    exp_year: 2025,
    cvv: '123',
  },
});

if (result.data.simulation.requires_3ds) {
  console.log('3DS challenge required');
  console.log('Challenge URL:', result.data.simulation.three_ds_flow.challenge_url);
  console.log('Risk score:', result.data.simulation.three_ds_flow.risk_score);

  // 2. User completes challenge (simulated)
  const threeDSId = result.data.simulation.three_ds_flow.id;
  await apiClient.post(`/dev/simulator/3ds/${threeDSId}/complete`, {
    authentication_result: 'authenticated',
  });

  console.log('3DS authentication completed, payment proceeds');
}
```

### Example 3: Test Mobile Money with OTP

```javascript
// 1. Initiate payment
const result = await apiClient.post('/dev/simulator/simulate/quick', {
  network: 'mobile_money',
  outcome: 'otp_required',
  amount: 10000,
  currency: 'XOF',
});

if (result.data.simulation.requires_otp) {
  const otpFlow = result.data.simulation.otp_flow;
  console.log('OTP required');
  console.log('Delivery method:', otpFlow.delivery_method);
  console.log('Sandbox OTP code:', otpFlow.otp_code_sandbox);  // Visible in sandbox!

  // 2. User enters OTP
  const otpCode = '123456';  // Would be from user input
  const verifyResult = await apiClient.post(
    `/dev/simulator/otp/${otpFlow.id}/verify`,
    { otp_code: otpCode }
  );

  if (verifyResult.data.verified) {
    console.log('OTP verified, payment proceeds');
  }
}
```

### Example 4: Test ACH Pending Status

```javascript
const result = await apiClient.post('/dev/simulator/simulate/quick', {
  network: 'bank_ach',
  outcome: 'success',  // ACH success is "pending" initially
  amount: 10000,
  currency: 'USD',
});

console.log('Status:', result.data.simulation.status);  // "pending"
console.log('Outcome:', result.data.simulation.outcome);  // "pending"
console.log('Settlement date:', result.data.simulation.response_payload.settlement_date);
// Expected: T+1 or T+2 business days
```

### Example 5: Test Fraud Scenario

```javascript
const result = await apiClient.post('/dev/simulator/simulate', {
  scenario_id: 'visa_fraud_detected_scenario',
  amount: 10000,
  currency: 'XOF',
});

console.log('Payment blocked:', result.data.simulation.outcome);  // "fraud_detected"
console.log('Error:', result.data.simulation.error);
// { code: "59", message: "Suspected fraud", type: "fraud_error" }

// Check SIRA AI response
// SIRA would flag this transaction for review
```

---

## Best Practices

### 1. Testing Strategy

**Comprehensive Test Coverage:**
```javascript
// Test matrix
const testCases = [
  { network: 'visa', outcome: 'success' },
  { network: 'visa', outcome: 'failure' },
  { network: 'visa', outcome: '3ds_required' },
  { network: 'mastercard', outcome: 'success' },
  { network: 'mobile_money', outcome: 'otp_required' },
  { network: 'bank_ach', outcome: 'success' },  // pending
];

for (const testCase of testCases) {
  const result = await simulatePayment(testCase);
  assert(result.outcome === testCase.outcome);
}
```

### 2. Webhook Testing

**Test Webhook Handlers:**
```javascript
// 1. Execute simulation
const result = await apiClient.post('/dev/simulator/simulate/quick', {
  network: 'visa',
  outcome: 'success',
  amount: 10000,
  currency: 'XOF',
});

// 2. Get webhook event ID
const webhookEventId = result.data.simulation.webhook_events[0].id;

// 3. Replay to your webhook endpoint
await apiClient.post(`/dev/simulator/webhooks/${webhookEventId}/replay`, {
  target_url: 'https://your-app.com/webhooks',
});

// 4. Verify your webhook handler received and processed the event
```

### 3. 3DS Compliance Testing

**Test All 3DS Scenarios:**
```javascript
const threeDSScenarios = [
  'frictionless_low_risk',
  'challenge_high_risk',
  'challenge_high_amount',
  'fallback_3ds_1_0',
  'not_enrolled',
  'authentication_failed',
];

for (const scenario of threeDSScenarios) {
  await test3DSScenario(scenario);
}
```

### 4. Chaos Engineering

**Inject Failures:**
```javascript
// Custom scenario with 30% failure rate
await apiClient.post('/dev/simulator/scenarios', {
  name: 'Unreliable Network Simulation',
  category: 'payment',
  network: 'visa',
  expected_outcome: 'success',
  failure_rate: 0.30,  // 30% random failures
  response_delay_ms: 2000,  // 2s delay
  parameters: { chaos: true },
});

// Test retry logic
let attempts = 0;
while (attempts < 5) {
  const result = await executeSimulation(scenarioId);
  if (result.success) break;
  attempts++;
  await sleep(1000 * attempts);  // Exponential backoff
}
```

### 5. Performance Testing

**Load Testing with Simulations:**
```javascript
// Simulate 1000 concurrent transactions
const promises = [];
for (let i = 0; i < 1000; i++) {
  promises.push(apiClient.post('/dev/simulator/simulate/quick', {
    network: 'visa',
    outcome: 'success',
    amount: 10000,
    currency: 'XOF',
  }));
}

const results = await Promise.all(promises);
const successRate = results.filter(r => r.data.simulation.success).length / 1000;
const avgResponseTime = results.reduce((sum, r) =>
  sum + r.data.simulation.response_time_ms, 0) / 1000;

console.log(`Success rate: ${successRate * 100}%`);
console.log(`Avg response time: ${avgResponseTime}ms`);
```

---

## Troubleshooting

### Issue: Scenario not found

**Error**: `404 - Scenario not found`

**Solution**:
```bash
# Check available scenarios
curl http://localhost:3074/dev/simulator/scenarios

# Or use quick simulation (no scenario_id needed)
curl -X POST http://localhost:3074/dev/simulator/simulate/quick \
  -H "Content-Type: application/json" \
  -d '{"network":"visa","outcome":"success","amount":10000,"currency":"XOF"}'
```

### Issue: OTP verification failing

**Error**: `OTP verification failed: Incorrect OTP code`

**Solution**:
```javascript
// In sandbox mode, OTP code is returned in the response
const result = await apiClient.post('/dev/simulator/simulate/quick', {
  network: 'mobile_money',
  outcome: 'otp_required',
  amount: 10000,
  currency: 'XOF',
});

// Use the sandbox OTP code
const otpCode = result.data.simulation.otp_flow.otp_code_sandbox;
console.log('Use this OTP:', otpCode);  // e.g., "123456"
```

---

## Roadmap

### Q1 2026
- [ ] Additional networks (Venmo, PayPal, Alipay)
- [ ] Biometric authentication simulation
- [ ] Push notification OTP delivery
- [ ] Advanced fraud pattern library (50+ patterns)

### Q2 2026
- [ ] Real-time collaboration (multiple users testing same scenario)
- [ ] Scenario recording/playback
- [ ] AI-powered test case generation
- [ ] Integration with CI/CD pipelines

---

**Brique 74bis v1.0 - Banking Network Simulator**
*Test anything, break nothing*

Implementation completed: 2025-11-11
Status: ✅ PRODUCTION READY
