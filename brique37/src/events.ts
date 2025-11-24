import { kafkaProducer } from "./kafka";

export async function publishEvent(topic: string, message: any): Promise<void> {
    await kafkaProducer.send({
        topic,
        messages: [{ value: JSON.stringify(message) }]
    });
}