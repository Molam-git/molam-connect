/**
 * Checkout Service - session management and completion flow
 */
import { pool } from "../utils/db.js";
import { publishEvent } from "../webhooks/publisher.js";
import shortid from "shortid";
import fetch from "node-fetch";

const SUBSCRIPTIONS_URL = process.env.SUBSCRIPTIONS_URL || "http://localhost:8052";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";
const SESSION_EXPIRY_MINUTES = Number(process.env.SESSION_EXPIRY_MINUTES) || 30;

export interface CreateCheckoutSessionInput {
  idempotencyKey: string;
  merchantId: string;
  customerId?: string;
  planId: string;
  returnUrl?: string;
  cancelUrl?: string;
  successUrl?: string;
  locale?: string;
  metadata?: any;
}

export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<any> {
  const {
    idempotencyKey,
    merchantId,
    customerId,
    planId,
    returnUrl,
    cancelUrl,
    successUrl,
    locale = "en",
    metadata = {},
  } = input;

  // Idempotency check
  const { rows: existed } = await pool.query(
    "SELECT * FROM checkout_sessions WHERE external_id = $1",
    [idempotencyKey]
  );
  if (existed.length) return existed[0];

  // Fetch plan from B52 Subscriptions
  const planResponse = await fetch(`${SUBSCRIPTIONS_URL}/api/plans/${planId}`, {
    headers: { Authorization: `Bearer ${SERVICE_TOKEN}` },
  });

  if (!planResponse.ok) {
    throw new Error("plan_not_found");
  }

  const plan = await planResponse.json() as any;

  // Calculate expiry
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000);

  // Create session
  const { rows } = await pool.query(
    `INSERT INTO checkout_sessions (
      external_id, merchant_id, customer_id, plan_id,
      amount, currency, status, return_url, cancel_url, success_url,
      locale, expires_at, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, 'created', $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      idempotencyKey,
      merchantId,
      customerId || null,
      planId,
      plan.amount,
      plan.billing_currency,
      returnUrl,
      cancelUrl,
      successUrl,
      locale,
      expiresAt,
      metadata,
    ]
  );

  const session = rows[0];

  // Log event
  await logCheckoutEvent(session.id, "session.created", { locale, plan_id: planId });

  return session;
}

export async function getCheckoutSession(sessionId: string): Promise<any> {
  const { rows } = await pool.query(
    `SELECT cs.*, mb.logo_url, mb.brand_color, mb.business_name
     FROM checkout_sessions cs
     LEFT JOIN merchant_branding mb ON mb.merchant_id = cs.merchant_id
     WHERE cs.id = $1`,
    [sessionId]
  );

  if (!rows.length) return null;

  const session = rows[0];

  // Check if expired
  if (
    (session.status === "created" || session.status === "requires_action") &&
    new Date(session.expires_at) < new Date()
  ) {
    await expireSession(sessionId);
    session.status = "expired";
  }

  return session;
}

export async function completeCheckoutSession(
  sessionId: string,
  paymentMethodId: string,
  subscriptionId: string
): Promise<any> {
  const { rows } = await pool.query(
    `UPDATE checkout_sessions SET
      status = 'completed',
      payment_method_id = $2,
      subscription_id = $3,
      completed_at = now(),
      updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [sessionId, paymentMethodId, subscriptionId]
  );

  if (!rows.length) throw new Error("session_not_found");

  const session = rows[0];

  // Publish webhook
  await publishEvent("merchant", session.merchant_id, "checkout.session.completed", {
    session_id: session.id,
    subscription_id: subscriptionId,
    customer_id: session.customer_id,
  });

  // Log event
  await logCheckoutEvent(sessionId, "session.completed", {
    subscription_id: subscriptionId,
    payment_method_id: paymentMethodId,
  });

  return session;
}

export async function failCheckoutSession(sessionId: string, reason: string): Promise<any> {
  const { rows } = await pool.query(
    `UPDATE checkout_sessions SET
      status = 'failed',
      metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{failure_reason}', to_jsonb($2::text)),
      updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [sessionId, reason]
  );

  if (!rows.length) throw new Error("session_not_found");

  const session = rows[0];

  // Publish webhook
  await publishEvent("merchant", session.merchant_id, "checkout.session.failed", {
    session_id: session.id,
    reason,
  });

  // Log event
  await logCheckoutEvent(sessionId, "session.failed", { reason });

  return session;
}

export async function expireSession(sessionId: string): Promise<void> {
  const { rows } = await pool.query(
    "UPDATE checkout_sessions SET status = 'expired', updated_at = now() WHERE id = $1 RETURNING *",
    [sessionId]
  );

  if (rows.length) {
    const session = rows[0];
    await publishEvent("merchant", session.merchant_id, "checkout.session.expired", {
      session_id: sessionId,
    });

    await logCheckoutEvent(sessionId, "session.expired", {});
  }
}

export async function logCheckoutEvent(
  sessionId: string,
  eventType: string,
  eventData: any,
  userAgent?: string,
  ipAddress?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO checkout_events (session_id, event_type, event_data, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, eventType, eventData, userAgent || null, ipAddress || null]
  );
}
