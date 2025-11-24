// src/lib/kafka.ts
import { Kafka, Producer } from "kafkajs";

const kafka = new Kafka({
    clientId: "voice-service",
    brokers: (process.env.KAFKA_BROKERS || "").split(",")
});

let producer: Producer;

export async function initKafka() {
    producer = kafka.producer();
    await producer.connect();
}

export async function publishKafka(topic: string, message: any) {
    if (!producer) await initKafka();
    await producer.send({
        topic,
        messages: [{ value: JSON.stringify(message) }]
    });
}