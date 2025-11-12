// ============================================================================
// Split Calculation Service
// Purpose: Calculate payment splits based on configured rules
// ============================================================================

import {
  SplitRule,
  PercentageRuleConfig,
  FixedRuleConfig,
  TieredRuleConfigItem,
  HierarchicalRuleConfigItem,
  SplitRecipient,
  SplitCalculationResult,
  CalculateSplitsInput,
  RecipientType,
  CalculationBasis,
} from '../types';
import pool from '../db';

/**
 * Calculate splits for a payment based on platform/merchant rules
 */
export async function calculateSplits(
  input: CalculateSplitsInput
): Promise<SplitCalculationResult> {
  const { payment_id, platform_id, merchant_id, total_amount, currency, recipient_mapping } = input;

  // 1. Find applicable split rule (merchant-specific first, then platform default)
  const rule = await findApplicableRule(platform_id, merchant_id, currency);

  if (!rule) {
    throw new Error(`No split rule found for platform ${platform_id}, currency ${currency}`);
  }

  // 2. Validate amount meets minimum requirements
  if (total_amount < rule.min_split_amount) {
    throw new Error(
      `Payment amount ${total_amount} is below minimum split amount ${rule.min_split_amount}`
    );
  }

  // 3. Calculate splits based on rule type
  let recipients: SplitRecipient[] = [];

  switch (rule.rule_type) {
    case 'percentage':
      recipients = calculatePercentageSplits(
        rule.rule_config as PercentageRuleConfig,
        total_amount,
        recipient_mapping
      );
      break;

    case 'fixed':
      recipients = calculateFixedSplits(
        rule.rule_config as FixedRuleConfig,
        total_amount,
        recipient_mapping
      );
      break;

    case 'tiered':
      recipients = calculateTieredSplits(
        rule.rule_config as TieredRuleConfigItem[],
        total_amount,
        recipient_mapping
      );
      break;

    case 'hierarchical':
      recipients = calculateHierarchicalSplits(
        rule.rule_config as HierarchicalRuleConfigItem[],
        total_amount,
        recipient_mapping
      );
      break;

    default:
      throw new Error(`Unsupported rule type: ${rule.rule_type}`);
  }

  // 4. Validate total split amount
  const totalSplit = recipients.reduce((sum, r) => sum + r.amount, 0);

  if (Math.abs(totalSplit - total_amount) > 1) {
    throw new Error(
      `Split calculation error: total splits ${totalSplit} != payment amount ${total_amount}`
    );
  }

  // 5. Filter out recipients below minimum amount
  recipients = recipients.filter((r) => r.amount >= rule.min_split_amount);

  // 6. Validate recipient count
  if (recipients.length > rule.max_recipients) {
    throw new Error(
      `Too many recipients: ${recipients.length} exceeds max ${rule.max_recipients}`
    );
  }

  return {
    payment_id,
    total_amount,
    currency,
    recipients,
    split_rule_id: rule.id,
    platform_id,
    merchant_id,
  };
}

/**
 * Find applicable split rule for platform/merchant
 */
async function findApplicableRule(
  platform_id: string,
  merchant_id: string,
  currency: string
): Promise<SplitRule | null> {
  // Try merchant-specific rule first
  const { rows: merchantRules } = await pool.query<SplitRule>(
    `SELECT * FROM split_rules
     WHERE platform_id = $1
       AND merchant_id = $2
       AND status = 'active'
       AND $3 = ANY(allowed_currencies)
     ORDER BY created_at DESC
     LIMIT 1`,
    [platform_id, merchant_id, currency]
  );

  if (merchantRules.length > 0) {
    return merchantRules[0];
  }

  // Fall back to platform default rule
  const { rows: platformRules } = await pool.query<SplitRule>(
    `SELECT * FROM split_rules
     WHERE platform_id = $1
       AND merchant_id IS NULL
       AND status = 'active'
       AND $2 = ANY(allowed_currencies)
     ORDER BY created_at DESC
     LIMIT 1`,
    [platform_id, currency]
  );

  return platformRules.length > 0 ? platformRules[0] : null;
}

/**
 * Calculate percentage-based splits
 * Example: {"platform": 10, "seller": 90}
 */
function calculatePercentageSplits(
  config: PercentageRuleConfig,
  total_amount: number,
  recipient_mapping: Record<RecipientType, string>
): SplitRecipient[] {
  const recipients: SplitRecipient[] = [];

  for (const [recipientType, percentage] of Object.entries(config)) {
    if (percentage === undefined) continue;

    const recipient_id = recipient_mapping[recipientType as RecipientType];
    if (!recipient_id) {
      throw new Error(`No recipient_id provided for type: ${recipientType}`);
    }

    const amount = Math.round((total_amount * percentage) / 100);

    recipients.push({
      recipient_id,
      recipient_type: recipientType as RecipientType,
      amount,
      calculation_basis: {
        type: 'percentage',
        rate: percentage,
        base_amount: total_amount,
      },
    });
  }

  return recipients;
}

