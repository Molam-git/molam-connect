// src/services/providerAdapters/twilioSms.ts
import fetch from "node-fetch";

export async function sendTwilioSms(providerConfig: any, to: string, body: string) {
    // providerConfig is pointer to Vault path; this adapter expects API credentials provided at runtime
    // This is a mock: production uses official SDK and secrets from Vault
    const url = providerConfig.api_url; // e.g. https://api.twilio.com/2010-04-01/Accounts/...
    const apiKey = process.env.TWILIO_API_KEY || providerConfig.api_key; // load from Vault in prod

    try {
        // Simulated POST
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ to, body, from: providerConfig.from })
        });

        const raw = await resp.text();
        if (resp.ok) {
            return { success: true, raw };
        } else {
            return { success: false, raw };
        }
    } catch (err: any) {
        return { success: false, raw: err.message };
    }
}