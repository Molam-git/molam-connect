import fetch from 'node-fetch';
import { PaymentProvider, ProviderResponse, WebhookResult, ProviderStatus } from '../base-provider';

export class WaveProvider extends PaymentProvider {
    handleWebhook(payload: any): Promise<WebhookResult> {
        throw new Error('Method not implemented.');
    }
    checkStatus(reference: string): Promise<ProviderStatus> {
        throw new Error('Method not implemented.');
    }
    name = 'wave';
    type = 'mobile_money';
    private apiUrl: string;
    private apiKey: string;

    constructor(config: any) {
        super();
        this.apiUrl = config.api_url;
        this.apiKey = config.api_key;
    }

    async createPaymentIntent(amount: number, currency: string, metadata: any): Promise<ProviderResponse> {
        try {
            const response = await fetch(`${this.apiUrl}/payments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amount,
                    currency,
                    customer_phone_number: metadata.msisdn,
                    merchant_reference: metadata.reference,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json() as any;

            if (data.status === 'SUCCESS') {
                return {
                    success: true,
                    reference: metadata.reference,
                    payment_url: data.payment_url,
                    provider_tx_id: data.id,
                };
            }

            return {
                success: false,
                reference: metadata.reference,
                error: data.error_message || 'Unknown error from Wave',
            };

        } catch (error) {
            console.error('Wave API error:', error);
            return {
                success: false,
                reference: metadata.reference,
                error: error instanceof Error ? error.message : 'Network error',
            };
        }
    }

    // ... reste des méthodes (handleWebhook, checkStatus, etc.) sans changement
}