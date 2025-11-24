// scripts/consumerTest.ts
import { Kafka, logLevel } from "kafkajs";

const kafka = new Kafka({
    clientId: "fraud-consumer-test",
    brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
    logLevel: logLevel.INFO,
});

const consumer = kafka.consumer({ groupId: "fraud-consumer-test-group" });

async function run() {
    await consumer.connect();
    await consumer.subscribe({ topic: "fraud.case.created", fromBeginning: true });

    console.log("👂 Listening on topic: fraud.case.created");

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            console.log(`📩 [${topic}] Partition:${partition}`);
            console.log(`Key: ${message.key?.toString()}`);
            console.log(`Value: ${message.value?.toString()}`);
            console.log("---");
        },
    });
}

run().catch((err) => {
    console.error("❌ Consumer error:", err);
    process.exit(1);
});