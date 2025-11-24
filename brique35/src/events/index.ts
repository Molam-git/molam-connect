import { pool } from "../db";

export interface EventPayload {
    payoutId: string;
    [key: string]: any;
}

export async function publishEvent(eventType: string, payload: EventPayload) {
    const timestamp = new Date().toISOString();

    console.log(`📢 [${timestamp}] Event: ${eventType}`, payload);

    // Enregistrement systématique en base pour audit
    try {
        await pool.query(
            `INSERT INTO payout_events (payout_id, event_type, payload, created_at) 
       VALUES ($1, $2, $3, $4)`,
            [payload.payoutId, eventType, JSON.stringify(payload), timestamp]
        );
    } catch (error) {
        console.error('Failed to save event to database:', error);
        // Ne pas bloquer le flux principal en cas d'erreur d'audit
    }

    // Ici on pourrait aussi publier vers Kafka/RabbitMQ pour d'autres services
    // await publishToMessageQueue(eventType, payload);
}

// Fonction utilitaire pour les événements courants
export const PayoutEvents = {
    created: (payoutId: string, data: any) =>
        publishEvent('payout.created', { payoutId, ...data }),

    processing: (payoutId: string, attempt: number) =>
        publishEvent('payout.processing', { payoutId, attempt }),

    sent: (payoutId: string, providerRef: string) =>
        publishEvent('payout.sent', { payoutId, providerRef }),

    failed: (payoutId: string, error: string, attempts: number) =>
        publishEvent('payout.failed', { payoutId, error, attempts }),

    settled: (payoutId: string, settledAt: string) =>
        publishEvent('payout.settled', { payoutId, settledAt }),

    cancelled: (payoutId: string, reason: string) =>
        publishEvent('payout.cancelled', { payoutId, reason })
};

// Simulation de publication vers un bus d'événements
async function publishToMessageQueue(eventType: string, payload: EventPayload) {
    // Implémentation réelle avec Kafka/RabbitMQ
    // await kafkaProducer.send({
    //   topic: 'payout-events',
    //   messages: [{ value: JSON.stringify({ eventType, payload, timestamp: new Date() }) }]
    // });
}