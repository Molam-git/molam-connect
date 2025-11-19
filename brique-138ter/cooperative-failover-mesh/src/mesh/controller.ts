// ============================================================================
// Mesh Controller - Apply routing proposals and manage failovers
// ============================================================================

import { pool } from "../utils/db";
import { logger } from "../utils/logger";
import { subscribe, publishActionLog } from "./broker";
import { verifySignature } from "../sira/predictionEngine";
import axios from "axios";
import crypto from "crypto";

const TREASURY_API_URL = process.env.TREASURY_API_URL || "http://treasury-service:3000";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";

interface RoutingProposal {
  id: string;
  mesh_region_id: string;
  currency: string;
  min_amount: number;
  max_amount: number | null;
  proposal: any;
  sira_signature: string;
}

/**
 * Start mesh controller
 */
export async function startMeshController(): Promise<void> {
  logger.info("Starting Mesh Controller");

  // Subscribe to proposals
  await subscribe("mesh.proposals", "mesh-controller", async (message) => {
    await handleProposal(message);
  });

  // Subscribe to health signals
  await subscribe("mesh.health", "mesh-controller-health", async (message) => {
    await handleHealthSignal(message);
  });

  logger.info("Mesh Controller started");
}

/**
 * Handle routing proposal from SIRA
 */
async function handleProposal(message: any): Promise<void> {
  const { proposal_id } = message;

  // Fetch full proposal from DB
  const { rows } = await pool.query(
    `SELECT * FROM mesh_routing_proposals WHERE id = $1`,
    [proposal_id]
  );

  if (rows.length === 0) {
    logger.warn("Proposal not found", { proposal_id });
    return;
  }

  const proposal: RoutingProposal = rows[0];

  // Verify signature
  if (!verifySignature(proposal.proposal, proposal.sira_signature)) {
    logger.error("Invalid proposal signature", { proposal_id });
    await pool.query(
      `UPDATE mesh_routing_proposals SET status = 'rejected' WHERE id = $1`,
      [proposal_id]
    );
    return;
  }

  // Load policy for region
  const policy = await loadPolicy(proposal.mesh_region_id);

  // Check if auto-failover is enabled
  if (policy.auto_failover_enabled) {
    const topCandidate = proposal.proposal.sequence[0];

    // Check confidence threshold
    if (topCandidate.confidence >= policy.min_confidence_for_auto) {
      logger.info("Auto-failover triggered", {
        proposal_id,
        bank_profile_id: topCandidate.bank_profile_id,
        confidence: topCandidate.confidence,
      });

      await applyRoutingAtomically(proposal);
    } else {
      logger.info("Confidence too low for auto-failover, requiring approval", {
        proposal_id,
        confidence: topCandidate.confidence,
        required: policy.min_confidence_for_auto,
      });

      await createOpsApprovalTicket(proposal);
    }
  } else {
    logger.info("Auto-failover disabled, requiring approval", { proposal_id });
    await createOpsApprovalTicket(proposal);
  }
}

/**
 * Handle health signal update
 */
async function handleHealthSignal(message: any): Promise<void> {
  const { bank_profile_id, health_score } = message;

  // Update mesh member health
  await pool.query(
    `UPDATE mesh_members
     SET current_health_score = $1, last_health_update = now()
     WHERE bank_profile_id = $2`,
    [health_score, bank_profile_id]
  );

  logger.debug("Health signal updated", { bank_profile_id, health_score });
}

/**
 * Load policy for mesh region
 */
async function loadPolicy(meshRegionId: string): Promise<any> {
  const { rows } = await pool.query(
    `SELECT rules FROM mesh_policies
     WHERE mesh_region_id = $1 AND active = TRUE
     ORDER BY priority ASC
     LIMIT 1`,
    [meshRegionId]
  );

  if (rows.length === 0) {
    // Return default policy
    return {
      auto_failover_enabled: false,
      approval_required_threshold: 10000,
      max_cascading_depth: 3,
      min_confidence_for_auto: 0.8,
      allowed_crossborder: true,
      require_multisig_for_new_member: true,
      rollback_window_hours: 24,
      max_cost_increase_pct: 10,
    };
  }

  return rows[0].rules;
}

/**
 * Apply routing atomically (idempotent)
 */
