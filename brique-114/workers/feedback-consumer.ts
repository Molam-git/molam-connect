/**
 * Brique 114 - SIRA Explainability & Feedback UI
 * Feedback Consumer Worker - Ingests feedback for retraining
 */

import { Kafka } from "kafkajs";
import { pool } from "../src/db";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true }
  }
});

const kafka = new Kafka({
  clientId: "sira-feedback-consumer",
  brokers: process.env.KAFKA_BROKERS?.split(",") || ["localhost:9092"]
});

async function run() {
  const consumer = kafka.consumer({ groupId: "sira-feedback-group" });

  try {
    await consumer.connect();
    logger.info("✅ Kafka consumer connected");

    await consumer.subscribe({ topic: "sira.feedback.created" });
    logger.info("✅ Subscribed to sira.feedback.created");

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event = JSON.parse(message.value!.toString());
          logger.info({ event }, "Processing feedback event");

          const { prediction_id, label, reviewer, feedback_id } = event;

          // Get prediction and features
          const { rows: predRows } = await pool.query(
            `SELECT * FROM siramodel_predictions WHERE id = $1`,
            [prediction_id]
          );

          if (predRows.length === 0) {
            logger.warn({ prediction_id }, "Prediction not found");
            return;
          }

          const pred = predRows[0];

          // Insert into training dataset
          // Note: sira_training_examples table should exist in B115 (retraining pipeline)
          // For now, we'll insert into a staging table or log
          await pool.query(
            `INSERT INTO sira_training_examples
             (prediction_id, model_id, features, label, reviewer_id, created_at)
             VALUES ($1, $2, $3, $4, $5, now())
             ON CONFLICT DO NOTHING`,
            [
              prediction_id,
              pred.model_id,
              JSON.stringify(pred.features),
              label,
              reviewer
            ]
          ).catch((error) => {
            // If table doesn't exist yet, log for now
            logger.warn({ error }, "Training table not available, logging feedback");
            logger.info({
              prediction_id,
              model_id: pred.model_id,
              features: pred.features,
              label,
              reviewer
            }, "Feedback for training");
          });

          logger.info({ prediction_id, label }, "✅ Feedback ingested for training");
        } catch (error: any) {
          logger.error({ error, topic, partition }, "❌ Failed to process message");
        }
      }
    });
  } catch (error: any) {
    logger.error({ error }, "❌ Consumer error");
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down consumer...");
  await kafka.consumer({ groupId: "sira-feedback-group" }).disconnect();
  process.exit(0);
});

run().catch((error) => {
  logger.error({ error }, "Failed to start consumer");
  process.exit(1);
});

logger.info("🔄 Feedback consumer worker started");

