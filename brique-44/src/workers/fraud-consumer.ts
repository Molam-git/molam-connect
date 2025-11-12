// ============================================================================
// Brique 44 - Anti-fraude Temps Réel
// Kafka Consumer - Real-time Transaction Evaluation
// ============================================================================

import dotenv from "dotenv";
dotenv.config();

import { getConsumer, getProducer, TOPIC_TXN_CREATED, TOPIC_FRAUD_DECISION, closeKafka } from "../utils/kafka";
import { pool, closeDb } from "../utils/db";
import { scoreTransaction, ScoringContext } from "../services/scoring";

const ENABLE_KAFKA_CONSUMER = process.env.ENABLE_KAFKA_CONSUMER !== "false";

async function main() {
  if (!ENABLE_KAFKA_CONSUMER) {
    console.log("Kafka consumer disabled via ENABLE_KAFKA_CONSUMER flag");
    process.exit(0);
  }

  console.log("Starting Fraud Detection Kafka Consumer...");

  const consumer = await getConsumer();
  const producer = await getProducer();

  // Subscribe to transaction created events
  await consumer.subscribe({ topics: [TOPIC_TXN_CREATED], fromBeginning: false });

  console.log(`Subscribed to topic: ${TOPIC_TXN_CREATED}`);

  // Process messages
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        if (!message.value) {
          console.warn("Received empty message, skipping");
          return;
        }

        const event = JSON.parse(message.value.toString());
        console.log(`Processing transaction: ${event.txnId}`);

        // Build scoring context
        const ctx: ScoringContext = {
          txnId: event.txnId,
          userId: event.userId,
          merchantId: event.merchantId,
          amount: event.amount,
          currency: event.currency,
          country: event.country || "US",
          ip: event.ip || "127.0.0.1",
          device: event.device || {},
          payment_method: event.payment_method || {},
        };

        // Score transaction
        const result = await scoreTransaction(ctx);

        console.log(`Transaction ${event.txnId} scored: ${result.score} -> ${result.decision}`);

        // Store decision in database
        const query = `
          INSERT INTO fraud_decisions (
            txn_id, user_id, merchant_id, decision, score, sira_score,
            confidence, reason, decided_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (txn_id) DO UPDATE SET
            decision = EXCLUDED.decision,
            score = EXCLUDED.score,
            sira_score = EXCLUDED.sira_score,
            confidence = EXCLUDED.confidence,
            reason = EXCLUDED.reason,
            decided_at = now()
          RETURNING *
        `;

        const values = [
          event.txnId,
          event.userId,
          event.merchantId,
          result.decision,
          result.score,
          result.sira_score,
          result.confidence,
          JSON.stringify(result.reasons),
          "auto",
        ];

        const dbResult = await pool.query(query, values);
        const decisionId = dbResult.rows[0].id;

        // If decision is "review", create review record
        if (result.decision === "review") {
          const reviewQuery = `
            INSERT INTO fraud_reviews (decision_id, priority, status)
            VALUES ($1, $2, 'pending')
          `;
          const priority = result.score >= 70 ? "high" : "medium";
          await pool.query(reviewQuery, [decisionId, priority]);

          console.log(`Created review queue entry for ${event.txnId} with priority: ${priority}`);
        }

        // Publish decision to Kafka
        await producer.send({
          topic: TOPIC_FRAUD_DECISION,
          messages: [
            {
              key: event.txnId,
              value: JSON.stringify({
                txnId: event.txnId,
                decision: result.decision,
                score: result.score,
                sira_score: result.sira_score,
                confidence: result.confidence,
                reasons: result.reasons,
                timestamp: new Date().toISOString(),
              }),
            },
          ],
        });

        console.log(`Published fraud decision for ${event.txnId} to ${TOPIC_FRAUD_DECISION}`);
      } catch (error: any) {
        console.error("Error processing message:", error);
        // Don't throw - continue processing other messages
      }
    },
  });
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down fraud consumer...");
  await closeKafka();
  await closeDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down fraud consumer...");
  await closeKafka();
  await closeDb();
  process.exit(0);
});

// Start consumer
main().catch((error) => {
  console.error("Fatal error in fraud consumer:", error);
  process.exit(1);
});
