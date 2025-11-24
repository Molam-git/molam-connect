// Implémentation simulée de Kafka - à remplacer par la vraie implémentation

interface KafkaMessage {
    topic: string;
    messages: Array<{ value: string }>;
}

class KafkaProducer {
    async send(message: KafkaMessage): Promise<void> {
        console.log(`[KAFKA] Publishing to ${message.topic}:`, message.messages[0].value);
        // TODO: Implémenter la vraie connexion Kafka
    }
}

// Simuler un producteur Kafka
const kafkaProducer = new KafkaProducer();

export async function publishEvent(topic: string, data: any): Promise<void> {
    try {
        await kafkaProducer.send({
            topic,
            messages: [{ value: JSON.stringify(data) }]
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[KAFKA] Failed to publish to ${topic}:`, errorMessage);
        // Ne pas throw l'erreur pour éviter de bloquer le processus
    }
}