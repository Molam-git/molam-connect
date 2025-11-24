// api/src/workers/queue.ts
import { Kafka } from 'kafkajs';

// Configuration Kafka pour l'API
const kafka = new Kafka({
    clientId: 'kyc-api-producer',
    brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'],
    ssl: process.env.KAFKA_SSL === 'true',
    sasl: process.env.KAFKA_USERNAME ? {
        mechanism: 'plain',
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD!,
    } : undefined,
});

let producer: any = null;

async function getProducer() {
    if (!producer) {
        producer = kafka.producer();
        await producer.connect();
        console.log('Kafka producer connected from API');
    }
    return producer;
}

export async function enqueueVerification(docId: string): Promise<void> {
    try {
        const producerInstance = await getProducer();

        await producerInstance.send({
            topic: 'kyc-uploaded',
            messages: [
                {
                    key: docId,
                    value: JSON.stringify({
                        docId,
                        timestamp: new Date().toISOString(),
                        event: 'document_uploaded',
                        source: 'kyc-api'
                    })
                }
            ],
        });

        console.log(`[API] Document ${docId} enqueued for verification`);
    } catch (error) {
        console.error('[API] Failed to enqueue verification:', error);
        throw error;
    }
}

export async function disconnectQueue(): Promise<void> {
    if (producer) {
        await producer.disconnect();
        producer = null;
        console.log('Kafka producer disconnected from API');
    }
}

// Gestion de la déconnexion propre
process.on('SIGTERM', async () => {
    await disconnectQueue();
});

process.on('SIGINT', async () => {
    await disconnectQueue();
});