// ============================================================================
// Brique 45 - Webhooks Industriels
// Payment Event Hooks (examples for integration with Checkout/Connect)
// ============================================================================

import { publishEvent } from "../webhooks/publisher";

/**
 * Hook: Payment succeeded
 * Triggered when a payment is successfully captured
 */
export async function onPaymentSucceeded(merchantId: string, payment: any): Promise<void> {
  await publishEvent("merchant", merchantId, "payment.succeeded", {
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    customer_id: payment.customer_id,
    method: payment.method, // 'wallet'|'card'|'bank'
    country: payment.country,
    metadata: payment.metadata || {},
    created: payment.created_at,
  });
}

/**
 * Hook: Payment failed
 * Triggered when a payment attempt fails
 */
export async function onPaymentFailed(merchantId: string, payment: any): Promise<void> {
  await publishEvent("merchant", merchantId, "payment.failed", {
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    customer_id: payment.customer_id,
    method: payment.method,
    failure_code: payment.failure_code,
    failure_message: payment.failure_message,
    created: payment.created_at,
  });
}

/**
 * Hook: Refund created
 * Triggered when a refund is initiated
 */
export async function onRefundCreated(merchantId: string, refund: any): Promise<void> {
  await publishEvent("merchant", merchantId, "refund.created", {
    id: refund.id,
    payment_id: refund.payment_id,
    amount: refund.amount,
    currency: refund.currency,
    reason: refund.reason,
    status: refund.status,
    created: refund.created_at,
  });
}

/**
 * Hook: Refund succeeded
 * Triggered when a refund is successfully processed
 */
export async function onRefundSucceeded(merchantId: string, refund: any): Promise<void> {
  await publishEvent("merchant", merchantId, "refund.succeeded", {
    id: refund.id,
    payment_id: refund.payment_id,
    amount: refund.amount,
    currency: refund.currency,
    processed_at: new Date().toISOString(),
  });
}

/**
 * Hook: Dispute created
 * Triggered when a payment dispute/chargeback is filed
 */
export async function onDisputeCreated(merchantId: string, dispute: any): Promise<void> {
  await publishEvent("merchant", merchantId, "dispute.created", {
    id: dispute.id,
    payment_id: dispute.payment_id,
    amount: dispute.amount,
    currency: dispute.currency,
    reason: dispute.reason,
    evidence_due_by: dispute.evidence_due_by,
    created: dispute.created_at,
  });
}

/**
 * Hook: Dispute resolved
 * Triggered when a dispute is resolved (won or lost)
 */
export async function onDisputeResolved(merchantId: string, dispute: any): Promise<void> {
  await publishEvent("merchant", merchantId, "dispute.resolved", {
    id: dispute.id,
    payment_id: dispute.payment_id,
    status: dispute.status, // 'won'|'lost'
    resolution: dispute.resolution,
    resolved_at: new Date().toISOString(),
  });
}

/**
 * Hook: Payout created
 * Triggered when a payout to merchant is scheduled
 */
export async function onPayoutCreated(merchantId: string, payout: any): Promise<void> {
  await publishEvent("merchant", merchantId, "payout.created", {
    id: payout.id,
    amount: payout.amount,
    currency: payout.currency,
    destination: payout.destination, // bank account, wallet, etc.
    arrival_date: payout.arrival_date,
    status: payout.status,
    created: payout.created_at,
  });
}

/**
 * Hook: Payout paid
 * Triggered when a payout is successfully sent
 */
export async function onPayoutPaid(merchantId: string, payout: any): Promise<void> {
  await publishEvent("merchant", merchantId, "payout.paid", {
    id: payout.id,
    amount: payout.amount,
    currency: payout.currency,
    paid_at: new Date().toISOString(),
  });
}

/**
 * Hook: Payout failed
 * Triggered when a payout fails
 */
export async function onPayoutFailed(merchantId: string, payout: any): Promise<void> {
  await publishEvent("merchant", merchantId, "payout.failed", {
    id: payout.id,
    amount: payout.amount,
    currency: payout.currency,
    failure_code: payout.failure_code,
    failure_message: payout.failure_message,
    failed_at: new Date().toISOString(),
  });
}

/**
 * Hook: Customer created
 * Triggered when a new customer is created
 */
export async function onCustomerCreated(merchantId: string, customer: any): Promise<void> {
  await publishEvent("merchant", merchantId, "customer.created", {
    id: customer.id,
    email: customer.email,
    name: customer.name,
    metadata: customer.metadata || {},
    created: customer.created_at,
  });
}

/**
 * Hook: Customer updated
 * Triggered when customer details are updated
 */
export async function onCustomerUpdated(merchantId: string, customer: any): Promise<void> {
  await publishEvent("merchant", merchantId, "customer.updated", {
    id: customer.id,
    email: customer.email,
    name: customer.name,
    metadata: customer.metadata || {},
    updated: new Date().toISOString(),
  });
}

/**
 * Hook: Subscription created
 * Triggered when a recurring subscription is created
 */
export async function onSubscriptionCreated(merchantId: string, subscription: any): Promise<void> {
  await publishEvent("merchant", merchantId, "subscription.created", {
    id: subscription.id,
    customer_id: subscription.customer_id,
    plan_id: subscription.plan_id,
    status: subscription.status,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
    created: subscription.created_at,
  });
}

/**
 * Hook: Subscription cancelled
 * Triggered when a subscription is cancelled
 */
export async function onSubscriptionCancelled(merchantId: string, subscription: any): Promise<void> {
  await publishEvent("merchant", merchantId, "subscription.cancelled", {
    id: subscription.id,
    customer_id: subscription.customer_id,
    cancel_at: subscription.cancel_at,
    cancelled_at: new Date().toISOString(),
  });
}
