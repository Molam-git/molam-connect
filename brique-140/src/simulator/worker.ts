/**
 * SOUS-BRIQUE 140quater-1 — Simulator Worker
 * Exécute simulations dans sandbox isolé (Docker)
 */

import { pool } from '../db';
import Docker from 'dockerode';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { dequeueSimulationRun } from './queue';

const docker = new Docker();
const MAX_RUN_TIME_MS = 3 * 60_000; // 3 minutes
const WORK_DIR = process.env.SIMULATOR_WORK_DIR || '/tmp/molam-simulator';

interface SimulationReport {
  status: 'success' | 'partial_success' | 'failed';
  metrics: {
    success_rate: number;
    avg_latency_ms: number;
    total_requests: number;
    failed_requests: number;
    regressions?: string[];
  };
  logs?: string[];
}

/**
 * Worker principal - poll la queue et exécute simulations
 */
export async function startSimulatorWorker(): Promise<void> {
  console.log('[SimulatorWorker] Starting...');

  while (true) {
    try {
      const runId = await dequeueSimulationRun();

      if (runId) {
        await executeSimulationRun(runId);
      } else {
        // Aucune simulation en attente, sleep 5s
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error('[SimulatorWorker] Error in main loop:', error);
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
}

/**
 * Exécute une simulation run dans sandbox Docker
 */
async function executeSimulationRun(runId: string): Promise<void> {
  let containerId: string | null = null;

  try {
    // Journal start
    await pool.query(
      `INSERT INTO sdk_simulation_journal(run_id, actor, action, details)
       VALUES ($1, 'system', 'started', $2)`,
      [runId, { timestamp: new Date().toISOString() }]
    );

    // Fetch run + simulation
    const { rows: runRows } = await pool.query(
      `SELECT sr.*, s.sdk_language, s.scenario, s.patch_reference
       FROM sdk_simulation_runs sr
       JOIN sdk_simulations s ON sr.simulation_id = s.id
       WHERE sr.id = $1`,
      [runId]
    );

    if (runRows.length === 0) {
      throw new Error(`Run ${runId} not found`);
    }

    const run = runRows[0];
    const sim = {
      sdk_language: run.sdk_language,
      scenario: run.scenario,
      patch_reference: run.patch_reference,
    };

    // Préparer workspace
    const workdir = path.join(WORK_DIR, runId);
    fs.mkdirSync(workdir, { recursive: true });

    // Écrire scenario
    const scenarioPath = path.join(workdir, 'scenario.json');
    fs.writeFileSync(
      scenarioPath,
      JSON.stringify({
        seed: run.seed,
        scenario: sim.scenario,
      })
    );

    // Si patch_reference, fetch patch code
    if (sim.patch_reference) {
      const { rows: patchRows } = await pool.query(
        `SELECT patch_code, rollback_code FROM sdk_self_healing_registry WHERE id = $1`,
        [sim.patch_reference]
      );

      if (patchRows.length > 0) {
        fs.writeFileSync(
          path.join(workdir, 'patch.js'),
          patchRows[0].patch_code
        );
        if (patchRows[0].rollback_code) {
          fs.writeFileSync(
            path.join(workdir, 'rollback.js'),
            patchRows[0].rollback_code
          );
        }
      }
    }

    // Sélectionner image Docker
    const containerImage = pickImageForSdk(sim.sdk_language);

    // Créer container
    console.log(`[SimulatorWorker] Creating container for ${runId} with image ${containerImage}`);

    const container = await docker.createContainer({
      Image: containerImage,
      Env: [`SEED=${run.seed}`, `RUN_ID=${runId}`],
      HostConfig: {
        AutoRemove: false, // Keep for log retrieval
        NetworkMode: 'none', // STRICT: no network access
        Memory: 256 * 1024 * 1024, // 256MB limit
        MemorySwap: 256 * 1024 * 1024, // No swap
        CpuQuota: 50000, // 50% CPU
        ReadonlyRootfs: false, // Allow temp writes
        SecurityOpt: ['no-new-privileges'],
      },
      Cmd: ['node', '/app/run_simulation.js', '/work/scenario.json'],
      WorkingDir: '/work',
    });

    containerId = container.id;

    // Update run with container_id
    await pool.query(
      `UPDATE sdk_simulation_runs SET container_id = $1 WHERE id = $2`,
      [containerId, runId]
    );

    // Copy workdir to container
    const tarStream = await createTarFromDirectory(workdir);
    await container.putArchive(tarStream, { path: '/work' });

    // Timeout handler
    const timeout = setTimeout(async () => {
      try {
        console.warn(`[SimulatorWorker] Timeout for ${runId}, killing container`);
        await container.kill();
        await pool.query(
          `INSERT INTO sdk_simulation_journal(run_id, actor, action, details)
           VALUES ($1, 'system', 'timeout', $2)`,
          [runId, { max_time_ms: MAX_RUN_TIME_MS }]
        );
      } catch (e) {
        console.error('[SimulatorWorker] Error killing container:', e);
      }
    }, MAX_RUN_TIME_MS);

    // Start container
    await container.start();
    console.log(`[SimulatorWorker] Container ${containerId} started for run ${runId}`);

    // Wait for completion
    const result = await container.wait();
    clearTimeout(timeout);

    const exitCode = result.StatusCode;

    // Collect logs
    const logsStream = await container.logs({
      stdout: true,
      stderr: true,
      timestamps: true,
    });
    const logs = logsStream.toString('utf-8');

    // Parse report
    const report = parseSimulationLogs(logs);

    // Archive logs to S3 (simulated with local file)
    const s3Key = await archiveLogsToS3(runId, logs);

    // Determine final status
    let finalStatus: 'success' | 'partial_success' | 'failed' | 'timeout' = report.status;
    if (exitCode === 124) {
      finalStatus = 'timeout';
    } else if (exitCode !== 0 && finalStatus === 'success') {
      finalStatus = 'failed';
    }

    // Update run
    await pool.query(
      `UPDATE sdk_simulation_runs
       SET status = $1, metrics = $2, artifact_s3_key = $3, exit_code = $4, completed_at = NOW()
       WHERE id = $5`,
      [finalStatus, report.metrics, s3Key, exitCode, runId]
    );

    // Journal completion
    await pool.query(
      `INSERT INTO sdk_simulation_journal(run_id, actor, action, details)
       VALUES ($1, 'system', 'completed', $2)`,
      [runId, { status: finalStatus, metrics: report.metrics }]
    );

    // Anonymize errors for SIRA training
    await anonymizeErrors(runId, sim.sdk_language, report);

    // Cleanup container
    await container.remove({ force: true });

    console.log(`[SimulatorWorker] Run ${runId} completed with status: ${finalStatus}`);
  } catch (err: any) {
    console.error(`[SimulatorWorker] Error executing run ${runId}:`, err);

    // Update run as failed
    await pool.query(
      `UPDATE sdk_simulation_runs
       SET status = 'failed', error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      [err.message, runId]
    );

    // Journal failure
    await pool.query(
      `INSERT INTO sdk_simulation_journal(run_id, actor, action, details)
       VALUES ($1, 'system', 'failed', $2)`,
      [runId, { error: err.message, stack: err.stack }]
    );

    // Cleanup container if exists
    if (containerId) {
      try {
        const container = docker.getContainer(containerId);
        await container.remove({ force: true });
      } catch (e) {
        console.error('[SimulatorWorker] Error removing container:', e);
      }
    }
  }
}

/**
 * Sélectionne image Docker selon langage SDK
 */
function pickImageForSdk(lang: string): string {
  const images: Record<string, string> = {
    node: 'molam/sim-node:2025-01',
    php: 'molam/sim-php:2025-01',
    python: 'molam/sim-py:2025-01',
    ruby: 'molam/sim-ruby:2025-01',
    woocommerce: 'molam/sim-php:2025-01', // WooCommerce = PHP
    shopify: 'molam/sim-node:2025-01', // Shopify = Node.js
  };

  return images[lang] || 'molam/sim-generic:2025-01';
}

/**
 * Parse simulation logs (JSON lines format)
 */
function parseSimulationLogs(raw: string): SimulationReport {
  try {
    const lines = raw
      .split('\n')
      .filter(Boolean)
      .filter((l) => l.trim().startsWith('{'));

    if (lines.length === 0) {
      return {
        status: 'failed',
        metrics: {
          success_rate: 0,
          avg_latency_ms: 0,
          total_requests: 0,
          failed_requests: 0,
        },
      };
    }

    // Last line contains summary
    const last = JSON.parse(lines[lines.length - 1]);

    return {
      status: last.status || 'partial_success',
      metrics: last.metrics || {
        success_rate: 0,
        avg_latency_ms: 0,
        total_requests: 0,
        failed_requests: 0,
      },
      logs: lines.map((l) => JSON.parse(l)),
    };
  } catch (e) {
    console.error('[SimulatorWorker] Error parsing logs:', e);
    return {
      status: 'failed',
      metrics: {
        success_rate: 0,
        avg_latency_ms: 0,
        total_requests: 0,
        failed_requests: 0,
      },
    };
  }
}

/**
 * Archive logs to S3 (ou stockage local pour démo)
 */
async function archiveLogsToS3(runId: string, logs: string): Promise<string> {
  // TODO: Implémenter upload S3 réel
  // Pour démo, stockage local
  const archiveDir = path.join(WORK_DIR, 'archives');
  fs.mkdirSync(archiveDir, { recursive: true });

  const s3Key = `simulations/${runId}.log`;
  const localPath = path.join(archiveDir, `${runId}.log`);

  fs.writeFileSync(localPath, logs);

  return s3Key;
}

/**
 * Anonymize errors pour training SIRA (PII redacted)
 */
async function anonymizeErrors(
  runId: string,
  sdkLanguage: string,
  report: SimulationReport
): Promise<void> {
  try {
    if (!report.logs || report.logs.length === 0) {
      return;
    }

    // Extract error signatures
    const errorSignatures = new Map<string, number>();

    report.logs.forEach((log: any) => {
      if (log.error) {
        const sig = log.error.split(':')[0]; // Ex: "signature_mismatch" from "signature_mismatch: HMAC failed"
        errorSignatures.set(sig, (errorSignatures.get(sig) || 0) + 1);
      }
    });

    // Insert anonymized errors
    for (const [sig, count] of errorSignatures) {
      const frequency = count / report.metrics.total_requests;
      const contextHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({ sdk_language: sdkLanguage }))
        .digest('hex');

      await pool.query(
        `INSERT INTO sdk_anonymized_errors
         (simulation_run_id, error_signature, error_category, sdk_language, frequency, context_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [runId, sig, 'simulation', sdkLanguage, frequency, contextHash]
      );
    }
  } catch (error) {
    console.error('[SimulatorWorker] Error anonymizing errors:', error);
  }
}

/**
 * Create tar stream from directory
 */
async function createTarFromDirectory(dir: string): Promise<NodeJS.ReadableStream> {
  const tar = require('tar-fs');
  return tar.pack(dir);
}
