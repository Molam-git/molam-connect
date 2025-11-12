import { pool } from '../db/pool';
import {
  PromoCode,
  MarketingCampaign,
  PromoCodeApplicationResult,
  PromoCodeValidationResult,
} from '../types/marketing';

/**
 * Validate if a promo code is valid for use
 */
export async function validatePromoCode(
  code: string,
  customerId?: string
): Promise<PromoCodeValidationResult> {
  const client = await pool.connect();

  try {
    // Use the PostgreSQL function for validation
    const validationResult = await client.query(
      'SELECT is_promo_code_valid($1, $2) as valid',
      [code, customerId]
    );

    if (!validationResult.rows[0].valid) {
      return {
        valid: false,
        reason: 'Promo code is invalid, expired, or usage limit reached',
      };
    }

    // Fetch promo code details
    const promoResult = await client.query<PromoCode & { campaign: MarketingCampaign }>(
      `SELECT
        pc.*,
        row_to_json(mc.*) as campaign
      FROM promo_codes pc
      JOIN marketing_campaigns mc ON mc.id = pc.campaign_id
      WHERE UPPER(pc.code) = UPPER($1)`,
      [code]
    );

    if (promoResult.rows.length === 0) {
      return { valid: false, reason: 'Promo code not found' };
    }

    const promoCode = promoResult.rows[0];
    const campaign = promoCode.campaign as any;

    return {
      valid: true,
      promo_code: promoCode,
      campaign,
    };
  } finally {
    client.release();
  }
}

/**
 * Apply a promo code to an order
 */
