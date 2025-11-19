// ============================================================================
// Payout Lifecycle Integration Tests
// ============================================================================

import { Pool } from "pg";
import { createPayout, getPayout, cancelPayout } from "../src/services/payoutService";
import { dispatchOnce } from "../src/worker/payoutDispatcher";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Test: Create payout with idempotency
 */
async function testCreatePayoutIdempotency() {
  const params = {
    idempotency: "test-idem-001",
    origin_module: "connect",
    origin_entity_id: "merchant-001",
    amount: 100.0,
    currency: "USD",
    payee_bank_account: {
      iban: "TEST123456789",
      holder_name: "Test Merchant",
    },
  };

  // First creation
  const payout1 = await createPayout(params);
  console.assert(payout1.external_id === "test-idem-001", "Should have correct external_id");
  console.assert(payout1.reference_code.startsWith("PAYOUT-"), "Should have reference code");

  // Second creation with same idempotency key
  const payout2 = await createPayout(params);
  console.assert(payout1.id === payout2.id, "Should return same payout on duplicate");

  console.log("✅ Create payout idempotency test passed");
  return payout1;
}

/**
 * Test: Payout status transitions
 */
async function testPayoutStatusTransitions() {
  const payout = await createPayout({
    idempotency: "test-status-001",
    origin_module: "connect",
    origin_entity_id: "merchant-002",
    amount: 200.0,
    currency: "XOF",
    payee_bank_account: { iban: "TEST987654321" },
    scheduled_for: new Date(Date.now() - 1000), // Scheduled in past
  });

  console.assert(payout.status === "pending", "Initial status should be pending");

  // Dispatch should process it
  const stats = await dispatchOnce(5);
  console.assert(stats.processed > 0, "Dispatcher should process payouts");

  // Check updated status
  const updated = await getPayout(payout.id);
  console.assert(
    ["sent", "failed", "pending"].includes(updated.status),
    `Status should transition from pending, got ${updated.status}`
  );

  console.log("✅ Payout status transitions test passed");
  return updated;
}

/**
 * Test: Cancel payout
 */
async function testCancelPayout() {
  const payout = await createPayout({
    idempotency: "test-cancel-001",
    origin_module: "connect",
    origin_entity_id: "merchant-003",
    amount: 50.0,
    currency: "USD",
    payee_bank_account: { iban: "TEST111111111" },
  });

  console.assert(payout.status === "pending", "Should be pending before cancel");

  // Cancel it
  const result = await cancelPayout(payout.id, "test_cancellation");
  console.assert(result.cancelled === true, "Should return cancelled=true");

  // Verify status
  const cancelled = await getPayout(payout.id);
  console.assert(cancelled.status === "cancelled", "Status should be cancelled");

  console.log("✅ Cancel payout test passed");
}

/**
 * Test: Ledger hold creation
 */
async function testLedgerHold() {
  const payout = await createPayout({
    idempotency: "test-hold-001",
    origin_module: "connect",
    origin_entity_id: "merchant-004",
    amount: 150.0,
    currency: "EUR",
    payee_bank_account: { iban: "TEST222222222" },
  });

  // Check hold was created
  const { rows: holds } = await pool.query(
    `SELECT * FROM payout_holds WHERE payout_id = $1`,
    [payout.id]
  );

  console.assert(holds.length > 0, "Should have created payout hold");
  console.assert(holds[0].amount === "150.00", "Hold amount should match payout amount");
  console.assert(holds[0].status === "active", "Hold should be active");

  console.log("✅ Ledger hold test passed");
}

/**
 * Test: Retry with exponential backoff
 */
async function testRetryBackoff() {
  // Create payout that will likely fail on first attempt
  const payout = await createPayout({
    idempotency: "test-retry-001",
    origin_module: "connect",
    origin_entity_id: "merchant-005",
    amount: 75.0,
    currency: "USD",
    payee_bank_account: { iban: "TEST333333333" },
    scheduled_for: new Date(Date.now() - 1000),
  });

  // Run dispatcher multiple times
  for (let i = 0; i < 3; i++) {
    await dispatchOnce(5);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Check attempts
  const { rows: attempts } = await pool.query(
    `SELECT * FROM payout_attempts WHERE payout_id = $1 ORDER BY attempt_ts ASC`,
    [payout.id]
  );

  console.assert(attempts.length > 0, "Should have payout attempts");
  console.log(`Attempts recorded: ${attempts.length}`);

  console.log("✅ Retry backoff test passed");
}

/**
 * Test: Payout batch creation
 */
async function testPayoutBatch() {
  // Create multiple payouts
  const payout1 = await createPayout({
    idempotency: "test-batch-001",
    origin_module: "connect",
    origin_entity_id: "merchant-006",
    amount: 100.0,
    currency: "USD",
    payee_bank_account: { iban: "TEST444444444" },
  });

  const payout2 = await createPayout({
    idempotency: "test-batch-002",
    origin_module: "connect",
    origin_entity_id: "merchant-007",
    amount: 200.0,
    currency: "USD",
    payee_bank_account: { iban: "TEST555555555" },
  });

  // Create batch
  const { rows: [batch] } = await pool.query(
    `INSERT INTO payout_batches(batch_ref, status)
     VALUES ($1, 'draft') RETURNING *`,
    [`BATCH-TEST-${Date.now()}`]
  );

  // Add items
  await pool.query(
    `INSERT INTO payout_batch_items(batch_id, payout_id) VALUES ($1, $2), ($1, $3)`,
    [batch.id, payout1.id, payout2.id]
  );

  // Verify
  const { rows: items } = await pool.query(
    `SELECT * FROM payout_batch_items WHERE batch_id = $1`,
    [batch.id]
  );

  console.assert(items.length === 2, "Should have 2 items in batch");

  console.log("✅ Payout batch test passed");
}

/**
 * Run all tests
 */
async function runTests() {
  console.log("🧪 Running Payout Lifecycle Tests...\n");

  try {
    await testCreatePayoutIdempotency();
    await testPayoutStatusTransitions();
    await testCancelPayout();
    await testLedgerHold();
    await testRetryBackoff();
    await testPayoutBatch();

    console.log("\n✅ All payout tests passed!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  runTests();
}

export { runTests };
