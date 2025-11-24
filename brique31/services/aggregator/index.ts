import { Kafka } from "kafkajs";
import { pool } from "../db";
import WebSocketServer from "./ws";
import { processTxn, handleAgentFloat, handleSiraAlert } from "./processors";
import { initMetrics } from "./metrics";

const kafka = new Kafka({
    clientId: "molam-aggregator",
    brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(",")
});
const consumer = kafka.consumer({ groupId: "molam-aggregator-g" });

async function start() {
    await consumer.connect();
    await consumer.subscribe({ topic: "wallet_txn_created", fromBeginning: false });
    await consumer.subscribe({ topic: "wallet_txn_updated", fromBeginning: false });
    await consumer.subscribe({ topic: "agent_float_change", fromBeginning: false });
    await consumer.subscribe({ topic: "sira_alert", fromBeginning: false });

    const ws = WebSocketServer.init();
    initMetrics();

    await consumer.run({
        eachMessage: async ({ topic, message }) => {
            const evt = JSON.parse(message.value!.toString());
            try {
                if (topic.startsWith("wallet_txn")) {
                    await processTxn(evt, ws);
                } else if (topic === "agent_float_change") {
                    await handleAgentFloat(evt, ws);
                } else if (topic === "sira_alert") {
                    await handleSiraAlert(evt, ws);
                }
            } catch (err) {
                console.error("process error", err);
            }
        }
    });
}

start().catch(err => {
    console.error(err);
    process.exit(1);
});