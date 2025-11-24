import { Kafka } from 'kafkajs';

const kafka = new Kafka({
    clientId: 'insurance-engine',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

export const kafkaProducer = kafka.producer();