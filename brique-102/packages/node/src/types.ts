/**
 * Public TypeScript types for Molam SDK
 */

export interface MolamClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface PaymentIntentCreate {
  amount: number; // cents
  currency: string;
  merchantId: string;
  description?: string;
  metadata?: Record<string, any>;
  customerId?: string;
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: "requires_confirmation" | "succeeded" | "failed";
  merchant_id: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface RefundCreate {
  paymentId: string;
  amount: number;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface Refund {
  id: string;
  payment_id: string;
  amount: number;
  status: "pending" | "succeeded" | "failed";
  created_at: string;
}

export interface Charge {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "succeeded" | "failed";
  payment_intent_id: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  customer_id: string;
  status: "active" | "canceled" | "past_due";
  amount: number;
  currency: string;
  interval: "month" | "year";
  created_at: string;
}

export interface Payout {
  id: string;
  amount: number;
  currency: string;
  beneficiary: string;
  status: "pending" | "completed" | "failed";
  origin_module: string;
  origin_entity: string;
  created_at: string;
}
