export interface SmsResult {
    provider: string;
    messageId: string;
    success: boolean;
}

export async function sendSms(userId: string, message: string): Promise<SmsResult> {
    // TODO: Choose SMS aggregator by country (SN: aggregator_A, US: aggregator_B)
    // TODO: Resolve user phone number from user profile
    console.log(`[SMS] to user ${userId}: ${message}`);

    return {
        provider: "sms",
        messageId: `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        success: true
    };
}