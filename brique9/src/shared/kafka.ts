import { Kafka } from 'kafkajs';

const kafka = new Kafka({
    clientId: 'molam-pay-bills',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
});

const producer = kafka.producer();

export async function connectKafka() {
    await producer.connect();
}

export async function publishEvent(topic: string, payload: any) {
    try {
        await producer.send({
            topic,
            messages: [
                {
                    value: JSON.stringify({
                        ...payload,
                        timestamp: new Date().toISOString(),
                        source: 'molam-pay-bills'
                    })
                }
            ]
        });
    } catch (error) {
        console.error('Failed to publish Kafka event:', error);
        // In production, implement retry logic and dead letter queue
    }
}

export async function disconnectKafka() {
    await producer.disconnect();
}