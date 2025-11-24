export interface EmailResult {
    provider: string;
    messageId: string;
    success: boolean;
}

export async function sendEmail(userId: string, subject: string, body: string): Promise<EmailResult> {
    // TODO: Call SMTP/SendGrid/Mailgun
    // TODO: Resolve user email from user profile
    console.log(`[EMAIL] to user ${userId}: ${subject} - ${body.substring(0, 50)}...`);

    return {
        provider: "email",
        messageId: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        success: true
    };
}