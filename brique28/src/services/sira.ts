// src/services/sira.ts
import { Kafka } from "kafkajs";

const kafka = new Kafka({
    clientId: "molam-notifications",
    brokers: (process.env.KAFKA_BROKERS || "").split(",")
});

const producer = kafka.producer();

let isConnected = false;

export async function publishSiraEvent(event: any) {
    try {
        if (!isConnected) {
            await producer.connect();
            isConnected = true;
        }

        await producer.send({
            topic: "sira.notifications",
            messages: [{ key: event.notification_id, value: JSON.stringify(event) }]
        });
    } catch (err) {
        console.error("sira publish error", err);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    if (isConnected) {
        await producer.disconnect();
    }
});