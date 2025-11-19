/**
 * Brique 114 - SIRA Explainability & Feedback UI
 * Event Publisher - Publish events to Kafka/webhooks
 */

import { Kafka } from "kafkajs";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info"
});

let kafka: Kafka | null = null;
let producer: any = null;

// Initialize Kafka if configured
if (process.env.KAFKA_BROKERS) {
  kafka = new Kafka({
    clientId: "sira-feedback-publisher",
    brokers: process.env.KAFKA_BROKERS.split(",")
  });
  producer = kafka.producer();
  producer.connect().catch((error: any) => {
    logger.error({ error }, "Failed to connect Kafka producer");
  });
}

/**
 * Publish event to Kafka/webhook system
 */
export async function publishEvent(
  target: "internal" | "merchant" | "ops",
  tenantId: string | null,
  eventType: string,
  payload: any
): Promise<void> {
  logger.info({ target, tenantId, eventType }, "Publishing event");

  // Publish to Kafka if available
  if (producer) {
    try {
      await producer.send({
        topic: eventType,
        messages: [{
          key: tenantId || "global",
          value: JSON.stringify({
            target,
            tenant_id: tenantId,
            event_type: eventType,
            payload,
            timestamp: new Date().toISOString()
          })
        }]
      });
      logger.info({ eventType }, "Event published to Kafka");
    } catch (error: any) {
      logger.error({ error }, "Failed to publish to Kafka");
    }
  } else {
    // Fallback: log event
    logger.info({ target, tenantId, eventType, payload }, "Event logged (Kafka not configured)");
  }
}

