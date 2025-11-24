import { Kafka } from "kafkajs";
const kafka = new Kafka({ clientId: "bank-interop", brokers: (process.env.KAFKA_BROKERS || "").split(",") });
const producer = kafka.producer(); let ready = false;
(async () => { await producer.connect(); ready = true; })();

export async function publishEvent(topic: string, payload: any) {
    if (!ready) return;
    await producer.send({ topic, messages: [{ value: JSON.stringify(payload) }] });
}