/**
 * Brique 70octies - Webhook Publisher
 * Event publishing for downstream systems with retry and DLQ support
 */

export interface WebhookEvent {
  eventType: 'loyalty.points.earned' | 'loyalty.points.redeemed' | 'loyalty.tier.upgraded' | 'loyalty.balance.adjusted' | 'loyalty.voucher.generated';
  programId: string;
  userId: string;
  data: any;
  timestamp: Date;
  idempotencyKey?: string;
}

interface WebhookConfig {
  url: string;
  secret: string;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Publish webhook event to configured endpoints
 * In production, this would integrate with a message queue (RabbitMQ, Kafka, etc.)
 */
export async function publishEvent(event: WebhookEvent, config?: WebhookConfig): Promise<void> {
  try {
    // For now, log the event
    // In production, this would send to a message queue or webhook endpoint
    console.log('[WEBHOOK] Event published:', {
      type: event.eventType,
      userId: event.userId,
      programId: event.programId,
      timestamp: event.timestamp.toISOString(),
      idempotencyKey: event.idempotencyKey
    });

    // TODO: Integrate with actual message queue
    // await publishToQueue(event, config);
  } catch (error) {
    console.error('[WEBHOOK] Failed to publish event:', error);
    // TODO: Send to Dead Letter Queue (DLQ)
    // await sendToDLQ(event, error);
  }
}

/**
 * Publish points earned event
 */
export async function publishPointsEarnedEvent(
  programId: string,
  userId: string,
  data: {
    transactionId: string;
    pointsAwarded: number;
    newBalance: number;
    source: string;
  },
  idempotencyKey?: string
): Promise<void> {
  await publishEvent({
    eventType: 'loyalty.points.earned',
    programId,
    userId,
    data,
    timestamp: new Date(),
    idempotencyKey
  });
}

/**
 * Publish points redeemed event
 */
export async function publishPointsRedeemedEvent(
  programId: string,
  userId: string,
  data: {
    transactionId: string;
    pointsRedeemed: number;
    newBalance: number;
    rewardId?: string;
  },
  idempotencyKey?: string
): Promise<void> {
  await publishEvent({
    eventType: 'loyalty.points.redeemed',
    programId,
    userId,
    data,
    timestamp: new Date(),
    idempotencyKey
  });
}

/**
 * Publish tier upgraded event
 */
export async function publishTierUpgradedEvent(
  programId: string,
  userId: string,
  data: {
    oldTier: string;
    newTier: string;
    triggeredBy: string;
  }
): Promise<void> {
  await publishEvent({
    eventType: 'loyalty.tier.upgraded',
    programId,
    userId,
    data,
    timestamp: new Date()
  });
}

/**
 * Publish balance adjusted event (manual adjustment by Ops)
 */
export async function publishBalanceAdjustedEvent(
  programId: string,
  userId: string,
  data: {
    adjustment: number;
    reason: string;
    actorId: string;
    actorRole: string;
  }
): Promise<void> {
  await publishEvent({
    eventType: 'loyalty.balance.adjusted',
    programId,
    userId,
    data,
    timestamp: new Date()
  });
}

/**
 * Publish voucher generated event
 */
export async function publishVoucherGeneratedEvent(
  programId: string,
  userId: string,
  data: {
    voucherId: string;
    code: string;
    amount: number;
    expiresAt: Date;
  }
): Promise<void> {
  await publishEvent({
    eventType: 'loyalty.voucher.generated',
    programId,
    userId,
    data,
    timestamp: new Date()
  });
}
