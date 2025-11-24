// worker/src/worker.ts
import { Kafka } from 'kafkajs';
import { processDocument } from './processDoc';

// Configuration Kafka identique à celle de l'API
const kafka = new Kafka({
    clientId: 'kyc-worker-consumer',
    brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'],
    ssl: process.env.KAFKA_SSL === 'true',
    sasl: process.env.KAFKA_USERNAME ? {
        mechanism: 'plain',
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD!,
    } : undefined,
});

const consumer = kafka.consumer({
    groupId: 'kyc-processing-group',
    sessionTimeout: 30000,
    heartbeatInterval: 10000,
});

async function startWorker() {
    try {
        await consumer.connect();
        console.log('Kafka consumer connected for KYC processing');

        await consumer.subscribe({
            topic: 'kyc-uploaded',
            fromBeginning: false
        });

        console.log('Subscribed to kyc-uploaded topic');

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const messageValue = message.value?.toString();
                    if (!messageValue) {
                        console.log('Empty message received, skipping');
                        return;
                    }

                    let docId: string;
                    try {
                        const parsed = JSON.parse(messageValue);
                        docId = parsed.docId;
                        console.log(`[Worker] Processing document: ${docId} from partition ${partition}`);
                    } catch (parseError) {
                        console.error('Failed to parse message:', parseError);
                        return;
                    }

                    if (!docId) {
                        console.error('No docId found in message');
                        return;
                    }

                    await processDocument(docId);
                    console.log(`[Worker] Completed processing document: ${docId}`);

                } catch (error) {
                    console.error(`Error processing message from topic ${topic}:`, error);
                }
            },
        });
    } catch (error) {
        console.error('Failed to start worker:', error);
        process.exit(1);
    }
}

// Gestion graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down worker gracefully');
    await consumer.disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down worker gracefully');
    await consumer.disconnect();
    process.exit(0);
});

startWorker().catch(console.error);