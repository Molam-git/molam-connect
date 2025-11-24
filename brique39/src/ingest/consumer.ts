import { Kafka } from "kafkajs";
import { upsertFeaturesForTxn } from "./feature_updater";
import { scoreTransaction } from "../scorer/client";
import { pool } from "../db";

const kafka = new Kafka({
    clientId: "fraud-ingest",
    brokers: (process.env.KAFKA_BROKERS || "").split(","),
});

const consumer = kafka.consumer({ groupId: "fraud-ingest-g" });

async function start() {
    await consumer.connect();
    await consumer.subscribe({ topic: "wallet_txn_created", fromBeginning: false });

    await consumer.run({
        eachMessage: async ({ message }) => {
            const evt = JSON.parse(message.value!.toString());

            await upsertFeaturesForTxn(evt);

            const features = await buildFeatureVector(evt);
            const scoreResp = await scoreTransaction(features);

            await pool.query(
                `INSERT INTO fraud_events (correlation_id, entity_type, entity_id, event_type, score, model_version, decision, explain)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    evt.reference_code,
                    "tx",
                    evt.origin_user_id,
                    "score",
                    scoreResp.score,
                    scoreResp.model_version,
                    scoreResp.decision || null,
                    scoreResp.explain || null,
                ]
            );
        },
    });
}

async function buildFeatureVector(evt: any): Promise<any> {
    return {
        entity_type: "tx",
        entity_id: evt.origin_user_id,
        features: {
            tx_count_7d: 0,
            tx_vol_7d: 0,
            p2p_count_7d: 0,
            cashout_count_7d: 0,
            sira_score: 0
        }
    };
}

start().catch(console.error);