/**
 * Brique 116quinquies - Integration Example
 * Demonstrates how to integrate A/B routing into your payment flow
 */

import { Pool } from 'pg';
import { spawn } from 'child_process';

// Initialize database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/molam_connect',
});

/**
 * Example 1: Process a payment with A/B routing
 */
async function processPaymentWithABRouting(
  merchantId: string,
  currency: string,
  amount: number,
  defaultRoute: string
) {
  console.log(`\n🔄 Processing payment: ${amount} ${currency} for merchant ${merchantId}`);

  // Step 1: Check if there's an active A/B test
  const { rows: tests } = await db.query(
    `SELECT * FROM routing_ab_tests
     WHERE merchant_id = $1 AND currency = $2 AND status = 'active'
     AND (end_date IS NULL OR end_date > now())
     ORDER BY start_date DESC
     LIMIT 1`,
    [merchantId, currency]
  );

  let selectedRoute: string;
  let routeType: 'primary' | 'test' | null = null;
  let abTestId: string | null = null;

  if (tests.length > 0) {
    const test = tests[0];
    abTestId = test.id;

    // Step 2: Decide which route to use (primary or test)
    const random = Math.random();
    if (random < test.allocation_percent / 100) {
      selectedRoute = test.test_route;
      routeType = 'test';
      console.log(`📊 A/B Test: Using TEST route (${test.test_route}) - ${test.allocation_percent}% allocation`);
    } else {
      selectedRoute = test.primary_route;
      routeType = 'primary';
      console.log(`📊 A/B Test: Using PRIMARY route (${test.primary_route})`);
    }
  } else {
    selectedRoute = defaultRoute;
    console.log(`➡️  No A/B test active, using default route: ${defaultRoute}`);
  }

  // Step 3: Process payment with selected route
  const startTime = Date.now();
  const paymentResult = await processPaymentWithRoute(selectedRoute, amount, currency);
  const latencyMs = Date.now() - startTime;

  console.log(`✅ Payment result: ${paymentResult.success ? 'SUCCESS' : 'FAILED'} (${latencyMs}ms)`);

  // Step 4: Record result if part of A/B test
  if (abTestId && routeType) {
    await db.query(
      `INSERT INTO routing_ab_results (
        ab_test_id, txn_id, route_used, route_name,
        success, latency_ms, fee_percent, error_code, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        abTestId,
        paymentResult.txn_id,
        routeType,
        selectedRoute,
        paymentResult.success,
        latencyMs,
        paymentResult.fee_percent,
        paymentResult.error_code,
        paymentResult.error_message,
      ]
    );
    console.log(`📝 A/B result recorded for test ${abTestId}`);
  }

  return paymentResult;
}

/**
 * Example 2: Create a new A/B test
 */
async function createABTest(
  merchantId: string,
  currency: string,
  primaryRoute: string,
  testRoute: string,
  allocationPercent: number = 5
) {
  console.log(`\n🆕 Creating new A/B test for ${currency}`);
  console.log(`   Primary: ${primaryRoute}`);
  console.log(`   Test: ${testRoute} (${allocationPercent}%)`);

  const { rows } = await db.query(
    `INSERT INTO routing_ab_tests (
      merchant_id, currency, primary_route, test_route, allocation_percent
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *`,
    [merchantId, currency, primaryRoute, testRoute, allocationPercent]
  );

  console.log(`✅ A/B test created: ${rows[0].id}`);
  return rows[0];
}

/**
 * Example 3: Evaluate A/B test and make decision
 */
async function evaluateABTest(testId: string, minTransactions: number = 100) {
  console.log(`\n📊 Evaluating A/B test: ${testId}`);

  // Get statistics from database
  const { rows: stats } = await db.query('SELECT * FROM get_ab_test_stats($1)', [testId]);

  if (stats.length < 2) {
    console.log('⚠️  Not enough data to evaluate');
    return null;
  }

  const primary = stats.find((s) => s.route_type === 'primary');
  const test = stats.find((s) => s.route_type === 'test');

  if (!primary || !test) {
    console.log('⚠️  Missing route data');
    return null;
  }

  const totalTxn = primary.total_txn + test.total_txn;

  if (totalTxn < minTransactions) {
    console.log(`⚠️  Not enough transactions (${totalTxn}/${minTransactions})`);
    return null;
  }

  // Calculate scores
  const primaryScore = parseFloat(primary.score);
  const testScore = parseFloat(test.score);

  console.log('\n📈 Results:');
  console.log(`   PRIMARY - Score: ${primaryScore.toFixed(4)}, Success: ${(primary.success_rate * 100).toFixed(2)}%, Latency: ${primary.avg_latency.toFixed(0)}ms, Fee: ${(primary.avg_fee * 100).toFixed(2)}%`);
  console.log(`   TEST    - Score: ${testScore.toFixed(4)}, Success: ${(test.success_rate * 100).toFixed(2)}%, Latency: ${test.avg_latency.toFixed(0)}ms, Fee: ${(test.avg_fee * 100).toFixed(2)}%`);

  // Make decision
  const winningRoute = testScore > primaryScore ? 'test' : 'primary';
  const decisionReason =
    testScore > primaryScore
      ? `Test route has better score (${testScore.toFixed(4)} vs ${primaryScore.toFixed(4)})`
      : `Primary route remains best (${primaryScore.toFixed(4)} vs ${testScore.toFixed(4)})`;

  console.log(`\n🏆 Decision: ${winningRoute.toUpperCase()} WINS!`);
  console.log(`   Reason: ${decisionReason}`);

  // Save decision
  const { rows: testInfo } = await db.query('SELECT * FROM routing_ab_tests WHERE id = $1', [testId]);
  const testData = testInfo[0];

  const winningRouteName = winningRoute === 'test' ? testData.test_route : testData.primary_route;

  await db.query(
    `INSERT INTO routing_ab_decisions (
      ab_test_id, merchant_id, currency, winning_route,
      primary_score, test_score, decision_reason, transactions_analyzed
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      testId,
      testData.merchant_id,
      testData.currency,
      winningRouteName,
      primaryScore,
      testScore,
      decisionReason,
      totalTxn,
    ]
  );

  console.log('💾 Decision saved to database');

  return {
    winningRoute,
    winningRouteName,
    primaryScore,
    testScore,
    decisionReason,
    totalTxn,
  };
}

/**
 * Example 4: Monitor active tests
 */
async function monitorActiveTests() {
  console.log('\n📊 Active A/B Tests:\n');

  const { rows } = await db.query(`
    SELECT * FROM routing_ab_performance
    WHERE status = 'active'
    ORDER BY start_date DESC
  `);

  if (rows.length === 0) {
    console.log('   No active tests');
    return;
  }

  rows.forEach((test, index) => {
    console.log(`${index + 1}. ${test.currency} - ${test.primary_route} vs ${test.test_route}`);
    console.log(`   Primary: ${test.primary_count} txn, ${(test.primary_success_rate * 100).toFixed(1)}% success, ${test.primary_avg_latency?.toFixed(0)}ms`);
    console.log(`   Test:    ${test.test_count} txn, ${(test.test_success_rate * 100).toFixed(1)}% success, ${test.test_avg_latency?.toFixed(0)}ms`);
    console.log('');
  });
}

/**
 * Simulate processing a payment with a specific route
 */
async function processPaymentWithRoute(route: string, amount: number, currency: string) {
  // Simulate payment processing
  const success = Math.random() > 0.05; // 95% success rate
  const fee_percent = 2.5 + Math.random() * 1.5; // 2.5-4% fee

  return {
    txn_id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    success,
    fee_percent,
    error_code: success ? null : 'CARD_DECLINED',
    error_message: success ? null : 'Card was declined by issuer',
  };
}

/**
 * Main demo function
 */
async function main() {
  console.log('🚀 Molam Connect - A/B Routing Demo\n');

  const MERCHANT_ID = '11111111-1111-1111-1111-111111111111';
  const CURRENCY = 'XOF';

  try {
    // Step 1: Create an A/B test
    const test = await createABTest(MERCHANT_ID, CURRENCY, 'bank_bci', 'bank_coris', 10);

    // Step 2: Simulate 200 transactions
    console.log('\n💳 Simulating 200 transactions...\n');
    for (let i = 0; i < 200; i++) {
      await processPaymentWithABRouting(MERCHANT_ID, CURRENCY, 10000, 'bank_bci');

      // Show progress every 50 transactions
      if ((i + 1) % 50 === 0) {
        console.log(`   Progress: ${i + 1}/200 transactions completed`);
      }
    }

    // Step 3: Monitor tests
    await monitorActiveTests();

    // Step 4: Evaluate the test
    const decision = await evaluateABTest(test.id);

    if (decision) {
      console.log('\n🎯 Recommendation:');
      if (decision.winningRoute === 'test') {
        console.log(`   ✅ Switch to ${decision.winningRouteName} for better performance`);
      } else {
        console.log(`   ✅ Keep using ${decision.winningRouteName}`);
      }
    }

    console.log('\n✨ Demo completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.end();
  }
}

// Run the demo
if (require.main === module) {
  main();
}

export {
  processPaymentWithABRouting,
  createABTest,
  evaluateABTest,
  monitorActiveTests,
};
