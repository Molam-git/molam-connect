/**
 * Brique 70octies - Campaign Executor Worker
 * CRON job to automatically execute scheduled loyalty campaigns
 */

import cron from 'node-cron';
import pool from '../db';
import { createAuditLog } from '../services/audit';
import { ingestEvent } from '../services/loyalty/ingest';

/**
 * Start campaign executor worker
 * Runs every hour to check for campaigns to execute
 */
export function startCampaignExecutor() {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('[CAMPAIGN_EXECUTOR] Starting campaign execution check...');

    try {
      const startTime = Date.now();
      const result = await executePendingCampaigns();
      const duration = Date.now() - startTime;

      console.log(
        `[CAMPAIGN_EXECUTOR] Completed. Executed ${result.campaignsExecuted} campaigns, awarded ${result.totalPointsAwarded} points to ${result.usersAwarded} users in ${duration}ms`
      );
    } catch (error) {
      console.error('[CAMPAIGN_EXECUTOR] Error:', error);
    }
  });

  console.log('[CAMPAIGN_EXECUTOR] Scheduled to run every hour');
}

/**
 * Execute pending campaigns
 */
export async function executePendingCampaigns(): Promise<{
  campaignsExecuted: number;
  usersAwarded: number;
  totalPointsAwarded: number;
}> {
  // Find campaigns that should be executed now
  const campaigns = await pool.query(
    `SELECT * FROM loyalty_campaigns
     WHERE status = 'scheduled'
       AND start_date <= NOW()
       AND (end_date IS NULL OR end_date >= NOW())
     ORDER BY created_at ASC`
  );

  let campaignsExecuted = 0;
  let totalUsersAwarded = 0;
  let totalPointsAwarded = 0;

  for (const campaign of campaigns.rows) {
    try {
      const result = await executeCampaign(campaign);
      campaignsExecuted++;
      totalUsersAwarded += result.usersAwarded;
      totalPointsAwarded += result.pointsAwarded;
    } catch (error) {
      console.error(`[CAMPAIGN_EXECUTOR] Failed to execute campaign ${campaign.id}:`, error);

      // Mark campaign as failed
      await pool.query(
        `UPDATE loyalty_campaigns
         SET status = 'failed', updated_at = NOW()
         WHERE id = $1`,
        [campaign.id]
      );
    }
  }

  return {
    campaignsExecuted,
    usersAwarded: totalUsersAwarded,
    totalPointsAwarded
  };
}

/**
 * Execute a specific campaign
 */
