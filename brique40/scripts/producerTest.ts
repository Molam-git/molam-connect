// scripts/producerTest.ts
import { Kafka, logLevel } from "kafkajs";

const kafka = new Kafka({
    clientId: "fraud-producer-test",
    brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
    logLevel: logLevel.INFO,
});

const producer = kafka.producer();

async function run() {
    await producer.connect();

    const event = {
        txnId: `txn-${Date.now()}`,
        userId: "user-456",
        amount: 1200,
        currency: "USD",
        risk: "high",
        reason: "velocity_rule",
        createdAt: new Date().toISOString(),
    };

    await producer.send({
        topic: "fraud.case.created",
        messages: [
            { key: event.txnId, value: JSON.stringify(event) },
        ],
    });

    console.log("✅ Fraud alert sent:", event);

    await producer.disconnect();
}

run().catch((err) => {
    console.error("❌ Producer error:", err);
    process.exit(1);
});