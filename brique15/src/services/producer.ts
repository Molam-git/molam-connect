import { Kafka } from 'kafkajs';
import { NotificationEvent } from '../types/contracts';
import { sign } from './security';

const kafka = new Kafka({ clientId: 'molam-pay', brokers: process.env.KAFKA_BROKERS!.split(',') });
const producer = kafka.producer();

export async function publishNotification(evt: NotificationEvent) {
    await producer.connect();
    const payload = { ...evt, signed: sign(evt) };
    await producer.send({
        topic: 'molam.notifications.events',
        messages: [{ key: evt.userId, value: JSON.stringify(payload) }]
    });
}