async function executeCampaign(campaign: any): Promise<{
  usersAwarded: number;
  pointsAwarded: number;
}> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log(`[CAMPAIGN_EXECUTOR] Executing campaign: ${campaign.name} (${campaign.id})`);

    // Get target users based on campaign rules
    const targetUsers = await getTargetUsers(campaign);

    if (targetUsers.length === 0) {
      console.log(`[CAMPAIGN_EXECUTOR] No eligible users for campaign ${campaign.id}`);

      await client.query(
        `UPDATE loyalty_campaigns
         SET status = 'completed', updated_at = NOW()
         WHERE id = $1`,
        [campaign.id]
      );

      await client.query('COMMIT');
      return { usersAwarded: 0, pointsAwarded: 0 };
    }

    let totalPointsAwarded = 0;
    let successCount = 0;

    // Award points to each user
    for (const user of targetUsers) {
      try {
        const idempotencyKey = `campaign-${campaign.id}-user-${user.user_id}-${Date.now()}`;

        const result = await ingestEvent({
          idempotencyKey,
          programId: campaign.program_id,
          userId: user.user_id,
          type: 'campaign_bonus',
          amount: campaign.bonus_points || 0,
          currency: 'points',
          metadata: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            campaignType: campaign.campaign_type
          },
          actorId: 'system',
          actorRole: 'campaign_executor'
        });

        if (result.success) {
          totalPointsAwarded += result.pointsAwarded || 0;
          successCount++;
        }
      } catch (error) {
        console.error(`[CAMPAIGN_EXECUTOR] Failed to award points to user ${user.user_id}:`, error);
      }
    }

    // Update campaign status
    await client.query(
      `UPDATE loyalty_campaigns
       SET status = 'completed',
           users_awarded = $1,
           total_points_awarded = $2,
           executed_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [successCount, totalPointsAwarded, campaign.id]
    );

    // Audit log
    await createAuditLog({
      entityType: 'campaign',
      entityId: campaign.id,
      action: 'update',
      actorId: 'system',
      actorRole: 'campaign_executor',
      changes: {
        status: 'completed',
        usersAwarded: successCount,
        totalPointsAwarded,
        executedAt: new Date().toISOString()
      }
    });

    await client.query('COMMIT');

    console.log(
      `[CAMPAIGN_EXECUTOR] Campaign ${campaign.id} completed: ${successCount} users awarded ${totalPointsAwarded} points`
    );

    return {
      usersAwarded: successCount,
      pointsAwarded: totalPointsAwarded
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get target users for a campaign based on rules
 */
async function getTargetUsers(campaign: any): Promise<any[]> {
  const targetSegment = campaign.target_segment;
  const programId = campaign.program_id;

  let query = 'SELECT user_id FROM loyalty_balances WHERE program_id = $1';
  const params: any[] = [programId];
  let paramIndex = 2;

  // Apply segment filters
  if (targetSegment === 'inactive') {
    // Users who haven't earned points in 30+ days
    query += ` AND last_earned_at < NOW() - INTERVAL '30 days'`;

  } else if (targetSegment === 'at_risk') {
    // Users with high churn risk
    query += ` AND churn_risk_score > 0.7`;

  } else if (targetSegment === 'high_value') {
    // Users with high lifetime spend
    query += ` AND lifetime_spend > 5000`;

  } else if (targetSegment === 'tier_basic') {
    query += ` AND current_tier = 'basic'`;

  } else if (targetSegment === 'tier_silver') {
    query += ` AND current_tier = 'silver'`;

  } else if (targetSegment === 'tier_gold') {
    query += ` AND current_tier = 'gold'`;

  } else if (targetSegment === 'tier_platinum') {
    query += ` AND current_tier = 'platinum'`;

  } else if (targetSegment === 'all') {
    // All users in program
    // No additional filter
  }

  // Exclude frozen accounts
  query += ' AND (is_frozen IS NULL OR is_frozen = FALSE)';

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Manual campaign execution (for testing or admin trigger)
 */
export async function manualCampaignExecution(campaignId: string): Promise<{
  usersAwarded: number;
  pointsAwarded: number;
}> {
  const campaign = await pool.query(
    'SELECT * FROM loyalty_campaigns WHERE id = $1',
    [campaignId]
  );

  if (campaign.rows.length === 0) {
    throw new Error('Campaign not found');
  }

  return await executeCampaign(campaign.rows[0]);
}

/**
 * Schedule a new campaign
 */
export async function scheduleCampaign(config: {
  programId: string;
  name: string;
  description: string;
  campaignType: string;
  targetSegment: string;
  bonusPoints?: number;
  bonusMultiplier?: number;
  startDate: Date;
  endDate?: Date;
  actorId?: string;
  actorRole?: string;
}): Promise<string> {
  const result = await pool.query(
    `INSERT INTO loyalty_campaigns
     (program_id, name, description, campaign_type, target_segment, bonus_points,
      bonus_multiplier, start_date, end_date, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', NOW(), NOW())
     RETURNING id`,
    [
      config.programId,
      config.name,
      config.description,
      config.campaignType,
      config.targetSegment,
      config.bonusPoints || null,
      config.bonusMultiplier || null,
      config.startDate,
      config.endDate || null
    ]
  );

  const campaignId = result.rows[0].id;

  // Audit log
  await createAuditLog({
    entityType: 'campaign',
    entityId: campaignId,
    action: 'create',
    actorId: config.actorId,
    actorRole: config.actorRole,
    changes: {
      name: config.name,
      targetSegment: config.targetSegment,
      bonusPoints: config.bonusPoints,
      startDate: config.startDate.toISOString()
    }
  });

  console.log(`[CAMPAIGN_EXECUTOR] Campaign scheduled: ${config.name} (${campaignId})`);

  return campaignId;
}
