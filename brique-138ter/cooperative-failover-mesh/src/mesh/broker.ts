// ============================================================================
// Mesh Broker - Kafka/PubSub abstraction for mesh communication
// ============================================================================

import { Kafka, Producer, Consumer, EachMessagePayload } from "kafkajs";
import { logger } from "../utils/logger";

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || "mesh-broker";

const kafka = new Kafka({
  clientId: KAFKA_CLIENT_ID,
  brokers: KAFKA_BROKERS,
  ssl: process.env.KAFKA_SSL === "true",
  sasl: process.env.KAFKA_SASL_USERNAME
    ? {
        mechanism: "plain",
        username: process.env.KAFKA_SASL_USERNAME,
        password: process.env.KAFKA_SASL_PASSWORD || "",
      }
    : undefined,
});

let producer: Producer | null = null;

/**
 * Initialize producer
 */
export async function initProducer(): Promise<void> {
  if (producer) return;

  producer = kafka.producer();
  await producer.connect();
  logger.info("Mesh broker producer connected");
}

/**
 * Publish message to mesh topic
 */
export async function publish(topic: string, message: any, key?: string): Promise<void> {
  if (!producer) {
    await initProducer();
  }

  await producer!.send({
    topic,
    messages: [
      {
        key: key || null,
        value: JSON.stringify(message),
        timestamp: Date.now().toString(),
      },
    ],
  });

  logger.info("Message published to mesh", { topic, key });
}

/**
 * Subscribe to mesh topic with handler
 */
export async function subscribe(
  topic: string,
  groupId: string,
  handler: (payload: any) => Promise<void>
): Promise<Consumer> {
  const consumer = kafka.consumer({ groupId });

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });

  await consumer.run({
    eachMessage: async (payload: EachMessagePayload) => {
      try {
        const message = JSON.parse(payload.message.value?.toString() || "{}");
        await handler(message);
      } catch (error: any) {
        logger.error("Failed to process mesh message", {
          topic,
          partition: payload.partition,
          offset: payload.message.offset,
          error: error.message,
        });
      }
    },
  });

  logger.info("Subscribed to mesh topic", { topic, groupId });

  return consumer;
}

/**
 * Publish health signal
 */
export async function publishHealthSignal(bankProfileId: string, health: any): Promise<void> {
  await publish(
    "mesh.health",
    {
      bank_profile_id: bankProfileId,
      health_score: health.score,
      latency_ms: health.latency_ms,
      success_rate: health.success_rate,
      volume_last_hour: health.volume_last_hour,
      timestamp: new Date().toISOString(),
    },
    bankProfileId
  );
}

/**
 * Publish SIRA prediction
 */
export async function publishPrediction(prediction: any): Promise<void> {
  await publish(
    "mesh.predictions",
    {
      prediction_id: prediction.id,
      bank_profile_id: prediction.bank_profile_id,
      mesh_region_id: prediction.mesh_region_id,
      predicted_score: prediction.predicted_score,
      confidence: prediction.confidence,
      prediction_window_minutes: prediction.prediction_window_minutes,
      recommendation: prediction.recommended_action,
      timestamp: new Date().toISOString(),
    },
    prediction.bank_profile_id
  );
}

/**
 * Publish routing proposal
 */
export async function publishRoutingProposal(proposal: any): Promise<void> {
  await publish(
    "mesh.proposals",
    {
      proposal_id: proposal.id,
      mesh_region_id: proposal.mesh_region_id,
      currency: proposal.currency,
      min_amount: proposal.min_amount,
      max_amount: proposal.max_amount,
      proposal: proposal.proposal,
      created_by: proposal.created_by,
      sira_signature: proposal.sira_signature,
      timestamp: new Date().toISOString(),
    },
    proposal.mesh_region_id
  );
}

/**
 * Publish action log
 */
export async function publishActionLog(action: any): Promise<void> {
  await publish(
    "mesh.actions",
    {
      action_id: action.id,
      action_type: action.action_type,
      mesh_region_id: action.mesh_region_id,
      actor_id: action.actor_id,
      result: action.result,
      timestamp: new Date().toISOString(),
    },
    action.mesh_region_id
  );
}

/**
 * Graceful shutdown
 */
export async function shutdown(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    logger.info("Mesh broker producer disconnected");
  }
}
