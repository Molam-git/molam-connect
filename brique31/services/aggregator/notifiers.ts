// Helpers pour l'envoi de notifications

export async function sendWebhook(url: string, payload: any): Promise<void> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Webhook failed with status ${response.status}`);
    }
}

export async function sendEmail(emails: string[], subject: string, body: string): Promise<void> {
    // Implémentation basique pour l'envoi d'email
    // À remplacer par un service d'email réel (SendGrid, SES, etc.)
    console.log(`Envoi email à: ${emails.join(', ')}`);
    console.log(`Sujet: ${subject}`);
    console.log(`Corps: ${body}`);

    // Simulation d'envoi
    await new Promise(resolve => setTimeout(resolve, 100));
}

export async function sendSms(phone: string, message: string): Promise<{ status: string }> {
    // Retourner seulement status sans detail
    console.log(`Envoi SMS à: ${phone}`);
    console.log(`Message: ${message}`);

    // Simulation d'envoi
    await new Promise(resolve => setTimeout(resolve, 100));

    return { status: 'sent' };
}