export async function applyRoutingAtomically(proposal: RoutingProposal): Promise<void> {
  const idempotencyKey = `apply-routing-${proposal.id}`;

  // Check if already applied
  const { rows: existing } = await pool.query(
    `SELECT * FROM mesh_action_logs WHERE idempotency_key = $1`,
    [idempotencyKey]
  );

  if (existing.length > 0) {
    logger.warn("Routing already applied", { proposal_id: proposal.id });
    return;
  }

  const client = await pool.connect();
  const startTime = Date.now();

  try {
    await client.query("BEGIN");

    // Get affected payouts (pending payouts matching currency/amount range)
    const { rows: affectedPayouts } = await client.query(
      `SELECT id, amount, currency, treasury_account_id
       FROM payouts
       WHERE status = 'pending'
         AND currency = $1
         AND amount >= $2
         AND ($3 IS NULL OR amount <= $3)
       FOR UPDATE`,
      [proposal.currency, proposal.min_amount, proposal.max_amount]
    );

    logger.info("Affected payouts found", {
      proposal_id: proposal.id,
      count: affectedPayouts.length,
    });

    if (affectedPayouts.length === 0) {
      await client.query("COMMIT");
      return;
    }

    // Get top candidate from proposal
    const topBank = proposal.proposal.sequence[0];

    // Get treasury account for this bank
    const { rows: treasuryAccounts } = await client.query(
      `SELECT id FROM treasury_accounts
       WHERE bank_profile_id = $1 AND currency = $2 AND status = 'active'
       LIMIT 1`,
      [topBank.bank_profile_id, proposal.currency]
    );

    if (treasuryAccounts.length === 0) {
      throw new Error("No active treasury account found for selected bank");
    }

    const newTreasuryAccountId = treasuryAccounts[0].id;

    // Update payouts
    const affectedPayoutIds = affectedPayouts.map((p) => p.id);

    await client.query(
      `UPDATE payouts
       SET treasury_account_id = $1, updated_at = now()
       WHERE id = ANY($2)`,
      [newTreasuryAccountId, affectedPayoutIds]
    );

    // Create reconciliation records for tracking
    for (const payout of affectedPayouts) {
      await client.query(
        `INSERT INTO mesh_reconciliations(
          payout_id, original_bank_profile_id, rerouted_bank_profile_id,
          routing_proposal_id, original_amount, original_currency,
          rerouted_amount, rerouted_currency, original_estimated_cost,
          reconciliation_status
        )
        VALUES($1, (SELECT bank_profile_id FROM treasury_accounts WHERE id = $2),
               $3, $4, $5, $6, $5, $6, $7, 'pending')`,
        [
          payout.id,
          payout.treasury_account_id,
          topBank.bank_profile_id,
          proposal.id,
          payout.amount,
          payout.currency,
          topBank.estimated_cost,
        ]
      );
    }

    // Log action
    const { rows: actionLog } = await client.query(
      `INSERT INTO mesh_action_logs(
        action_type, mesh_region_id, routing_proposal_id,
        payload, actor_type, actor_id, affected_payouts,
        affected_bank_profiles, result, idempotency_key,
        duration_ms, completed_at
      )
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
      RETURNING *`,
      [
        "apply_route",
        proposal.mesh_region_id,
        proposal.id,
        JSON.stringify({
          currency: proposal.currency,
          affected_count: affectedPayouts.length,
          new_bank: topBank.bank_profile_id,
        }),
        "system",
        "mesh-controller",
        affectedPayoutIds,
        [topBank.bank_profile_id],
        "success",
        idempotencyKey,
        Date.now() - startTime,
      ]
    );

    // Update proposal status
    await client.query(
      `UPDATE mesh_routing_proposals
       SET status = 'applied', applied_at = now()
       WHERE id = $1`,
      [proposal.id]
    );

    await client.query("COMMIT");

    // Publish action log
    await publishActionLog(actionLog[0]);

    logger.info("Routing applied atomically", {
      proposal_id: proposal.id,
      affected_payouts: affectedPayouts.length,
      new_bank: topBank.bank_profile_id,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    logger.error("Failed to apply routing", {
      proposal_id: proposal.id,
      error: error.message,
    });

    // Log failed action
    await pool.query(
      `INSERT INTO mesh_action_logs(
        action_type, mesh_region_id, routing_proposal_id,
        payload, actor_type, actor_id, result, error_details,
        idempotency_key, duration_ms, completed_at
      )
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
      [
        "apply_route",
        proposal.mesh_region_id,
        proposal.id,
        JSON.stringify({ error: error.message }),
        "system",
        "mesh-controller",
        "failed",
        error.message,
        idempotencyKey,
        Date.now() - startTime,
      ]
    );

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Simulate impact of routing proposal
 */
export async function simulateImpact(proposalId: string): Promise<any> {
  const { rows } = await pool.query(
    `SELECT * FROM mesh_routing_proposals WHERE id = $1`,
    [proposalId]
  );

  if (rows.length === 0) {
    throw new Error("Proposal not found");
  }

  const proposal = rows[0];

  // Get affected payouts
  const { rows: affectedPayouts } = await pool.query(
    `SELECT id, amount, currency FROM payouts
     WHERE status = 'pending'
       AND currency = $1
       AND amount >= $2
       AND ($3 IS NULL OR amount <= $3)`,
    [proposal.currency, proposal.min_amount, proposal.max_amount]
  );

  // Calculate cost delta
  const topBank = proposal.proposal.sequence[0];
  const estimatedCostDelta =
    affectedPayouts.reduce((sum, p) => sum + topBank.estimated_cost, 0) * 0.1; // 10% reduction estimate

  // Calculate latency delta (simplified)
  const estimatedLatencyDelta = topBank.score > 80 ? -120 : 0; // 2 minutes faster if healthy

  const simulationResults = {
    affected_payouts: affectedPayouts.length,
    estimated_cost_delta: estimatedCostDelta,
    estimated_latency_delta_seconds: estimatedLatencyDelta,
    new_bank_profile_id: topBank.bank_profile_id,
    new_bank_name: topBank.bank_name,
    confidence: topBank.confidence,
  };

  // Store simulation results
  await pool.query(
    `UPDATE mesh_routing_proposals
     SET simulation_results = $1, status = 'simulated'
     WHERE id = $2`,
    [simulationResults, proposalId]
  );

  logger.info("Simulation completed", { proposal_id: proposalId, results: simulationResults });

  return simulationResults;
}

/**
 * Create ops approval ticket
 */
async function createOpsApprovalTicket(proposal: RoutingProposal): Promise<void> {
  // TODO: Integration with B136ter (risk-aware approvals)
  // For now, just mark as needing approval

  await pool.query(
    `UPDATE mesh_routing_proposals SET status = 'proposed' WHERE id = $1`,
    [proposal.id]
  );

  logger.info("Ops approval ticket created", { proposal_id: proposal.id });
}

/**
 * Rollback routing change
 */
export async function rollbackRouting(proposalId: string, reason: string): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get proposal
    const { rows: proposals } = await client.query(
      `SELECT * FROM mesh_routing_proposals WHERE id = $1`,
      [proposalId]
    );

    if (proposals.length === 0) {
      throw new Error("Proposal not found");
    }

    const proposal = proposals[0];

    if (proposal.status !== "applied") {
      throw new Error("Cannot rollback non-applied proposal");
    }

    // Get affected reconciliations
    const { rows: reconciliations } = await client.query(
      `SELECT * FROM mesh_reconciliations WHERE routing_proposal_id = $1`,
      [proposalId]
    );

    // Restore original routing
    for (const recon of reconciliations) {
      const { rows: originalAccounts } = await client.query(
        `SELECT id FROM treasury_accounts
         WHERE bank_profile_id = $1 AND currency = $2
         LIMIT 1`,
        [recon.original_bank_profile_id, recon.original_currency]
      );

      if (originalAccounts.length > 0) {
        await client.query(
          `UPDATE payouts SET treasury_account_id = $1 WHERE id = $2`,
          [originalAccounts[0].id, recon.payout_id]
        );
      }
    }

    // Update proposal status
    await client.query(
      `UPDATE mesh_routing_proposals
       SET status = 'rolled_back', rolled_back_at = now(), rollback_reason = $1
       WHERE id = $2`,
      [reason, proposalId]
    );

    // Log action
    await client.query(
      `INSERT INTO mesh_action_logs(
        action_type, mesh_region_id, routing_proposal_id,
        payload, actor_type, actor_id, result
      )
      VALUES($1, $2, $3, $4, $5, $6, $7)`,
      [
        "rollback",
        proposal.mesh_region_id,
        proposalId,
        JSON.stringify({ reason, affected_count: reconciliations.length }),
        "system",
        "mesh-controller",
        "success",
      ]
    );

    await client.query("COMMIT");

    logger.info("Routing rolled back", { proposal_id: proposalId, reason });
  } catch (error: any) {
    await client.query("ROLLBACK");
    logger.error("Failed to rollback routing", { proposal_id: proposalId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
}
