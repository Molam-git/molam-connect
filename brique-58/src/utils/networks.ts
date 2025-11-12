/**
 * Network utilities for computing deadlines and normalizing dispute data
 */

interface NetworkRules {
  evidenceWindow: number; // days
  responseWindow: number; // days
}

const NETWORK_RULES: Record<string, NetworkRules> = {
  visa: {
    evidenceWindow: 20,
    responseWindow: 30,
  },
  mastercard: {
    evidenceWindow: 45,
    responseWindow: 45,
  },
  amex: {
    evidenceWindow: 20,
    responseWindow: 20,
  },
  default: {
    evidenceWindow: 14,
    responseWindow: 30,
  },
};

/**
 * Compute network deadline based on dispute creation time and network rules
 */
export function computeNetworkDeadline(rawPayload: any): Date {
  const network = (rawPayload.network || 'default').toLowerCase();
  const rules = NETWORK_RULES[network] || NETWORK_RULES.default;

  // If network provides explicit deadline, use it
  if (rawPayload.deadline || rawPayload.response_deadline) {
    return new Date(rawPayload.deadline || rawPayload.response_deadline);
  }

  // Otherwise compute from creation time
  const createdAt = rawPayload.created_at ? new Date(rawPayload.created_at) : new Date();
  const deadline = new Date(createdAt);
  deadline.setDate(deadline.getDate() + rules.evidenceWindow);

  return deadline;
}

/**
 * Normalize network dispute payload to standard format
 */
export function normalizeNetworkDispute(raw: any): {
  dispute_ref: string;
  payment_id: string | null;
  merchant_id: string;
  customer_id: string | null;
  amount: number;
  currency: string;
  country: string | null;
  reason_code: string;
  reason_description: string | null;
  network: string;
  status: string;
} {
  // Handle different network payload formats
  const disputeRef = raw.reference || raw.dispute_id || raw.id || `DISP-${Date.now()}`;
  const paymentId = raw.charge_id || raw.payment_id || raw.transaction_id || null;
  const merchantId = raw.merchant_id || raw.merchant;
  const customerId = raw.card_holder_id || raw.customer_id || raw.payer_id || null;

  // Amount normalization (cents to dollars if needed)
  let amount = Number(raw.amount || 0);
  if (raw.amount_minor_units || (amount > 10000 && raw.currency)) {
    amount = amount / 100.0;
  }

  const currency = (raw.currency || 'USD').toUpperCase();
  const country = raw.country || raw.merchant_country || null;
  const reasonCode = raw.reason_code || raw.reason || 'unknown';
  const reasonDescription = raw.reason_description || raw.description || null;
  const network = (raw.network || raw.card_network || 'unknown').toLowerCase();
  const status = mapNetworkStatus(raw.status || 'reported');

  return {
    dispute_ref: disputeRef,
    payment_id: paymentId,
    merchant_id: merchantId,
    customer_id: customerId,
    amount,
    currency,
    country,
    reason_code: reasonCode,
    reason_description: reasonDescription,
    network,
    status,
  };
}

/**
 * Map network-specific status to our canonical status
 */
function mapNetworkStatus(networkStatus: string): string {
  const statusMap: Record<string, string> = {
    reported: 'reported',
    open: 'evidence_requested',
    pending: 'evidence_requested',
    under_review: 'submitted',
    reviewing: 'network_review',
    accepted: 'won',
    won: 'won',
    lost: 'lost',
    denied: 'lost',
    settled: 'settled',
    withdrawn: 'closed',
    closed: 'closed',
  };

  return statusMap[networkStatus.toLowerCase()] || 'reported';
}

/**
 * Get network-specific reason code mapping
 */
export function getReasonCodeInfo(reasonCode: string, network: string): {
  category: string;
  description: string;
  requiresEvidence: boolean;
} {
  const reasonMap: Record<string, any> = {
    '10.4': {
      category: 'fraud',
      description: 'Fraud - Card Absent Environment',
      requiresEvidence: true,
    },
    '13.1': {
      category: 'service',
      description: 'Services Not Provided or Merchandise Not Received',
      requiresEvidence: true,
    },
    '13.2': {
      category: 'subscription',
      description: 'Cancelled Recurring Transaction',
      requiresEvidence: true,
    },
    '13.3': {
      category: 'quality',
      description: 'Not as Described or Defective Merchandise',
      requiresEvidence: true,
    },
    '13.5': {
      category: 'misrepresentation',
      description: 'Misrepresentation',
      requiresEvidence: true,
    },
    '13.7': {
      category: 'cancellation',
      description: 'Cancelled Merchandise/Services',
      requiresEvidence: true,
    },
    '83': {
      category: 'fraud',
      description: 'Fraud - Card Present Environment',
      requiresEvidence: true,
    },
  };

  return (
    reasonMap[reasonCode] || {
      category: 'other',
      description: reasonCode,
      requiresEvidence: true,
    }
  );
}
