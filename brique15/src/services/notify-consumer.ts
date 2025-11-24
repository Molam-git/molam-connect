import { Kafka } from 'kafkajs';
import { renderAndQueue } from './renderer';
import { verify } from './security';

const kafka = new Kafka({ clientId: 'notify-svc', brokers: process.env.KAFKA_BROKERS!.split(',') });
const consumer = kafka.consumer({ groupId: 'notify-workers' });

export async function runConsumer() {
    await consumer.connect();
    await consumer.subscribe({ topic: 'molam.notifications.events', fromBeginning: false });

    await consumer.run({
        eachMessage: async ({ message }) => {
            if (!message.value) return;
            const evt = JSON.parse(message.value.toString());
            if (!verify(evt)) return;

            try {
                await renderAndQueue(evt);
            } catch (e) {
                throw e;
            }
        }
    });
}