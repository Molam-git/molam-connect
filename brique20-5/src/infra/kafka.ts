export const kafka = {
    async publish(topic: string, message: any) {
        // Stub implementation - in production use kafkajs
        if (process.env.DEBUG_LOG_EVENTS === "1") {
            console.log("[KAFKA]", topic, JSON.stringify(message));
        }

        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10));

        return { success: true };
    }
};