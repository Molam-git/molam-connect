/**
 * SOUS-BRIQUE 140quater-1 — Deterministic Simulation Tests
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const HARNESS_PATH = path.join(__dirname, '../../../docker/simulator/run_simulation.js');

describe('Deterministic Simulation Harness', () => {
  const testScenario = {
    seed: 12345,
    scenario: {
      error: 'timeout',
      error_frequency: 0.1,
      latency_ms: 200,
      total_requests: 100,
      success_threshold: 0.95,
    },
  };

  beforeAll(() => {
    // Create temp scenario file
    fs.mkdirSync('/tmp/sim-test', { recursive: true });
    fs.writeFileSync(
      '/tmp/sim-test/scenario.json',
      JSON.stringify(testScenario)
    );
  });

  it('should produce same metrics for same seed', () => {
    const out1 = execFileSync('node', [HARNESS_PATH, '/tmp/sim-test/scenario.json'], {
      env: { ...process.env, SEED: '12345' },
    }).toString();

    const out2 = execFileSync('node', [HARNESS_PATH, '/tmp/sim-test/scenario.json'], {
      env: { ...process.env, SEED: '12345' },
    }).toString();

    // Parse last line (summary)
    const lines1 = out1.split('\n').filter(Boolean);
    const lines2 = out2.split('\n').filter(Boolean);

    const summary1 = JSON.parse(lines1[lines1.length - 1]);
    const summary2 = JSON.parse(lines2[lines2.length - 1]);

    expect(summary1.metrics.success_rate).toBe(summary2.metrics.success_rate);
    expect(summary1.metrics.avg_latency_ms).toBe(summary2.metrics.avg_latency_ms);
    expect(summary1.metrics.total_requests).toBe(summary2.metrics.total_requests);
  });

  it('should produce different metrics for different seeds', () => {
    const out1 = execFileSync('node', [HARNESS_PATH, '/tmp/sim-test/scenario.json'], {
      env: { ...process.env, SEED: '12345' },
    }).toString();

    const out2 = execFileSync('node', [HARNESS_PATH, '/tmp/sim-test/scenario.json'], {
      env: { ...process.env, SEED: '54321' },
    }).toString();

    const lines1 = out1.split('\n').filter(Boolean);
    const lines2 = out2.split('\n').filter(Boolean);

    const summary1 = JSON.parse(lines1[lines1.length - 1]);
    const summary2 = JSON.parse(lines2[lines2.length - 1]);

    // Should be different (statistically)
    expect(summary1.metrics.avg_latency_ms).not.toBe(summary2.metrics.avg_latency_ms);
  });

  it('should respect error frequency', () => {
    const out = execFileSync('node', [HARNESS_PATH, '/tmp/sim-test/scenario.json'], {
      env: { ...process.env, SEED: '12345' },
    }).toString();

    const lines = out.split('\n').filter(Boolean);
    const summary = JSON.parse(lines[lines.length - 1]);

    // With 10% error frequency, success rate should be ~90%
    expect(summary.metrics.success_rate).toBeGreaterThan(0.85);
    expect(summary.metrics.success_rate).toBeLessThan(0.95);
    expect(summary.metrics.failed_requests).toBeGreaterThan(5);
    expect(summary.metrics.failed_requests).toBeLessThan(15);
  });

  it('should exit with code 0 on success', () => {
    const result = execFileSync('node', [HARNESS_PATH, '/tmp/sim-test/scenario.json'], {
      env: { ...process.env, SEED: '12345' },
      encoding: 'utf-8',
    });

    const lines = result.split('\n').filter(Boolean);
    const summary = JSON.parse(lines[lines.length - 1]);

    expect(summary.status).toBe('success');
  });

  it('should detect regressions on high latency', () => {
    const highLatencyScenario = {
      seed: 12345,
      scenario: {
        error: 'timeout',
        error_frequency: 0.1,
        latency_ms: 5000, // Very high base latency
        total_requests: 50,
        success_threshold: 0.95,
      },
    };

    fs.writeFileSync(
      '/tmp/sim-test/high_latency.json',
      JSON.stringify(highLatencyScenario)
    );

    const out = execFileSync('node', [HARNESS_PATH, '/tmp/sim-test/high_latency.json'], {
      env: { ...process.env, SEED: '12345' },
    }).toString();

    const lines = out.split('\n').filter(Boolean);
    const summary = JSON.parse(lines[lines.length - 1]);

    expect(summary.metrics.regressions).toBeDefined();
    expect(summary.metrics.regressions.length).toBeGreaterThan(0);
    expect(summary.metrics.regressions[0]).toContain('High latency');
  });

  afterAll(() => {
    // Cleanup
    try {
      fs.unlinkSync('/tmp/sim-test/scenario.json');
      fs.unlinkSync('/tmp/sim-test/high_latency.json');
      fs.rmdirSync('/tmp/sim-test');
    } catch (e) {
      // Ignore
    }
  });
});
