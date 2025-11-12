import { pool } from '../utils/db';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const SANDBOX_REPO = process.env.SANDBOX_REPO_PATH || '/tmp/sira-sandbox';
const AUTO_DEPLOY_ENABLED = process.env.ENABLE_AUTO_PATCHES === 'true';
const AUTO_DEPLOY_THRESHOLD = parseFloat(process.env.AUTO_DEPLOY_THRESHOLD || '0.05');

/**
 * Propose a self-improvement patch
 */
export async function proposePatch(
  patchName: string,
  modelVersion: string,
  patchType: 'code' | 'hyperparameters' | 'training_data' | 'feature_engineering',
  codeDiff: string,
  description: string
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO sira_patches (patch_name, model_version, patch_type, code_diff, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [patchName, modelVersion, patchType, codeDiff, description]
  );

  const patchId = rows[0].id;
  console.log(`[SelfUpdater] Proposed patch ${patchId}: ${patchName}`);

  return patchId;
}

/**
 * Test patch in sandbox environment
 */
export async function testPatch(patchId: string): Promise<{
  passed: boolean;
  accuracyBefore: number;
  accuracyAfter: number;
  improvement: number;
}> {
  const { rows } = await pool.query('SELECT * FROM sira_patches WHERE id = $1', [patchId]);

  if (rows.length === 0) {
    throw new Error('Patch not found');
  }

  const patch = rows[0];

  // Update status to testing
  await pool.query(`UPDATE sira_patches SET status = 'testing' WHERE id = $1`, [patchId]);

  try {
    // Setup sandbox
    if (!fs.existsSync(SANDBOX_REPO)) {
      console.log('[SelfUpdater] Cloning sandbox repo...');
      execSync(`git clone ${process.env.SIRA_REPO_URL || '.'} ${SANDBOX_REPO}`);
    }

    // Apply patch
    const patchFile = path.join('/tmp', `${patchId}.patch`);
    fs.writeFileSync(patchFile, patch.code_diff);

    console.log(`[SelfUpdater] Applying patch ${patchId}...`);
    execSync(`git apply ${patchFile}`, { cwd: SANDBOX_REPO });

    // Run tests
    console.log('[SelfUpdater] Running tests...');
    const testsPassed = runTests(SANDBOX_REPO);

    // Measure accuracy on validation set
    const accuracyBefore = await measureAccuracy('current');
    const accuracyAfter = await measureAccuracy('patched');
    const improvement = accuracyAfter - accuracyBefore;

    // Update patch record
    await pool.query(
      `UPDATE sira_patches SET
       tests_passed = $1, sandbox_accuracy_before = $2, sandbox_accuracy_after = $3,
       accuracy_improvement = $4, test_results = $5
       WHERE id = $6`,
      [
        testsPassed,
        accuracyBefore,
        accuracyAfter,
        improvement,
        JSON.stringify({ passed: testsPassed, improvement }),
        patchId,
      ]
    );

    // Cleanup
    execSync(`git reset --hard HEAD`, { cwd: SANDBOX_REPO });
    fs.unlinkSync(patchFile);

    console.log(`[SelfUpdater] Patch ${patchId} tested: improvement=${improvement.toFixed(4)}`);

    return { passed: testsPassed, accuracyBefore, accuracyAfter, improvement };
  } catch (error: any) {
    console.error(`[SelfUpdater] Patch testing failed:`, error.message);

    await pool.query(
      `UPDATE sira_patches SET status = 'rejected', rejection_reason = $1 WHERE id = $2`,
      [error.message, patchId]
    );

    throw error;
  }
}

/**
 * Deploy approved patch to production
 */
export async function deployPatch(patchId: string, approvedBy: string): Promise<void> {
  const { rows } = await pool.query('SELECT * FROM sira_patches WHERE id = $1', [patchId]);

  if (rows.length === 0) {
    throw new Error('Patch not found');
  }

  const patch = rows[0];

  if (!patch.tests_passed) {
    throw new Error('Cannot deploy patch that did not pass tests');
  }

  // Update status
  await pool.query(
    `UPDATE sira_patches SET status = 'approved', approved_by = $1 WHERE id = $2`,
    [approvedBy, patchId]
  );

  // Apply to production (this would trigger CI/CD in real system)
  console.log(`[SelfUpdater] Deploying patch ${patchId} approved by ${approvedBy}`);

  // In production, this would:
  // 1. Create PR in main repo
  // 2. Trigger CI/CD pipeline
  // 3. Deploy new model version

  await pool.query(
    `UPDATE sira_patches SET deployed = true, deployed_at = NOW() WHERE id = $1`,
    [patchId]
  );

  console.log(`[SelfUpdater] Patch ${patchId} deployed successfully`);
}

/**
 * Auto-deploy patch if improvement exceeds threshold
 */
export async function autoDeployIfWorthy(patchId: string): Promise<boolean> {
  if (!AUTO_DEPLOY_ENABLED) {
    console.log('[SelfUpdater] Auto-deploy disabled');
    return false;
  }

  const { rows } = await pool.query('SELECT * FROM sira_patches WHERE id = $1', [patchId]);
  const patch = rows[0];

  if (!patch || !patch.tests_passed) {
    return false;
  }

  if (patch.accuracy_improvement >= AUTO_DEPLOY_THRESHOLD) {
    console.log(`[SelfUpdater] Auto-deploying patch ${patchId} (improvement: ${patch.accuracy_improvement})`);
    await deployPatch(patchId, 'auto_deployer');
    return true;
  }

  console.log(`[SelfUpdater] Patch ${patchId} improvement (${patch.accuracy_improvement}) below threshold (${AUTO_DEPLOY_THRESHOLD})`);
  return false;
}

/**
 * Run tests in sandbox
 */
function runTests(repoPath: string): boolean {
  try {
    execSync('npm test', { cwd: repoPath, stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Measure model accuracy on validation set
 */
async function measureAccuracy(version: 'current' | 'patched'): Promise<number> {
  // Get validation predictions
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE prediction_correct = true) as correct,
       COUNT(*) as total
     FROM sira_predictions
     WHERE actual_outcome IS NOT NULL
     LIMIT 1000`
  );

  const correct = parseInt(rows[0]?.correct || '0', 10);
  const total = parseInt(rows[0]?.total || '1', 10);

  return correct / total;
}
