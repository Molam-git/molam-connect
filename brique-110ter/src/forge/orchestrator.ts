// src/forge/orchestrator.ts
// Plugin Forge Orchestrator - Main pipeline executor

import { Pool } from 'pg';
import { publishMetrics } from '../metrics';
import { generateStep } from './steps/generate';
import { buildStep } from './steps/build';
import { testStep } from './steps/test';
import { sandboxStep } from './steps/sandbox';
import { packageStep } from './steps/package';
import { signStep } from './steps/sign';
import { publishStep } from './steps/publish';

let pool: Pool;

export function setPool(dbPool: Pool) {
  pool = dbPool;
}

interface ForgeJob {
  id: string;
  plugin_package_id: string | null;
  requested_by: string;
  params: any;
  status: string;
}

interface ForgeRun {
  id: string;
  job_id: string;
  step: string;
  status: string;
  logs: string[];
  artifacts: any;
}

const PIPELINE_STEPS = [
  { name: 'generate', fn: generateStep },
  { name: 'build', fn: buildStep },
  { name: 'test', fn: testStep },
  { name: 'sandbox', fn: sandboxStep },
  { name: 'package', fn: packageStep },
  { name: 'sign', fn: signStep },
  { name: 'publish', fn: publishStep }
];

/**
 * Run complete forge job pipeline
 * @param jobId - Forge job ID
 */
export async function runJob(jobId: string): Promise<void> {
  try {
    // Mark job as running
    await pool.query(
      `UPDATE forge_jobs SET status = 'running', started_at = now() WHERE id = $1`,
      [jobId]
    );

    console.log(`[FORGE] Starting job ${jobId}`);

    // Execute each pipeline step
    for (const step of PIPELINE_STEPS) {
      const runId = await startRun(jobId, step.name);

      try {
        console.log(`[FORGE] Executing step: ${step.name}`);
        await appendRunLog(runId, `Starting ${step.name} step`);

        // Execute step function
        const artifacts = await step.fn(jobId, runId, pool);

        // Mark run as success
        await finishRun(runId, 'success', artifacts);
        await appendRunLog(runId, `${step.name} step completed successfully`);

        publishMetrics('forge_step_success', 1, { step: step.name });
      } catch (error: any) {
        console.error(`[FORGE] Step ${step.name} failed:`, error);

        await appendRunLog(runId, `Error: ${error.message}`);
        await finishRun(runId, 'failed', { error: error.message });

        // Mark job as failed
        await pool.query(
          `UPDATE forge_jobs SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1`,
          [jobId, error.message]
        );

        publishMetrics('forge_job_failed', 1, { step: step.name });
        throw error;
      }
    }

    // Mark job as success
    await pool.query(
      `UPDATE forge_jobs SET status = 'success', completed_at = now() WHERE id = $1`,
      [jobId]
    );

    console.log(`[FORGE] Job ${jobId} completed successfully`);
    publishMetrics('forge_job_success', 1);

  } catch (error: any) {
    console.error(`[FORGE] Job ${jobId} failed:`, error);
    throw error;
  }
}

/**
 * Start a new pipeline step run
 */
async function startRun(jobId: string, step: string): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO forge_runs (job_id, step, status, logs, started_at)
     VALUES ($1, $2, 'running', '[]'::jsonb, now())
     RETURNING id`,
    [jobId, step]
  );

  return rows[0].id;
}

/**
 * Append log message to run
 */
export async function appendRunLog(runId: string, message: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, message };

  await pool.query(
    `UPDATE forge_runs
     SET logs = logs || $2::jsonb
     WHERE id = $1`,
    [runId, JSON.stringify([logEntry])]
  );
}

/**
 * Finish a run with status and artifacts
 */
async function finishRun(
  runId: string,
  status: 'success' | 'failed' | 'skipped',
  artifacts?: any
): Promise<void> {
  await pool.query(
    `UPDATE forge_runs
     SET status = $2,
         ended_at = now(),
         artifacts = $3
     WHERE id = $1`,
    [runId, status, artifacts || null]
  );
}

/**
 * Get job details
 */
export async function getJob(jobId: string): Promise<ForgeJob | null> {
  const { rows } = await pool.query(
    `SELECT * FROM forge_jobs WHERE id = $1`,
    [jobId]
  );

  return rows[0] || null;
}

/**
 * Get all runs for a job
 */
export async function getJobRuns(jobId: string): Promise<ForgeRun[]> {
  const { rows } = await pool.query(
    `SELECT * FROM forge_runs WHERE job_id = $1 ORDER BY started_at ASC`,
    [jobId]
  );

  return rows;
}

/**
 * Cancel a running job
 */
export async function cancelJob(jobId: string): Promise<void> {
  await pool.query(
    `UPDATE forge_jobs SET status = 'cancelled', completed_at = now() WHERE id = $1`,
    [jobId]
  );

  console.log(`[FORGE] Job ${jobId} cancelled`);
  publishMetrics('forge_job_cancelled', 1);
}

/**
 * Retry a failed job
 */
export async function retryJob(jobId: string): Promise<string> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  // Create new job with same params
  const { rows } = await pool.query(
    `INSERT INTO forge_jobs (requested_by, params, idempotency_key, status)
     VALUES ($1, $2, $3, 'queued')
     RETURNING id`,
    [job.requested_by, job.params, `retry-${jobId}-${Date.now()}`]
  );

  const newJobId = rows[0].id;

  console.log(`[FORGE] Created retry job ${newJobId} for failed job ${jobId}`);

  return newJobId;
}

/**
 * Get job statistics
 */
export async function getJobStats(days: number = 30): Promise<any> {
  const { rows } = await pool.query(
    `SELECT * FROM get_forge_job_stats($1)`,
    [days]
  );

  return rows[0];
}
