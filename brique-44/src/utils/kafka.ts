// ============================================================================
// Brique 44 - Anti-fraude Temps Réel
// Kafka Client Configuration
// ============================================================================

import { Kafka, Producer, Consumer, logLevel } from "kafkajs";

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || "molam-fraud";
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || "fraud-evaluation";

export const TOPIC_TXN_CREATED = process.env.KAFKA_TOPIC_TXN_CREATED || "checkout.txn_created";
export const TOPIC_FRAUD_DECISION = process.env.KAFKA_TOPIC_FRAUD_DECISION || "fraud.decision";

// Kafka client
export const kafka = new Kafka({
  clientId: KAFKA_CLIENT_ID,
  brokers: KAFKA_BROKERS,
  logLevel: logLevel.INFO,
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
});

// Producer (for publishing fraud decisions)
let producerInstance: Producer | null = null;

export async function getProducer(): Promise<Producer> {
  if (!producerInstance) {
    producerInstance = kafka.producer();
    await producerInstance.connect();
    console.log("Kafka producer connected");
  }
  return producerInstance;
}

// Consumer (for consuming transaction events)
let consumerInstance: Consumer | null = null;

export async function getConsumer(): Promise<Consumer> {
  if (!consumerInstance) {
    consumerInstance = kafka.consumer({ groupId: KAFKA_GROUP_ID });
    await consumerInstance.connect();
    console.log("Kafka consumer connected");
  }
  return consumerInstance;
}

// Graceful shutdown
export async function closeKafka(): Promise<void> {
  if (producerInstance) {
    await producerInstance.disconnect();
    producerInstance = null;
  }
  if (consumerInstance) {
    await consumerInstance.disconnect();
    consumerInstance = null;
  }
  console.log("Kafka connections closed");
}
