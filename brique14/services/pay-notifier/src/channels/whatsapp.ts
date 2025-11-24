export interface WhatsappResult {
    provider: string;
    messageId: string;
    success: boolean;
}

export async function sendWhatsapp(userId: string, message: string): Promise<WhatsappResult> {
    // TODO: Call WhatsApp Business API
    // TODO: Resolve user phone number from user profile
    console.log(`[WHATSAPP] to user ${userId}: ${message}`);

    return {
        provider: "whatsapp",
        messageId: `whatsapp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        success: true
    };
}