// src/common/events.ts
export async function publishEvent(eventType: string, data: any): Promise<void> {
    // Implémentation simplifiée - à compléter avec le système de messaging
    console.log(`Event published: ${eventType}`, data);
}