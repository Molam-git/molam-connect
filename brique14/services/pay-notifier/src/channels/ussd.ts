export interface UssdResult {
    provider: string;
    messageId: string;
    success: boolean;
}

export async function sendUssdFlash(userId: string, message: string): Promise<UssdResult> {
    // TODO: Call USSD gateway: flash message (short lived)
    // TODO: Resolve user phone number from user profile
    console.log(`[USSD] to user ${userId}: ${message}`);

    return {
        provider: "ussd",
        messageId: `ussd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        success: true
    };
}