/**
 * Calculate fixed-amount splits
 * Example: {"platform_fee": 500} means platform gets $5.00
 */
function calculateFixedSplits(
  config: FixedRuleConfig,
  total_amount: number,
  recipient_mapping: Record<RecipientType, string>
): SplitRecipient[] {
  const recipients: SplitRecipient[] = [];
  let remaining = total_amount;

  // First, deduct all fixed fees
  for (const [key, fixed_amount] of Object.entries(config)) {
    if (fixed_amount === undefined) continue;

    const recipientType = key.replace('_fee', '') as RecipientType;
    const recipient_id = recipient_mapping[recipientType];

    if (!recipient_id) {
      throw new Error(`No recipient_id provided for type: ${recipientType}`);
    }

    recipients.push({
      recipient_id,
      recipient_type: recipientType,
      amount: fixed_amount,
      calculation_basis: {
        type: 'fixed',
        fixed_amount,
        base_amount: total_amount,
      },
    });

    remaining -= fixed_amount;
  }

  // Remaining amount goes to seller (if mapped)
  if (recipient_mapping.seller && remaining > 0) {
    recipients.push({
      recipient_id: recipient_mapping.seller,
      recipient_type: 'seller',
      amount: remaining,
      calculation_basis: {
        type: 'fixed',
        base_amount: total_amount,
      },
    });
  }

  return recipients;
}

/**
 * Calculate tiered splits based on amount ranges
 * Example: [{"min_amount": 0, "max_amount": 10000, "platform": 15, "seller": 85}]
 */
function calculateTieredSplits(
  config: TieredRuleConfigItem[],
  total_amount: number,
  recipient_mapping: Record<RecipientType, string>
): SplitRecipient[] {
  // Find matching tier
  const matchingTier = config.find((tier) => {
    const aboveMin = total_amount >= tier.min_amount;
    const belowMax = tier.max_amount === null || total_amount <= tier.max_amount;
    return aboveMin && belowMax;
  });

  if (!matchingTier) {
    throw new Error(`No matching tier found for amount ${total_amount}`);
  }

  // Apply percentage splits from matching tier
  const recipients: SplitRecipient[] = [];

  for (const [recipientType, percentage] of Object.entries(matchingTier)) {
    if (recipientType === 'min_amount' || recipientType === 'max_amount') continue;
    if (percentage === undefined) continue;

    const recipient_id = recipient_mapping[recipientType as RecipientType];
    if (!recipient_id) continue;

    const amount = Math.round((total_amount * percentage) / 100);

    recipients.push({
      recipient_id,
      recipient_type: recipientType as RecipientType,
      amount,
      calculation_basis: {
        type: 'tiered',
        rate: percentage,
        base_amount: total_amount,
        tier_applied: `${matchingTier.min_amount}-${matchingTier.max_amount || 'infinity'}`,
      },
    });
  }

  return recipients;
}

/**
 * Calculate hierarchical splits (cascading with order)
 * Example: [{"order": 1, "recipient_type": "platform", "percentage": 10}]
 */
function calculateHierarchicalSplits(
  config: HierarchicalRuleConfigItem[],
  total_amount: number,
  recipient_mapping: Record<RecipientType, string>
): SplitRecipient[] {
  const recipients: SplitRecipient[] = [];
  let remaining = total_amount;

  // Sort by order
  const sortedConfig = [...config].sort((a, b) => a.order - b.order);

  for (const item of sortedConfig) {
    const recipient_id = recipient_mapping[item.recipient_type];
    if (!recipient_id) {
      throw new Error(`No recipient_id provided for type: ${item.recipient_type}`);
    }

    let amount = 0;
    const baseAmount = item.from_remaining ? remaining : total_amount;

    if (item.percentage !== undefined) {
      amount = Math.round((baseAmount * item.percentage) / 100);
    } else if (item.fixed_amount !== undefined) {
      amount = item.fixed_amount;
    }

    recipients.push({
      recipient_id,
      recipient_type: item.recipient_type,
      amount,
      calculation_basis: {
        type: 'hierarchical',
        rate: item.percentage,
        fixed_amount: item.fixed_amount,
        base_amount: baseAmount,
        hierarchy_order: item.order,
      },
    });

    remaining -= amount;
  }

  return recipients;
}

/**
 * Validate split calculation result
 */
export function validateSplitCalculation(result: SplitCalculationResult): void {
  const totalSplit = result.recipients.reduce((sum, r) => sum + r.amount, 0);

  if (Math.abs(totalSplit - result.total_amount) > 1) {
    throw new Error(
      `Split validation failed: total ${totalSplit} != expected ${result.total_amount}`
    );
  }

  if (result.recipients.some((r) => r.amount < 0)) {
    throw new Error('Split validation failed: negative amounts detected');
  }
}
