/**
 * SOUS-BRIQUE 140quater-1 — Simulation Harness
 * Script exécuté DANS le container Docker sandbox
 *
 * This runs inside molam/sim-node:2025-01 image
 */

const fs = require('fs');
const path = process.argv[2] || '/work/scenario.json';

// Load scenario
let scenario;
try {
  scenario = JSON.parse(fs.readFileSync(path, 'utf8'));
} catch (err) {
  console.error(JSON.stringify({ error: 'failed_to_load_scenario', message: err.message }));
  process.exit(2);
}

const seed = Number(process.env.SEED || scenario.seed || Date.now());
const runId = process.env.RUN_ID || 'local';

console.log(JSON.stringify({ action: 'start', run_id: runId, seed, scenario: scenario.scenario }));

/**
 * Deterministic random number generator
 */
function deterministicRandom(seed) {
  let x = seed % 2147483647;
  if (x <= 0) x += 2147483646;

  return () => {
    x = (x * 48271) % 2147483647;
    return x / 2147483647;
  };
}

const rnd = deterministicRandom(seed);

// Extract scenario config
const config = scenario.scenario || {};
const totalRequests = config.total_requests || 100;
const errorFrequency = config.error_frequency || 0.1;
const baseLatencyMs = config.latency_ms || 200;
const successThreshold = config.success_threshold || 0.95;
const errorType = config.error || 'generic_error';

// Check if patch should be applied
let patchApplied = false;
if (fs.existsSync('/work/patch.js')) {
  try {
    console.log(JSON.stringify({ action: 'applying_patch' }));
    const patchCode = fs.readFileSync('/work/patch.js', 'utf8');

    // Apply patch (eval in safe context)
    // In production, use VM or isolated sandbox
    eval(patchCode);

    patchApplied = true;
    console.log(JSON.stringify({ action: 'patch_applied' }));
  } catch (patchErr) {
    console.error(JSON.stringify({
      action: 'patch_failed',
      error: patchErr.message
    }));

    // Try rollback
    if (fs.existsSync('/work/rollback.js')) {
      try {
        const rollbackCode = fs.readFileSync('/work/rollback.js', 'utf8');
        eval(rollbackCode);
        console.log(JSON.stringify({ action: 'rollback_executed' }));
      } catch (rollbackErr) {
        console.error(JSON.stringify({
          action: 'rollback_failed',
          error: rollbackErr.message
        }));
      }
    }
  }
}

// Simulate N requests
let successCount = 0;
let failedCount = 0;
const latencies = [];
const errors = [];

console.log(JSON.stringify({
  action: 'simulation_start',
  total_requests: totalRequests,
  error_frequency: errorFrequency,
  patch_applied: patchApplied
}));

for (let i = 0; i < totalRequests; i++) {
  const shouldFail = rnd() < errorFrequency;

  if (shouldFail) {
    // Simulate error
    failedCount++;

    const latency = baseLatencyMs + Math.floor(rnd() * 500);
    latencies.push(latency);

    errors.push({
      request_id: i,
      error: errorType,
      latency_ms: latency,
    });

    // Log error
    if (i % 10 === 0) {
      console.log(JSON.stringify({
        request_id: i,
        status: 'error',
        error: errorType,
        latency_ms: latency
      }));
    }
  } else {
    // Simulate success
    successCount++;

    const latency = Math.floor(baseLatencyMs * (0.5 + rnd() * 0.5));
    latencies.push(latency);

    // Log success (sample)
    if (i % 50 === 0) {
      console.log(JSON.stringify({
        request_id: i,
        status: 'success',
        latency_ms: latency
      }));
    }
  }
}

// Calculate metrics
const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
const successRate = successCount / totalRequests;
const p50Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.5)];
const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
const p99Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.99)];

// Determine status
let status = 'success';
if (successRate < successThreshold) {
  status = successRate > (successThreshold - 0.1) ? 'partial_success' : 'failed';
}

// Check for regressions (simple heuristic)
const regressions = [];
if (avgLatency > baseLatencyMs * 2) {
  regressions.push(`High latency: ${Math.round(avgLatency)}ms > ${baseLatencyMs * 2}ms threshold`);
}
if (successRate < 0.7) {
  regressions.push(`Low success rate: ${(successRate * 100).toFixed(1)}% < 70%`);
}

// Final report (last line = summary for parser)
const report = {
  status,
  metrics: {
    success_rate: successRate,
    avg_latency_ms: Math.round(avgLatency),
    p50_latency_ms: p50Latency,
    p95_latency_ms: p95Latency,
    p99_latency_ms: p99Latency,
    total_requests: totalRequests,
    successful_requests: successCount,
    failed_requests: failedCount,
    regressions: regressions.length > 0 ? regressions : undefined,
    patch_applied: patchApplied,
  },
};

console.log(JSON.stringify(report));

// Exit code
const exitCode = status === 'success' ? 0 : status === 'partial_success' ? 0 : 2;
process.exit(exitCode);
