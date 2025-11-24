import { Kafka } from "kafkajs";

const kafka = new Kafka({
    clientId: "molam-fraud",
    brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

export const producer = kafka.producer();
export const consumer = kafka.consumer({ groupId: "molam-fraud-group" });

export async function publish(topic: string, payload: any) {
    await producer.connect();
    await producer.send({
        topic,
        messages: [{ value: JSON.stringify(payload) }],
    });
}

export async function consume(topic: string, handler: (msg: any) => void) {
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    await consumer.run({
        eachMessage: async ({ message }) => {
            await handler(message);
        },
    });
}