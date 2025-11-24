// src/utils/kafka.ts
import { Kafka, Producer, Consumer } from "kafkajs";

const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || "fraud-ops",
    brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

export const producer: Producer = kafka.producer();
export const consumer: Consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP || "fraud-playbook-executor" });

export async function kafkaInit() {
    await producer.connect();
    await consumer.connect();
}

export async function publish(topic: string, value: any) {
    await producer.send({ topic, messages: [{ value: JSON.stringify(value) }] });
}