export async function applyPromoCode(
  code: string,
  amount: number,
  currency: string,
  customerId: string,
  orderId?: string,
  productIds?: string[],
  ipAddress?: string,
  userAgent?: string
): Promise<PromoCodeApplicationResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Validate promo code
    const validation = await validatePromoCode(code, customerId);
    if (!validation.valid || !validation.promo_code) {
      await client.query('ROLLBACK');
      return {
        success: false,
        original_amount: amount,
        discount_amount: 0,
        final_amount: amount,
        currency,
        promo_code: null as any,
        usage_log_id: '',
        error: validation.reason || 'Invalid promo code',
      };
    }

    const promoCode = validation.promo_code;
    const campaign = validation.campaign!;

    // Check minimum purchase amount
    if (campaign.min_purchase_amount && amount < campaign.min_purchase_amount) {
      await client.query('ROLLBACK');
      return {
        success: false,
        original_amount: amount,
        discount_amount: 0,
        final_amount: amount,
        currency,
        promo_code: promoCode,
        usage_log_id: '',
        error: `Minimum purchase amount is ${campaign.min_purchase_amount} ${currency}`,
      };
    }

    // Check applicable products
    if (
      productIds &&
      campaign.applicable_products &&
      campaign.applicable_products.length > 0
    ) {
      const hasApplicableProduct = productIds.some((pid) =>
        campaign.applicable_products!.includes(pid)
      );
      if (!hasApplicableProduct) {
        await client.query('ROLLBACK');
        return {
          success: false,
          original_amount: amount,
          discount_amount: 0,
          final_amount: amount,
          currency,
          promo_code: promoCode,
          usage_log_id: '',
          error: 'Promo code not applicable to products in cart',
        };
      }
    }

    // Check excluded products
    if (
      productIds &&
      campaign.excluded_products &&
      campaign.excluded_products.length > 0
    ) {
      const hasExcludedProduct = productIds.some((pid) =>
        campaign.excluded_products!.includes(pid)
      );
      if (hasExcludedProduct) {
        await client.query('ROLLBACK');
        return {
          success: false,
          original_amount: amount,
          discount_amount: 0,
          final_amount: amount,
          currency,
          promo_code: promoCode,
          usage_log_id: '',
          error: 'Cart contains products excluded from this promotion',
        };
      }
    }

    // Calculate discount
    let discountAmount = 0;
    let freeShipping = false;

    switch (promoCode.discount_type) {
      case 'percentage':
        discountAmount = (amount * promoCode.discount_value) / 100;
        break;
      case 'fixed':
        if (promoCode.currency && promoCode.currency !== currency) {
          await client.query('ROLLBACK');
          return {
            success: false,
            original_amount: amount,
            discount_amount: 0,
            final_amount: amount,
            currency,
            promo_code: promoCode,
            usage_log_id: '',
            error: `Promo code currency (${promoCode.currency}) does not match order currency (${currency})`,
          };
        }
        discountAmount = promoCode.discount_value;
        break;
      case 'free_shipping':
        freeShipping = true;
        discountAmount = 0; // Shipping cost will be handled separately
        break;
    }

    // Apply max discount limit
    if (campaign.max_discount_amount && discountAmount > campaign.max_discount_amount) {
      discountAmount = campaign.max_discount_amount;
    }

    // Ensure discount doesn't exceed order amount
    if (discountAmount > amount) {
      discountAmount = amount;
    }

    const finalAmount = amount - discountAmount;

    // Increment usage count
    await client.query(
      `UPDATE promo_codes
       SET used_count = used_count + 1, updated_at = now()
       WHERE id = $1`,
      [promoCode.id]
    );

    // Increment campaign usage count
    await client.query(
      `UPDATE marketing_campaigns
       SET total_usage_count = total_usage_count + 1, updated_at = now()
       WHERE id = $1`,
      [promoCode.campaign_id]
    );

    // Log usage for audit and fraud detection
    const usageResult = await client.query(
      `INSERT INTO promo_code_usage (
        promo_code_id, customer_id, order_id,
        original_amount, discount_amount, final_amount, currency,
        ip_address, user_agent, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'applied')
      RETURNING id`,
      [
        promoCode.id,
        customerId,
        orderId,
        amount,
        discountAmount,
        finalAmount,
        currency,
        ipAddress,
        userAgent,
      ]
    );

    await client.query('COMMIT');

    return {
      success: true,
      original_amount: amount,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      currency,
      promo_code: promoCode,
      usage_log_id: usageResult.rows[0].id,
      free_shipping: freeShipping,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error applying promo code:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Refund a promo code usage (e.g., when order is canceled)
 */
export async function refundPromoCodeUsage(
  usageLogId: string
): Promise<{ success: boolean; error?: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get usage log
    const usageResult = await client.query(
      'SELECT * FROM promo_code_usage WHERE id = $1',
      [usageLogId]
    );

    if (usageResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Usage log not found' };
    }

    const usage = usageResult.rows[0];

    if (usage.status === 'refunded') {
      await client.query('ROLLBACK');
      return { success: false, error: 'Usage already refunded' };
    }

    // Decrement promo code usage
    await client.query(
      `UPDATE promo_codes
       SET used_count = GREATEST(used_count - 1, 0), updated_at = now()
       WHERE id = $1`,
      [usage.promo_code_id]
    );

    // Decrement campaign usage
    const promoResult = await client.query(
      'SELECT campaign_id FROM promo_codes WHERE id = $1',
      [usage.promo_code_id]
    );

    if (promoResult.rows.length > 0) {
      await client.query(
        `UPDATE marketing_campaigns
         SET total_usage_count = GREATEST(total_usage_count - 1, 0), updated_at = now()
         WHERE id = $1`,
        [promoResult.rows[0].campaign_id]
      );
    }

    // Mark usage as refunded
    await client.query(
      `UPDATE promo_code_usage SET status = 'refunded' WHERE id = $1`,
      [usageLogId]
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error refunding promo code:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get customer promo code usage history
 */
export async function getCustomerPromoUsage(
  customerId: string,
  limit: number = 10
): Promise<any[]> {
  const result = await pool.query(
    `SELECT
      pcu.*,
      pc.code as promo_code,
      pc.discount_type,
      mc.name as campaign_name
    FROM promo_code_usage pcu
    JOIN promo_codes pc ON pc.id = pcu.promo_code_id
    JOIN marketing_campaigns mc ON mc.id = pc.campaign_id
    WHERE pcu.customer_id = $1
    ORDER BY pcu.created_at DESC
    LIMIT $2`,
    [customerId, limit]
  );

  return result.rows;
}
